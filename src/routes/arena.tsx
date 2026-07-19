import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Swords, QrCode, ChevronRight, Loader2, MessageCircle } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { PokemonSprite } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { NearbyBattleSheet } from "@/components/NearbyBattleSheet";
import { startTrainingMatch } from "@/lib/pvp-live";
import {
  fetchActiveMegaEvent,
  MEGA_MAX_ATTEMPTS,
  MEGA_WIN_CORRECT,
  type MegaEvent,
} from "@/lib/mega/schedule";
import { getMegaAttempts, getMyMegaRun } from "@/lib/mega/runs";
import { ensureSession, getProfileById } from "@/lib/social";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/arena")({
  component: ArenaPage,
  // `nearby: 1` is a one-shot flag (PvP Rematch, docs/handoffs/.../03-frontend.md):
  // landing here from a human-match result auto-opens the Battle Code sheet so a
  // rematch is one tap away. Optional (like index.tsx's `ref`/refer.tsx's `code`)
  // so every existing `navigate({ to: "/arena" })` call site stays valid.
  validateSearch: (s: Record<string, unknown>): { nearby?: 1 } =>
    s.nearby ? { nearby: 1 } : {},
});

const MODE_LABELS: Record<string, string> = {
  battle: "Battle",
  elite: "Elite Four",
  weekly: "Weekly",
  daily: "Daily",
  mega: "Mega Raid",
  pvp: "PvP",
  nearby: "Nearby",
  whosthat: "Who's That?",
};

/** Coarse relative-time label — matches the "just now / Xm / Xh / Xd / Xw ago"
 * granularity used elsewhere in the app's activity surfaces. */
function relativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}

/** "Xd Yh" while more than a day remains, else "Yh Zm", else "Zm" — minute
 * granularity is enough since the caller only re-computes this every 30-60s. */
function formatEndsIn(ms: number): string {
  if (ms <= 0) return "ending soon";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

interface RecentNearbyMatch {
  id: string;
  opponentName: string;
  createdAt: string;
}

function ArenaPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const battleLog = useGameStore((s) => s.battleLog);

  const [nearbyBattleOpen, setNearbyBattleOpen] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);
  const nearbyAutoOpenedRef = useRef(false);

  const [megaLoading, setMegaLoading] = useState(true);
  const [megaEvent, setMegaEvent] = useState<MegaEvent | null>(null);
  const [megaAttempts, setMegaAttempts] = useState(0);
  const [megaWon, setMegaWon] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());

  const [recentMatches, setRecentMatches] = useState<RecentNearbyMatch[]>([]);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  useEffect(() => {
    if (
      hasOnboarded &&
      search.nearby === 1 &&
      !nearbyAutoOpenedRef.current
    ) {
      nearbyAutoOpenedRef.current = true;
      setNearbyBattleOpen(true);
    }
  }, [hasOnboarded, search.nearby]);

  // Mega Raid permanent slot: active event + this trainer's attempts/win state.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ev = await fetchActiveMegaEvent();
      if (cancelled) return;
      setMegaEvent(ev);
      if (ev) {
        const [attempts, run] = await Promise.all([getMegaAttempts(ev.id), getMyMegaRun(ev.id)]);
        if (cancelled) return;
        setMegaAttempts(attempts);
        setMegaWon(!!run && run.correct >= MEGA_WIN_CORRECT);
      }
      setMegaLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Countdown refresh — minute granularity, no per-second interval.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

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

  const recentLog = useMemo(() => battleLog.slice(0, 30), [battleLog]);

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

  if (!hydrated || !hasOnboarded) return null;

  const megaExhausted = megaAttempts >= MEGA_MAX_ATTEMPTS;
  const megaDisabled = !megaEvent || megaWon || megaExhausted;
  const megaEndsIn = megaEvent ? formatEndsIn(Date.parse(megaEvent.endsAt) - nowTick) : "";
  const megaStatusCopy = !megaEvent
    ? "No active raid — check back soon"
    : megaWon
      ? `Cleared! Ends in ${megaEndsIn}`
      : megaExhausted
        ? `Out of attempts · Ends in ${megaEndsIn}`
        : `Ends in ${megaEndsIn}`;

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      {/* Header */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <p className="font-pixel-xs text-primary">FACE OFF</p>
        <h1 className="font-display-lg text-foreground">Battle Arena</h1>
      </div>

      {/* Nearby Battle — primary gradient card */}
      <div className="px-5 pt-3">
        <button
          onClick={() => setNearbyBattleOpen(true)}
          className="relative flex w-full items-center gap-4 overflow-hidden rounded-3xl bg-gradient-to-br from-[oklch(0.62_0.2_25)] to-[oklch(0.5_0.2_25)] p-5 text-left text-white shadow-card active:scale-[0.99]"
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              background:
                "repeating-conic-gradient(from 0deg at 84% 50%, rgba(255,255,255,0.16) 0deg 4deg, transparent 4deg 10deg)",
            }}
          />
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            <QrCode className="h-7 w-7" />
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="font-pixel text-[9px] leading-none text-white/85">FACE TO FACE</div>
            <h3 className="mt-1.5 text-lg font-extrabold leading-tight">Nearby Battle</h3>
            <p className="mt-0.5 text-xs font-semibold leading-tight text-white/85">
              Scan a Battle Code to fight instantly
            </p>
          </div>
          <span className="relative shrink-0 text-lg text-white/80">›</span>
        </button>
      </div>

      {/* Training */}
      <div className="px-5 pt-2.5">
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
              {trainingBusy ? "Summoning..." : "Training"}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Practice against the Training Bot — no friend required
            </p>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 text-foreground/40" />
        </button>
      </div>

      {/* Mega Raid — permanent full-width slot */}
      <div className="px-5 pt-2.5">
        {megaLoading ? (
          <div className="flex w-full animate-pulse items-center gap-3 rounded-3xl bg-card/60 p-4 shadow-card">
            <div className="h-14 w-14 shrink-0 rounded-2xl bg-muted" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-2.5 w-20 rounded bg-muted" />
              <div className="h-3 w-32 rounded bg-muted" />
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              if (!megaDisabled) void navigate({ to: "/battle", search: { mega: 1 } as never });
            }}
            disabled={megaDisabled}
            className={`relative flex w-full items-center gap-3 overflow-hidden rounded-3xl bg-gradient-to-br from-[oklch(0.62_0.16_250)] to-[oklch(0.5_0.18_270)] p-4 text-left text-white shadow-card disabled:opacity-80 ${
              megaDisabled ? "grayscale" : ""
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="font-pixel text-[9px] leading-none text-white/85">
                ⚡ MEGA RAID
              </div>
              <h3 className="mt-1.5 text-base font-extrabold leading-tight">
                {megaEvent ? megaEvent.name : "No Raid Active"}
              </h3>
              <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/85">
                {megaStatusCopy}
              </p>
            </div>
            {megaEvent && (
              <PokemonSprite
                id={megaEvent.megaId}
                alt={megaEvent.name}
                className="sprite -mr-1 h-[56px] w-[56px] shrink-0"
              />
            )}
          </button>
        )}
      </div>

      {/* Recent Nearby Battles — lightweight chat entry point */}
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

      {/* Battle History */}
      <div className="px-5 pt-5">
        <div className="font-pixel-xs text-primary">BATTLE LOG</div>
        <h2 className="mt-0.5 font-display-md text-foreground">Recent Battles</h2>
      </div>
      <div className="space-y-2 px-5 pb-8 pt-3">
        {recentLog.length === 0 ? (
          <div className="rounded-3xl bg-card p-6 text-center text-sm text-foreground/55 shadow-card">
            No battles yet — jump into Nearby Battle or Training to get started!
          </div>
        ) : (
          recentLog.map((entry, i) => (
            <div
              key={`${entry.timestamp}-${i}`}
              className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${entry.won ? "bg-hp-good" : "bg-destructive"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">
                  vs {entry.opponent}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground/55">
                  <span className="rounded-full bg-muted px-1.5 py-0.5 font-pixel-xs text-foreground/60">
                    {MODE_LABELS[entry.mode ?? "battle"] ?? "Battle"}
                  </span>
                  <span>{relativeTime(entry.timestamp)}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={`text-xs font-bold ${entry.won ? "text-hp-good" : "text-destructive"}`}
                >
                  {entry.won ? "WIN" : "LOSS"}
                </div>
                {entry.xpGained > 0 && (
                  <div className="text-[11px] text-foreground/55">+{entry.xpGained} XP</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <NearbyBattleSheet open={nearbyBattleOpen} onOpenChange={setNearbyBattleOpen} />
    </div>
  );
}
