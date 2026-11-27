import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { NaIcon } from "@/components/na/icon";
import { FitSprite } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { routeGym, stopsLeft } from "@/lib/route";
import type { BattleLogEntry } from "@/lib/store/types";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { ItemIcon } from "@/components/game-ui";
import { AppIcon } from "@/components/app-icon";
import {
  REWARD_ICON,
  ARENA_BADGE_ICON,
  VERSUS_BACKDROP,
  TRAINING_BOT_AVATAR,
} from "@/lib/app-icons";
import { BattleCodeQr } from "@/components/battle-code-qr";
import { VersusScreen } from "@/components/versus-screen";
import { trainingBotSide } from "@/lib/training-bot";
import { ScanPanel } from "@/components/NearbyBattleSheet";
import { getWeekRangeUtc, trainerArtFor, trainerSpriteUrl } from "@/lib/game-data";
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
  head: () => pageHead("/arena"),
  component: ArenaPage,
  // `nearby: 1` came from PvP Rematch and used to force the Battle tab. There
  // are no tabs any more — Battle is the whole page — so nothing reads it, but
  // pvp.live.$matchId.tsx still navigates with it, and dropping the validator
  // would make that a search param the router rejects. Accepted and ignored.
  validateSearch: (s: Record<string, unknown>): { nearby?: 1 } => (s.nearby ? { nearby: 1 } : {}),
});

const NEXT_TIER: Record<TrophyTier, string> = { none: "bronze", bronze: "silver", silver: "gold", gold: "platinum", platinum: "platinum" };
/** The medal's ring shows the tier you've reached. */
const TIER_RING: Record<TrophyTier, string> = { none: "", bronze: "border-amber-600", silver: "border-slate-300", gold: "border-reward-gold", platinum: "border-violet-300" };

/**
 * One Arena badge (7.2): the medal tinted to its tier (hold it to see its own
 * colours), the name, a line, the meter and how many battles to the next tier.
 */
function TrophyCard({ label, sub, count, art, icon }: { label: string; sub: string; count: number; art: string; icon: React.ReactNode }) {
  const { tier, next } = trophyTier(count);
  const pct = next === null ? 100 : Math.min(100, Math.round((count / next) * 100));
  // Pointer events cover touch, pen and mouse; cancel catches a scroll stealing the press.
  const [held, setHeld] = useState(false);
  const release = () => setHeld(false);
  return (
    <div className="na-glass flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-[20px] p-3.5 text-center">
      <button
        type="button"
        aria-label={`${label} badge: hold to see it in full colour`}
        aria-pressed={held}
        onPointerDown={() => setHeld(true)}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") setHeld(true);
        }}
        onKeyUp={release}
        onBlur={release}
        className={`flex h-[68px] w-[68px] touch-none select-none items-center justify-center rounded-full border-2 bg-night-card-2 ${tier === "none" ? "border-reward-gold/60" : TIER_RING[tier]}`}
      >
        {held ? <AppIcon src={art} className="h-11 w-11" /> : icon}
      </button>
      <span className="na-headline text-foreground">{label}</span>
      <span className="na-caption text-text-secondary">{sub}</span>
      <span className="block h-2 w-full overflow-hidden rounded bg-night-deep">
        <span className="na-fill-gold block h-full rounded" style={{ width: `${Math.max(2, pct)}%` }} />
      </span>
      <span className="na-label whitespace-nowrap tracking-normal text-text-muted">{next === null ? `${count} · MAX` : `${count} of ${next} battles to ${NEXT_TIER[tier]}`}</span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="na-body text-text-secondary">{label}</span>
      <span className="na-number-l text-brand-red-light">{value.toLocaleString()}</span>
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
  const battleLog = useGameStore((s) => s.battleLog);
  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const route = useGameStore((s) => s.route);
  const [historyOpen, setHistoryOpen] = useState(false);
  // The Weekly League card shows the gym on your route (same rules as Home).
  const leader = routeGym(route);
  const badgeName = leader.badge;
  const gymLeft = stopsLeft(route);
  const weekDone = weeklyLeague?.gymLeaderId === leader.id && (weeklyLeague.status === "won" || weeklyLeague.status === "lost");
  const daysLeft = Math.max(1, Math.ceil((getWeekRangeUtc().nextStart - Date.now()) / 86_400_000));

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
    for (const src of new Set([
      versusBackdropSrc(versusBackdropId),
      VERSUS_BACKDROP,
      // The bot's animated avatar. Its half is Forest, already in this set.
      ...(TRAINING_BOT_AVATAR ? [TRAINING_BOT_AVATAR] : []),
    ])) {
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
            // Figma 15.1: a secondary M button sized to its word, not a primary action.
            <NaButton kind="secondary" size="M" onClick={() => stopQueue(true)}>
              Cancel
            </NaButton>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto pb-nav safe-x">
      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+8px)]">
        {/* Header: ARENA and the match chat (rendered even with nothing to open; it says so). */}
        <div className="flex items-center gap-2">
          <h1 className="na-display-m flex-1 text-foreground">ARENA</h1>
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
            className={`press flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-card-2 shadow-[0_4px_0_#141A3F] ${latestChatMatchId ? "text-foreground" : "text-text-muted"}`}
          >
            <NaIcon name="chat" size={22} />
          </button>
        </div>

        {/* Weekly League first (7.2): this week's gym on your route. It opens on Home's route once every stop is beaten. */}
        <div className="na-card flex flex-col gap-2 rounded-[22px] border-[1.5px] border-reward-gold/50 p-4">
          <div className="flex items-center gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="na-label uppercase text-reward-gold">Weekly League</span>
              <span className="na-display-s text-foreground">Gym Leader {leader.name}</span>
              <span className="na-caption text-text-secondary">
                {weekDone
                  ? weeklyLeague?.status === "won"
                    ? `You won the ${badgeName}! A new gym opens Monday.`
                    : `${leader.name} is ready for a rematch on Monday.`
                  : `Ends in ${daysLeft} day${daysLeft === 1 ? "" : "s"} · Win the ${badgeName}!`}
              </span>
            </div>
            <FitSprite id={leader.signaturePokemonId} size={64} />
          </div>
          {!weekDone && (
            <NaButton size="M" block onClick={() => void navigate({ to: "/battle", search: { autostart: 0 } as never })}>
              {gymLeft === 0 ? "Challenge" : `Beat ${gymLeft} more trainer${gymLeft === 1 ? "" : "s"} first`}
            </NaButton>
          )}
        </div>

        {/* Your record: Arena numbers only, so a solo win no longer reads as "Wins 0". */}
        <div className="na-glass flex items-center gap-3.5 rounded-[22px] p-3.5">
          <img
            src={trainerSpriteUrl(trainerSprite)}
            alt={trainerSprite}
            className="sprite h-[88px] w-[88px] shrink-0 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <StatRow label="Arena wins" value={arenaStats.wins} />
            <StatRow label="Arena battles" value={arenaStats.battles} />
            <StatRow label="Best win streak" value={arenaStats.longestWinStreak} />
            <div className="flex items-center justify-between gap-2">
              <span className="na-body text-text-secondary">Last berries</span>
              <span className="flex gap-1">
                {[0, 1, 2].map((i) => {
                  const id = arenaStats.lastBerries[i];
                  return id ? (
                    <ItemIcon key={i} item={ITEM_BY_ID[id]} className="h-[22px] w-[22px]" />
                  ) : (
                    <span key={i} className="h-[22px] w-[22px] rounded-[7px] bg-night-deep/50" />
                  );
                })}
              </span>
            </div>
          </div>
        </div>

        {/* The two badges: battles against trainers, and with the Training Bot. */}
        <div className="flex gap-2.5">
          <TrophyCard
            label="Trainer Battles"
            sub="Battle real players live!"
            count={arenaStats.nearbyBattles}
            art={ARENA_BADGE_ICON.nearby}
            icon={<NaIcon name="arena" size={36} />}
          />
          <TrophyCard label="Training Bot" sub="Practice anytime" count={arenaStats.trainingBattles} art={ARENA_BADGE_ICON.training} icon={<NaGlossIcon kind="bot" size={36} />} />
        </div>

        {/* Battle Rewards and Leaderboard share one card, with Battle now under them. */}
        <div className="na-glass flex flex-col gap-3 rounded-[22px] p-4">
          <div role="tablist" className="flex gap-1 rounded-[14px] bg-night-deep/60 p-1">
            {(
              [
                ["rewards", "Battle Rewards"],
                ["ranked", "Leaderboard"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={group3Tab === key}
                onClick={() => setGroup3Tab(key)}
                className={`flex h-[38px] flex-1 items-center justify-center rounded-[10px] ${
                  group3Tab === key ? "na-body-strong bg-night-card-2 text-foreground shadow-[0_4px_0_#141A3F]" : "na-body text-text-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex min-h-[96px] flex-col justify-center gap-3">
            {group3Tab === "rewards" ? (
              <>
                <p className="na-body text-center text-text-secondary">Win trainer battles to unlock all 5 rewards!</p>
                <div className="flex justify-between">
                  {ARENA_REWARD_SLOTS.map(({ slot, kind }) => {
                    const unlocked = slot < arenaStats.set.wins;
                    const claimed = arenaStats.set.claimed[slot];
                    const tile = `flex h-14 w-14 flex-col items-center justify-center gap-0.5 rounded-2xl bg-night-deep/50 ${claimed ? "opacity-60" : ""}`;
                    return !claimed && unlocked ? (
                      <button key={slot} type="button" onClick={() => handleClaim(slot)} aria-label={`Collect reward ${slot + 1}`} className={`${tile} press border-2 border-reward-gold`}>
                        <AppIcon src={REWARD_ICON[kind]} className="h-7 w-7" />
                      </button>
                    ) : (
                      <span key={slot} className={tile}>
                        {claimed ? <AppIcon src={REWARD_ICON[kind]} className="h-7 w-7" /> : <NaGlossIcon kind="lock" size={22} />}
                      </span>
                    );
                  })}
                </div>
              </>
            ) : board.rows.length === 0 ? (
              <p className="na-body text-center text-text-secondary">Win a battle against another trainer to join the leaderboard!</p>
            ) : (
              <>
                <p className="na-caption text-center text-text-secondary">
                  {board.ranked && board.me ? `You: ${board.me.rating} · #${board.me.position} of ${board.total}` : `Top ${board.rows.length}. Win a ranked battle to take your place!`}
                </p>
                <div className="flex flex-col gap-1.5">
                  {board.rows.map((row) => (
                    <div key={row.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${board.me && row.id === board.me.id ? "bg-primary/15" : ""}`}>
                      <span className="na-label w-5 shrink-0 text-center text-text-muted">{row.position}</span>
                      <img
                        src={trainerSpriteUrl(row.trainerSprite)}
                        alt=""
                        className="sprite h-6 w-6 shrink-0"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).style.opacity = "0";
                        }}
                      />
                      <span className="na-body-strong min-w-0 flex-1 truncate text-foreground">{row.trainerName}</span>
                      <span className="na-number-m shrink-0 text-foreground">{row.rating}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          <NaButton block onClick={() => void handleBattleOnline()} disabled={rewardsBlockBattling || trainingBusy}>
            {trainingBusy ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" /> Starting…
              </>
            ) : (
              "Battle now"
            )}
          </NaButton>
          <p className={`na-caption text-center ${rewardsBlockBattling ? "text-brand-red-light" : "text-text-secondary"}`}>
            {rewardsBlockBattling
              ? claimFirstMessage
              : `${arenaStats.set.battles}/5 battles played. We'll find a trainer near your level. No match in 20 seconds? Battle the Training Bot!`}
          </p>
        </div>

        {/* Nearby Battle: show your Battle Code, or scan theirs (the scanner takes the code's place). */}
        <div className="flex flex-col items-center gap-3 rounded-[22px] border border-primary/50 bg-white/[0.08] p-4">
          <span className="na-label uppercase text-brand-red-light">Nearby Battle</span>
          <span className="na-body-strong text-foreground">{scanOpen ? "Point your camera at their Battle Code!" : "Challenge a friend nearby!"}</span>
          <div className="w-full max-w-[220px]">{scanOpen ? <ScanPanel active={scanOpen} onClose={() => setScanOpen(false)} /> : <BattleCodeQr />}</div>
          <NaButton
            size="M"
            onClick={() => {
              if (rewardsBlockBattling) {
                toast.error(claimFirstMessage);
                return;
              }
              setScanOpen((v) => !v);
            }}
            disabled={rewardsBlockBattling && !scanOpen}
          >
            {scanOpen ? "Show my code" : "Scan a Battle Code"}
          </NaButton>
        </div>

        {/* Recent battles, moved here from Profile. See all opens 7.2c. */}
        <div className="na-glass flex flex-col gap-2.5 rounded-[22px] p-4">
          <div className="flex items-center justify-between">
            <span className="na-label uppercase text-text-secondary">Recent battles</span>
            {battleLog.length > 3 && (
              <button type="button" onClick={() => setHistoryOpen(true)} className="na-body-strong text-[#5b8cff]">
                See all
              </button>
            )}
          </div>
          {battleLog.length === 0 ? (
            <p className="na-body text-text-secondary">No battles yet. Your first one is waiting!</p>
          ) : (
            battleLog.slice(0, 3).map((e, i) => <HistoryRow key={i} e={e} compact />)
          )}
        </div>
      </div>

      {historyOpen && <BattleHistory log={battleLog} onClose={() => setHistoryOpen(false)} />}
    </div>
  );
}

/** One battle in the history: result, who, which mode and when. */
function HistoryRow({ e, compact }: { e: BattleLogEntry; compact?: boolean }) {
  const chip = (
    <span className={`na-label shrink-0 rounded-lg px-2 py-[3px] ${e.won ? "bg-success/[0.18] text-success" : "bg-danger/[0.18] text-danger"}`}>{e.won ? "WIN" : "LOSS"}</span>
  );
  const s = compact ? 36 : 40;
  return (
    <div className={`flex items-center gap-2.5 ${compact ? "" : "rounded-2xl bg-white/[0.08] p-3"}`}>
      {compact && chip}
      <span className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-night-card-2" style={{ width: s, height: s }}>
        <img src={(e.opponent === "Training Bot" && TRAINING_BOT_AVATAR) || trainerArtFor(e.opponent)} alt="" className="sprite object-contain" style={{ width: s, height: s }} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="na-body-strong truncate text-foreground">{e.opponent}</span>
        <span className="na-caption text-text-secondary">
          {MODE_NAME[e.mode ?? "battle"] ?? "Battle"} · {whenLabel(e.timestamp)}
        </span>
      </span>
      {!compact && chip}
    </div>
  );
}

const MODE_NAME: Record<string, string> = {
  battle: "Solo battle",
  elite: "Elite Four",
  weekly: "Weekly League",
  mega: "Mega Raid",
  pvp: "Trainer battle",
  nearby: "Nearby Battle",
  daily: "Daily Quest",
  whosthat: "Who's That?",
};

function whenLabel(ts: number) {
  const day = (t: number) => Math.floor(t / 86_400_000);
  const d = day(Date.now()) - day(ts);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Figma 7.2c Battle history: All / Wins / Losses, grouped by when. */
function BattleHistory({ log, onClose }: { log: BattleLogEntry[]; onClose: () => void }) {
  const [show, setShow] = useState<"all" | "wins" | "losses">("all");
  const rows = log.filter((e) => show === "all" || (show === "wins") === e.won);
  const groups: [string, BattleLogEntry[]][] = [
    ["TODAY", rows.filter((e) => whenLabel(e.timestamp) === "today")],
    ["THIS WEEK", rows.filter((e) => whenLabel(e.timestamp) !== "today" && Date.now() - e.timestamp < 7 * 86_400_000)],
    ["EARLIER", rows.filter((e) => Date.now() - e.timestamp >= 7 * 86_400_000)],
  ];
  return (
    <div className="na-bg-night fixed inset-0 z-50 flex flex-col overflow-y-auto pt-[env(safe-area-inset-top)]">
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
          <NaIcon name="arrow-left" size={20} />
        </button>
        <h1 className="na-display-s flex-1 text-foreground">Battle history</h1>
      </div>
      <div className="flex flex-col gap-2.5 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <div role="tablist" className="flex gap-1 rounded-[14px] bg-night-deep/60 p-1">
          {(["all", "wins", "losses"] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={show === k}
              onClick={() => setShow(k)}
              className={`flex h-[38px] flex-1 items-center justify-center rounded-[10px] capitalize ${show === k ? "na-body-strong bg-night-card-2 text-foreground shadow-[0_4px_0_#141A3F]" : "na-body text-text-secondary"}`}
            >
              {k}
            </button>
          ))}
        </div>
        {groups.map(([label, g]) =>
          g.length ? (
            <div key={label} className="flex flex-col gap-2.5">
              <span className="na-label text-text-muted">{label}</span>
              {g.map((e, i) => (
                <HistoryRow key={i} e={e} />
              ))}
            </div>
          ) : null,
        )}
        {rows.length === 0 && <p className="na-body py-6 text-center text-text-secondary">Nothing here yet!</p>}
      </div>
    </div>
  );
}
