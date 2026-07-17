// Characterization/regression baseline for DailyScreen's scoring/reward math
// (handleAnswer in daily-screen.tsx).
//
// WHY THIS EXISTS: server-first-refactor's Phase 3 will move Daily Quest's
// grading and reward computation server-side (see the plan at
// /root/.claude/plans/prancy-spinning-sedgewick.md) — today the client is
// handed the full question set INCLUDING the correct answer index
// (api.daily-challenge.ts's GET response), self-grades locally, and directly
// applies dailyReward()'s XP/TP to the store with no server validation at
// all. Per CLAUDE.md's signature-ability warning, ported math must be
// diffed against a snapshot of the REAL component's behavior, not
// read-through-and-guessed. This test drives the real, unmodified
// DailyScreen end-to-end (render + simulated clicks) so the baseline is
// exactly what players experience today.
//
// Non-determinism is pinned: every test question has `correct: 0`, so
// "click option-0" is always correct and any other index is always wrong.
// The system clock is fixed and only advanced by explicit amounts.
// `data-testid` hooks added to daily-screen.tsx for this (option-N,
// daily-result) are observability-only — they don't change any behavior.
//
// COVERAGE: a full 10-question run (mixed correct/wrong), the <6-correct
// "no reward" floor, and a perfect run's 2x reward multiplier. NOT covered
// yet: the timeout-answer branch (picked === -1) and the confirm-leave
// dialog. Extend this file rather than guessing they're covered.
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// Animations are irrelevant to the scoring math being characterized, and
// framer-motion's internal RAF-driven scheduling deadlocks vitest's fake
// timers (same precedent as battle-screen.characterization.test.tsx /
// MegaRaidScreen.characterization.test.tsx).
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

vi.mock("@/lib/audio", () => ({
  playSfx: vi.fn(),
  playBattleResult: vi.fn(),
}));

vi.mock("sonner", () => {
  const toastFn = vi.fn() as unknown as {
    (msg: string): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  toastFn.success = vi.fn();
  toastFn.error = vi.fn();
  return { toast: toastFn };
});

const { syncActivity } = vi.hoisted(() => ({ syncActivity: vi.fn() }));
vi.mock("@/lib/social", () => ({ syncActivity }));

import { DailyScreen } from "./daily-screen";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import type { Trivia } from "@/lib/trivia-core";

const PLAYER = findPokemon(1)!; // Bulbasaur

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
  vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
  syncActivity.mockReset();
  syncActivity.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore(overrides?: Partial<ReturnType<typeof useGameStore.getState>>) {
  useGameStore.setState({ ...initialStoreState, pokemon: PLAYER, ...overrides }, true);
}

type Action = "correct" | "wrong";

async function runDaily(script: Action[]) {
  seedStore();
  const questions = makeQuestions(script.length);
  render(<DailyScreen questions={questions} onExit={() => {}} />);

  for (let i = 0; i < script.length; i++) {
    const idx = script[i] === "correct" ? 0 : 1;
    await act(async () => {
      fireEvent.click(screen.getByTestId(`option-${idx}`));
    });
    // Resolve the 1500ms feedback delay between questions.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
  }

  return screen.queryByTestId("daily-result");
}

describe("DailyScreen characterization (regression baseline)", () => {
  it("tallies correct/total across a mixed 10-question run", async () => {
    const script: Action[] = [
      "correct",
      "wrong",
      "correct",
      "correct",
      "wrong",
      "correct",
      "correct",
      "wrong",
      "correct",
      "correct",
    ];
    const result = await runDaily(script);
    expect(result).not.toBeNull();
    expect(result!.getAttribute("data-correct")).toBe("7");
    expect(result!.getAttribute("data-total")).toBe("10");

    const state = useGameStore.getState();
    expect(state.dailyResult).toMatchObject({ correct: 7, total: 10 });
    // dailyReward: correct(7) >= 6 threshold, not perfect (7 !== 10) ->
    // xp = round(50 * levelMultiplier(1) * 1) = 50, tp = round(0.2*50) = 10.
    expect(state.xp).toBe(initialStoreState.xp + 50);
  });

  it("awards no XP/TP when fewer than 6 of 10 are correct", async () => {
    const script: Action[] = [
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
      "wrong",
      "wrong",
      "wrong",
      "wrong",
      "wrong",
    ];
    const result = await runDaily(script);
    expect(result!.getAttribute("data-correct")).toBe("5");

    const state = useGameStore.getState();
    expect(state.xp).toBe(initialStoreState.xp);
    expect(state.trainingPoints?.[PLAYER.id] ?? 0).toBe(initialStoreState.trainingPoints?.[PLAYER.id] ?? 0);
  });

  it("doubles the XP reward for a perfect run", async () => {
    const script: Action[] = Array(10).fill("correct");
    const result = await runDaily(script);
    expect(result!.getAttribute("data-correct")).toBe("10");

    const state = useGameStore.getState();
    // xp = round(50 * levelMultiplier(1) * 2) = 100.
    expect(state.xp).toBe(initialStoreState.xp + 100);
  });
});
