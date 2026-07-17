// Verifies DailyScreen.tsx's daily-run wiring itself — NOT the scoring math
// (covered by daily-screen.characterization.test.tsx, which defaults
// submitDailyRun to always reject so it exercises the fallback path
// unchanged). This checks:
//   - submitDailyRun is called once, at the end of the run, with one pick
//     per question in order (null for a timeout) and the elapsed time.
//   - A successful submit's returned reward is what gets applied (xp/tp),
//     NOT a client-recomputed dailyReward() — proven by making the mocked
//     reward diverge from what the local math would have produced.
//   - `alreadyGranted`/`reward: null` applies nothing (no double-reward).
//   - When submitDailyRun rejects, the fallback computes the reward locally
//     the old way (dailyReward()) so a network hiccup doesn't cost the
//     player their earned XP/TP.
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

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

const { submitDailyRun } = vi.hoisted(() => ({ submitDailyRun: vi.fn() }));
vi.mock("@/services/client/daily-run", () => ({ submitDailyRun }));

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
  submitDailyRun.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore() {
  useGameStore.setState({ ...initialStoreState, pokemon: PLAYER }, true);
}

type Action = "correct" | "wrong" | "timeout";

async function runDaily(script: Action[]) {
  seedStore();
  const questions = makeQuestions(script.length);
  render(<DailyScreen questions={questions} onExit={() => {}} />);

  for (const step of script) {
    if (step === "timeout") {
      // Advancing the fake clock a full 20s in one jump doesn't reliably
      // cascade the countdown's recursive setTimeout-triggered re-renders
      // (each decrement's React effect schedules the NEXT one) — tick in
      // 1s increments, matching the timer's own granularity, instead.
      for (let i = 0; i < 20; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1000);
        });
      }
    } else {
      const idx = step === "correct" ? 0 : 1;
      await act(async () => {
        fireEvent.click(screen.getByTestId(`option-${idx}`));
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1600);
    });
  }
}

describe("DailyScreen daily-run wiring", () => {
  it("submits one pick per question, in order, with null for a timeout", async () => {
    submitDailyRun.mockResolvedValue({ correct: 2, total: 3, reward: { xp: 10, tp: 2 }, save: null });
    await runDaily(["correct", "wrong", "timeout"]);

    expect(submitDailyRun).toHaveBeenCalledTimes(1);
    expect(submitDailyRun).toHaveBeenCalledWith([0, 1, null], expect.any(Number));
  });

  it("applies the server-returned reward, not a locally recomputed one", async () => {
    // If the fallback path fired instead, dailyReward({correct:10,total:10,level:1})
    // would compute xp=100 (perfect-run 2x) — assert the DIVERGENT mocked
    // value is what actually lands, proving the server result is authoritative.
    submitDailyRun.mockResolvedValue({ correct: 10, total: 10, reward: { xp: 777, tp: 55 }, save: null });
    await runDaily(Array(10).fill("correct"));

    const state = useGameStore.getState();
    expect(state.xp).toBe(initialStoreState.xp + 777);
    expect(state.trainingPoints?.[PLAYER.id]).toBe(
      (initialStoreState.trainingPoints?.[PLAYER.id] ?? 0) + 55,
    );
  });

  it("applies nothing when the server reports alreadyGranted", async () => {
    submitDailyRun.mockResolvedValue({
      correct: 10,
      total: 10,
      alreadyGranted: true,
      reward: null,
      save: null,
    });
    await runDaily(Array(10).fill("correct"));

    const state = useGameStore.getState();
    expect(state.xp).toBe(initialStoreState.xp);
    expect(state.trainingPoints?.[PLAYER.id] ?? 0).toBe(initialStoreState.trainingPoints?.[PLAYER.id] ?? 0);
  });

  it("falls back to the local dailyReward() computation when the submit fails", async () => {
    submitDailyRun.mockRejectedValue(new Error("network down"));
    await runDaily(Array(10).fill("correct"));

    const state = useGameStore.getState();
    // dailyReward({correct:10,total:10,level:1}): xp = round(50*1*2) = 100.
    expect(state.xp).toBe(initialStoreState.xp + 100);
  });
});
