import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "@/lib/store";
import { dailyReward } from "@/lib/rewards";
import { rollLevelUpRewards } from "@/lib/level-rewards";
import { rankForLevel, trainerSpriteUrl } from "@/lib/game-data";
import { PokemonSprite, PokeballPattern, type DailyMark } from "@/components/game-ui";
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
import { TimerRing } from "@/components/battle-screen";
import { syncActivity } from "@/lib/social";

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
  const [correctCount, setCorrectCount] = useState(0);
  const [timer, setTimer] = useState(20);
  const startedAt = useRef(Date.now());
  const qStart = useRef(Date.now());
  const recordedRef = useRef(false);
  const dailyStreakRef = useRef(0);

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
    const nextStreak = correct ? dailyStreakRef.current + 1 : 0;
    dailyStreakRef.current = nextStreak;
    recordAnswer(correct, elapsed, nextStreak);
    const sym: DailyMark = picked === -1 ? "timeout" : correct ? "correct" : "wrong";
    const nextPattern: DailyMark[] = [...pattern, sym];
    setPattern(nextPattern);
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
          const lvl = useGameStore.getState().level;
          const daily = dailyReward({ correct: finalCorrect, total, level: lvl });
          if (daily.xp > 0) {
            const prevLevel = useGameStore.getState().level;
            useGameStore.getState().addXp(daily.xp);
            const partner = useGameStore.getState().pokemon;
            if (partner) useGameStore.getState().addTrainingPoints(partner.id, daily.tp);
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
      <DailyResultScreen
        correct={correctCount}
        total={total}
        timeMs={timeMs}
        pattern={pattern}
        onExit={onExit}
      />
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
        <div className="pointer-events-none absolute left-1/2 -top-12 z-10 flex -translate-x-1/2 flex-col items-center">
          <TimerRing timer={timer} maxTime={20} />
          <p className="mt-1.5 font-pixel-xs text-foreground/70">{trivia.category}</p>
        </div>

        <p className="text-center text-[clamp(0.95rem,4vw,1.125rem)] font-bold leading-snug">
          {trivia.question}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {trivia.options.map((opt, i) => {
            const isCorrect = phase === "feedback" && i === trivia.correct;
            const isWrong = phase === "feedback" && chosen === i && i !== trivia.correct;
            return (
              <button
                key={i}
                disabled={phase !== "question"}
                onClick={() => handleAnswer(i)}
                className={`flex min-h-[48px] items-center justify-between rounded-2xl border-2 bg-card px-4 py-2.5 text-left text-[clamp(0.875rem,3.6vw,0.95rem)] font-semibold transition active:scale-[0.98] ${
                  isCorrect
                    ? "border-hp-good bg-hp-good/5 text-hp-good"
                    : isWrong
                      ? "border-destructive bg-destructive/5 text-destructive"
                      : "border-border/60 text-foreground hover:border-primary/50"
                } disabled:cursor-not-allowed`}
              >
                <span className="min-w-0 flex-1 truncate">{opt}</span>
                {isCorrect && (
                  <span className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hp-good text-[12px] text-white">
                    ✓
                  </span>
                )}
                {isWrong && (
                  <span className="ml-2 shrink-0 text-[10px] font-bold uppercase tracking-wide text-destructive">
                    Your Pick ×
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {phase === "feedback" && (
          <p className="mt-2 rounded-xl bg-muted p-2 text-[11px] leading-snug text-muted-foreground">
            💡 {trivia.explanation}
          </p>
        )}
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
