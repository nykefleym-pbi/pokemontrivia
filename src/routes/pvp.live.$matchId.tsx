import { noindexHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { ItemIcon, PokeballSpinner } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getLivePvpMatch,
  forfeitLivePvpMatch,
  subscribeToLivePvpEffects,
  setLivePvpPartner,
  startTrainingMatch,
  isFreshlyStartedBotMatch,
  noteAppliedRev,
  forgetAppliedRev,
  type LivePvpMatch,
  type LivePvpEffect,
} from "@/lib/pvp-live";
import type { SigRuntimeMap } from "@/lib/signature-rework-types";
import { LivePvpBattleScreen, type LivePvpBattleResult } from "@/components/live-pvp-battle-screen";
import { getProfileById, ensureSession, type TrainerProfile } from "@/lib/social";
import { supabase } from "@/integrations/supabase/client";
import { playBgm, playBattleResult } from "@/lib/audio";
import {
  ITEMS,
  rollBerryDrops,
  STARTER_PVP_BERRY,
  rankForLevel,
  trainerSpriteUrl,
} from "@/lib/game-data";
import { PVP_QUESTIONS, PVP_MAX_HP } from "@/lib/pvp-combat";
import { useForfeitGuard } from "@/lib/use-forfeit-guard";
import { resolvePvpTypeAbilityId } from "@/lib/pvp-type-abilities";
import { useBattleFxCues } from "@/hooks/useBattleFxCues";
import { AddFriendPrompt } from "@/components/add-friend-prompt";
import { MistakesReview } from "@/components/mistakes-review";
import { FittedTrainer } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { NaGlassRow, NaRewardTile, NaWordmark } from "@/components/na/celebration";
import { NaIcon } from "@/components/na/icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { BAG_SHORT_DESC } from "@/lib/item-categories";
import type { ItemId } from "@/lib/game-data";
import type { MissedAnswer } from "@/lib/trivia-core";
import { ShareCardDialog } from "@/components/share-card-dialog";
import { VersusScreen } from "@/components/versus-screen";
import { trainingBotSide } from "@/lib/training-bot";
import { versusBackdropSrc } from "@/lib/versus-backdrops";
import { VERSUS_BACKDROP } from "@/lib/app-icons";
import type { BattleShareData } from "@/components/share-card-builder";

export const Route = createFileRoute("/pvp/live/$matchId")({
  head: () => noindexHead(),
  component: LivePvpMatchPage,
});

const FORFEIT_GRACE_MS = 30_000;

type Phase = "loading" | "not_found" | "battle" | "result" | "forfeit_won" | "forfeit_lost";

function phaseFor(m: LivePvpMatch): Phase {
  if (m.status === "forfeited") return "forfeit_lost"; // resolved below via winnerId check
  if (m.status === "completed") return "result";
  return "battle";
}

/**
 * Route component: just resolves `matchId` and keys `MatchPageContent` on it.
 * TanStack Router does NOT remount the component on a param-only navigation
 * (`/pvp/live/$matchId` -> `/pvp/live/$otherMatchId`) — it's the same route,
 * so `LivePvpMatchPage` stays mounted and every one of its `useState`/`useRef`
 * would otherwise carry over from the finished match into the new one (stale
 * `phase`/`match` flashing the old result screen, `rewardsGrantedRef` staying
 * true and silently skipping the new match's reward grant, `missed`/
 * `berryDrops` leaking across matches). Keying on `matchId` forces React to
 * tear down and remount `MatchPageContent` from scratch — the simplest robust
 * fix, verified against how every effect below is already keyed on `matchId`
 * (PvP Rematch, docs/handoffs/.../03-frontend.md).
 */
function LivePvpMatchPage() {
  const { matchId } = Route.useParams();
  return <MatchPageContent key={matchId} matchId={matchId} />;
}

function MatchPageContent({ matchId }: { matchId: string }) {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [match, setMatch] = useState<LivePvpMatch | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<TrainerProfile | null>(null);
  const [forfeitConfirmOpen, setForfeitConfirmOpen] = useState(false);
  const [berryDrops, setBerryDrops] = useState<ItemId[] | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);
  // Missed-answer history for the defeat review (feedback #1). Accumulated here
  // (not in the battle screen) so it survives the battle→result unmount that a
  // loss resolved by the OPPONENT's answer triggers.
  const [missed, setMissed] = useState<MissedAnswer[]>([]);
  // Best streak and answer pace, accumulated here rather than in the battle
  // screen for the same reason as `missed`: a loss decided by the opponent's
  // answer unmounts that screen without its own finish handler running.
  const [tally, setTally] = useState({ bestStreak: 0, totalMs: 0, answered: 0 });
  const partner = useGameStore((s) => s.pokemon);
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const versusBackdropId = useGameStore((s) => s.versusBackdropId);
  const level = useGameStore((s) => s.level);
  const friendCode = useGameStore((s) => s.friendCode);
  const [shareOpen, setShareOpen] = useState(false);
  // The Arena already ran the face-off for a queue fallback — it showed the bot
  // arriving and held it across the route change. Running the 3-second beat
  // again here would be a SECOND countdown over the same two trainers, with the
  // sprites re-mounting and re-animating in the middle of it. Skipped outright
  // for that arrival; every other one (Nearby, a rematch, a deep link) still
  // gets its beat, because for those this is the first face-off there has been.
  const [introDone, setIntroDone] = useState(() => isFreshlyStartedBotMatch(matchId));
  // Drives the pre-battle countdown. Cheap: it only runs while the intro is up.
  const [introNow, setIntroNow] = useState(() => Date.now());
  useEffect(() => {
    if (introDone) return;
    const t = setInterval(() => setIntroNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [introDone]);
  // Opponent-side combat cues funnel through the same frozen `emit` path as the
  // battle screen's local cues, so wording/ordering/dedupe are identical.
  const { emit } = useBattleFxCues();

  // Back-button forfeit guard (feedback 2286b6fc): while the battle is live, a
  // stray Back press opens the confirm dialog instead of silently abandoning
  // the match. Confirming runs the same forfeit path as the presence timeout.
  useForfeitGuard(phase === "battle", () => setForfeitConfirmOpen(true));

  const matchRef = useRef<LivePvpMatch | null>(null);
  const myIdRef = useRef<string | null>(null);
  const rewardsGrantedRef = useRef(false);
  matchRef.current = match;
  myIdRef.current = myId;

  useEffect(() => {
    if (!hydrated) return;
    if (!hasOnboarded) {
      navigate({ to: "/" });
      return;
    }
    (async () => {
      const uid = await ensureSession();
      const m = await getLivePvpMatch(matchId);
      if (!uid || !m) {
        setPhase("not_found");
        return;
      }
      setMyId(uid);
      // Seed the revision mark from the row we just read, so realtime events
      // already superseded by this snapshot are dropped rather than replayed.
      noteAppliedRev(matchId, m.rev);
      setMatch(m);
      const opponentId = uid === m.hostId ? m.guestId : m.hostId;
      void getProfileById(opponentId).then(setOpponentProfile);

      // Phase 1: register this side's partner dex id so identity-dependent
      // abilities (Mew's Transform, weather-conflict resolution) can resolve.
      // The host's is already stored at match creation; this is a harmless
      // idempotent no-op for the host and the real write for the guest. Refresh
      // the local row with the returned ids so both sides are known ASAP.
      const myPartnerId = useGameStore.getState().pokemon?.id ?? null;
      // Always register the resolved TYPE ability id (feedback #3). A legendary
      // now fires its type ability IN ADDITION TO its signature, so the server
      // needs the type id for its battleStart/postAnswerFires catalog effects and
      // the opponent needs it to attribute the type ability. The signature id is
      // carried separately (keyed by dex id), so both coexist.
      const myPokemon = useGameStore.getState().pokemon;
      const myAbilityId = resolvePvpTypeAbilityId(
        myPokemon?.types,
        useGameStore.getState().abilityId,
      );
      void setLivePvpPartner(matchId, myPartnerId, myAbilityId).then((res) => {
        if (res.ok) {
          setMatch((prev) =>
            prev
              ? { ...prev, hostPartnerId: res.hostPartnerId, guestPartnerId: res.guestPartnerId }
              : prev,
          );
        }
      });

      // One-time starter Lum Berry the first time a player ever enters Nearby
      // Battle, so they can cure one status in their first game.
      if (useGameStore.getState().markNearbyBattleEntered()) {
        useGameStore.getState().grantItem(STARTER_PVP_BERRY, 1);
        const berry = ITEMS.find((i) => i.id === STARTER_PVP_BERRY);
        toast.success(`You received a starter ${berry?.name ?? "Lum Berry"}!`);
      }

      setPhase(
        m.status === "forfeited"
          ? m.winnerId === uid
            ? "forfeit_won"
            : "forfeit_lost"
          : phaseFor(m),
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, hasOnboarded, hydrated]);

  useEffect(() => {
    playBgm("battle_regular");
  }, []);

  useEffect(() => {
    const { setBattleScreenActive } = useGameStore.getState();
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, []);

  // Live row updates: HP/stages/statuses/completion/forfeit all flow through
  // this single postgres_changes subscription (pvp_live_matches was already
  // in the realtime publication; the new HP columns ride the same channel).
  useEffect(() => {
    if (!hasOnboarded) return;
    const channel = supabase
      .channel(`pvp_live_row_${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "pvp_live_matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const uid = myIdRef.current;
          if (!uid) return;
          // Drop anything we have already moved past. A turn writes this row
          // several times and we also apply state straight from each write's
          // HTTP response, so an event for an earlier write can land after a
          // later response — without this the older HP would win, which is what
          // made a Pokémon appear to gain HP mid-battle. Skipping is safe: the
          // payload is a whole row, so the next one that passes is complete.
          // Fails open on purpose. If `rev` were ever absent from the payload,
          // treating that as revision 0 would make every event after the first
          // look stale and silently freeze the battle; applying the row instead
          // is no worse than the behaviour before this guard existed.
          // The row is ALWAYS folded into `match`, however old it is. Only HP
          // is revision-ordered, and the battle screen owns that gate (it is
          // the one channel that also receives HP straight from RPC responses).
          // Dropping whole rows here is what previously stalled
          // `hostAnsweredLive`/`guestAnsweredLive` and left the both-answered
          // early-advance waiting out the full question timer.
          const rev = row.rev as number | undefined;
          const updated: LivePvpMatch = {
            rev: rev ?? 0,
            id: row.id as string,
            hostId: row.host_id as string,
            guestId: row.guest_id as string,
            questions: matchRef.current?.questions ?? [],
            status: row.status as LivePvpMatch["status"],
            // Immutable for the life of a match, so a realtime payload that
            // omits it must not blank out what we already knew.
            matchSource:
              (row.match_source as LivePvpMatch["matchSource"] | undefined) ??
              matchRef.current?.matchSource ??
              null,
            startedAt: row.started_at as string,
            hostCorrect: row.host_correct as number | null,
            hostTotal: row.host_total as number | null,
            hostTimeMs: row.host_time_ms as number | null,
            hostStreak: row.host_streak as number | null,
            hostScore: row.host_score as number | null,
            hostCompletedAt: row.host_completed_at as string | null,
            guestCorrect: row.guest_correct as number | null,
            guestTotal: row.guest_total as number | null,
            guestTimeMs: row.guest_time_ms as number | null,
            guestStreak: row.guest_streak as number | null,
            guestScore: row.guest_score as number | null,
            guestCompletedAt: row.guest_completed_at as string | null,
            winnerId: row.winner_id as string | null,
            createdAt: row.created_at as string,
            expiresAt: row.expires_at as string,
            hostHp: (row.host_hp as number) ?? 120,
            guestHp: (row.guest_hp as number) ?? 120,
            hostStages: (row.host_stages as LivePvpMatch["hostStages"]) ?? {
              attack: 0,
              defense: 0,
              speed: 0,
              crit: 0,
            },
            guestStages: (row.guest_stages as LivePvpMatch["guestStages"]) ?? {
              attack: 0,
              defense: 0,
              speed: 0,
              crit: 0,
            },
            hostStatuses: (row.host_statuses as LivePvpMatch["hostStatuses"]) ?? [],
            guestStatuses: (row.guest_statuses as LivePvpMatch["guestStatuses"]) ?? [],
            hostCorrectLive: (row.host_correct_live as number) ?? 0,
            guestCorrectLive: (row.guest_correct_live as number) ?? 0,
            hostAnsweredLive: (row.host_answered_live as number) ?? 0,
            guestAnsweredLive: (row.guest_answered_live as number) ?? 0,
            hostTimeMsLive: (row.host_time_ms_live as number) ?? 0,
            guestTimeMsLive: (row.guest_time_ms_live as number) ?? 0,
            hostItemsUsed: (row.host_items_used as number) ?? 0,
            guestItemsUsed: (row.guest_items_used as number) ?? 0,
            liveResolvedAt: row.live_resolved_at as string | null,
            hostPartnerId:
              (row.host_partner_id as number | null) ?? matchRef.current?.hostPartnerId ?? null,
            guestPartnerId:
              (row.guest_partner_id as number | null) ?? matchRef.current?.guestPartnerId ?? null,
            hostAbilityId:
              (row.host_ability_id as string | null) ?? matchRef.current?.hostAbilityId ?? null,
            guestAbilityId:
              (row.guest_ability_id as string | null) ?? matchRef.current?.guestAbilityId ?? null,
            hostSuppressedUntil: (row.host_suppressed_until as number) ?? 0,
            guestSuppressedUntil: (row.guest_suppressed_until as number) ?? 0,
            weatherOwner:
              (row.weather_owner as "host" | "guest" | null) ??
              matchRef.current?.weatherOwner ??
              null,
            hostSigState:
              (row.host_sig_state as Record<string, number> | null) ??
              matchRef.current?.hostSigState ??
              {},
            guestSigState:
              (row.guest_sig_state as Record<string, number> | null) ??
              matchRef.current?.guestSigState ??
              {},
            // The signature-engine runtime rides this same channel: it is how each
            // client sees the OTHER side's engine fire (`phaseIdx` advancing), which
            // the `opponent_signature` rows react to.
            hostSigRuntime:
              (row.host_sig_runtime as SigRuntimeMap | null) ??
              matchRef.current?.hostSigRuntime ??
              {},
            guestSigRuntime:
              (row.guest_sig_runtime as SigRuntimeMap | null) ??
              matchRef.current?.guestSigRuntime ??
              {},
            hostRevived:
              (row.host_revived as boolean | null) ?? matchRef.current?.hostRevived ?? false,
            guestRevived:
              (row.guest_revived as boolean | null) ?? matchRef.current?.guestRevived ?? false,
            isBotMatch:
              (row.is_bot_match as boolean | null) ?? matchRef.current?.isBotMatch ?? false,
            hostStreakLive:
              (row.host_streak_live as number | null) ?? matchRef.current?.hostStreakLive ?? 0,
            guestStreakLive:
              (row.guest_streak_live as number | null) ?? matchRef.current?.guestStreakLive ?? 0,
            hostWrongStreakLive:
              (row.host_wrong_streak_live as number | null) ??
              matchRef.current?.hostWrongStreakLive ??
              0,
            guestWrongStreakLive:
              (row.guest_wrong_streak_live as number | null) ??
              matchRef.current?.guestWrongStreakLive ??
              0,
            hostConfusedTicksLive:
              (row.host_confused_ticks_live as number | null) ??
              matchRef.current?.hostConfusedTicksLive ??
              0,
            guestConfusedTicksLive:
              (row.guest_confused_ticks_live as number | null) ??
              matchRef.current?.guestConfusedTicksLive ??
              0,
          };
          setMatch(updated);
          if (updated.status === "forfeited") {
            setPhase(updated.winnerId === uid ? "forfeit_won" : "forfeit_lost");
          } else if (updated.status === "completed") {
            setPhase("result");
          }
          // Sync self/opponent stat stages + statuses into the shared store so
          // the battle screen (and any other consumer) reads one source of truth.
          const amIHost = uid === updated.hostId;
          useGameStore.setState({
            myStages: amIHost ? updated.hostStages : updated.guestStages,
            oppStages: amIHost ? updated.guestStages : updated.hostStages,
            battleStatuses: amIHost ? updated.hostStatuses : updated.guestStatuses,
            opponentStatuses: amIHost ? updated.guestStatuses : updated.hostStatuses,
          });
        },
      )
      .subscribe();
    return () => {
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
      // Leaving the match retires its mark. Nothing reuses a match id today,
      // but a stale high mark would silently swallow every event of a reused
      // one, and the map would otherwise grow for the life of the tab.
      forgetAppliedRev(matchId);
    };
  }, [matchId, hasOnboarded]);

  // Item/berry AND signature-ability effect attribution toasts — shows what
  // the OPPONENT used/triggered against us (our own uses already toast
  // locally in the battle screen). Ability toasts always show the Signature
  // Move name (never the internal key) resolved locally from the partner
  // dex id — the move name itself is never trusted from the wire.
  useEffect(() => {
    if (!hasOnboarded || !myId) return;
    // Route every opponent effect through the frozen `emit` path. The hook
    // resolves all wording locally from the ids (never trusting text off the
    // wire) and dedupes by dedupeKey so a bot effect arriving via both the
    // broadcast and a row-diff toasts at most once. Covers the Training bot:
    // its RPCs broadcast pvp_live_effects rows sourced as the guest, which the
    // host receives here (sourceId !== myId).
    return subscribeToLivePvpEffects(matchId, (effect: LivePvpEffect) => {
      if (effect.sourceId === myId) return;
      const questionIndex = effect.questionIndex;
      const hitsOpponent = effect.target === "opponent";
      if (effect.source === "ability") {
        // Non-legendary TYPE ability: no dex id, carries an abilityId.
        if (!effect.pokemonId && effect.abilityId) {
          emit({
            kind: "type-ability",
            side: "opponent",
            abilityId: effect.abilityId,
            hitsOpponent,
            questionIndex,
            dedupeKey: `opponent:type-ability:${questionIndex}:${effect.abilityId}`,
          });
          return;
        }
        if (effect.pokemonId == null) return;
        emit({
          kind: "signature",
          side: "opponent",
          partnerId: effect.pokemonId,
          hitsOpponent,
          questionIndex,
          dedupeKey: `opponent:signature:${questionIndex}:${effect.pokemonId}`,
        });
        return;
      }
      if (!effect.itemId) return;
      emit({
        kind: "item",
        side: "opponent",
        itemId: effect.itemId,
        hitsOpponent,
        questionIndex,
        dedupeKey: `opponent:item:${questionIndex}:${effect.itemId}`,
      });
    });
  }, [hasOnboarded, myId, matchId, emit]);

  // Presence: forfeit the opponent after 30s of them being gone mid-match.
  // A bot is never "present," so this is disabled for Training matches (it would
  // otherwise instantly auto-forfeit-win the human against their own bot).
  useEffect(() => {
    if (!hasOnboarded || !myId || !match) return;
    if (match.status !== "active" || match.isBotMatch) return;
    const opponentId = myId === match.hostId ? match.guestId : match.hostId;
    let forfeitTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase.channel(`pvp_live_presence_${matchId}`, {
      config: { presence: { key: myId } },
    });
    function clearForfeitTimer() {
      if (forfeitTimer) {
        clearTimeout(forfeitTimer);
        forfeitTimer = null;
      }
    }
    function checkPresence() {
      const state = channel.presenceState();
      const opponentPresent = Object.prototype.hasOwnProperty.call(state, opponentId);
      if (opponentPresent) {
        clearForfeitTimer();
      } else if (!forfeitTimer) {
        forfeitTimer = setTimeout(() => {
          void forfeitLivePvpMatch(matchId);
        }, FORFEIT_GRACE_MS);
      }
    }
    channel
      .on("presence", { event: "sync" }, checkPresence)
      .on("presence", { event: "join" }, checkPresence)
      .on("presence", { event: "leave" }, checkPresence)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") void channel.track({ online: true });
      });
    return () => {
      clearForfeitTimer();
      try {
        supabase.removeChannel(channel);
      } catch {
        /* noop */
      }
    };
  }, [hasOnboarded, myId, match, matchId]);

  // Grant the per-battle berry drops exactly once when the match reaches a
  // terminal phase — WINNERS ONLY (win on HP/tiebreak, or a forfeit win). A
  // loss/tie/forfeit-loss records the battle log but grants no berries and
  // shows no pickup toast.
  useEffect(() => {
    if (rewardsGrantedRef.current) return;
    if (phase !== "result" && phase !== "forfeit_won" && phase !== "forfeit_lost") return;
    rewardsGrantedRef.current = true;
    const won = phase === "forfeit_won" || (phase === "result" && match?.winnerId === myId);
    // Celebratory / defeat result music, mirroring Solo's result screen. Nearby
    // Battle rides the "regular" battle track, so reuse its win/lose clips.
    playBattleResult("regular", won);
    useGameStore.getState().pushBattleLog({
      opponent: opponentProfile?.trainer_name || "PvP",
      won,
      xpGained: 0,
      bestStreak: 0,
      timestamp: Date.now(),
      mode: "nearby",
    });
    const drops = won ? rollBerryDrops() : [];
    if (won) {
      for (const id of drops) useGameStore.getState().grantItem(id, 1);
      setBerryDrops(drops);
    } else {
      setBerryDrops([]);
    }
    useGameStore.getState().recordArenaBattle({
      won,
      isBot: match?.isBotMatch ?? false,
      berries: drops,
    });
  }, [phase, match, myId, opponentProfile]);

  function handleFinish(result: LivePvpBattleResult) {
    // The server has already resolved status/winner_id by the time onFinish
    // fires (resolvePvpLiveTurn/resolveBotPvpTurn only report resolved:true
    // once it has); the row-update subscription above will flip `phase` to
    // "result".
    void result;
  }

  // PvP Rematch (docs/handoffs/.../03-frontend.md): a bot match starts a fresh
  // Training match with the exact same recipe arena.tsx's "Start Training"
  // card uses (shared via `startTrainingMatch`), then navigates to the new
  // match id — `LivePvpMatchPage` above re-keys `MatchPageContent` on that id,
  // so every piece of this route's state resets cleanly. A human (Nearby
  // Battle) match has no bot to restart against: "rematch" means going
  // through the Battle Code scan again, so this hands off to /arena with a
  // one-shot `nearby=1` flag that auto-opens the Battle Code sheet there.
  async function handleRematch() {
    if (rematchBusy) return;
    if (!match?.isBotMatch) {
      void navigate({ to: "/arena", search: { nearby: 1 } as never });
      return;
    }
    setRematchBusy(true);
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
      console.warn("[pvp-live] rematch failed:", e);
      toast.error("Couldn't start training. Try again.");
    } finally {
      setRematchBusy(false);
    }
  }

  if (!hydrated || !hasOnboarded) return null;

  if (phase === "loading") {
    // Arriving straight from the Arena's queue fallback, the face-off is
    // already on screen there — so hold the same picture instead of dropping a
    // bright cream spinner between two dark face-offs. That spinner is what
    // made one hand-off to the Training Bot look like two separate bot screens.
    // Only for a match THIS client just started as a bot match; every other
    // arrival (a deep link, the guest side of a queue pairing) still spins,
    // because there is genuinely nothing known to show yet.
    if (isFreshlyStartedBotMatch(matchId)) {
      return (
        <VersusScreen
          me={{
            name: trainerName || "You",
            spriteId: trainerSprite,
            level,
            backdrop: versusBackdropSrc(versusBackdropId),
          }}
          opponent={trainingBotSide(level)}
          status="Battle starting…"
          backdrop={VERSUS_BACKDROP}
          // Continuing the Arena's face-off, not starting a new one.
          entrance={false}
        />
      );
    }
    return (
      <div className="flex h-full w-full items-center justify-center bg-poke-cream">
        <PokeballSpinner spinning />
      </div>
    );
  }

  if (phase === "not_found") {
    return (
      <div className="screen-x flex h-full w-full flex-col items-center justify-center gap-4 bg-poke-cream text-center">
        <div className="font-display text-lg text-foreground">
          This battle isn't available anymore.
        </div>
        <Button size="action" onClick={() => navigate({ to: "/arena" })}>
          Back to Arena
        </Button>
      </div>
    );
  }

  // The three-second beat between "match exists" and question one. It used to
  // be the battle screen sitting on a blank timer; now it is the face-off. Tap
  // to skip so a rematch chain is never slowed by ceremony.
  const msUntilStart = match ? new Date(match.startedAt).getTime() - introNow : 0;

  if (phase === "battle" && match && myId && !introDone && msUntilStart > 0) {
    return (
      <VersusScreen
        me={{
          name: trainerName || "You",
          spriteId: trainerSprite,
          level,
          backdrop: versusBackdropSrc(versusBackdropId),
        }}
        // A bot match has no profile row to read a name or sprite from, so it
        // gets the shared definition — the same picture the Arena's fallback
        // just showed, which is what makes the route change between them
        // invisible instead of a second, different "Training Bot".
        opponent={
          match.isBotMatch
            ? trainingBotSide(level)
            : {
                name: opponentProfile?.trainer_name || "Opponent",
                spriteId: opponentProfile?.trainer_sprite || "",
                level: opponentProfile?.level ?? null,
              }
        }
        status="Battle starting…"
        detail={`${Math.ceil(msUntilStart / 1000)}…`}
        backdrop={VERSUS_BACKDROP}
        onSkip={() => setIntroDone(true)}
      />
    );
  }

  if (phase === "battle" && match && myId) {
    return (
      <>
        <LivePvpBattleScreen
          matchId={matchId}
          questions={match.questions}
          startedAt={match.startedAt}
          myId={myId}
          hostId={match.hostId}
          match={match}
          opponentName={opponentProfile?.trainer_name || "Opponent"}
          onFinish={handleFinish}
          onMissed={(m) => setMissed((prev) => [...prev, m])}
          onAnswered={({ streakAfter, elapsedMs }) =>
            setTally((t) => ({
              bestStreak: Math.max(t.bestStreak, streakAfter),
              totalMs: t.totalMs + elapsedMs,
              answered: t.answered + 1,
            }))
          }
        />
        <AlertDialog open={forfeitConfirmOpen} onOpenChange={setForfeitConfirmOpen}>
          <AlertDialogContent className="max-w-xs rounded-3xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display-lg text-foreground">
                Forfeit this battle?
              </AlertDialogTitle>
              <AlertDialogDescription>
                You'll lose the battle and its rewards.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep playing</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setForfeitConfirmOpen(false);
                  // concede=true: the opponent wins, we earn no rewards
                  // (feedback 45f613c7).
                  void forfeitLivePvpMatch(matchId, true);
                }}
              >
                Forfeit
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  const iAmHost = myId === match?.hostId;
  const myFinalHp = match ? (iAmHost ? match.hostHp : match.guestHp) : null;
  const myCorrect = match ? (iAmHost ? match.hostCorrectLive : match.guestCorrectLive) : null;
  const won = phase === "forfeit_won" || (phase === "result" && match?.winnerId === myId);
  const tied = phase === "result" && match?.winnerId === null && match.status === "completed";

  const shareData: BattleShareData | null =
    partner && won
      ? {
          type: "battle",
          trainerName,
          trainerSpriteUrl: trainerSpriteUrl(trainerSprite),
          partnerName: partner.name,
          partnerPokemonId: partner.id,
          partnerShiny: false,
          opponentName: opponentProfile?.trainer_name || "Opponent",
          opponentTitle: "Trainer",
          opponentSpriteUrl: null,
          signaturePokemonId: null,
          finalPlayerHp: myFinalHp ?? 0,
          maxPlayerHp: PVP_MAX_HP,
          // The BEST streak of the battle, not the live one. hostStreakLive is
          // whatever the streak happened to be at the final answer — zero if
          // that answer was wrong — so the card reported 0 for most wins.
          topStreak: tally.bestStreak,
          topDamage: 0,
          correctCount: myCorrect ?? 0,
          totalQuestions: PVP_QUESTIONS,
          // Never passed at all before, so the card always printed "—s".
          avgTimeMs: tally.answered > 0 ? tally.totalMs / tally.answered : undefined,
          level,
          rank: rankForLevel(level),
          dateISO: new Date().toISOString().slice(0, 10),
        }
      : null;

  return (
    <>
      {shareData && (
        <ShareCardDialog
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          data={shareData}
          inviteCode={friendCode}
        />
      )}
      <PvpResultScreen
        won={won}
        tied={tied}
        forfeitWon={phase === "forfeit_won"}
        forfeitLost={phase === "forfeit_lost"}
        opponentName={opponentProfile?.trainer_name || "Opponent"}
        mySpriteId={trainerSprite}
        opponentSpriteId={opponentProfile?.trainer_sprite || ""}
        correctCount={myCorrect}
        oppCorrect={match ? (iAmHost ? match.guestCorrectLive : match.hostCorrectLive) : null}
        timeMs={tally.totalMs}
        berries={berryDrops}
        // A Trainer Battle (or the bot) counts toward the Arena's set of 5; a Nearby Battle does not show it.
        arenaWins={match?.matchSource === "queue" || match?.isBotMatch ? useGameStore.getState().arenaStats.set.wins : null}
        missed={missed}
        onBack={() => navigate({ to: "/battle", search: { autostart: 0 } as never })}
        // Only on a win, and only once there is a partner to draw.
        onShare={won && partner ? () => setShareOpen(true) : undefined}
        // No chat for strangers paired by matchmaking: the server refuses those messages.
        onChat={
          match?.matchSource === "queue"
            ? undefined
            : () => navigate({ to: "/pvp/chat/$matchId", params: { matchId } })
        }
        onRematch={() => void handleRematch()}
        rematchBusy={rematchBusy}
        // Renders nothing for a bot match, an existing friend or a pending request.
        friendPrompt={
          <AddFriendPrompt
            opponentId={opponentProfile?.id}
            opponentName={opponentProfile?.trainer_name || "Opponent"}
          />
        }
      />
    </>
  );
}

/** A trainer in a round frame (Figma avatar()): the app's own art fitted to the frame. */
function FaceAvatar({ spriteId, ring }: { spriteId: string; ring: string }) {
  const art = trainerSpriteUrl(spriteId);
  return (
    <span className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-full border-[3px] bg-night-card-2" style={{ borderColor: ring }}>
      {art && <FittedTrainer art={art} height={74} cx={45} feetY={86} />}
    </span>
  );
}

/** Figma faceOff(): you and them, the red VS between, and how many each got right. */
function FaceOff({ me, them, mine, theirs }: { me: string; them: string; mine: number | null; theirs: number | null }) {
  return (
    <div className="relative h-[150px] w-[320px] shrink-0">
      <span className="absolute left-0 top-0">
        <FaceAvatar spriteId={me} ring="#FF3B4E" />
      </span>
      <span className="absolute right-0 top-0">
        <FaceAvatar spriteId={them} ring="#5B8CFF" />
      </span>
      <span className="na-fill-brand na-headline absolute left-[132px] top-5 flex h-14 w-14 items-center justify-center rounded-full text-foreground shadow-[0_4px_0_#A3142C]">VS</span>
      {mine != null && <span className="na-number-l absolute left-0 top-[108px] w-24 text-center text-reward-gold">{mine}</span>}
      {theirs != null && <span className="na-number-l absolute right-0 top-[108px] w-24 text-center text-reward-gold">{theirs}</span>}
    </div>
  );
}

const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * Figma 15.3 "Live result: who got more right" (a Trainer Battle or the bot)
 * and 15.5 "Nearby Battle won: 2 berries". A loss keeps the face-off under
 * SO CLOSE!. Missed answers open the review (4.3).
 */
function PvpResultScreen({
  won,
  tied,
  forfeitWon,
  forfeitLost,
  opponentName,
  mySpriteId,
  opponentSpriteId,
  correctCount,
  oppCorrect,
  timeMs,
  berries,
  arenaWins,
  missed,
  onBack,
  onShare,
  onChat,
  onRematch,
  rematchBusy,
  friendPrompt,
}: {
  won: boolean;
  tied: boolean;
  forfeitWon: boolean;
  forfeitLost: boolean;
  opponentName: string;
  mySpriteId: string;
  opponentSpriteId: string;
  correctCount: number | null;
  oppCorrect: number | null;
  timeMs: number;
  /** The berries this win dropped (Nearby Battle). */
  berries: ItemId[] | null;
  /** Wins in the Arena's current set of 5, for a Trainer Battle; null for Nearby. */
  arenaWins: number | null;
  missed: MissedAnswer[];
  onBack: () => void;
  onShare?: () => void;
  onChat?: () => void;
  onRematch?: () => void;
  rematchBusy?: boolean;
  friendPrompt?: React.ReactNode;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const right = correctCount ?? 0;
  const won2 = won && (berries?.length ?? 0) > 0;
  const berryDefs = (berries ?? []).map((id) => ITEMS.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const line = forfeitWon
    ? `${opponentName} left the battle. You win!`
    : forfeitLost
      ? "You left the battle."
      : won2
        ? `You defeated ${opponentName} and earned ${berryDefs.length} ${berryDefs.length === 1 ? "Berry" : "Berries"}!`
        : won
          ? `You defeated ${opponentName}! ${right} of ${PVP_QUESTIONS} correct`
          : tied
            ? `It's a tie! ${right} of ${PVP_QUESTIONS} correct`
            : `${opponentName} wins this time · ${right} of ${PVP_QUESTIONS} correct`;
  const rise = (d: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.3 } });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="na-bg-night relative flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+16px)]"
    >
      <NaWordmark kind={won ? "victory" : "soclose"}>{won ? "VICTORY!" : tied ? "IT'S A TIE!" : "SO CLOSE!"}</NaWordmark>
      {won2 ? (
        <div className="relative h-[140px] w-[300px] shrink-0">
          {berryDefs.slice(0, 2).map((b, i) => (
            <ItemIcon key={b.id} item={b} className={`absolute h-[110px] w-[110px] ${i === 0 ? "left-10 top-2.5" : "left-[150px] top-5"}`} />
          ))}
          {[[24, 20, 22], [262, 12, 24], [270, 100, 16], [20, 110, 14]].map(([x, y, sz], i) => (
            <span key={i} className="absolute text-reward-gold" style={{ left: x, top: y }}>
              <NaIcon name="sparkle" size={sz} />
            </span>
          ))}
        </div>
      ) : (
        <FaceOff me={mySpriteId} them={opponentSpriteId} mine={correctCount} theirs={oppCorrect} />
      )}
      <p className="na-body-strong text-center text-text-secondary">{line}</p>
      {won2 ? (
        <motion.div {...rise(0.4)} className="flex w-full flex-col gap-2.5">
          {berryDefs.map((b) => (
            <div key={b.id} className="flex items-center gap-2.5 rounded-2xl border border-white/[0.12] bg-white/[0.08] p-2.5">
              <ItemIcon item={b} className="h-10 w-10 shrink-0" />
              <span className="flex min-w-0 flex-col">
                <span className="na-body-strong text-foreground">{b.name}</span>
                <span className="na-caption text-text-secondary">{BAG_SHORT_DESC[b.id] ?? b.desc}</span>
              </span>
            </div>
          ))}
        </motion.div>
      ) : (
        !forfeitWon &&
        !forfeitLost && (
          <motion.div {...rise(0.4)} className="flex gap-[9px]">
            <NaRewardTile tone="success" label="Accuracy" value={`${Math.round((right / PVP_QUESTIONS) * 100)}%`} icon={<NaRewardIcon kind="Accuracy" size={30} />} />
            <NaRewardTile tone="info" label="Time" value={fmtClock(timeMs)} icon={<NaRewardIcon kind="Time" size={30} />} />
          </motion.div>
        )
      )}
      {won && arenaWins != null && (
        <motion.div {...rise(0.5)} className="w-full">
          <NaGlassRow
            tone="gold"
            lead={<NaIcon name="medal" size={36} />}
            title={`Trainer Battles: ${Math.min(5, arenaWins)} of 5`}
            sub={arenaWins >= 5 ? "All 5 Arena rewards unlocked! Collect them in the Arena." : `Win ${5 - arenaWins} more ${5 - arenaWins === 1 ? "battle" : "battles"} to unlock all 5 Arena rewards!`}
          />
        </motion.div>
      )}
      {missed.length > 0 && (
        <motion.div {...rise(0.6)} className="w-full">
          <NaGlassRow
            lead={<NaIcon name="review" size={28} className="text-reward-gold" />}
            title={`Review ${missed.length} missed ${missed.length === 1 ? "answer" : "answers"}`}
            sub="Learn them for next time!"
            onClick={() => setReviewOpen(true)}
            trailing={<NaIcon name="chevron-right" size={18} className="text-text-muted" />}
          />
        </motion.div>
      )}
      {friendPrompt}
      <div className="min-h-2 flex-1" />
      {onRematch && (
        <NaButton block disabled={rematchBusy} onClick={onRematch}>
          {rematchBusy ? "Starting…" : won2 ? "Rematch" : "Battle again"}
        </NaButton>
      )}
      {onShare && (
        <NaButton kind="secondary" size="M" block onClick={onShare}>
          Share
        </NaButton>
      )}
      <div className="flex w-full gap-2.5">
        {onChat && (
          <NaButton kind="secondary" size="M" className="flex-1" onClick={onChat}>
            Match chat
          </NaButton>
        )}
        <NaButton kind="text" size="M" className="flex-1" onClick={onBack}>
          Home
        </NaButton>
      </div>
      {reviewOpen && <MistakesReview missed={missed} onClose={() => setReviewOpen(false)} />}
    </motion.div>
  );
}