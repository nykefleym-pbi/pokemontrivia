import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { dailyReward } from "@/lib/rewards";
import { rollLevelUpRewards } from "@/lib/level-rewards";
import { rankForLevel, trainerSpriteUrl } from "@/lib/game-data";
import { PokemonSprite, PokeballPattern, QuestionCard, type DailyMark } from "@/components/game-ui";
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
import { playSfx, playBattleResult } from "@/lib/audio";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";
import type { Trivia } from "@/lib/trivia-core";
import { syncActivity } from "@/lib/social";
import { useForfeitGuard } from "@/lib/use-forfeit-guard";
import { submitDailyRun } from "@/services/client/daily-run";

export function DailyScreen({ questions, onExit }: { questions: Trivia[]; onExit: () => void }) {
  const recordDaily = useGameStore((s) => s.recordDaily);
  const recordAnswer = useGameStore((s) => s.recordAnswer);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "done">("question");
  const [chosen, setChosen] = useState<number | null>(null);
  const [pattern, setPattern] = useState<DailyMark[]>([]);
  const abortBattle = useGameStore((s) => s.abortBattle);
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive]);
  const [confirmExit, setConfirmExit] = useState(false);
  // Browser/Android back mid-run asks to forfeit instead of silently leaving
  // (feedback 2286b6fc). Reuses the existing Leave dialog.
  useForfeitGuard(phase !== "done", () => setConfirmExit(true));
  const [correctCount, setCorrectCount] = useState(0);
  const [timer, setTimer] = useState(20);
  const [lastElapsedMs, setLastElapsedMs] = useState(0);
  const startedAt = useRef(Date.now());
  const qStart = useRef(Date.now());
  const recordedRef = useRef(false);
  const dailyStreakRef = useRef(0);
  // server-first-refactor Phase 3 — raw picks (null for a timeout), in
  // question order, submitted to daily-run once the whole set is answered.
  const picksRef = useRef<Array<number | null>>([]);

  const trivia = questions[idx];
  const total = questions.length;

  useEffect(() => {
    qStart.current = Date.now();
    setTimer(20);
  }, [idx]);

  useEffect(() => {
    if (phase !== "question") return;
    if (timer <= 0) {
      handleAnswer(-1);
      return;
    }
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, phase]);

  function handleAnswer(picked: number) {
    if (!trivia || phase !== "question") return;
    setChosen(picked);
    const correct = picked === trivia.correct;
    const elapsed = Date.now() - qStart.current;
    setLastElapsedMs(elapsed);
    const nextStreak = correct ? dailyStreakRef.current + 1 : 0;
    dailyStreakRef.current = nextStreak;
    recordAnswer(correct, elapsed, nextStreak);
    const sym: DailyMark = picked === -1 ? "timeout" : correct ? "correct" : "wrong";
    const nextPattern: DailyMark[] = [...pattern, sym];
    setPattern(nextPattern);
    picksRef.current = [...picksRef.current, picked === -1 ? null : picked];
    if (correct) setCorrectCount((c) => c + 1);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(correct ? 30 : [50, 30, 50]);
      } catch {
        /* ignore */
      }
    }
    playSfx(correct ? "correct" : "wrong");
    setPhase("feedback");
    setTimeout(() => {
      const next = idx + 1;
      if (next >= total) {
        const timeMs = Date.now() - startedAt.current;
        if (!recordedRef.current) {
          recordedRef.current = true;
          const finalCorrect = correctCount + (correct ? 1 : 0);
          recordDaily({
            date: new Date().toISOString().slice(0, 10),
            correct: finalCorrect,
            total,
            timeMs,
            pattern: nextPattern,
          });
          void syncActivity("last_daily_claim");
          useGameStore.getState().pushBattleLog({
            opponent: "Daily Quest",
            won: true,
            xpGained: 0,
            bestStreak: 0,
            timestamp: Date.now(),
            mode: "daily",
          });
          // server-first-refactor Phase 3 — submit to daily-run for the
          // idempotent, server-validated reward instead of trusting this
          // component's own self-scored tally. Falls back to the old
          // client-computed dailyReward() only if the submit itself fails
          // (network hiccup) — never on `alreadyGranted`, which means the
          // server already paid this out (or determined it didn't qualify).
          void (async () => {
            let reward: { xp: number; tp: number } | null = null;
            try {
              const res = await submitDailyRun(picksRef.current, timeMs);
              reward = res.reward;
            } catch {
              const lvl = useGameStore.getState().level;
              reward = dailyReward({ correct: finalCorrect, total, level: lvl });
            }
            if (reward && reward.xp > 0) {
              const prevLevel = useGameStore.getState().level;
              useGameStore.getState().addXp(reward.xp);
              const partner = useGameStore.getState().pokemon;
              if (partner) useGameStore.getState().addTrainingPoints(partner.id, reward.tp);
              const newLevel = useGameStore.getState().level;
              if (newLevel > prevLevel) {
                const rewards = rollLevelUpRewards(prevLevel, newLevel);
                if (rewards) {
                  useGameStore.getState().mergePendingLevelUp(rewards);
                  if (rewards.coins > 0) useGameStore.getState().addCoins(rewards.coins);
                  for (const it of rewards.items) useGameStore.getState().grantItem(it.id, it.qty);
                  if (rewards.eggs > 0) useGameStore.getState().grantPokeEgg(rewards.eggs);
                }
              }
            }
            playSfx("victory");
            playBattleResult("daily", true);
            setPhase("done");
          })();
          return;
        }
        playSfx("victory");
        playBattleResult("daily", true);
        setPhase("done");
      } else {
        setChosen(null);
        setIdx(next);
        setPhase("question");
      }
    }, 1500);
  }

  if (phase === "done") {
    const timeMs = Date.now() - startedAt.current;
    return (
      <>
        {/* Test-observability hook only — not read by any production code. */}
        <div
          data-testid="daily-result"
          data-correct={correctCount}
          data-total={total}
          hidden
        />
        <DailyResultScreen
          correct={correctCount}
          total={total}
          timeMs={timeMs}
          pattern={pattern}
          onExit={onExit}
        />
      </>
    );
  }

  if (!trivia) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="font-pixel text-sm text-muted-foreground">
          No daily questions available.
        </div>
      </div>
    );
  }

  const progressPct = (idx / total) * 100;

  return (
    <div className="bg-battle-field relative flex h-full w-full flex-col overflow-hidden">
      <div className="absolute left-0 right-0 top-0 z-40 h-1 bg-poke-dark/20">
        <motion.div
          className="h-full bg-poke-yellow"
          initial={false}
          animate={{ width: `${progressPct}%` }}
        />
      </div>
      <div className="flex shrink-0 items-center justify-between pt-[calc(env(safe-area-inset-top)+1rem)] pb-1 px-[max(1.25rem,env(safe-area-inset-left))]">
        <div className="w-9" />
        <div className="rounded-full bg-poke-dark px-2.5 py-1 font-pixel text-[9px] text-poke-yellow shadow-card">
          🔥 DAILY · {idx + 1}/{total}
        </div>
        <div className="w-9" />
      </div>
      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the daily challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving will discard your progress on today's challenge. You can start it again, but
              nothing is saved until you finish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                abortBattle();
                onExit();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="relative flex-1 min-h-0 flex items-center justify-center px-4">
        <motion.div
          className="pointer-events-none absolute left-1/2 top-[18%] z-10 -translate-x-1/2"
          animate={{
            x: [0, 14, -10, 8, 0],
            y: [0, -10, 6, -5, 0],
            rotate: [0, 4, -3, 2, 0],
          }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        >
          <div className="relative">
            <div className="absolute inset-0 -z-10 rounded-full bg-destructive/50 blur-3xl" />
            <PokemonSprite
              id={479}
              alt="Rotom"
              className="sprite h-72 w-72 sm:h-80 sm:w-80 shrink-0 object-contain drop-shadow-[0_0_40px_oklch(0.62_0.22_25/0.85)]"
            />
          </div>
        </motion.div>
        <PokeballPattern marks={pattern} />
      </div>

      <div className="relative shrink-0 rounded-t-[28px] bg-card pt-14 px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-8px_30px_-12px_oklch(0.3_0.05_260/0.25)]">
        <AnimatePresence mode="wait">
          <QuestionCard
            key={idx}
            trivia={trivia}
            phase={phase as "question" | "feedback"}
            chosen={chosen}
            revealedWrong={null}
            revealedWrong2={null}
            revealedCorrect={null}
            timer={timer}
            maxTime={20}
            lastElapsedMs={lastElapsedMs}
            onAnswer={(i) => handleAnswer(i)}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}

function DailyResultScreen({
  correct,
  total,
  timeMs,
  pattern,
  onExit,
}: {
  correct: number;
  total: number;
  timeMs: number;
  pattern: DailyMark[];
  onExit: () => void;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const seconds = Math.round(timeMs / 1000);
  const bestStreak = (() => {
    let best = 0,
      cur = 0;
    for (const m of pattern) {
      if (m === "correct") {
        cur += 1;
        best = Math.max(best, cur);
      } else cur = 0;
    }
    return best;
  })();
  const [shareOpen, setShareOpen] = useState(false);
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const partner = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const isPerfect = correct === total && total > 0;
  const avgTimeMs = total > 0 ? timeMs / total : undefined;
  const shareData: ShareData | null =
    isPerfect && partner
      ? {
          type: "daily-perfect",
          trainerName,
          trainerSpriteUrl: trainerSpriteUrl(trainerSprite),
          partnerName: partner.name,
          partnerPokemonId: partner.id,
          partnerShiny: false,
          opponentName: "Rotom",
          opponentTitle: "Daily Challenge",
          opponentSpriteUrl: null,
          signaturePokemonId: 479,
          finalPlayerHp: 100,
          maxPlayerHp: 100,
          topStreak: bestStreak,
          topDamage: 0,
          dateISO: date,
          correctCount: correct,
          totalQuestions: total,
          xpEarned: dailyReward({ correct, total, level }).xp,
          avgTimeMs,
          level,
          rank: rankForLevel(level),
        }
      : null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-poke-hero pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))] py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]"
    >
      <div className="rounded-full bg-poke-yellow px-3 py-1 font-pixel-xs uppercase text-foreground">
        Daily Challenge · {date}
      </div>
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 140 }}
        className="relative mt-4 flex h-24 w-24 items-center justify-center"
      >
        <div className="absolute inset-0 rounded-full bg-poke-yellow/50 blur-xl" />
        <svg viewBox="0 0 64 64" className="relative h-20 w-20">
          <circle
            cx="32"
            cy="26"
            r="20"
            fill="var(--color-poke-yellow)"
            stroke="var(--color-poke-dark)"
            strokeWidth="2.5"
          />
          <path d="M12 26 H52" stroke="var(--color-poke-dark)" strokeWidth="2.5" />
          <circle
            cx="32"
            cy="26"
            r="5"
            fill="white"
            stroke="var(--color-poke-dark)"
            strokeWidth="2"
          />
          <path
            d="M22 44 L18 60 L26 54 L32 60 L38 54 L46 60 L42 44 Z"
            fill="var(--color-primary)"
            stroke="var(--color-poke-dark)"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      </motion.div>
      <div className="mt-3 font-display-xl text-foreground">All done!</div>

      <div className="mt-5 grid w-full max-w-xs grid-cols-3 gap-2">
        <DailyTile label="Score" value={`${correct}/${total}`} accent />
        <DailyTile label="Time" value={`${seconds}s`} />
        <DailyTile label="Best Streak" value={String(bestStreak)} />
      </div>

      <div className="mt-4 w-full max-w-xs rounded-2xl bg-card p-4 shadow-card">
        <div className="font-pixel-xs uppercase text-muted-foreground">Today's Pattern</div>
        <div className="mt-3 flex justify-center">
          <PokeballPattern marks={pattern} />
        </div>
      </div>

      {shareData && (
        <Button
          size="lg"
          onClick={() => setShareOpen(true)}
          className="mt-5 h-12 w-full max-w-xs rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
        >
          Share result
        </Button>
      )}
      <Button
        size="lg"
        onClick={onExit}
        className="mt-5 h-12 w-full max-w-xs rounded-full border-2 border-poke-dark/20 bg-card font-bold text-foreground shadow-card hover:bg-card/80"
      >
        Back
      </Button>
      {shareData && (
        <ShareCardDialog open={shareOpen} onClose={() => setShareOpen(false)} data={shareData} />
      )}
    </motion.div>
  );
}

function DailyTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl bg-card px-2 py-3 text-center shadow-card">
      <div className={`font-display-md ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
