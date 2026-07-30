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
import { versusBackdropSrc } from "@/lib/versus-backdrops";
import { ITEM_BY_ID } from "@/content/items";
import { ARENA_REWARD_SLOTS, trophyTier, type TrophyTier } from "@/lib/arena-rewards";
import { stopBgm } from "@/lib/audio";
import {
  startTrainingMatch,
  prepareQueueTicket,
  attemptQueueMatch,
  leaveQueue,
  type QueueTicket,
} from "@/lib/pvp-live";
import { fetchPvpRatingWindow, type LeaderboardRow } from "@/lib/pvp";
import { ensureSession } from "@/lib/social";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/arena")({
  component: ArenaPage,
  // `nearby: 1` came from PvP Rematch and used to force the Battle tab. There
  // are no tabs any more — Battle is the whole page — so nothing reads it, but
  // pvp.live.$matchId.tsx still navigates with it, and dropping the validator
  // would make that a search param the router rejects. Accepted and ignored.
  validateSearch: (s: Record<string, unknown>): { nearby?: 1 } => (s.nearby ? { nearby: 1 } : {}),
});

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
  const versusBackdropId = useGameStore((s) => s.versusBackdropId);
  const claimArenaReward = useGameStore((s) => s.claimArenaReward);

  const [scanOpen, setScanOpen] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);

  const [latestChatMatchId, setLatestChatMatchId] = useState<string | null>(null);
  const [board, setBoard] = useState<{
    rows: LeaderboardRow[];
    me: LeaderboardRow | null;
    ranked: boolean;
    total: number;
  }>({
    rows: [],
    ranked: false,
    total: 0,
    me: null,
  });
  /** Which half of the Group 3 card is showing. The reward slots and the
   *  rankings are the same size and the same kind of thing — a scoreboard —
   *  so they share one panel instead of stacking two cards down the page. */
  const [group3Tab, setGroup3Tab] = useState<"rewards" | "ranked">("rewards");

  // Rating only moves on human matches, so an all-bot player has no standing
  // and the card stays hidden rather than showing them a rank of nothing.
  useEffect(() => {
    let cancelled = false;
    // Three rows, not five: the board shares a fixed-height panel with the
    // reward slots now, and three is what fits without the Battle button
    // underneath moving when the player switches tabs.
    //
    // A WINDOW, not a top 3 — owner request. The player is always one of the
    // three, with the trainer above and the trainer below them on rating; at
    // either end of the table the window slides so three still show. Computed in
    // the database, since a player at #40 has neighbours no top-N fetch holds.
    void fetchPvpRatingWindow(3).then((b) => {
      if (!cancelled) setBoard(b);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Warm the two backdrops the face-off is about to need. The whole point of
  // putting that screen up within 83ms of the tap is undone if it then spends
  // a few hundred milliseconds on a bare gradient waiting for artwork; fetched
  // here, it is in cache before the Battle button is pressed.
  useEffect(() => {
    for (const src of new Set([versusBackdropSrc(versusBackdropId), VERSUS_BACKDROP])) {
      const img = new Image();
      img.src = src;
    }
  }, [versusBackdropId]);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  // What the header's chat button opens: the most recent Nearby Battle of the
  // last 24 hours. This used to be a five-row "RECENT PVP BATTLES" strip, which
  // repeated the Battle History list on Profile — same battles, second place to
  // read them. Only the chat entry point was unique to it, so only that
  // survives. RLS on pvp_live_matches already scopes rows to matches the caller
  // took part in.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const uid = await ensureSession();
      if (!uid || cancelled) return;
      const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      // Queue matches are excluded: strangers paired by matchmaking have no
      // chat channel to reopen (send_pvp_chat_message refuses them
      // server-side), so offering one is a button guaranteed to fail.
      const { data, error } = await supabase
        .from("pvp_live_matches")
        .select("id")
        .eq("is_bot_match", false)
        .or("match_source.is.null,match_source.neq.queue")
        .gt("created_at", cutoffIso)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        console.warn("[arena] recent nearby battle fetch failed:", error.message);
        return;
      }
      if (cancelled) return;
      setLatestChatMatchId((data as { id?: string } | null)?.id ?? null);
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
  // Mirrors queueWaitS for the async gap in handleBattleOnline: the ticket
  // fetch can outlive a Cancel, and the state it closed over would be stale.
  const queueWaitSRef = useRef<number | null>(null);
  queueWaitSRef.current = queueWaitS;

  const stopQueue = useCallback((leave: boolean) => {
    for (const t of queueTimersRef.current) window.clearInterval(t);
    queueTimersRef.current = [];
    queueTicketRef.current = null;
    queueWaitSRef.current = null;
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
    // The face-off goes up FIRST. Preparing the ticket fetches twenty questions
    // over the network, and waiting for that before showing anything left the
    // Battle button dead for a second or two — the tap looked like it missed.
    // The search screen is honest during that window: it really is searching.
    fallenBackRef.current = false;
    setQueueWaitS(0);
    // The Arena's music belongs to the Arena. Silence rather than a queue theme
    // until that track exists — playBgm("arena") on a screen you have left is
    // worse than nothing.
    stopBgm();
    const tick = window.setInterval(() => {
      setQueueWaitS((s) => {
        if (s === null) return s;
        const next = s + 1;
        // Guarded by a ref, not by the count: this runs inside a state updater,
        // which React may invoke more than once.
        if (next >= QUEUE_FALLBACK_S && !fallenBackRef.current) {
          fallenBackRef.current = true;
          // Raise the flag BEFORE stopping the queue so the face-off never
          // unmounts between the two, and leave the line — a row left behind
          // would pair someone into a battle they have walked away from.
          setFallingBack(true);
          stopQueue(true);
          // On success the flag is deliberately LEFT raised: `navigate` only
          // starts the transition and the router keeps this route mounted while
          // the next one boots, so clearing it here showed the Arena again for
          // a few hundred milliseconds. Only a failure needs the Arena back.
          void handleStartTraining().then((navigated) => {
            if (!navigated) setFallingBack(false);
          });
        }
        return next;
      });
    }, 1000);
    queueTimersRef.current.push(tick);

    const prep = await prepareQueueTicket();
    // Cancelled, or already fell through to Training, while the questions were
    // in flight — either way this ticket has nowhere to go.
    if (queueWaitSRef.current === null || fallenBackRef.current) return;
    if (!prep.ok) {
      stopQueue(true);
      toast.error(
        prep.error === "questions"
          ? "Couldn't prepare the battle. Try again."
          : "Couldn't reach matchmaking. Try again.",
      );
      return;
    }
    queueTicketRef.current = prep.ticket;

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
    queueTimersRef.current.push(window.setInterval(() => void attempt(), QUEUE_POLL_MS));
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
          backdrop: versusBackdropSrc(versusBackdropId),
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
              onClick={() => stopQueue(true)}
              // Reads as a button — bordered pill, not a text link — but sized
              // to its word rather than the screen. Cancel is the way OUT of
              // the thing you just asked for; full width gave it the weight of
              // a primary action.
              className="mx-auto h-10 w-auto rounded-full border border-white/60 bg-white/10 px-8 text-sm font-bold text-white backdrop-blur-sm transition hover:bg-white/20 active:scale-[0.98]"
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
      {/* Header. Chat lives here now, level with the title, because the list it
          used to hang off is gone — see `latestChatMatchId`. */}
      <div className="flex items-center justify-between gap-3 px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <div className="min-w-0">
          <p className="font-pixel-xs text-primary">WELCOME TO</p>
          <h1 className="font-display-lg text-foreground">Battle Arena</h1>
        </div>
        {/* Rendered even with nothing to open, and it says so when tapped. A
            button that pops into the header a second after the page settles
            shifts the title under the player's thumb. */}
        <button
          type="button"
          aria-label="Open match chat"
          onClick={() => {
            if (!latestChatMatchId) {
              toast.error("No recent Nearby Battle to chat about yet.");
              return;
            }
            void navigate({ to: "/pvp/chat/$matchId", params: { matchId: latestChatMatchId } });
          }}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-card shadow-card transition active:scale-95 ${
            latestChatMatchId ? "text-primary" : "text-foreground/35"
          }`}
        >
          <MessageCircle className="h-5 w-5" />
        </button>
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
        <TrophyCard label="PVP" count={arenaStats.nearbyBattles} art={ARENA_BADGE_ICON.nearby} />
        <TrophyCard
          label="TRAINING"
          count={arenaStats.trainingBattles}
          art={ARENA_BADGE_ICON.training}
        />
      </div>

      {/* ── Group 3 — rewards, and the one button that starts a battle ─────── */}
      <div className="px-5 pt-3">
        <div className="rounded-3xl bg-card p-4 shadow-card">
          {/* Two views of the same thing — what this battle earns you, and where
              it puts you — sharing one panel. The rankings used to be a second
              card further down; folded in here they cost no extra height. */}
          <div className="flex gap-1 rounded-full bg-muted/60 p-1">
            {(
              [
                ["rewards", "BATTLE REWARDS"],
                ["ranked", "RANKED"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setGroup3Tab(key)}
                aria-pressed={group3Tab === key}
                className={`flex-1 rounded-full py-2 font-pixel-xs tracking-[0.12em] transition ${
                  group3Tab === key
                    ? "bg-card text-primary shadow-card"
                    : "text-foreground/45 active:scale-[0.98]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* One fixed height for both panels, sized to the taller (the top 3),
              so the Battle button underneath stays put when the player
              switches. The shorter panel centres in the slack rather than
              leaving a gap under itself. */}
          <div className="flex min-h-[144px] flex-col justify-center">
            {group3Tab === "rewards" ? (
              <>
                <p className="text-center text-xs text-foreground/60">
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
              </>
            ) : board.rows.length === 0 ? (
              // Rating only moves on human matches, so before anyone has played
              // one there is no table to show — say why rather than draw an
              // empty one.
              <p className="px-2 text-center text-xs text-foreground/60">
                Win a battle against another trainer to join the rankings.
              </p>
            ) : (
              <>
                {board.ranked && board.me ? (
                  <div className="text-center text-xs text-foreground/60">
                    You: <span className="font-bold text-foreground">{board.me.rating}</span> · #
                    {board.me.position} of {board.total}
                  </div>
                ) : (
                  // Not on the board yet, so the three rows are the top three
                  // instead of a window — say so rather than let it look like the
                  // player is ranked among them.
                  <div className="text-center text-xs text-foreground/60">
                    Top {board.rows.length} — win a ranked battle to take your place
                  </div>
                )}
                <div className="mt-2 space-y-1.5">
                  {board.rows.map((row) => (
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
                      <span className="shrink-0 text-sm font-bold text-foreground">
                        {row.rating}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
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

      {/* ── Group 4 — Nearby Battle (QR + scanner) ─────────────────────────── */}
      <div className="px-5 pt-3">
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

      <div className="pb-8" />
    </div>
  );
}
