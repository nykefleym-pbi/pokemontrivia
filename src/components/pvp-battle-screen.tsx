import { useEffect, useMemo, useRef, useState } from "react";
import type { Trivia } from "@/lib/trivia-core";
import { shuffleAllTriviaOptions } from "@/lib/trivia-core";
import { playSfx } from "@/lib/audio";

const QUESTION_TIME_MS = 20_000;

export interface PvpBattleResult {
  correct: number;
  total: number;
  timeMs: number;
  maxStreak: number;
}

interface Props {
  questions: Trivia[];
  onFinish: (result: PvpBattleResult) => void;
}

/**
 * Dedicated lightweight quiz runner for PvP — no HP/type-effectiveness
 * machinery, just the frozen question set, a per-question countdown, and a
 * running correct/streak/time tally handed back on completion.
 */
export function PvpBattleScreen({ questions: rawQuestions, onFinish }: Props) {
  // Both players get the same frozen question set; only the option order is
  // randomized per client (correctness is computed locally, so this is safe).
  const questions = useMemo(() => shuffleAllTriviaOptions(rawQuestions), [rawQuestions]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const [msLeft, setMsLeft] = useState(QUESTION_TIME_MS);
  const startedAtRef = useRef(Date.now());
  const questionStartRef = useRef(Date.now());
  const advancingRef = useRef(false);

  const q = questions[index];

  useEffect(() => {
    questionStartRef.current = Date.now();
    setMsLeft(QUESTION_TIME_MS);
    advancingRef.current = false;
    const iv = setInterval(() => {
      const left = QUESTION_TIME_MS - (Date.now() - questionStartRef.current);
      setMsLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(iv);
        handleAnswer(-1);
      }
    }, 100);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  function handleAnswer(choiceIndex: number) {
    if (advancingRef.current || selected !== null) return;
    advancingRef.current = true;
    setSelected(choiceIndex);
    const isCorrect = choiceIndex === q.correct;
    if (isCorrect) {
      playSfx("correct");
      setCorrectCount((c) => c + 1);
      setStreak((s) => {
        const next = s + 1;
        setMaxStreak((m) => Math.max(m, next));
        return next;
      });
    } else {
      playSfx("wrong");
      setStreak(0);
    }
    setTimeout(() => {
      if (index + 1 >= questions.length) {
        onFinish({
          correct: correctCount + (isCorrect ? 1 : 0),
          total: questions.length,
          timeMs: Date.now() - startedAtRef.current,
          maxStreak: Math.max(maxStreak, isCorrect ? streak + 1 : maxStreak),
        });
      } else {
        setIndex((i) => i + 1);
        setSelected(null);
      }
    }, 900);
  }

  if (!q) return null;

  const pct = (msLeft / QUESTION_TIME_MS) * 100;

  return (
    <div className="flex h-full w-full flex-col bg-poke-cream px-5 pb-8 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-pixel-xs text-foreground/60">
          Question {index + 1} / {questions.length}
        </div>
        <div className="font-pixel-xs text-foreground/60">
          Streak {streak} · Best {maxStreak}
        </div>
      </div>
      <div className="mb-5 h-2 w-full overflow-hidden rounded-full bg-black/10">
        <div
          className="h-full rounded-full bg-poke-red transition-[width] duration-100"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mb-6 rounded-3xl bg-card p-5 shadow-card">
        <div className="font-pixel-xs mb-2 text-foreground/50">{q.category}</div>
        <div className="font-display text-lg leading-snug text-foreground">{q.question}</div>
      </div>
      <div className="flex flex-1 flex-col gap-3">
        {q.options.map((opt, i) => {
          const isCorrectOpt = i === q.correct;
          const isSelected = selected === i;
          const showState = selected !== null;
          return (
            <button
              key={i}
              disabled={selected !== null}
              onClick={() => handleAnswer(i)}
              className={`rounded-2xl border-2 px-4 py-3 text-left font-display text-base transition-colors ${
                showState && isCorrectOpt
                  ? "border-hp-good bg-hp-good/15 text-hp-good"
                  : showState && isSelected && !isCorrectOpt
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border bg-card text-foreground"
              }`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
