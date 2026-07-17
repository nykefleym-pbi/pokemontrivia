// Verifies engine/mega-replay.ts's `applyMegaAnswer`/`applyMegaPotion`/
// `applyMegaXAttack`/`applyMegaForfeit` (the pure, server-authoritative port
// of MegaRaidScreen.tsx's `answer`/`advance` HP math) against the REAL,
// unmodified MegaRaidScreen component, in the same test run — not against a
// possibly-stale committed snapshot. This drives BOTH the real component (via
// RTL, same technique as MegaRaidScreen.characterization.test.tsx) and the
// pure engine through identical scripts, and asserts their bossHp/playerHp/
// ended/outcome/correct trajectories are exactly equal.
//
// This file intentionally DUPLICATES MegaRaidScreen.characterization.test.tsx's
// mocks/fixtures rather than importing them, so this verification stays
// self-contained and easy to reason about in isolation — same convention as
// battle-screen-engine-verification.test.tsx.
//
// SCOPE MATCHES engine/mega-replay.ts's own documented gaps: Scope/X-Accuracy
// and Escape Rope are not exercised here either — see that module's doc.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/audio", () => ({
  playSfx: vi.fn(),
  revealPokemon: vi.fn(),
}));

vi.mock("sonner", () => {
  const toastFn = vi.fn() as unknown as {
    (msg: string): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    warning: ReturnType<typeof vi.fn>;
    info: ReturnType<typeof vi.fn>;
  };
  toastFn.success = vi.fn();
  toastFn.error = vi.fn();
  toastFn.warning = vi.fn();
  toastFn.info = vi.fn();
  return { toast: toastFn };
});

const { revealMegaAnswer } = vi.hoisted(() => ({ revealMegaAnswer: vi.fn() }));
vi.mock("@/lib/mega/questions", () => ({ revealMegaAnswer }));

const { submitMegaRun, getMyMegaRank } = vi.hoisted(() => ({
  submitMegaRun: vi.fn(),
  getMyMegaRank: vi.fn(),
}));
vi.mock("@/lib/mega/runs", () => ({ submitMegaRun, getMyMegaRank }));

// server-first-refactor Phase 2 — mega-run wiring, defaulted the same way as
// MegaRaidScreen.characterization.test.tsx: attemptId never resolves, so
// finish() always falls back to submitMegaRun directly. This file verifies
// engine/mega-replay.ts's HP math, unaffected by this wiring.
const { startMegaAttempt, submitMegaAction, abandonMegaAttempt } = vi.hoisted(() => ({
  startMegaAttempt: vi.fn(),
  submitMegaAction: vi.fn(),
  abandonMegaAttempt: vi.fn(),
}));
vi.mock("@/services/client/mega-run", () => ({ startMegaAttempt, submitMegaAction, abandonMegaAttempt }));

import { MegaRaidScreen } from "./MegaRaidScreen";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import type { MegaEvent } from "@/lib/mega/schedule";
import { MEGA_BOSS_HP } from "@/lib/mega/schedule";
import type { Trivia } from "@/lib/trivia-core";
import type { ItemId } from "@/lib/game-data";
import type { MegaRunRow, SubmitResult } from "@/lib/mega/runs";
import {
  applyMegaAnswer,
  applyMegaPotion,
  applyMegaXAttack,
  applyMegaForfeit,
  initialMegaRaidState,
  MEGA_PLAYER_MAX_HP,
} from "@/engine/mega-replay";

const PLAYER = findPokemon(1)!; // Bulbasaur

const EVENT: MegaEvent = {
  id: "event-1",
  megaId: 6,
  name: "Mega Charizard X",
  baseName: "Charizard",
  baseDexId: 6,
  types: ["fire", "dragon"],
  startsAt: "2026-01-01T00:00:00Z",
  endsAt: "2026-02-01T00:00:00Z",
  reward: { xp: 2500, tp: 1000, items: 10, egg: true, dexId: 6 },
  champion: { xp: 5000, tp: 2000, items: 20, trophyId: "trophy-1", trophyName: "Champion" },
};

function makeQuestions(n: number): Trivia[] {
  return Array.from({ length: n }, (_, i) => ({
    question: `Question ${i}?`,
    options: ["A", "B", "C", "D"],
    correct: -1,
    explanation: "",
    category: "Test",
  }));
}

function submitOk(): SubmitResult {
  return {
    ok: true,
    rank: 3,
    row: {
      id: "run-1",
      user_id: "user-1",
      event_id: EVENT.id,
      accuracy: 0,
      correct: 0,
      total: 0,
      time_ms: 0,
      trainer_name: "Trainer",
      trainer_sprite: "sprite.png",
      level: 5,
      attempts: 1,
      finished_at: new Date().toISOString(),
    } as MegaRunRow,
  };
}

let initialStoreState: ReturnType<typeof useGameStore.getState>;

beforeEach(() => {
  if (!initialStoreState) initialStoreState = useGameStore.getState();
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(new Date("2026-01-15T00:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  revealMegaAnswer.mockReset();
  revealMegaAnswer.mockResolvedValue({ correctIndex: 0, explanation: "because" });
  submitMegaRun.mockReset();
  submitMegaRun.mockResolvedValue(submitOk());
  getMyMegaRank.mockReset();
  getMyMegaRank.mockResolvedValue(null);
  startMegaAttempt.mockReset();
  startMegaAttempt.mockRejectedValue(new Error("no attemptId in this test file"));
  submitMegaAction.mockReset();
  submitMegaAction.mockResolvedValue({ state: {}, ended: false });
  abandonMegaAttempt.mockReset();
  abandonMegaAttempt.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore(inventory?: Partial<Record<ItemId, number>>) {
  useGameStore.setState(
    {
      ...initialStoreState,
      pokemon: PLAYER,
      ...(inventory ? { inventory: inventory as Record<ItemId, number> } : {}),
    },
    true,
  );
}

type Action = "correct" | "wrong";

interface ComparableStep {
  action: Action;
  bossHp: string | null;
  playerHp: string | null;
  ended: boolean;
  outcome?: string;
  correct?: string;
}

async function runDom(script: Action[], totalQuestions?: number): Promise<ComparableStep[]> {
  seedStore();
  const total = totalQuestions ?? script.length;
  const questions = makeQuestions(total);

  render(
    <MegaRaidScreen
      event={EVENT}
      questions={questions}
      onExit={() => {}}
      onViewLeaderboard={() => {}}
      onRematch={() => {}}
    />,
  );

  const steps: ComparableStep[] = [];
  for (let i = 0; i < script.length; i++) {
    if (screen.queryByTestId("player-hp") == null) break;
    const idx = script[i] === "correct" ? 0 : 1;
    const btn = screen.queryByTestId(`option-${idx}`);
    if (!btn) break;

    await act(async () => {
      fireEvent.click(btn);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    const result = screen.queryByTestId("mega-result");
    steps.push({
      action: script[i],
      bossHp: screen.queryByTestId("boss-hp")?.textContent ?? null,
      playerHp: screen.queryByTestId("player-hp")?.textContent ?? null,
      ended: !!result,
      ...(result
        ? {
            outcome: result.getAttribute("data-outcome") ?? undefined,
            correct: result.getAttribute("data-correct") ?? undefined,
          }
        : {}),
    });
    if (result) break;
  }
  return steps;
}

function runPure(script: Action[], totalQuestions?: number): ComparableStep[] {
  const total = totalQuestions ?? script.length;
  let state = initialMegaRaidState();
  const steps: ComparableStep[] = [];
  for (const action of script) {
    state = applyMegaAnswer(state, total, { correct: action === "correct" });
    const ended = state.phase !== "in_progress";
    steps.push({
      action,
      bossHp: ended ? null : `${state.bossHp}/${MEGA_BOSS_HP}`,
      playerHp: ended ? null : `${state.playerHp}/${MEGA_PLAYER_MAX_HP}`,
      ended,
      // The engine's phase vocabulary ("won"/"lost", matching engine/turn.ts's
      // BattleState.phase) differs from the UI's result vocabulary
      // ("win"/"loss", MegaResults' `outcome` prop) — translate for comparison.
      ...(ended
        ? { outcome: state.phase === "won" ? "win" : "loss", correct: String(state.correctCount) }
        : {}),
    });
    if (ended) break;
  }
  return steps;
}

describe("engine/mega-replay applyMegaAnswer matches the real MegaRaidScreen component", () => {
  it("ends as a loss when the question set runs out before the boss is depleted", async () => {
    const script: Action[] = ["wrong", "wrong", "correct", "wrong", "correct", "wrong"];
    const dom = await runDom(script);
    const pure = runPure(script);
    expect(pure).toEqual(dom);
  });

  it("ends as a loss once player HP is depleted, before the question set runs out", async () => {
    const script = Array(20).fill("wrong") as Action[];
    const dom = await runDom(script, 20);
    const pure = runPure(script, 20);
    expect(pure).toEqual(dom);
  });

  it("ends as a win once 40 correct answers deplete the boss's 400 HP", async () => {
    const script = Array(40).fill("correct") as Action[];
    const dom = await runDom(script, 40);
    const pure = runPure(script, 40);
    expect(pure).toEqual(dom);
  });
});

describe("engine/mega-replay item support matches the real MegaRaidScreen component", () => {
  it("X Attack doubles boss damage on the next correct answer", async () => {
    seedStore({ xattack: 1 });
    const questions = makeQuestions(3);
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={questions}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-item-xattack"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("option-0"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    const domBossHp = screen.getByTestId("boss-hp").textContent;

    let state = initialMegaRaidState();
    state = applyMegaXAttack(state);
    state = applyMegaAnswer(state, 3, { correct: true });
    expect(`${state.bossHp}/${MEGA_BOSS_HP}`).toBe(domBossHp);
    expect(domBossHp).toBe("380/400");
  });

  it("a potion heals player HP, capped at max", async () => {
    seedStore({ potion: 1 });
    const questions = makeQuestions(3);
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={questions}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("option-1")); // wrong: -8 HP
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("item-potion")); // +30 HP, capped
    });
    const domPlayerHp = screen.getByTestId("player-hp").textContent;

    let state = initialMegaRaidState();
    state = applyMegaAnswer(state, 3, { correct: false });
    state = applyMegaPotion(state, "potion");
    expect(`${state.playerHp}/${MEGA_PLAYER_MAX_HP}`).toBe(domPlayerHp);
    expect(domPlayerHp).toBe("100/100");
  });

  it("leaving via the confirm dialog counts as an immediate loss, matching applyMegaForfeit", async () => {
    seedStore();
    const questions = makeQuestions(10);
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={questions}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId("option-0")); // one correct answer first
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-leave-button"));
    });
    const result = screen.getByTestId("mega-result");
    const domOutcome = result.getAttribute("data-outcome");
    const domCorrect = result.getAttribute("data-correct");

    let state = initialMegaRaidState();
    state = applyMegaAnswer(state, 10, { correct: true });
    state = applyMegaForfeit(state);
    expect(state.phase === "won" ? "win" : "loss").toBe(domOutcome);
    expect(String(state.correctCount)).toBe(domCorrect);
  });
});
