import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { PokeballSpinner } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import {
  getLivePvpMatch,
  submitLivePvpResult,
  forfeitLivePvpMatch,
  type LivePvpMatch,
} from "@/lib/pvp-live";
import { getProfileById, ensureSession, type TrainerProfile } from "@/lib/social";
import { LivePvpBattleScreen, type LivePvpBattleResult } from "@/components/live-pvp-battle-screen";
import { supabase } from "@/integrations/supabase/client";
import { playBgm } from "@/lib/audio";
import { trainerSpriteUrl } from "@/lib/game-data";

export const Route = createFileRoute("/pvp/live/$matchId")({
  component: LivePvpMatchPage,
});

const FORFEIT_GRACE_MS = 30_000;

type Phase =
  | "loading"
  | "not_found"
  | "battle"
  | "waiting"
  | "submit_error"
  | "result"
  | "forfeit_won"
  | "forfeit_lost";

function phaseFor(m: LivePvpMatch, myId: string, iCompleted: boolean): Phase {
  if (m.status === "forfeited") return m.winnerId === myId ? "forfeit_won" : "forfeit_lost";
  if (m.status === "completed") return "result";
  return iCompleted ? "waiting" : "battle";
}

function LivePvpMatchPage() {
  const { matchId } = Route.useParams();
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [match, setMatch] = useState<LivePvpMatch | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<TrainerProfile | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [pendingResult, setPendingResult] = useState<LivePvpBattleResult | null>(null);

  const matchRef = useRef<LivePvpMatch | null>(null);
  const myIdRef = useRef<string | null>(null);
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
      const iCompleted = uid === m.hostId ? m.hostCompletedAt !== null : m.guestCompletedAt !== null;
      setPhase(phaseFor(m, uid, iCompleted));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, hasOnboarded]);

  useEffect(() => {
    playBgm("battle_regular");
  }, []);

  // Live row updates: catch the opponent finishing, forfeiting, or the match
  // completing while we're mid-quiz.
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
          };
          setMatch(updated);
          const iCompleted =
            uid === updated.hostId ? updated.hostCompletedAt !== null : updated.guestCompletedAt !== null;
          // Don't yank the player out of an in-progress quiz just because the
          // row changed (e.g. opponent submitting doesn't affect my status);
          // only override when the match is no longer simply "active&mine to play".
          const next = phaseFor(updated, uid, iCompleted);
          setPhase((prev) => (prev === "battle" && next === "battle" ? prev : next));
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

  async function handleFinish(result: LivePvpBattleResult) {
    if (!match || !myId) return;
    const res = await submitLivePvpResult(
      matchId,
      result.correct,
      result.total,
      result.timeMs,
      result.maxStreak,
    );
    if (!res.ok) {
      toast.error("Couldn't submit your result. Try again.");
      setPendingResult(result);
      setPhase("submit_error");
      return;
    }
    setPendingResult(null);
    setMyScore(res.score);
    useGameStore.getState().pushBattleLog({
      opponent: "Nearby Battle",
      won: result.correct > result.total / 2,
      xpGained: 0,
      bestStreak: result.maxStreak,
      timestamp: Date.now(),
      mode: "nearby",
    });
    const fresh = await getLivePvpMatch(matchId);
    if (!fresh) {
      setPhase("not_found");
      return;
    }
    setMatch(fresh);
    const iCompleted = myId === fresh.hostId ? fresh.hostCompletedAt !== null : fresh.guestCompletedAt !== null;
    setPhase(phaseFor(fresh, myId, iCompleted));
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

  if (phase === "battle" && match) {
    return (
      <LivePvpBattleScreen
        questions={match.questions}
        startedAt={match.startedAt}
        onFinish={handleFinish}
      />
    );
  }

  if (phase === "submit_error") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-poke-cream px-6 text-center">
        <div className="font-display text-lg text-foreground">
          Couldn't submit your result — your answers are still saved here.
        </div>
        <Button
          onClick={() => {
            if (pendingResult) void handleFinish(pendingResult);
          }}
        >
          Try again
        </Button>
      </div>
    );
  }

  const iAmHost = myId === match?.hostId;
  const myFinal = match ? (iAmHost ? match.hostScore : match.guestScore) : myScore;
  const oppFinal = match ? (iAmHost ? match.guestScore : match.hostScore) : null;
  const won = phase === "result" && myFinal !== null && oppFinal !== null && myFinal > oppFinal;
  const tied = phase === "result" && myFinal !== null && oppFinal !== null && myFinal === oppFinal;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-6 bg-poke-cream px-6 text-center">
      <img
        src={trainerSpriteUrl(opponentProfile?.trainer_sprite || "red")}
        alt=""
        className="sprite h-24 w-24 object-contain"
      />
      {phase === "waiting" ? (
        <>
          <div className="font-display-xl text-foreground">Your score: {myFinal ?? myScore}</div>
          <div className="font-pixel-xs text-foreground/60">
            Waiting for {opponentProfile?.trainer_name || "your opponent"} to finish…
          </div>
        </>
      ) : phase === "forfeit_won" ? (
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
            You: {myFinal} · {opponentProfile?.trainer_name || "Opponent"}: {oppFinal}
          </div>
        </>
      )}
      <Button onClick={() => navigate({ to: "/profile" })}>Back to Profile</Button>
    </div>
  );
}
