import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { type Ability } from "@/lib/abilities";

export interface AbilityState {
  sturdyUsed: boolean;
  iceFirstWrongConsumed: boolean;
  hydrationUsed: boolean;
  cursedBodyPending: { hpBefore: number; appliedAt: number } | null;
  triggered: Set<string>;
}

interface Trivia {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

interface Opts {
  playerAbility: Ability;
  enemyMaxHp: number;
  questionIdx: number;
  trivia: Trivia | null;
  phase: "intro" | "question" | "feedback" | "result";
  questionsPerSet: number;
  setEnemyHp: (hp: number) => void;
  setRevealedWrong: (idx: number | null) => void;
}

export function useBattleAbilities({
  playerAbility,
  enemyMaxHp,
  questionIdx,
  trivia,
  phase,
  questionsPerSet,
  setEnemyHp,
  setRevealedWrong,
}: Opts) {
  const abilityStateRef = useRef<AbilityState>({
    sturdyUsed: false,
    iceFirstWrongConsumed: false,
    hydrationUsed: false,
    cursedBodyPending: null,
    triggered: new Set<string>(),
  });
  const lastAbilityToastRef = useRef<number>(0);

  function triggerAbilityToast(ability: Ability) {
    const already = abilityStateRef.current.triggered.has(ability.id);
    const now = Date.now();
    const recentlyShown = now - lastAbilityToastRef.current < 1500;
    if (!recentlyShown) {
      toast.info(`✨ ${ability.name} activated!`, {
        description: ability.description,
        duration: 2200,
      });
      lastAbilityToastRef.current = now;
    }
    if (!already) {
      abilityStateRef.current.triggered.add(ability.id);
      useGameStore.getState().registerAbilityTriggered(ability.id);
    }
  }

  // onBattleStart effects (Intimidate, Sand Veil) — run once
  useEffect(() => {
    if (playerAbility.id === "intimidate") {
      setEnemyHp(Math.floor(enemyMaxHp * 0.9));
    }
    if (playerAbility.id === "sand-veil") {
      useGameStore.setState((s) => ({ bonusTimeThisBattle: s.bonusTimeThisBattle + 2 }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Foresight: every 5th question reveal a wrong option
  useEffect(() => {
    if (phase !== "question" || !trivia) return;
    if (playerAbility.id !== "foresight") return;
    if ((questionIdx + 1) % 5 !== 0) return;
    const wrongs = trivia.options.map((_, i) => i).filter((i) => i !== trivia.correct);
    setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    triggerAbilityToast(playerAbility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx, trivia, playerAbility]);

  // Compound Eyes: reveal a wrong option on first/last of each set
  useEffect(() => {
    if (phase !== "question" || !trivia) return;
    if (playerAbility.id !== "compound-eyes") return;
    const pos = questionIdx % questionsPerSet;
    if (pos !== 0 && pos !== questionsPerSet - 1) return;
    const wrongs = trivia.options.map((_, i) => i).filter((i) => i !== trivia.correct);
    setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    triggerAbilityToast(playerAbility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx, trivia, playerAbility]);

  return { abilityStateRef, triggerAbilityToast, playerAbility };
}
