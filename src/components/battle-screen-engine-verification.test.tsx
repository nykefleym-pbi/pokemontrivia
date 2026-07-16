// Verifies engine/turn.ts's `applyAnswer`/`applyRoundStart` (the pure,
// server-authoritative port of battle-screen.tsx's handleAnswer/loadQuestion)
// against the REAL, unmodified BattleMode component, in the same test run —
// not against a possibly-stale committed snapshot. For every rolled ability
// (plus the confused-miss proc/no-proc cases and Elite/Weekly mode), this
// drives BOTH the real component (via RTL, same technique as
// battle-screen.characterization.test.tsx) and the pure engine through the
// identical fixed action script, and asserts their playerHp/enemyHp/ended/won
// trajectories are exactly equal.
//
// This file intentionally DUPLICATES battle-screen.characterization.test.tsx's
// mocks/fixtures rather than importing them, so this verification stays
// self-contained and easy to reason about in isolation. If the two ever
// diverge, that's a signal to look at, not a bug to silently reconcile.
//
// SCOPE MATCHES engine/turn.ts's own documented gaps: item auto-triggers and
// the poisoned-status tick's real-time cadence are NOT exercised here either
// (the fixed SCRIPT below never reaches the poison threshold — see its
// comment in the characterization test file). Those are out of scope for
// `applyAnswer` by design, not silently unverified.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

vi.mock("@/lib/audio", () => ({
  playSfx: vi.fn(),
  revealPokemon: vi.fn(),
  playBattleResult: vi.fn(),
  playItemCue: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("framer-motion", () => {
  interface MotionDivProps extends ComponentPropsWithoutRef<"div"> {
    initial?: unknown;
    animate?: unknown;
    exit?: unknown;
    transition?: unknown;
    layout?: unknown;
    layoutId?: unknown;
    variants?: unknown;
  }
  const stripMotionProps = ({
    initial: _initial,
    animate: _animate,
    exit: _exit,
    transition: _transition,
    layout: _layout,
    layoutId: _layoutId,
    variants: _variants,
    ...rest
  }: MotionDivProps) => rest;
  const Div = (props: MotionDivProps) => <div {...stripMotionProps(props)} />;
  return {
    motion: new Proxy({} as Record<string, typeof Div>, { get: () => Div }),
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  };
});

const FIXED_ENEMY_ID = 4; // Charmander — same fixture as the characterization test

vi.mock("@/lib/game-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/game-data")>();
  const { findPokemon } = await import("@/lib/pokemon-data");
  return {
    ...actual,
    pickRandomEnemy: () => ({
      name: "Test Trainer",
      title: "Trainer",
      pokemon: findPokemon(FIXED_ENEMY_ID)!,
      isShiny: false,
    }),
  };
});

import { BattleScreen } from "./battle-screen";
import { useGameStore } from "@/lib/store";
import { findPokemon, isPlayerDisadvantaged, isPlayerImmune, isSuperEffective } from "@/lib/pokemon-data";
import { shuffleTriviaOptions, type Trivia } from "@/lib/trivia-core";
import { enemyHpForLevel } from "@/lib/game-data";
import { ROLLED_LIST } from "@/content/abilities/rolled";
import { getAbility, type AbilityId } from "@/lib/abilities";
import { ELITE_FOUR } from "@/lib/elite-four";
import { GYM_LEADERS } from "@/lib/gym-leaders";
import {
  applyAnswer,
  applyRoundStart,
  initialBattleState,
  type BattleConfig,
  type BattleState,
} from "@/engine/turn";
import type { Rng } from "@/engine/rng";

const PLAYER = findPokemon(1)!; // Bulbasaur
const ENEMY = findPokemon(FIXED_ENEMY_ID)!; // Charmander
const LEVEL = 5;
const QUESTION_COUNT = 16;

function makeQuestions(n: number): Trivia[] {
  return Array.from({ length: n }, (_, i) => ({
    question: `Question ${i}?`,
    options: ["A", "B", "C", "D"],
    correct: 0,
    explanation: "because",
    category: "Test",
  }));
}

let initialStoreState: ReturnType<typeof useGameStore.getState>;

beforeEach(() => {
  if (!initialStoreState) initialStoreState = useGameStore.getState();
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0.5);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore(abilityId: AbilityId | null) {
  useGameStore.setState(
    { ...initialStoreState, pokemon: PLAYER, level: LEVEL, abilityId, flags: ["tutorial_done"] },
    true,
  );
}

type Action = "correct" | "wrong";

// Same fixed script as battle-screen.characterization.test.tsx's SCRIPT —
// mixed enough to build/break streak and cross the confuse threshold (2
// consecutive wrongs), never the poison threshold (5 in a row).
const SCRIPT: Action[] = [
  "correct",
  "correct",
  "correct",
  "wrong",
  "correct",
  "wrong",
  "wrong",
  "correct",
  "correct",
  "correct",
  "wrong",
  "correct",
];

interface ComparableStep {
  action: Action;
  playerHp: string;
  enemyHp: string;
  ended: boolean;
  won?: string;
  maxStreak?: string;
}

async function runDom(abilityId: AbilityId | null, isElite = false, isWeekly = false): Promise<ComparableStep[]> {
  seedStore(abilityId);
  const questions = makeQuestions(QUESTION_COUNT);
  const correctIdx = shuffleTriviaOptions(questions[0]).correct;
  const wrongIdx = correctIdx === 0 ? 1 : 0;

  const eliteMember = isElite ? (await import("@/lib/elite-four")).ELITE_FOUR[0] : undefined;
  const gymLeader = isWeekly ? (await import("@/lib/gym-leaders")).GYM_LEADERS[0] : undefined;

  render(
    <BattleScreen
      questions={questions}
      onExit={() => {}}
      mode={isElite ? "elite" : isWeekly ? "weekly" : "battle"}
      eliteMember={eliteMember}
      gymLeader={gymLeader}
    />,
  );

  await act(async () => {
    await vi.advanceTimersByTimeAsync(isElite ? 5000 : 3000);
  });

  const steps: ComparableStep[] = [];
  for (const action of SCRIPT) {
    if (screen.queryByTestId("player-hp") == null) break;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    const idx = action === "correct" ? correctIdx : wrongIdx;
    const btn = screen.queryByTestId(`option-${idx}`);
    if (!btn) break;
    await act(async () => {
      fireEvent.click(btn);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    const result = screen.queryByTestId("battle-result");
    steps.push({
      action,
      playerHp: screen.queryByTestId("player-hp")?.textContent ?? "",
      enemyHp: screen.queryByTestId("enemy-hp")?.textContent ?? "",
      ended: !!result,
      ...(result
        ? {
            won: result.getAttribute("data-won") ?? undefined,
            maxStreak: result.getAttribute("data-streak") ?? undefined,
          }
        : {}),
    });
    if (result) break;
  }
  return steps;
}

function constantRng(value: number): Rng {
  const rng: Rng = {
    next: () => value,
    int: (min, max) => min + Math.floor(value * (max - min + 1)),
    chance: (p) => value < p,
    pick: (items) => items[Math.floor(value * items.length)],
    fork: () => rng,
  };
  return rng;
}

function runPure(
  rawAbilityId: AbilityId | null,
  rngValue: number,
  isElite = false,
  isWeekly = false,
): ComparableStep[] {
  // getAbility() resolves the fallback the real component uses: a legacy
  // player with no stored abilityId gets their primary type's first rolled
  // ability (leech-seed for grass/Bulbasaur), not "no ability".
  const abilityId = getAbility(PLAYER.types, rawAbilityId).id;
  // Elite/Weekly battles fight a specific signature Pokémon, not the mocked
  // pickRandomEnemy() — matchup math must use the same one runDom renders.
  const enemy = isElite
    ? findPokemon(ELITE_FOUR[0].signaturePokemonId)!
    : isWeekly
      ? findPokemon(GYM_LEADERS[0].signaturePokemonId)!
      : ENEMY;
  const superEff = isSuperEffective(PLAYER, enemy);
  const disadvantaged = isPlayerDisadvantaged(PLAYER, enemy);
  const immune = isPlayerImmune(PLAYER, enemy);
  const playerMaxHp = abilityId === "adaptable" ? 105 : 100;
  const enemyMaxHp = isElite ? 200 : isWeekly ? 250 : enemyHpForLevel(LEVEL);
  const startingEnemyHp = abilityId === "intimidate" ? Math.floor(enemyMaxHp * 0.9) : enemyMaxHp;
  const bonusTime = abilityId === "sand-veil" ? 2 : 0;

  const config: BattleConfig = {
    abilityId,
    level: LEVEL,
    isElite,
    isWeekly,
    playerMaxHp,
    enemyMaxHp,
    superEff,
    disadvantaged,
    immune,
    trainingPoints: 0,
    bonusTime,
  };

  let state: BattleState = initialBattleState(playerMaxHp, startingEnemyHp);
  const rng = constantRng(rngValue);
  const steps: ComparableStep[] = [];

  for (let i = 0; i < SCRIPT.length; i++) {
    if (state.phase !== "in_progress") break;
    const rs = applyRoundStart(state, config, i);
    state = rs.state;
    if (state.phase !== "in_progress") {
      // Matches runDom: once the battle ends, the result screen replaces the
      // combat panel, so player-hp/enemy-hp no longer exist in the DOM —
      // runDom's `?? ""` fallback reads empty strings on the ended step.
      steps.push({
        action: SCRIPT[i],
        playerHp: "",
        enemyHp: "",
        ended: true,
        won: String(state.phase === "won"),
        maxStreak: String(state.maxStreak),
      });
      break;
    }
    const ar = applyAnswer(
      state,
      config,
      { correct: SCRIPT[i] === "correct", questionIdx: i, elapsedMs: 3000 },
      rng,
    );
    state = ar.state;
    const ended = state.phase !== "in_progress";
    steps.push({
      action: SCRIPT[i],
      playerHp: ended ? "" : String(Math.round(state.playerHp)),
      enemyHp: ended ? "" : String(Math.round(state.enemyHp)),
      ended,
      ...(ended ? { won: String(state.phase === "won"), maxStreak: String(state.maxStreak) } : {}),
    });
    if (ended) break;
  }
  return steps;
}

describe("engine/turn.ts applyAnswer matches the real BattleMode component", () => {
  // "stealth-rock" is excluded from this sweep and verified separately below
  // — see that test for why it's expected to (correctly) diverge.
  const abilitiesToVerify = ROLLED_LIST.map((a) => a.id).filter((id) => id !== "stealth-rock");

  it.each(abilitiesToVerify)("ability: %s", async (abilityId) => {
    const dom = await runDom(abilityId as AbilityId);
    const pure = runPure(abilityId as AbilityId, 0.5);
    expect(pure).toEqual(dom);
  });

  it("baseline — unset abilityId (legacy fallback to leech-seed)", async () => {
    const dom = await runDom(null);
    const pure = runPure(null, 0.5);
    expect(pure).toEqual(dom);
  });

  it("confused miss forced to proc", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const dom = await runDom("guts");
    const pure = runPure("guts", 0.01);
    expect(pure).toEqual(dom);
  });

  it("confused but the miss doesn't proc", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.9);
    const dom = await runDom("guts");
    const pure = runPure("guts", 0.9);
    expect(pure).toEqual(dom);
  });

  it("elite battle: flat base damage + dark-aura elite bonus", async () => {
    const dom = await runDom("dark-aura", true, false);
    const pure = runPure("dark-aura", 0.5, true, false);
    expect(pure).toEqual(dom);
  });

  it("weekly league battle: flat base damage + dark-aura weekly bonus", async () => {
    const dom = await runDom("dark-aura", false, true);
    const pure = runPure("dark-aura", 0.5, false, true);
    expect(pure).toEqual(dom);
  });

  // KNOWN, DELIBERATE DIVERGENCE — not a port bug.
  //
  // battle-screen.tsx's Stealth Rock chip (in loadQuestion, fired via a
  // setTimeout(nextQuestion, 1800) scheduled by the PRECEDING answer) closes
  // over that render's `enemyHp`, which is stale by the time it runs if that
  // same answer's own `setEnemyHp(newEnemyHp)` already landed — the chip's
  // `Math.max(0, enemyHp - 3)` computes from the pre-answer HP and then
  // overwrites the post-answer HP with a direct (non-functional) `setEnemyHp`,
  // silently discarding that answer's own damage whenever a round boundary
  // (every 5th question) lands right after it. `applyRoundStart` is a
  // synchronous step against the CURRENT state, so it doesn't have this bug:
  // both the answer's damage and the chip apply. This makes the engine more
  // correct than the client for this one interaction, not less faithful —
  // documented in engine/turn.ts's module doc. This test asserts the
  // difference explicitly rather than silently skipping stealth-rock.
  it("stealth-rock: the engine (correctly) doesn't reproduce the client's stale-closure chip bug", async () => {
    const dom = await runDom("stealth-rock");
    const pure = runPure("stealth-rock", 0.5);
    expect(pure).not.toEqual(dom);
    // Up to the first round boundary (question index 5, the 6th action),
    // nothing has diverged yet.
    expect(pure.slice(0, 4)).toEqual(dom.slice(0, 4));
  });
});
