import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Swords, QrCode, ChevronRight, Loader2, MessageCircle } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { ItemIcon } from "@/components/game-ui";
import { AppIcon } from "@/components/app-icon";
import { REWARD_ICON, LOCK_ICON, ARENA_BADGE_ICON } from "@/lib/app-icons";
import { Button } from "@/components/ui/button";
import { BattleCodeQr } from "@/components/battle-code-qr";
import { ScanPanel } from "@/components/NearbyBattleSheet";
import { trainerSpriteUrl } from "@/lib/game-data";
import { ITEM_BY_ID } from "@/content/items";
import { ARENA_REWARD_SLOTS, trophyTier, type TrophyTier } from "@/lib/arena-rewards";
import { relativeTime } from "@/lib/battle-log-format";
import { startTrainingMatch } from "@/lib/pvp-live";
import { ensureSession, getProfileById } from "@/lib/social";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/arena")({
  component: ArenaPage,
  // `nearby: 1` is a one-shot flag (PvP Rematch, docs/handoffs/.../03-frontend.md):
  // landing here from a human-match result forces the Battle tab so a rematch
  // is one tap away. Optional (like index.tsx's `ref`/refer.tsx's `code`) so
  // every existing `navigate({ to: "/arena" })` call site stays valid.
  validateSearch: (s: Record<string, unknown>): { nearby?: 1 } =>
    s.nearby ? { nearby: 1 } : {},
});

interface RecentNearbyMatch {
  id: string;
  opponentName: string;
  createdAt: string;
}

/** Per-tier badge styling. There is deliberately no textual tier label: the
 * badge art is unframed and recoloured to the tier, so the colour IS the rank.
 * `grayscale` first flattens whatever colours the webp ships with, then
 * sepia/hue-rotate/saturate tint it to the target metal; `none` stays dim and
 * desaturated so reaching Bronze reads as an unlock.
 * (A filter tint approximates metal; dedicated per-tier art would be crisper.) */
const TROPHY_STYLE: Record<TrophyTier, { bar: string; filter: string }> = {
  none: { bar: "bg-slate-400", filter: "grayscale(1) brightness(0.9) opacity(0.45)" },
  bronze: {
    bar: "bg-amber-600",
    filter: "grayscale(1) sepia(0.9) saturate(2.6) hue-rotate(-18deg) brightness(0.92)",
  },
  silver: {
    bar: "bg-slate-500",
    filter: "grayscale(1) brightness(1.12) contrast(1.05)",
  },
  gold: {
    bar: "bg-poke-yellow",
    filter: "grayscale(1) sepia(0.95) saturate(3.4) hue-rotate(-6deg) brightness(1.06)",
  },
  platinum: {
    bar: "bg-violet-400",
    filter: "grayscale(1) brightness(1.2) sepia(0.25) hue-rotate(175deg) saturate(1.6)",
  },
};

function TrophyCard({ label, count, art }: { label: string; count: number; art: string }) {
  const { tier, next } = trophyTier(count);
  const st = TROPHY_STYLE[tier];
  const pct = next === null ? 100 : Math.min(100, Math.round((count / next) * 100));
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-3xl bg-card p-4 shadow-card">
      {/* No frame — the badge art stands on its own, tinted to its tier so each
          rank-up visibly changes the metal. */}
      <AppIcon src={art} className="h-20 w-20 drop-shadow" style={{ filter: st.filter }} />
      <span className="font-pixel-xs text-primary">{label}</span>
      <div className="w-full">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1 text-center text-[10px] text-foreground/55">
          {next === null ? `${count} · MAX` : `${count}/${next}`}
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-foreground/55">{label}</span>
      <span className="font-semibold text-foreground">{value}</span>
    </div>
  );
}

function ArenaPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const arenaStats = useGameStore((s) => s.arenaStats);
  const claimArenaReward = useGameStore((s) => s.claimArenaReward);

  const [tab, setTab] = useState<"battle" | "training">("battle");
  const [scanOpen, setScanOpen] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const forcedBattleTabRef = useRef(false);

  const [recentMatches, setRecentMatches] = useState<RecentNearbyMatch[]>([]);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  // `nearby: 1` (PvP Rematch one-shot flag): force the Battle tab. Battle is
  // already the default, so this is close to a no-op — kept so the contract
  // stays honest if the default tab ever changes.
  useEffect(() => {
    if (hasOnboarded && search.nearby === 1 && !forcedBattleTabRef.current) {
      forcedBattleTabRef.current = true;
      setTab("battle");
    }
  }, [hasOnboarded, search.nearby]);

  // Recent Nearby Battles strip — a lightweight entry point into match chat,
  // not an inbox. RLS on pvp_live_matches already scopes rows to matches the
  // caller is a participant of.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await ensureSession();
      if (!uid || cancelled) return;
      const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("pvp_live_matches")
        .select("id, host_id, guest_id, created_at, status")
        .eq("is_bot_match", false)
        .gt("created_at", cutoffIso)
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) {
        console.warn("[arena] recent nearby battles fetch failed:", error.message);
        return;
      }
      if (!data || cancelled) return;
      const rows = data as Array<{
        id: string;
        host_id: string;
        guest_id: string;
        created_at: string;
        status: string;
      }>;
      const withOpponents = await Promise.all(
        rows.map(async (r) => {
          const opponentId = r.host_id === uid ? r.guest_id : r.host_id;
          const profile = await getProfileById(opponentId);
          return {
            id: r.id,
            opponentName: profile?.trainer_name || "Trainer",
            createdAt: r.created_at,
          };
        }),
      );
      if (!cancelled) setRecentMatches(withOpponents);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleStartTraining() {
    if (trainingBusy) return;
    setTrainingBusy(true);
    try {
      const res = await startTrainingMatch();
      if (!res.ok) {
        toast.error(
          res.error === "questions"
            ? "Couldn't prepare the battle. Try again."
            : "Couldn't start training. Try again.",
        );
        return;
      }
      void navigate({ to: "/pvp/live/$matchId", params: { matchId: res.matchId } });
    } catch (e) {
      console.warn("[arena] startTraining failed:", e);
      toast.error("Couldn't start training. Try again.");
    } finally {
      setTrainingBusy(false);
    }
  }

  function handleClaim(slot: number) {
    const res = claimArenaReward(slot);
    if (res) toast.success(res.text);
  }

  if (!hydrated || !hasOnboarded) return null;

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      {/* Header */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <p className="font-pixel-xs text-primary">FACE OFF</p>
        <h1 className="font-display-lg text-foreground">Battle Arena</h1>
      </div>

      {/* Tabs */}
      <div className="mt-1 flex gap-6 border-b border-border/60 px-5">
        <button
          onClick={() => setTab("battle")}
          className={`pb-2.5 font-pixel text-[10px] uppercase tracking-wide ${
            tab === "battle"
              ? "border-b-2 border-primary text-primary"
              : "text-foreground/40"
          }`}
        >
          Battle
        </button>
        <button
          onClick={() => setTab("training")}
          className={`pb-2.5 font-pixel text-[10px] uppercase tracking-wide ${
            tab === "training"
              ? "border-b-2 border-primary text-primary"
              : "text-foreground/40"
          }`}
        >
          Training
        </button>
      </div>

      {/* Hero */}
      <div className="px-5 pt-4">
        <div className="flex items-center gap-4 rounded-3xl bg-card p-4 shadow-card">
          <img
            src={trainerSpriteUrl(trainerSprite)}
            alt={trainerSprite}
            className="sprite h-36 w-36 shrink-0 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <StatRow label="Wins" value={arenaStats.wins} />
            <StatRow label="Battles" value={arenaStats.battles} />
            <StatRow label="Longest Streak" value={arenaStats.longestWinStreak} />
            <div className="flex items-center justify-between text-sm">
              <span className="text-foreground/55">Berries Earned</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => {
                  const id = arenaStats.lastBerries[i];
                  return id ? (
                    <ItemIcon key={i} item={ITEM_BY_ID[id]} className="h-6 w-6" />
                  ) : (
                    <span
                      key={i}
                      className="flex h-6 w-6 items-center justify-center text-foreground/30"
                    >
                      —
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Trophies */}
      <div className="flex gap-3 px-5 pt-3">
        <TrophyCard
          label="NEARBY"
          count={arenaStats.nearbyBattles}
          art={ARENA_BADGE_ICON.nearby}
        />
        <TrophyCard
          label="TRAINING"
          count={arenaStats.trainingBattles}
          art={ARENA_BADGE_ICON.training}
        />
      </div>

      {/* Rewards card */}
      <div className="px-5 pt-3">
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <div className="font-pixel-xs text-primary">BATTLE REWARDS</div>
          <p className="mt-0.5 text-xs text-foreground/55">Win battles to fill your set of 5</p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {ARENA_REWARD_SLOTS.map(({ slot, kind }) => {
              const unlocked = slot < arenaStats.set.wins;
              const claimed = arenaStats.set.claimed[slot];
              return (
                <div
                  key={slot}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center ${
                    claimed ? "bg-muted/60 opacity-60" : "bg-muted/60"
                  }`}
                >
                  {claimed ? (
                    <AppIcon src={REWARD_ICON[kind]} className="h-7 w-7" />
                  ) : unlocked ? (
                    <>
                      <AppIcon src={REWARD_ICON[kind]} className="h-7 w-7" />
                      <button
                        onClick={() => handleClaim(slot)}
                        className="rounded-full bg-primary px-2 py-0.5 font-pixel text-[8px] text-primary-foreground"
                      >
                        COLLECT
                      </button>
                    </>
                  ) : (
                    <AppIcon src={LOCK_ICON} className="h-9 w-9 opacity-50" />
                  )}
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-center text-[11px] text-foreground/55">
            {arenaStats.set.battles}/5 battles played
          </div>
        </div>
      </div>

      {/* Tab-dependent */}
      {tab === "battle" ? (
        <div className="px-5 pt-3">
          <div className="rounded-3xl bg-card p-4 shadow-card">
            <div className="font-pixel-xs text-primary">NEARBY BATTLE</div>
            <p className="mt-0.5 text-xs text-foreground/55">
              {scanOpen
                ? "Point your camera at a nearby trainer's Battle Code to fight instantly."
                : "Your friend code doubles as your Battle Code — have a nearby trainer scan it to fight instantly."}
            </p>
            {/* Scanner replaces the QR in place — same footprint, no layout jump. */}
            <div className="mt-3">
              {scanOpen ? (
                <ScanPanel active={scanOpen} onClose={() => setScanOpen(false)} />
              ) : (
                <BattleCodeQr />
              )}
            </div>
            <Button
              onClick={() => setScanOpen((v) => !v)}
              className="mt-3 h-11 w-full rounded-full"
            >
              <QrCode className="mr-1.5 h-4 w-4" />
              {scanOpen ? "Show My Battle Code" : "Scan a Battle Code"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-5 pt-3">
          <button
            onClick={() => void handleStartTraining()}
            disabled={trainingBusy}
            className="flex w-full items-center gap-3 rounded-3xl bg-card p-4 text-left shadow-card transition active:scale-[0.99] disabled:opacity-70"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              {trainingBusy ? (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              ) : (
                <Swords className="h-6 w-6 text-primary" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-display-md text-foreground">
                {trainingBusy ? "Summoning..." : "Start Training"}
              </h3>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Practice against the Training Bot — no friend required
              </p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-foreground/40" />
          </button>
        </div>
      )}

      {/* Recent Nearby Battles — lightweight chat entry point, fixed on both tabs */}
      {recentMatches.length > 0 && (
        <div className="px-5 pt-4">
          <div className="font-pixel-xs text-primary">RECENT NEARBY BATTLES</div>
          <div className="mt-2 space-y-2">
            {recentMatches.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-2xl bg-card p-3 shadow-card"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">
                    vs {m.opponentName}
                  </div>
                  <div className="text-[11px] text-foreground/55">
                    {relativeTime(Date.parse(m.createdAt))}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigate({ to: "/pvp/chat/$matchId", params: { matchId: m.id } })
                  }
                  className="ml-2 shrink-0 rounded-full"
                >
                  <MessageCircle className="mr-1 h-3.5 w-3.5" /> Chat
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="pb-8" />
    </div>
  );
}
