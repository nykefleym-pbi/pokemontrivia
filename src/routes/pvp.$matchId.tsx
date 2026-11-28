import { noindexHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { PokeballSpinner } from "@/components/game-ui";
import { getPvpMatch, submitPvpResult, type PvpMatch } from "@/lib/pvp";
import { getProfileById, ensureSession, type TrainerProfile } from "@/lib/social";
import { PvpBattleScreen, type PvpBattleResult } from "@/components/pvp-battle-screen";
import { playBgm } from "@/lib/audio";
import { inviteUrl } from "@/lib/referral-rewards";
import { sendFriendChallenge } from "@/components/friends-screen";
import { NaButton } from "@/components/na/button";
import { NaGlassRow, NaRewardTile, NaWordmark } from "@/components/na/celebration";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { FaceOff } from "@/components/na/face-off";
import { markResultSeen } from "@/lib/friend-results";

export const Route = createFileRoute("/pvp/$matchId")({
  head: () => noindexHead(),
  component: PvpMatchPage,
});

type Phase =
  "loading" | "not_found" | "playing" | "waiting" | "inactive" | "submit_error" | "result";

function phaseForCompletedSide(status: PvpMatch["status"]): Phase {
  if (status === "completed") return "result";
  if (status === "declined" || status === "expired") return "inactive";
  return "waiting";
}

function PvpMatchPage() {
  const { matchId } = Route.useParams();
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [match, setMatch] = useState<PvpMatch | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [opponentProfile, setOpponentProfile] = useState<TrainerProfile | null>(null);
  const [myScore, setMyScore] = useState<number | null>(null);
  const [pendingResult, setPendingResult] = useState<PvpBattleResult | null>(null);
  const [rematching, setRematching] = useState(false);
  /** Only known for the side that just played on this phone. */
  const [accuracy, setAccuracy] = useState<number | null>(null);

  useEffect(() => {
    if (!hydrated) return;
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
      // Past its expiry counts as expired, whatever the row says yet.
      const expired = m.status === "expired" || (m.status === "pending" && Date.parse(m.expiresAt) < Date.now());
      if (iCompleted) {
        setMyScore(uid === m.challengerId ? m.challengerScore : m.opponentScore);
        setPhase(m.status !== "completed" && expired ? "inactive" : phaseForCompletedSide(m.status));
      } else if (m.status === "declined" || expired) {
        setPhase("inactive");
      } else if (m.status !== "pending") {
        setPhase("not_found");
      } else {
        setPhase("playing");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId, hasOnboarded, hydrated]);

  useEffect(() => {
    playBgm("battle_regular");
  }, []);

  // Opening a result once turns the friend's Results button back into Battle.
  useEffect(() => {
    if (match && (phase === "result" || phase === "inactive")) markResultSeen(match.id);
  }, [match, phase]);

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
      setPendingResult(result);
      setPhase("submit_error");
      return;
    }
    setPendingResult(null);
    setMyScore(res.score);
    if (result.total > 0) setAccuracy(Math.round((result.correct / result.total) * 100));
    useGameStore.getState().pushBattleLog({
      opponent: "PvP Battle",
      won: result.correct > result.total / 2,
      xpGained: 0,
      bestStreak: result.maxStreak,
      timestamp: Date.now(),
      mode: "pvp",
    });
    const fresh = await getPvpMatch(matchId);
    setMatch(fresh);
    setPhase(fresh ? phaseForCompletedSide(fresh.status) : "not_found");
  }

  if (!hydrated || !hasOnboarded) return null;

  if (phase === "loading") {
    return (
      <div className="na-bg-night flex h-full w-full items-center justify-center">
        <PokeballSpinner spinning />
      </div>
    );
  }

  if (phase === "playing" && match) {
    return <PvpBattleScreen questions={match.questions} onFinish={handleFinish} />;
  }

  const oppName = opponentProfile?.trainer_name || "your friend";
  const goHome = () => void navigate({ to: "/battle", search: { autostart: 0 } as never });

  // 16.6 for a challenge that never finished: declined, or nobody played in time.
  if (phase === "inactive" && match) {
    const declined = match.status === "declined";
    const iChallenged = myId === match.challengerId;
    const mine = iChallenged ? match.challengerScore : match.opponentScore;
    const friend = opponentProfile;
    return (
      <div className="na-bg-night flex h-full w-full flex-col items-center gap-3.5 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+40px)]">
        <h1 className="na-display-m text-center text-foreground">{declined ? "Challenge declined" : "Challenge expired"}</h1>
        <FaceOff me={useGameStore.getState().trainerSprite} them={opponentProfile?.trainer_sprite || "red"} mine={mine ?? "–"} theirs="–" />
        <p className="na-body-strong text-center text-text-secondary">
          {declined ? `${oppName} declined this one.` : iChallenged ? `${oppName} didn't play in time.` : "You didn't play this one in time."}
        </p>
        <div className="flex-1" />
        <NaButton
          block
          disabled={!friend || rematching}
          onClick={() => {
            if (!friend) return;
            setRematching(true);
            void sendFriendChallenge(friend.id, friend.trainer_name)
              .then((id) => {
                if (id) void navigate({ to: "/pvp/$matchId", params: { matchId: id } });
              })
              .finally(() => setRematching(false));
          }}
        >
          Challenge again
        </NaButton>
        <NaButton kind="text" size="M" onClick={goHome}>
          Home
        </NaButton>
      </div>
    );
  }

  // The plain states: gone or a failed submit.
  if (phase === "not_found" || phase === "inactive" || phase === "submit_error") {
    const text =
      phase === "submit_error"
        ? "Couldn't send your result. Your answers are still saved here."
        : phase === "not_found"
          ? "This challenge isn't available anymore."
          : match?.status === "declined"
            ? `${oppName} declined this challenge.`
            : "This challenge expired.";
    return (
      <div className="na-bg-night flex h-full w-full flex-col items-center justify-center gap-4 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] text-center">
        <p className="na-title text-foreground">{text}</p>
        {phase === "inactive" && myScore !== null && <p className="na-body text-text-secondary">Your score: {myScore}</p>}
        {phase === "submit_error" ? (
          <NaButton block onClick={() => pendingResult && void handleFinish(pendingResult)}>
            Try again
          </NaButton>
        ) : (
          <NaButton block onClick={goHome}>
            Home
          </NaButton>
        )}
      </div>
    );
  }

  const mySprite = useGameStore.getState().trainerSprite;
  const oppSprite = opponentProfile?.trainer_sprite || "red";
  const iAmChallenger = myId === match?.challengerId;
  const myFinal = match ? (iAmChallenger ? match.challengerScore : match.opponentScore) : myScore;
  const oppFinal = match ? (iAmChallenger ? match.opponentScore : match.challengerScore) : null;

  // Figma 16.5: your score is in, theirs is a question mark until they play.
  if (phase === "waiting") {
    return (
      <div className="na-bg-night flex h-full w-full flex-col items-center gap-3.5 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+40px)]">
        <h1 className="na-display-m text-center text-foreground">Nice battle!</h1>
        <FaceOff me={mySprite} them={oppSprite} mine={myFinal ?? myScore} theirs="?" />
        <p className="na-title text-center text-foreground">Waiting for {oppName} to play…</p>
        <NaGlassRow lead={<NaGlossIcon kind="bell" size={32} />} title="We'll tell you who won!" sub="Find the result in Friends and Recent Battles." />
        <div className="flex-1" />
        <NaButton block onClick={goHome}>
          Home
        </NaButton>
      </div>
    );
  }

  // Figma 16.6: both scores side by side, the winner's crown.
  const won = myFinal !== null && oppFinal !== null && myFinal > oppFinal;
  const tied = myFinal !== null && oppFinal !== null && myFinal === oppFinal;
  const opp = opponentProfile;
  async function rematch() {
    if (!opp || rematching) return;
    setRematching(true);
    try {
      const id = await sendFriendChallenge(opp.id, opp.trainer_name);
      if (id) void navigate({ to: "/pvp/$matchId", params: { matchId: id } });
    } finally {
      setRematching(false);
    }
  }
  function share() {
    const text = `${won ? `I beat ${oppName}` : tied ? `I tied with ${oppName}` : `${oppName} beat me`} ${myFinal} to ${oppFinal} in Pokémon Trivia Battle! Battle me too:`;
    const url = inviteUrl(useGameStore.getState().friendCode);
    if (navigator.share) navigator.share({ text, url }).catch(() => {});
    else {
      void navigator.clipboard?.writeText(`${text} ${url}`);
      toast.success("Copied!");
    }
  }
  return (
    <div className="na-bg-night flex h-full w-full flex-col items-center gap-3.5 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+16px)]">
      <NaWordmark kind={won || tied ? "victory" : "soclose"}>{won ? "YOU WIN!" : tied ? "A TIE!" : "SO CLOSE!"}</NaWordmark>
      <div className="pt-[30px]">
        <FaceOff me={mySprite} them={oppSprite} mine={myFinal} theirs={oppFinal} crown={won ? "me" : tied ? undefined : "them"} />
      </div>
      <p className="na-body-strong text-center text-text-secondary">
        {won ? `You beat ${oppName}` : tied ? `You tied with ${oppName}` : `${oppName} won`} · {myFinal} to {oppFinal}
      </p>
      {accuracy !== null && (
        <div className="flex gap-[9px]">
          <NaRewardTile tone="success" label="Accuracy" value={`${accuracy}%`} icon={<NaRewardIcon kind="Accuracy" size={30} />} />
        </div>
      )}
      <div className="flex-1" />
      <NaButton block disabled={!opp || rematching} onClick={() => void rematch()}>
        Rematch
      </NaButton>
      <div className="flex w-full gap-2.5">
        <NaButton kind="secondary" size="M" className="flex-1" onClick={share}>
          Share
        </NaButton>
        <NaButton kind="text" size="M" className="flex-1" onClick={goHome}>
          Home
        </NaButton>
      </div>
    </div>
  );
}