// Verifies MegaRaidScreen.tsx's mega-run wiring itself — NOT the HP math
// (covered by MegaRaidScreen.characterization.test.tsx) or the pure engine
// (covered by MegaRaidScreen.engine-verification.test.tsx). This checks:
//   - startMegaAttempt fires once on mount with the event's id.
//   - Each answer mirrors a submitMegaAction({type:"answer",...}) call, with
//     choiceIdx translated back into ORIGINAL option order (not the
//     shuffled display order the player clicked).
//   - X Attack mirrors a use_xattack action; Scope/X-Accuracy do NOT (hint-
//     only, nothing for the server to model — see mega-battle-replay.ts).
//   - When submitMegaAction's response for the concluding action reports
//     ended:true with a successful submit, finish() uses ITS rank/attempts
//     (via getMyMegaRank) instead of calling submitMegaRun directly — calling
//     both would double-consume the 2-attempt cap.
//   - When the mirror never concludes (attemptId unavailable), finish()
//     falls back to calling submitMegaRun directly, unchanged from before
//     this wiring existed.
//   - Escape Rope calls abandonMegaAttempt, never submitMegaAction (a forfeit
//     would consume an attempt server-side, breaking its "doesn't count"
//     contract).
//   - Leaving via the confirm dialog mirrors a forfeit action before calling
//     finish().
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
import type { Trivia } from "@/lib/trivia-core";
import type { ItemId } from "@/lib/game-data";

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
  getMyMegaRank.mockReset();
  startMegaAttempt.mockReset();
  submitMegaAction.mockReset();
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

describe("MegaRaidScreen mega-run wiring", () => {
  it("starts a mega-run attempt on mount, with the event's id", async () => {
    startMegaAttempt.mockResolvedValue({ attemptId: "attempt-1", total: 3, log: [] });
    seedStore();
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={makeQuestions(3)}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(startMegaAttempt).toHaveBeenCalledWith(EVENT.id);
  });

  it("mirrors each answer with choiceIdx translated back into original option order", async () => {
    startMegaAttempt.mockResolvedValue({ attemptId: "attempt-1", total: 3, log: [] });
    submitMegaAction.mockResolvedValue({ state: {}, ended: false });
    seedStore();
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={makeQuestions(3)}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("option-1")); // display idx 1
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    // Fixed Math.random(0.5) shuffle permutation is order=[0,3,1,2] (see
    // MegaRaidScreen.characterization.test.tsx's module doc) — display idx 1
    // maps back to original idx 3.
    expect(submitMegaAction).toHaveBeenCalledWith("attempt-1", {
      type: "answer",
      questionIdx: 0,
      choiceIdx: 3,
    });
  });

  it("mirrors X Attack as use_xattack, but not Scope/X-Accuracy hint items", async () => {
    startMegaAttempt.mockResolvedValue({ attemptId: "attempt-1", total: 3, log: [] });
    submitMegaAction.mockResolvedValue({ state: {}, ended: false });
    seedStore({ xattack: 1, scope: 1, xaccuracy: 1 });
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={makeQuestions(3)}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-item-scope"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-item-xaccuracy"));
    });
    expect(submitMegaAction).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-item-xattack"));
    });
    expect(submitMegaAction).toHaveBeenCalledWith("attempt-1", { type: "use_xattack" });
  });

  it("uses mega-run's own submit result (via getMyMegaRank) when the mirror concludes the run, without calling submitMegaRun", async () => {
    startMegaAttempt.mockResolvedValue({ attemptId: "attempt-1", total: 1, log: [] });
    submitMegaAction.mockResolvedValue({
      state: { phase: "lost" },
      ended: true,
      submit: { ok: true, row: { attempts: 1 } },
    });
    getMyMegaRank.mockResolvedValue({ rank: 7, row: {} });
    seedStore();
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={makeQuestions(1)}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("option-1")); // wrong -> run-out-of-questions loss
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    const result = screen.getByTestId("mega-result");
    expect(result.getAttribute("data-rank")).toBe("7");
    expect(result.getAttribute("data-attempts")).toBe("1");
    expect(submitMegaRun).not.toHaveBeenCalled();
  });

  it("falls back to submitMegaRun directly when the mirror never obtains an attemptId", async () => {
    startMegaAttempt.mockRejectedValue(new Error("network down"));
    submitMegaRun.mockResolvedValue({
      ok: true,
      rank: 4,
      row: { attempts: 1 },
    });
    seedStore();
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={makeQuestions(1)}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("option-1"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    expect(submitMegaRun).toHaveBeenCalledWith({
      eventId: EVENT.id,
      accuracy: 0,
      correct: 0,
      total: 1,
      timeMs: expect.any(Number),
    });
    const result = screen.getByTestId("mega-result");
    expect(result.getAttribute("data-rank")).toBe("4");
  });

  it("Escape Rope abandons the shadow attempt without ever calling submitMegaAction", async () => {
    startMegaAttempt.mockResolvedValue({ attemptId: "attempt-1", total: 3, log: [] });
    seedStore({ escape: 1 });
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={makeQuestions(3)}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("escape-button"));
    });

    expect(abandonMegaAttempt).toHaveBeenCalledWith("attempt-1");
    expect(submitMegaAction).not.toHaveBeenCalled();
  });

  it("mirrors a forfeit action before finishing when leaving via the confirm dialog", async () => {
    startMegaAttempt.mockResolvedValue({ attemptId: "attempt-1", total: 10, log: [] });
    submitMegaAction.mockResolvedValue({
      state: { phase: "lost" },
      ended: true,
      submit: { ok: true, row: { attempts: 1 } },
    });
    getMyMegaRank.mockResolvedValue(null);
    seedStore();
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={makeQuestions(10)}
        onExit={() => {}}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-leave-button"));
    });

    expect(submitMegaAction).toHaveBeenCalledWith("attempt-1", { type: "forfeit" });
    expect(submitMegaRun).not.toHaveBeenCalled();
  });
});
