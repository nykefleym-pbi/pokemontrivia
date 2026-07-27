import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Swords, QrCode, Loader2, MessageCircle } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { ItemIcon } from "@/components/game-ui";
import { AppIcon } from "@/components/app-icon";
import { REWARD_ICON, LOCK_ICON, ARENA_BADGE_ICON, VERSUS_BACKDROP } from "@/lib/app-icons";
import { Button } from "@/components/ui/button";
import { BattleCodeQr } from "@/components/battle-code-qr";
import { VersusScreen } from "@/components/versus-screen";
import { trainingBotSide } from "@/lib/training-bot";
import { ScanPanel } from "@/components/NearbyBattleSheet";
import { trainerSpriteUrl } from "@/lib/game-data";
import { ITEM_BY_ID } from "@/content/items";
import { ARENA_REWARD_SLOTS, trophyTier, type TrophyTier } from "@/lib/arena-rewards";
import { relativeTime } from "@/lib/battle-log-format";
import {
  startTrainingMatch,
  prepareQueueTicket,
  attemptQueueMatch,
  leaveQueue,
  type QueueTicket,
} from "@/lib/pvp-live";
import { fetchPvpLeaderboard, type LeaderboardRow } from "@/lib/pvp";
import { ensureSession, getProfileById } from "@/lib/social";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/arena")({
  component: ArenaPage,
  // `nearby: 1` came from PvP Rematch and used to force the Battle tab. There
  // are no tabs any more — Battle is the whole page — so nothing reads it, but
  // pvp.live.$matchId.tsx still navigates with it, and dropping the validator
  // would make that a search param the router rejects. Accepted and ignored.
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
  // Hold to see the badge in its own colours; releasing returns it to the tier
  // tint. Pointer events rather than onTouchStart/onMouseDown so one pair of
  // handlers covers touch, pen and mouse, and `onPointerCancel` catches the
  // scroll-steals-the-gesture case that would otherwise leave it stuck coloured.
  const [held, setHeld] = useState(false);
  const release = () => setHeld(false);
  return (
    <div className="flex flex-1 flex-col items-center gap-1.5 rounded-3xl bg-card p-4 shadow-card">
      {/* No frame — the badge art stands on its own, tinted to its tier so each
          rank-up visibly changes the metal. */}
      <button
        type="button"
        aria-label={`${label} badge — hold to see it in full colour`}
        aria-pressed={held}
        onPointerDown={() => setHeld(true)}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        // Keyboard parity: hold Space/Enter for the same effect.
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") setHeld(true);
        }}
        onKeyUp={release}
        onBlur={release}
        // `select-none` alone was not enough to keep a long press out of the
        // browser's hands: holding the badge opened Chrome's image menu ("Copy
        // image", "Download image") instead of colourising. That is suppressed
        // app-wide now — styles.css plus src/lib/native-gestures.ts.
        className="touch-none select-none rounded-full transition active:scale-95"
      >
        <AppIcon
          src={art}
          className="h-20 w-20 drop-shadow transition-[filter] duration-150"
          style={{ filter: held ? "none" : st.filter }}
        />
      </button>
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
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="shrink-0 text-foreground/55">{label}</span>
      {/* GO colours the number, not the label — the eye lands on the figure. */}
      <span className="font-display-md tabular-nums text-primary">{value.toLocaleString()}</span>
    </div>
  );
}

/** GO's section heading: a centred caption with a hairline under it, which is
 *  what separates its stacked cards without needing a heavier divider. */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div className="font-pixel-xs tracking-[0.2em] text-primary">{children}</div>
      <div className="mt-1.5 h-px w-16 rounded-full bg-primary/25" />
    </div>
  );
}

function ArenaPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const trainerName = useGameStore((s) => s.trainerName);
  const level = useGameStore((s) => s.level);
  const arenaStats = useGameStore((s) => s.arenaStats);
  const claimArenaReward = useGameStore((s) => s.claimArenaReward);

  const [scanOpen, setScanOpen] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);

  const [recentMatches, setRecentMatches] = useState<RecentNearbyMatch[]>([]);
  const [board, setBoard] = useState<{ top: LeaderboardRow[]; me: LeaderboardRow | null }>({
    top: [],
    me: null,
  });

  // Rating only moves on human matches, so an all-bot player has no standing
  // and the card stays hidden rather than showing them a rank of nothing.
  useEffect(() => {
    let cancelled = false;
    void fetchPvpLeaderboard(5).then((b) => {
      if (!cancelled) setBoard(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  // Recent Nearby Battles strip — a lightweight entry point into match chat,
  // not an inbox. RLS on pvp_live_matches already scopes rows to matches the
  // caller is a participant of.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await ensureSession();
      if (!uid || cancelled) return;
      const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // Queue matches are excluded: this strip exists only to reopen a chat,
      // and strangers paired by matchmaking have no chat channel to reopen
      // (send_pvp_chat_message refuses them server-side). Listing them would
      // offer a button that is guaranteed to fail.
      const { data, error } = await supabase
        .from("pvp_live_matches")
        .select("id, host_id, guest_id, created_at, status, match_source")
        .eq("is_bot_match", false)
        .or("match_source.is.null,match_source.neq.queue")
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

  // ── Online matchmaking ────────────────────────────────────────────────────
  // Polling rather than realtime on purpose: the pairing RPC is the only thing
  // that can pair, and calling it is also what keeps this player's place in the
  // line alive, so one call does both jobs. The waiting side needs no signal of
  // its own — LivePvpWatcher pulls it into the match the instant the row lands.
  const QUEUE_POLL_MS = 5000;
  /** How long to hold out for a human before dropping into a Training battle.
   *  The fallback is automatic rather than a button: the player asked to
   *  battle, and with a small player base an empty queue is the normal case,
   *  so making them acknowledge that is a dead end wearing a prompt. */
  const QUEUE_FALLBACK_S = 30;
  const [queueWaitS, setQueueWaitS] = useState<number | null>(null);
  const queueTicketRef = useRef<QueueTicket | null>(null);
  const queueTimersRef = useRef<number[]>([]);
  const fallenBackRef = useRef(false);
  /**
   * True from the moment the search gives up until the Training battle is on
   * screen. Without it the face-off unmounted the instant the queue stopped and
   * the Arena flashed back up for the second or two `startTrainingMatch` takes,
   * which read as "matchmaking failed" rather than "here comes your opponent".
   */
  const [fallingBack, setFallingBack] = useState(false);
  const searching = queueWaitS !== null;

  const stopQueue = useCallback((leave: boolean) => {
    for (const t of queueTimersRef.current) window.clearInterval(t);
    queueTimersRef.current = [];
    queueTicketRef.current = null;
    setQueueWaitS(null);
    if (leave) void leaveQueue();
  }, []);

  // Abandoning the screen must abandon the line: a row left behind would pair
  // someone into a battle nobody is watching.
  useEffect(() => () => stopQueue(true), [stopQueue]);

  async function handleBattleOnline() {
    if (searching) return;
    if (rewardsBlockBattling) {
      toast.error(claimFirstMessage);
      return;
    }
    const prep = await prepareQueueTicket();
    if (!prep.ok) {
      toast.error(
        prep.error === "questions"
          ? "Couldn't prepare the battle. Try again."
          : "Couldn't reach matchmaking. Try again.",
      );
      return;
    }
    queueTicketRef.current = prep.ticket;
    fallenBackRef.current = false;
    setQueueWaitS(0);

    const attempt = async () => {
      const ticket = queueTicketRef.current;
      if (!ticket) return;
      const res = await attemptQueueMatch(ticket);
      if (!res.ok) {
        stopQueue(true);
        toast.error("Matchmaking dropped out. Try again.");
        return;
      }
      if (res.matched) {
        stopQueue(false); // the pairing already took us out of the queue
        void navigate({ to: "/pvp/live/$matchId", params: { matchId: res.matchId } });
      }
    };

    void attempt();
    queueTimersRef.current.push(
      window.setInterval(() => void attempt(), QUEUE_POLL_MS),
      window.setInterval(() => {
        setQueueWaitS((s) => {
          if (s === null) return s;
          const next = s + 1;
          // Guarded by a ref, not by the count: this runs inside a state
          // updater, which React may invoke more than once.
          if (next >= QUEUE_FALLBACK_S && !fallenBackRef.current) {
            fallenBackRef.current = true;
            // Hand straight over to the Training Bot: raise the flag BEFORE
            // stopping the queue so the face-off never unmounts between the two.
            setFallingBack(true);
            // Leave the line — a row left behind would pair someone into a
            // battle this player has already walked away from.
            stopQueue(true);
            // On success the flag is deliberately LEFT raised. `navigate` only
            // starts the transition, and the router keeps this route mounted
            // while the next one boots — clearing it here dropped the face-off
            // and showed the Arena again for a few hundred milliseconds, which
            // is the flash. The whole page is about to unmount, so there is
            // nothing to clean up; only a failure needs the Arena back.
            void handleStartTraining().then((navigated) => {
              if (!navigated) setFallingBack(false);
            });
          }
          return next;
        });
      }, 1000),
    );
  }

  /** Resolves true once the match route has been navigated to. */
  async function handleStartTraining(): Promise<boolean> {
    if (trainingBusy) return false;
    if (rewardsBlockBattling) {
      toast.error(claimFirstMessage);
      return false;
    }
    setTrainingBusy(true);
    try {
      const res = await startTrainingMatch();
      if (!res.ok) {
        toast.error(
          res.error === "questions"
            ? "Couldn't prepare the battle. Try again."
            : "Couldn't start training. Try again.",
        );
        return false;
      }
      void navigate({ to: "/pvp/live/$matchId", params: { matchId: res.matchId } });
      return true;
    } catch (e) {
      console.warn("[arena] startTraining failed:", e);
      toast.error("Couldn't start training. Try again.");
      return false;
    } finally {
      setTrainingBusy(false);
    }
  }

  // Battling is gated until every unlocked reward has been collected (owner
  // ruling 2026-07-26). Without this, an unclaimed slot can be silently
  // auto-granted when the set rolls over at 5 battles played, so the player
  // never sees what they earned. `set.wins` is how many slots are unlocked.
  const unclaimedRewards = ARENA_REWARD_SLOTS.filter(
    ({ slot }) => slot < arenaStats.set.wins && !arenaStats.set.claimed[slot],
  ).length;
  const rewardsBlockBattling = unclaimedRewards > 0;
  const claimFirstMessage =
    unclaimedRewards === 1
      ? "Collect your battle reward first."
      : `Collect your ${unclaimedRewards} battle rewards first.`;

  function handleClaim(slot: number) {
    const res = claimArenaReward(slot);
    if (res) toast.success(res.text);
  }

  if (!hydrated || !hasOnboarded) return null;

  if (searching || fallingBack) {
    return (
      <VersusScreen
        me={{
          name: trainerName || "You",
          spriteId: trainerSprite,
          level,
          rating: board.me?.rating ?? null,
        }}
        // The bot appears the moment the search gives up, so the handover looks
        // like an opponent arriving rather than the search failing.
        opponent={fallingBack ? trainingBotSide(level) : null}
        status={fallingBack ? "Battle starting…" : "Finding an opponent…"}
        detail={fallingBack ? undefined : `${queueWaitS}s elapsed…`}
        backdrop={VERSUS_BACKDROP}
        actions={
          searching ? (
            <Button
              variant="ghost"
              onClick={() => stopQueue(true)}
              className="h-11 w-full rounded-full font-bold text-white/70 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      {/* Header */}
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <p className="font-pixel-xs text-primary">WELCOME TO</p>
        <h1 className="font-display-lg text-foreground">Battle Arena</h1>
      </div>

      {/* ── Group 1 — trainer + record ─────────────────────────────────────── */}
      <div className="px-5 pt-3">
        <div className="flex items-center gap-3 rounded-3xl bg-card p-4 shadow-card">
          <img
            src={trainerSpriteUrl(trainerSprite)}
            alt={trainerSprite}
            className="sprite h-32 w-32 shrink-0 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <StatRow label="Wins" value={arenaStats.wins} />
            <StatRow label="Battles" value={arenaStats.battles} />
            <StatRow label="Longest Streak" value={arenaStats.longestWinStreak} />
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <span className="shrink-0 text-foreground/55">Berries</span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => {
                  const id = arenaStats.lastBerries[i];
                  return id ? (
                    <ItemIcon key={i} item={ITEM_BY_ID[id]} className="h-6 w-6" />
                  ) : (
                    <span
                      key={i}
                      className="flex h-6 w-6 items-center justify-center text-foreground/25"
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

      {/* ── Group 2 — the two badges ───────────────────────────────────────── */}
      <div className="flex gap-3 px-5 pt-3">
        <TrophyCard
          label="PVP"
          count={arenaStats.nearbyBattles}
          art={ARENA_BADGE_ICON.nearby}
        />
        <TrophyCard
          label="TRAINING"
          count={arenaStats.trainingBattles}
          art={ARENA_BADGE_ICON.training}
        />
      </div>

      {/* ── Group 3 — rewards, and the one button that starts a battle ─────── */}
      <div className="px-5 pt-3">
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <SectionLabel>BATTLE REWARDS</SectionLabel>
          <p className="mt-2 text-center text-xs text-foreground/60">
            Battle other trainers to unlock all 5 rewards.
          </p>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {ARENA_REWARD_SLOTS.map(({ slot, kind }) => {
              const unlocked = slot < arenaStats.set.wins;
              const claimed = arenaStats.set.claimed[slot];
              // The whole tile is the tap target when there's something to
              // collect — the COLLECT pill alone is ~14px tall, small enough
              // that a thumb regularly misses it and the tap reads as "nothing
              // happened, tap again".
              const tileCls = `flex min-h-[68px] w-full flex-col items-center justify-center gap-1 rounded-2xl p-2 text-center bg-muted/60 ${
                claimed ? "opacity-60" : ""
              }`;
              if (!claimed && unlocked) {
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => handleClaim(slot)}
                    aria-label={`Collect reward ${slot + 1}`}
                    className={`${tileCls} transition active:scale-95`}
                  >
                    <AppIcon src={REWARD_ICON[kind]} className="h-7 w-7" />
                    <span className="rounded-full bg-primary px-2 py-0.5 font-pixel text-[8px] text-primary-foreground">
                      COLLECT
                    </span>
                  </button>
                );
              }
              return (
                <div key={slot} className={tileCls}>
                  <AppIcon
                    src={claimed ? REWARD_ICON[kind] : LOCK_ICON}
                    className={claimed ? "h-7 w-7" : "h-9 w-9 opacity-50"}
                  />
                </div>
              );
            })}
          </div>
          {/* GO puts its BATTLE button directly under the reward row, so the
              rewards read as what this button is FOR. Same here — and it is now
              the only way in, since Online falls back to Training by itself. */}
          <Button
            onClick={() => void handleBattleOnline()}
            disabled={rewardsBlockBattling || trainingBusy}
            className="mt-4 h-14 w-full rounded-full bg-gradient-to-b from-primary to-primary/85 text-lg font-bold tracking-wide shadow-pop transition active:scale-[0.98] disabled:opacity-60"
          >
            {trainingBusy ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Swords className="mr-2 h-5 w-5" />
            )}
            {trainingBusy ? "Starting…" : "Battle"}
          </Button>
          <div className="mt-3 text-center text-[11px] text-foreground/55">
            {arenaStats.set.battles}/5 battles played
          </div>
          {/* Says WHY the Battle button is disabled — a dead button with no
              explanation is the worse failure. */}
          {rewardsBlockBattling && (
            <p className="mt-2 text-center text-[11px] font-semibold text-primary">
              {claimFirstMessage}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 px-5 pt-3">
          {board.top.length > 0 && (
            <div className="rounded-3xl bg-card p-4 shadow-card">
              <SectionLabel>RANKED</SectionLabel>
              {board.me && board.me.ratingMatches > 0 && (
                <div className="mt-2 text-center text-xs text-foreground/60">
                  You: <span className="font-bold text-foreground">{board.me.rating}</span> · #
                  {board.me.position}
                </div>
              )}
              <div className="mt-2 space-y-1.5">
                {board.top.map((row) => (
                  <div
                    key={row.id}
                    className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${
                      board.me && row.id === board.me.id ? "bg-primary/10" : ""
                    }`}
                  >
                    <span className="w-5 shrink-0 text-center font-pixel-xs text-foreground/50">
                      {row.position}
                    </span>
                    <img
                      src={trainerSpriteUrl(row.trainerSprite)}
                      alt=""
                      className="sprite h-6 w-6 shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0";
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                      {row.trainerName}
                    </span>
                    <span className="shrink-0 text-sm font-bold text-foreground">{row.rating}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-center text-[11px] text-foreground/50">
                Only battles against people count. Training never moves your rating.
              </p>
            </div>
          )}

          {/* ── Group 4 — Nearby Battle (QR + scanner) ────────────────────── */}
          <div className="rounded-3xl bg-card p-4 shadow-card">
            <SectionLabel>NEARBY BATTLE</SectionLabel>
            {/* Scanner replaces the QR in place — same footprint, no layout jump. */}
            <div className="mt-3 rounded-2xl bg-primary/5 p-3">
              {scanOpen ? (
                <ScanPanel active={scanOpen} onClose={() => setScanOpen(false)} />
              ) : (
                <BattleCodeQr />
              )}
              <p className="mt-2 text-center text-xs font-semibold text-foreground/70">
                {scanOpen
                  ? "Point your camera at a nearby trainer's Battle Code."
                  : "Scan this Battle Code with another device to battle!"}
              </p>
              <Button
                onClick={() => {
                  if (rewardsBlockBattling) {
                    toast.error(claimFirstMessage);
                    return;
                  }
                  setScanOpen((v) => !v);
                }}
                disabled={rewardsBlockBattling && !scanOpen}
                className="mt-3 h-12 w-full rounded-full font-bold shadow-pop transition active:scale-[0.98]"
              >
                <QrCode className="mr-1.5 h-4 w-4" />
                {scanOpen ? "Show My Battle Code" : "Scan a Battle Code"}
              </Button>
            </div>
          </div>
        </div>

      {/* Recent Nearby Battles — lightweight chat entry point */}
      {recentMatches.length > 0 && (
        <div className="px-5 pt-4">
          <div className="font-pixel-xs text-primary">RECENT PVP BATTLES</div>
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
