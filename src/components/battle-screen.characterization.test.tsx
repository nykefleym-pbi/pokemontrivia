// Characterization/regression baseline for BattleMode's in-battle math
// (handleAnswer / finish in battle-screen.tsx).
//
// WHY THIS EXISTS: that logic is ~50 per-ability special cases plus item
// auto-triggers, tightly interleaved with React state, refs, and timers, with
// no prior test coverage. Per CLAUDE.md's signature-ability warning, this
// codebase has gotten this exact class of thing wrong before when a change
// was eyeballed instead of verified. engine/turn.ts's reduce()/replay() (the
// server-authoritative port of this logic, see that file) must NOT be written
// from a read-through of battle-screen.tsx alone — it must be diffed against
// these snapshots and match byte-for-byte, or the port has a bug.
//
// This drives the REAL, unmodified BattleMode component end-to-end (render +
// simulated clicks) rather than re-implementing the math, so the baseline is
// exactly what players experience today. Non-determinism is pinned: Math.random
// is a fixed constant, the system clock is fixed and only advanced by explicit
// amounts, and the enemy/player/questions are fixed fixtures. `data-testid`
// hooks added to battle-screen.tsx for this (enemy-hp, player-hp, option-N,
// battle-result) are observability-only — they don't change any behavior.
//
// COVERAGE: every rolled ability (content/abilities/rolled) run through one
// fixed 12-answer script, plus the three chance-based wrong-answer branches
// (static / flame-body / cute-charm) forced to proc. NOT covered yet: item
// auto-triggers (Focus Band, Oran Berry, Revive, Silk Scarf, King's Rock,
// Leftovers, Metronome, Quick Claw, Assault Vest), Elite/Weekly-only branches,
// and the confused/poisoned status ticks. Extend `SCRIPT`/`seedStore` to add
// those rather than guessing they're covered.
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

// Animations are irrelevant to the battle math being characterized, and
// framer-motion's internal RAF-driven scheduling deadlocks vitest's fake
// timers. Replace it with plain passthrough elements.
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

const FIXED_ENEMY_ID = 4; // Charmander — fixed so type-matchup math is stable

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
import { findPokemon } from "@/lib/pokemon-data";
import { shuffleTriviaOptions, type Trivia } from "@/lib/trivia-core";
import { ROLLED_LIST } from "@/content/abilities/rolled";
import type { AbilityId } from "@/lib/abilities";

const PLAYER = findPokemon(1)!; // Bulbasaur
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
  // Exclude requestAnimationFrame from the fake clock: framer-motion (and
  // jsdom generally) drive rAF-based work that must keep ticking in real
  // time, independent of our explicit setTimeout/Date advances below.
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
    {
      ...initialStoreState,
      pokemon: PLAYER,
      level: 5,
      abilityId,
      flags: ["tutorial_done"],
    },
    true,
  );
}

type Action = "correct" | "wrong";

// A fixed sequence exercising both branches repeatedly across several
// QUESTIONS_PER_SET(=5) round boundaries (streak build, streak break,
// wrong-streak thresholds for confuse/poison, set-boundary abilities).
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

// All-wrong: drives playerHp toward (and past) 0, exercising the near-KO
// branches SCRIPT never reaches — Sturdy's revive-at-1, Torrent's
// below-30%-HP heal, and Amnesia's shifted confuse/poison thresholds.
const ATTRITION_SCRIPT: Action[] = Array(10).fill("wrong");

async function runBattle(abilityId: AbilityId | null, script: Action[]) {
  seedStore(abilityId);
  const questions = makeQuestions(QUESTION_COUNT);
  // Same fixed Math.random as the component uses, so this predicts which
  // button index is "correct" after battle-screen's own per-question shuffle.
  const correctIdx = shuffleTriviaOptions(questions[0]).correct;
  const wrongIdx = correctIdx === 0 ? 1 : 0;

  render(<BattleScreen questions={questions} onExit={() => {}} />);

  // Intro sequencing (banner -> reveal partner -> loadQuestion(0)) resolves
  // by ~2800ms for a regular (non-elite) battle.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3000);
  });

  const trace: Array<Record<string, unknown>> = [];

  for (const action of script) {
    if (screen.queryByTestId("player-hp") == null) break; // battle already ended

    // ~3s of "thinking time" before answering — feeds the speed bonus calc.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });

    const idx = action === "correct" ? correctIdx : wrongIdx;
    const btn = screen.queryByTestId(`option-${idx}`);
    if (!btn) break;
    await act(async () => {
      fireEvent.click(btn);
    });

    // feedback delay (1800ms) or finish() delay (1400ms) before the next
    // question/result renders.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    const result = screen.queryByTestId("battle-result");
    trace.push({
      action,
      playerHp: screen.queryByTestId("player-hp")?.textContent ?? null,
      enemyHp: screen.queryByTestId("enemy-hp")?.textContent ?? null,
      ended: !!result,
      ...(result
        ? {
            won: result.getAttribute("data-won"),
            xp: result.getAttribute("data-xp"),
            tp: result.getAttribute("data-tp"),
            coins: result.getAttribute("data-coins"),
            maxStreak: result.getAttribute("data-streak"),
          }
        : {}),
    });
    if (result) break;
  }

  return trace;
}

describe("battle-screen ability characterization (regression baseline)", () => {
  // Bulbasaur with no stored abilityId falls back to its primary type's
  // first rolled ability (leech-seed) — this IS current production
  // behavior for any legacy save without a rolled ability, not a "no
  // ability" case.
  it("baseline — unset abilityId (legacy fallback)", async () => {
    const trace = await runBattle(null, SCRIPT);
    expect(trace).toMatchSnapshot();
  });

  it.each(ROLLED_LIST.map((a) => a.id))("ability: %s", async (abilityId) => {
    const trace = await runBattle(abilityId as AbilityId, SCRIPT);
    expect(trace).toMatchSnapshot();
  });
});

describe("chance-based wrong-answer branches forced to proc", () => {
  it.each(["static", "flame-body", "cute-charm"] as const)("%s procs", async (abilityId) => {
    vi.spyOn(Math, "random").mockReturnValue(0.01);
    const trace = await runBattle(abilityId, SCRIPT);
    expect(trace).toMatchSnapshot();
  });
});

// FINDING (not fixed here — this suite characterizes current behavior, it
// doesn't patch it): under this script, "sturdy"'s trace ends with
// `ended: false` forever, i.e. a soft-locked battle. It's the only ability
// of the 51 that doesn't reach a result. Reproduced with generous extra
// timer-advance (10s+) beyond the normal ~1400ms finish() delay — it's a
// real stuck state, not a test-timing race. Best-guess mechanism: Sturdy is
// the only ability whose wrong-answer branch can revive playerHp from a
// would-be <=0 back to 1 within the same click; if the poisoned-status
// interval (wrongStreak reaches the poison threshold around the same time)
// also drops that 1 HP to 0 on its own tick, its callback schedules a
// competing `finish(false)` from inside a `setPlayerHp` functional updater —
// which is itself a pre-existing pattern in battle-screen.tsx, not something
// this harness introduced. Needs production investigation; flagged in the PR
// rather than guessed at further here.
describe("battle-screen ability characterization — attrition (near-KO branches)", () => {
  it.each(ROLLED_LIST.map((a) => a.id))("ability: %s", async (abilityId) => {
    const trace = await runBattle(abilityId as AbilityId, ATTRITION_SCRIPT);
    expect(trace).toMatchSnapshot();
  });
});
