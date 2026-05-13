import { useEffect, useState } from "react";

const TIMER_BASE = 20;

interface Opts {
  phase: "intro" | "question" | "feedback" | "result";
  paused: boolean;
  bonusTime: number;
  onTimeout: () => void;
}

export function useBattleTimer({ phase, paused, bonusTime, onTimeout }: Opts) {
  const [timer, setTimer] = useState(TIMER_BASE);

  useEffect(() => {
    if (phase !== "question") return;
    if (paused) return;
    if (timer <= 0) {
      onTimeout();
      return;
    }
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timer, paused]);

  function resetTimer() {
    setTimer(TIMER_BASE + bonusTime);
  }

  return { timer, setTimer, resetTimer, TIMER_BASE };
}
