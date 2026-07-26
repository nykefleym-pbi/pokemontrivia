import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { PokeballSpinner, PokemonSprite } from "@/components/game-ui";
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
import { ITEMS, rollBerryDrops, STARTER_PVP_BERRY } from "@/lib/game-data";
import { PVP_QUESTIONS } from "@/lib/pvp-combat";
import { useForfeitGuard } from "@/lib/use-forfeit-guard";
import { resolvePvpTypeAbilityId } from "@/lib/pvp-type-abilities";
import { useBattleFxCues } from "@/hooks/useBattleFxCues";
import { MissedReview } from "@/components/MissedReview";
import { AppIcon } from "@/components/app-icon";
import { ITEM_CATEGORY_ICON } from "@/lib/app-icons";
import type { MissedAnswer } from "@/lib/trivia-core";

export const Route = createFileRoute("/pvp/live/$matchId")({
  component: LivePvpMatchPage,
});

const FORFEIT_GRACE_MS = 30_000;

type Phase =
  | "loading"
  | "not_found"
  | "battle"
  | "result"
  | "forfeit_won"
  | "forfeit_lost";

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
  const [berryDrops, setBerryDrops] = useState<number | null>(null);
  const [rematchBusy, setRematchBusy] = useState(false);
  // Missed-answer history for the defeat review (feedback #1). Accumulated here
  // (not in the battle screen) so it survives the battle→result unmount that a
  // loss resolved by the OPPONENT's answer triggers.
  const [missed, setMissed] = useState<MissedAnswer[]>([]);
  const partner = useGameStore((s) => s.pokemon);
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
        { event: "UPDATE", schema: "public", table: "pvp_live_matches", filter: `id=eq.${matchId}` },
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
              (row.weather_owner as "host" | "guest" | null) ?? matchRef.current?.weatherOwner ?? null,
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
            hostRevived: (row.host_revived as boolean | null) ?? matchRef.current?.hostRevived ?? false,
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
    const won =
      phase === "forfeit_won" ||
      (phase === "result" && match?.winnerId === myId);
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
      setBerryDrops(drops.length);
      toast.success(`You picked up ${drops.length} berries from this battle!`);
    } else {
      setBerryDrops(0);
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
    return (
      <div className="flex h-full w-full items-center justify-center bg-poke-cream">
        <PokeballSpinner spinning />
      </div>
    );
  }

  if (phase === "not_found") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-poke-cream px-6 text-center">
        <div className="font-display text-lg text-foreground">
          This battle isn't available anymore.
        </div>
        <Button onClick={() => navigate({ to: "/arena" })}>Back to Arena</Button>
      </div>
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
  const oppFinalHp = match ? (iAmHost ? match.guestHp : match.hostHp) : null;
  const myCorrect = match ? (iAmHost ? match.hostCorrectLive : match.guestCorrectLive) : null;
  const won =
    phase === "forfeit_won" || (phase === "result" && match?.winnerId === myId);
  const tied = phase === "result" && match?.winnerId === null && match.status === "completed";

  return (
    <PvpResultScreen
      won={won}
      tied={tied}
      forfeitWon={phase === "forfeit_won"}
      forfeitLost={phase === "forfeit_lost"}
      opponentName={opponentProfile?.trainer_name || "Opponent"}
      myHp={myFinalHp}
      oppHp={oppFinalHp}
      correctCount={myCorrect}
      partnerId={partner?.id ?? null}
      partnerName={partner?.name ?? "Your partner"}
      berryDrops={berryDrops}
      missed={missed}
      onBack={() => navigate({ to: "/arena" })}
      onChat={() => navigate({ to: "/pvp/chat/$matchId", params: { matchId } })}
      onRematch={() => void handleRematch()}
      rematchBusy={rematchBusy}
    />
  );
}

/**
 * Victory / Defeat screen for Nearby Battle. Reuses the visual language of
 * Solo's `ResultScreen` (feedback c067f516) — the victory confetti + bouncing
 * partner sprite on a win, the muted grayscale defeat treatment on a loss — but
 * carries the PvP-relevant summary (HP result, correct count, berry drops)
 * instead of Solo's XP/coin/level rewards, which don't exist in Nearby Battle.
 */
function PvpResultScreen({
  won,
  tied,
  forfeitWon,
  forfeitLost,
  opponentName,
  myHp,
  oppHp,
  correctCount,
  partnerId,
  partnerName,
  berryDrops,
  missed,
  onBack,
  onChat,
  onRematch,
  rematchBusy,
}: {
  won: boolean;
  tied: boolean;
  forfeitWon: boolean;
  forfeitLost: boolean;
  opponentName: string;
  myHp: number | null;
  oppHp: number | null;
  correctCount: number | null;
  partnerId: number | null;
  partnerName: string;
  berryDrops: number | null;
  missed: MissedAnswer[];
  onBack: () => void;
  /** Opens this match's full-screen chat route (docs/handoffs/global-chat).
   * Renders a "Chat" button beside "Back to Profile" when provided. */
  onChat?: () => void;
  /** PvP Rematch (docs/handoffs/.../03-frontend.md): renders a full-width
   * "Rematch" button above the Back/Chat row when provided. For a bot match
   * this starts a fresh Training match; for a human match it hands off to
   * the Battle Code sheet on /arena. Omitted entirely when not provided (no
   * behavior change for any caller that doesn't pass it). */
  onRematch?: () => void;
  /** Disables the Rematch button + shows a spinner while the rematch's
   * fetch/RPC round-trip is in flight (bot path only — the human path
   * navigates instantly). */
  rematchBusy?: boolean;
}) {
  const hpLine = (
    <>
      You: {myHp ?? "—"} HP · {opponentName}: {oppHp ?? "—"} HP
    </>
  );

  if (won) {
    const confetti = [
      { c: "bg-primary", s: "h-3 w-3 rounded-sm", l: "8%" },
      { c: "bg-poke-yellow", s: "h-2 w-2 rounded-full", l: "20%" },
      { c: "bg-poke-blue", s: "h-2.5 w-2.5 rounded-full", l: "32%" },
      { c: "bg-hp-good", s: "h-3 w-3 rounded-sm", l: "44%" },
      { c: "bg-poke-yellow", s: "h-2 w-2 rounded-full", l: "56%" },
      { c: "bg-primary", s: "h-2 w-2 rounded-full", l: "68%" },
      { c: "bg-destructive", s: "h-2.5 w-2.5 rounded-sm", l: "80%" },
      { c: "bg-poke-blue", s: "h-2 w-2 rounded-full", l: "92%" },
    ];
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-victory px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        {confetti.map((d, i) => (
          <motion.span
            key={i}
            className={`pointer-events-none absolute ${d.s} ${d.c}`}
            style={{ left: d.l, top: "-5%" }}
            initial={{ y: 0, opacity: 0 }}
            animate={{
              y: ["-5%", "115%"],
              x: [0, i % 2 === 0 ? 20 : -20, 0],
              rotate: [0, 360],
              opacity: [0, 1, 1, 0.8, 0],
            }}
            transition={{
              duration: 3.5 + (i % 4) * 0.6,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeIn",
            }}
          />
        ))}

        <div className="flex flex-col items-center text-center">
          <div className="font-pixel-xs uppercase tracking-[0.25em] text-primary">★ Battle Won ★</div>
          <h1 className="mt-2 font-display-xl text-foreground">Victory!</h1>
          <p className="mt-1 text-sm text-foreground/70">
            {forfeitWon
              ? `${opponentName} disconnected`
              : correctCount != null
                ? `${opponentName} defeated · ${correctCount}/${PVP_QUESTIONS} correct`
                : `${opponentName} defeated`}
          </p>

          {partnerId != null && (
            <div className="relative mt-6 flex h-36 w-44 items-end justify-center">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-2 left-1/2 h-10 w-32 -translate-x-1/2 rounded-[50%]"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 35%, oklch(0.88 0.16 145) 0%, oklch(0.72 0.18 145) 55%, oklch(0.55 0.16 150) 100%)",
                  boxShadow:
                    "0 8px 14px -6px oklch(0.3 0.1 150 / 0.35), inset 0 1px 0 oklch(1 0 0 / 0.35)",
                }}
              />
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 1.4, repeat: Infinity }}
                className="relative z-10"
              >
                <PokemonSprite id={partnerId} alt={partnerName} className="sprite h-28 w-28" />
              </motion.div>
            </div>
          )}
        </div>

        <div className="mx-auto mt-6 w-full max-w-sm rounded-2xl bg-card p-4 text-center shadow-card">
          <div className="font-pixel-xs text-foreground/70">{hpLine}</div>
          {berryDrops != null && berryDrops > 0 && (
            <div className="mt-2 flex items-center justify-center gap-1.5 font-display-md text-hp-good">
              <AppIcon src={ITEM_CATEGORY_ICON.berries} className="h-5 w-5" />
              +{berryDrops} berr{berryDrops === 1 ? "y" : "ies"}
            </div>
          )}
        </div>

        <div className="mx-auto mt-auto flex w-full max-w-sm flex-col gap-2 pt-8">
          {onRematch && (
            <Button
              size="lg"
              onClick={onRematch}
              disabled={rematchBusy}
              className="h-14 w-full rounded-full bg-primary font-bold text-primary-foreground shadow-pop disabled:opacity-70"
            >
              {rematchBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Rematch"}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              size="lg"
              onClick={onBack}
              className="h-14 flex-1 rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
            >
              Back to Arena
            </Button>
            {onChat && (
              <Button
                size="lg"
                variant="outline"
                onClick={onChat}
                className="h-14 flex-1 rounded-full border-2 font-bold shadow-card"
              >
                Chat
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    );
  }

  // DEFEAT / TIE / FORFEIT-LOSS
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full w-full flex-col overflow-y-auto bg-defeat px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
    >
      <div className="flex flex-col items-center text-center">
        <div className="font-pixel-xs uppercase tracking-[0.25em] text-poke-blue/80">
          {tied ? "Battle Tied" : "Battle Lost"}
        </div>
        <h1 className="mt-2 font-display-xl text-white">
          {tied ? "It's a tie!" : forfeitLost ? "Battle forfeited" : "So close!"}
        </h1>
        <p className="mt-1 text-sm text-white/60">
          {forfeitLost
            ? "You left the battle."
            : correctCount != null
              ? `${opponentName} wins · ${correctCount}/${PVP_QUESTIONS} correct`
              : `${opponentName} wins`}
        </p>

        {partnerId != null && (
          <div className="relative mt-6 flex h-32 w-40 items-end justify-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 left-1/2 h-8 w-28 -translate-x-1/2 rounded-[50%] bg-black/40 blur-[2px]"
            />
            <motion.div
              animate={{ rotate: [0, -3, 3, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="relative z-10"
            >
              <PokemonSprite
                id={partnerId}
                alt={partnerName}
                className="sprite h-24 w-24 opacity-80 grayscale"
              />
            </motion.div>
          </div>
        )}
      </div>

      <div className="mx-auto mt-6 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-center">
        <p className="text-xs text-white/70">{hpLine}</p>
      </div>

      {/* Missed-answer review at parity with Solo's defeat screen (feedback #1).
          Renders nothing when the loss had no wrong answers (HP/forfeit). */}
      <MissedReview missed={missed} />

      <div className="mx-auto mt-auto flex w-full max-w-sm flex-col gap-2 pt-8">
        {onRematch && (
          <Button
            size="lg"
            onClick={onRematch}
            disabled={rematchBusy}
            className="h-14 w-full rounded-full bg-primary font-bold text-primary-foreground shadow-pop disabled:opacity-70"
          >
            {rematchBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Rematch"}
          </Button>
        )}
        <div className="flex gap-2">
          <Button
            size="lg"
            onClick={onBack}
            className="h-14 flex-1 rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
          >
            Back to Arena
          </Button>
          {onChat && (
            <Button
              size="lg"
              variant="outline"
              onClick={onChat}
              className="h-14 flex-1 rounded-full border-2 border-white/30 font-bold text-white shadow-card"
            >
              Chat
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
