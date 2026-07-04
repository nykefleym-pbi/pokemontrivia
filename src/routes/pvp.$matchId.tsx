import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { PokeballSpinner } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { getPvpMatch, submitPvpResult, type PvpMatch } from "@/lib/pvp";
import { getProfileById, ensureSession, type TrainerProfile } from "@/lib/social";
import { PvpBattleScreen, type PvpBattleResult } from "@/components/pvp-battle-screen";
import { playBgm } from "@/lib/audio";
import { trainerSpriteUrl } from "@/lib/game-data";

export const Route = createFileRoute("/pvp/$matchId")({
  component: PvpMatchPage,
});

type Phase = "loading" | "not_found" | "playing" | "waiting" | "result";

function PvpMatchPage() {
  const { matchId } = Route.useParams();
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [match, setMatch] = useState<PvpMatch | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<TrainerProfile | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);

  useEffect(() => {
    if (!hasOnboarded) {
      navigate({ to: "/" });
      return;
    }
    (async () => {
      const uid = await ensureSession();
      const m = await getPvpMatch(matchId);
      if (!uid || !m) {
        setPhase("not_found");
        return;
      }
      setMyId(uid);
      setMatch(m);
      const opponentId = uid === m.challengerId ? m.opponentId : m.challengerId;
      void getProfileById(opponentId).then(setOpponentProfile);

      const iCompleted =
        uid === m.challengerId ? m.challengerCompletedAt !== null : m.opponentCompletedAt !== null;
      if (iCompleted) {
        setMyScore(uid === m.challengerId ? m.challengerScore : m.opponentScore);
        setPhase(m.status === "completed" ? "result" : "waiting");
      } else if (m.status !== "pending") {
        setPhase("not_found");
      } else {
        setPhase("playing");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, hasOnboarded]);

  useEffect(() => {
    playBgm("battle_regular");
  }, []);

  async function handleFinish(result: PvpBattleResult) {
    if (!match || !myId) return;
    const opponentId = myId === match.challengerId ? match.opponentId : match.challengerId;
    const res = await submitPvpResult(
      matchId,
      opponentId,
      result.correct,
      result.total,
      result.timeMs,
      result.maxStreak,
    );
    if (!res.ok) {
      toast.error("Couldn't submit your result. Try again.");
      setPhase("not_found");
      return;
    }
    setMyScore(res.score);
    const fresh = await getPvpMatch(matchId);
    setMatch(fresh);
    setPhase(fresh?.status === "completed" ? "result" : "waiting");
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
          This challenge isn't available anymore.
        </div>
        <Button onClick={() => navigate({ to: "/profile" })}>Back to Profile</Button>
      </div>
    );
  }

  if (phase === "playing" && match) {
    return <PvpBattleScreen questions={match.questions} onFinish={handleFinish} />;
  }

  const iAmChallenger = myId === match?.challengerId;
  const myFinal = match
    ? iAmChallenger
      ? match.challengerScore
      : match.opponentScore
    : myScore;
  const oppFinal = match ? (iAmChallenger ? match.opponentScore : match.challengerScore) : null;
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
            Waiting for {opponentProfile?.trainer_name || "your opponent"} to play their side…
          </div>
        </>
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
