import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import type { Ability } from "@/lib/abilities";
import type { AbilityState } from "./use-battle-abilities";

export type StatusKind = "confused" | "poisoned";
export interface ActiveStatus {
  kind: StatusKind;
  curesRemaining: number;
  appliedAt: number;
}

interface FloatDmg {
  who: "player" | "enemy";
  n: number;
  super: boolean;
  speedy: boolean;
}

interface Opts {
  playerMaxHp: number;
  setPlayerHp: Dispatch<SetStateAction<number>>;
  setFloatDmg: (data: FloatDmg | null) => void;
  finishRef: React.MutableRefObject<(won: boolean) => void>;
  paused: boolean;
  playerAbility: Ability;
  abilityStateRef: React.MutableRefObject<AbilityState>;
  triggerAbilityToast: (ability: Ability) => void;
}

export function useBattleStatuses({
  playerMaxHp,
  setPlayerHp,
  setFloatDmg,
  finishRef,
  paused,
  playerAbility,
  abilityStateRef,
  triggerAbilityToast,
}: Opts) {
  const [statuses, setStatuses] = useState<ActiveStatus[]>([]);
  const wrongStreakRef = useRef(0);
  const poisonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPoisonTick() {
    if (poisonTimerRef.current) {
      clearInterval(poisonTimerRef.current);
      poisonTimerRef.current = null;
    }
  }

  function startPoisonTick() {
    stopPoisonTick();
    poisonTimerRef.current = setInterval(() => {
      setPlayerHp((hp) => {
        const tick = Math.max(1, Math.floor(playerMaxHp * 0.02));
        const next = Math.max(0, hp - tick);
        setFloatDmg({ who: "player", n: tick, super: false, speedy: false });
        setTimeout(() => setFloatDmg(null), 800);
        if (next <= 0) {
          stopPoisonTick();
          setTimeout(() => finishRef.current(false), 800);
        }
        return next;
      });
    }, 2000);
  }

  function applyStatus(kind: StatusKind) {
    if (
      kind === "confused" &&
      playerAbility.id === "hydration" &&
      !abilityStateRef.current.hydrationUsed
    ) {
      abilityStateRef.current.hydrationUsed = true;
      triggerAbilityToast(playerAbility);
      return;
    }
    const cureNeeds = { confused: 2, poisoned: 3 } as const;
    setStatuses((prev) => {
      const without = prev.filter((s) => s.kind !== kind);
      return [...without, { kind, curesRemaining: cureNeeds[kind], appliedAt: Date.now() }];
    });
    if (kind === "confused") {
      toast.warning("🌀 Confused! Some correct answers may miss.");
    } else {
      toast.error("☠️ Poisoned! Losing HP over time.");
      startPoisonTick();
    }
  }

  function tickStatusCure(kind: StatusKind) {
    setStatuses((prev) => {
      const willClear = prev.some((s) => s.kind === kind && s.curesRemaining === 1);
      const updated = prev
        .map((s) => (s.kind === kind ? { ...s, curesRemaining: s.curesRemaining - 1 } : s))
        .filter((s) => s.curesRemaining > 0);
      if (willClear) {
        if (kind === "confused") toast.success("Snapped out of confusion!");
        if (kind === "poisoned") {
          toast.success("Recovered from poison!");
          stopPoisonTick();
        }
      }
      return updated;
    });
  }

  // Pause/resume poison tick
  useEffect(() => {
    const poisoned = statuses.some((s) => s.kind === "poisoned");
    if (paused && poisonTimerRef.current) {
      stopPoisonTick();
    } else if (!paused && poisoned && !poisonTimerRef.current) {
      startPoisonTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, statuses]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPoisonTick();
  }, []);

  return {
    statuses,
    setStatuses,
    applyStatus,
    tickStatusCure,
    wrongStreakRef,
    stopPoisonTick,
  };
}
