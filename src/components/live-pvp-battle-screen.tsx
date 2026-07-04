import { useEffect, useRef, useState } from "react";
import type { Trivia } from "@/lib/trivia-core";
import { playSfx } from "@/lib/audio";

const QUESTION_TIME_MS = 20_000;

export interface LivePvpBattleResult {
  correct: number;
  total: number;
  timeMs: number;
  maxStreak: number;
}

interface Props {
  questions: Trivia[];
  startedAt: string;
  onFinish: (result: LivePvpBattleResult) => void;
}

/**
 * Wall-clock synced quiz runner for Nearby Battle: both trainers derive the
 * current question index from the same shared `startedAt` anchor, so
 * questions advance in lockstep for both screens regardless of who answers
 * first — answering early just locks your pick in until the shared boundary.
 */
export function LivePvpBattleScreen({ questions, startedAt, onFinish }: Props) {
  const startedAtMs = useRef(new Date(startedAt).getTime()).current;
  const [now, setNow] = useState(() => Date.now());
  const [displayedIndex, setDisplayedIndex] = useState(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [maxStreak, setMaxStreak] = useState(0);
  const finishedRef = useRef(false);
  const correctRef = useRef(0);
  const maxStreakRef = useRef(0);

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(iv);
  }, []);

  const elapsed = now - startedAtMs;
  const idx = elapsed < 0 ? -1 : Math.floor(elapsed / QUESTION_TIME_MS);

  useEffect(() => {
    if (idx === displayedIndex || finishedRef.current) return;
    if (idx >= questions.length) {
      finishedRef.current = true;
      onFinish({
        correct: correctRef.current,
        total: questions.length,
        timeMs: questions.length * QUESTION_TIME_MS,
        maxStreak: maxStreakRef.current,
      });
      return;
    }
    if (idx > displayedIndex && displayedIndex >= 0 && selected === null) {
      // Time ran out on the previous question without an answer.
      setStreak(0);
    }
    setDisplayedIndex(idx);
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  function handleAnswer(choiceIndex: number) {
    if (selected !== null || displayedIndex < 0) return;
    const q = questions[displayedIndex];
    setSelected(choiceIndex);
    if (choiceIndex === q.correct) {
      playSfx("correct");
      correctRef.current += 1;
      setStreak((s) => {
        const next = s + 1;
        setMaxStreak((m) => {
          const nm = Math.max(m, next);
          maxStreakRef.current = nm;
          return nm;
        });
        return next;
      });
    } else {
      playSfx("wrong");
      setStreak(0);
    }
  }

  if (idx < 0) {
    const secsLeft = Math.max(0, Math.ceil(-elapsed / 1000));
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-poke-cream px-6 text-center">
        <div className="font-display-xl text-foreground">Get ready!</div>
        <div className="text-5xl font-extrabold text-primary">{secsLeft}</div>
        <div className="font-pixel-xs text-foreground/60">Battle starting…</div>
      </div>
    );
  }

  const q = questions[displayedIndex];
  if (!q) return null;

  const windowElapsed = elapsed - displayedIndex * QUESTION_TIME_MS;
  const msLeft = Math.max(0, QUESTION_TIME_MS - windowElapsed);
  const pct = (msLeft / QUESTION_TIME_MS) * 100;

  return (
    <div className="flex h-full w-full flex-col bg-poke-cream px-5 pb-8 pt-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="font-pixel-xs text-foreground/60">
          Question {displayedIndex + 1} / {questions.length}
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
      {selected !== null && (
        <div className="mt-3 text-center font-pixel-xs text-foreground/50">
          Locked in — next question in {Math.ceil(msLeft / 1000)}s
        </div>
      )}
    </div>
  );
}
