import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { PokeballSpinner } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import {
  getLivePvpMatch,
  forfeitLivePvpMatch,
  subscribeToLivePvpEffects,
  setLivePvpPartner,
  type LivePvpMatch,
  type LivePvpEffect,
} from "@/lib/pvp-live";
import { LivePvpBattleScreen, type LivePvpBattleResult } from "@/components/live-pvp-battle-screen";
import { getProfileById, ensureSession, type TrainerProfile } from "@/lib/social";
import { supabase } from "@/integrations/supabase/client";
import { playBgm } from "@/lib/audio";
import { trainerSpriteUrl, ITEMS, rollBerryDrops, STARTER_PVP_BERRY } from "@/lib/game-data";
import { signatureMoveName } from "@/lib/signature-abilities";

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

function LivePvpMatchPage() {
  const { matchId } = Route.useParams();
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [match, setMatch] = useState<LivePvpMatch | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<TrainerProfile | null>(null);

  const matchRef = useRef<LivePvpMatch | null>(null);
  const myIdRef = useRef<string | null>(null);
  const rewardsGrantedRef = useRef(false);
  matchRef.current = match;
  myIdRef.current = myId;

  useEffect(() => {
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
      setMatch(m);
      const opponentId = uid === m.hostId ? m.guestId : m.hostId;
      void getProfileById(opponentId).then(setOpponentProfile);

      // Phase 1: register this side's partner dex id so identity-dependent
      // abilities (Mew's Transform, weather-conflict resolution) can resolve.
      // The host's is already stored at match creation; this is a harmless
      // idempotent no-op for the host and the real write for the guest. Refresh
      // the local row with the returned ids so both sides are known ASAP.
      const myPartnerId = useGameStore.getState().pokemon?.id ?? null;
      void setLivePvpPartner(matchId, myPartnerId).then((res) => {
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
        toast.success(`${berry?.emoji ?? "🟢"} You received a starter ${berry?.name ?? "Lum Berry"}!`);
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
  }, [matchId, hasOnboarded]);

  useEffect(() => {
    playBgm("battle_regular");
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
          const updated: LivePvpMatch = {
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
            hostSuppressedUntil: (row.host_suppressed_until as number) ?? 0,
            guestSuppressedUntil: (row.guest_suppressed_until as number) ?? 0,
            weatherOwner:
              (row.weather_owner as "host" | "guest" | null) ?? matchRef.current?.weatherOwner ?? null,
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
    };
  }, [matchId, hasOnboarded]);

  // Item/berry AND signature-ability effect attribution toasts — shows what
  // the OPPONENT used/triggered against us (our own uses already toast
  // locally in the battle screen). Ability toasts always show the Signature
  // Move name (never the internal key) resolved locally from the partner
  // dex id — the move name itself is never trusted from the wire.
  useEffect(() => {
    if (!hasOnboarded || !myId) return;
    return subscribeToLivePvpEffects(matchId, (effect: LivePvpEffect) => {
      if (effect.sourceId === myId) return;
      if (effect.source === "ability") {
        const move = signatureMoveName(effect.pokemonId);
        if (!move) return;
        toast.warning(
          effect.target === "opponent"
            ? `✨ Opponent's ${move} activates — you're affected!`
            : `✨ Opponent's ${move} activates!`,
        );
        return;
      }
      const def = ITEMS.find((i) => i.id === effect.itemId);
      if (!def) return;
      if (effect.target === "opponent") {
        toast.warning(`${def.emoji} Opponent used ${def.name} — you're affected!`);
      } else {
        toast.info(`${def.emoji} Opponent used ${def.name}.`);
      }
    });
  }, [hasOnboarded, myId, matchId]);

  // Presence: forfeit the opponent after 30s of them being gone mid-match.
  useEffect(() => {
    if (!hasOnboarded || !myId || !match) return;
    if (match.status !== "active") return;
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

  // Grant the per-battle berry drops exactly once, whenever the match reaches
  // a terminal phase (win, loss, or forfeit either way) — "5 berries per
  // completed battle played" applies regardless of win/loss.
  useEffect(() => {
    if (rewardsGrantedRef.current) return;
    if (phase !== "result" && phase !== "forfeit_won" && phase !== "forfeit_lost") return;
    rewardsGrantedRef.current = true;
    const drops = rollBerryDrops();
    for (const id of drops) useGameStore.getState().grantItem(id, 1);
    const won =
      phase === "forfeit_won" ||
      (phase === "result" && match?.winnerId === myId);
    useGameStore.getState().pushBattleLog({
      opponent: opponentProfile?.trainer_name || "Nearby Battle",
      won,
      xpGained: 0,
      bestStreak: 0,
      timestamp: Date.now(),
      mode: "nearby",
    });
    toast.success(`🍒 You picked up ${drops.length} berries from this battle!`);
  }, [phase, match, myId, opponentProfile]);

  function handleFinish(result: LivePvpBattleResult) {
    // The server has already resolved status/winner_id by the time onFinish
    // fires (submitPvpLiveAnswer only reports resolved:true once it has);
    // the row-update subscription above will flip `phase` to "result".
    void result;
  }

  if (!hasOnboarded) return null;

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
        <Button onClick={() => navigate({ to: "/profile" })}>Back to Profile</Button>
      </div>
    );
  }

  if (phase === "battle" && match && myId) {
    return (
      <LivePvpBattleScreen
        matchId={matchId}
        questions={match.questions}
        startedAt={match.startedAt}
        myId={myId}
        hostId={match.hostId}
        match={match}
        opponentName={opponentProfile?.trainer_name || "Opponent"}
        onFinish={handleFinish}
      />
    );
  }

  const iAmHost = myId === match?.hostId;
  const myFinalHp = match ? (iAmHost ? match.hostHp : match.guestHp) : null;
  const oppFinalHp = match ? (iAmHost ? match.guestHp : match.hostHp) : null;
  const won = phase === "result" && match?.winnerId === myId;
  const tied = phase === "result" && match?.winnerId === null && match.status === "completed";

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-poke-cream px-6 text-center">
      <img
        src={trainerSpriteUrl(opponentProfile?.trainer_sprite || "red")}
        alt=""
        className="sprite h-24 w-24 object-contain"
      />
      {phase === "forfeit_won" ? (
        <>
          <div className="font-display-xl text-foreground">You won! 🎉</div>
          <div className="font-pixel-xs text-foreground/60">
            {opponentProfile?.trainer_name || "Your opponent"} disconnected.
          </div>
        </>
      ) : phase === "forfeit_lost" ? (
        <div className="font-display-xl text-foreground">You forfeited this battle.</div>
      ) : (
        <>
          <div className="font-display-xl text-foreground">
            {won ? "You won! 🎉" : tied ? "It's a tie!" : "You lost this one."}
          </div>
          <div className="font-pixel-xs text-foreground/60">
            You: {myFinalHp ?? "—"} HP · {opponentProfile?.trainer_name || "Opponent"}:{" "}
            {oppFinalHp ?? "—"} HP
          </div>
        </>
      )}
      <Button onClick={() => navigate({ to: "/profile" })}>Back to Profile</Button>
    </div>
  );
}
