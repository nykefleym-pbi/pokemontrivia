// Characterization/regression baseline for MegaRaidScreen's in-raid math
// (answer/advance/finish in MegaRaidScreen.tsx).
//
// WHY THIS EXISTS: server-first-refactor's Phase 2 will port this math into a
// pure `engine/mega-replay.ts` module so `submit_mega_run` stops trusting
// client-supplied accuracy/correct/total numbers (see the plan at
// /root/.claude/plans/prancy-spinning-sedgewick.md). Per CLAUDE.md's
// signature-ability warning, ported math must be diffed against a snapshot of
// the REAL component's behavior, not read-through-and-guessed. This test
// drives the real, unmodified MegaRaidScreen end-to-end (render + simulated
// clicks) so the baseline is exactly what players experience today.
//
// Non-determinism is pinned: Math.random is a fixed constant (0.5), so every
// question's option shuffle produces the same permutation (display index 0
// always maps to original option index 0) — `revealMegaAnswer` is mocked to
// always resolve `correctIndex: 0`, so "click option-0" is always "correct"
// and any other option index is always "wrong". The system clock is fixed and
// only advanced by explicit amounts. `data-testid` hooks added to
// MegaRaidScreen.tsx for this (boss-hp, player-hp, option-N, item-{id},
// bag-button, bag-item-{id}, escape-button, keep-fighting-button,
// confirm-leave-button, mega-result) are observability-only — they don't
// change any behavior.
//
// COVERAGE: run-out-of-questions loss, player-HP-depleted loss, boss-depleted
// win (the full 40-correct path), X Attack's doubled boss damage, potion
// healing, the free Escape Rope exit (never submitted), and the
// leave-confirm dialog (counts as an immediate loss). NOT covered yet: Scope
// / X-Accuracy hint items, the low-HP banner, and rematch/attempts-exhausted
// branches. Extend this file rather than guessing they're covered.
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// Animations are irrelevant to the raid math being characterized, and
// framer-motion's internal RAF-driven scheduling deadlocks vitest's fake
// timers (same precedent as battle-screen.characterization.test.tsx — Mega
// Raid started using QuestionCard/AnimatePresence in Phase 2's UI-adoption
// pass). Replace it with plain passthrough elements.
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
  revealPokemon: vi.fn(),
  playBattleResult: vi.fn(),
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

// server-first-refactor Phase 2 — mega-run wiring. Defaulted to "never
// concludes" (attemptId resolves, submitMegaAction always reports
// ended:false) so finish() always takes its submitMegaRun fallback path —
// this file's coverage is for MegaRaidScreen's own HP/correctCount math
// (unchanged by this wiring), not the mirror's own success path, which
// MegaRaidScreen.mega-run-wiring.test.tsx covers instead.
const { startMegaAttempt, submitMegaAction, abandonMegaAttempt } = vi.hoisted(() => ({
  startMegaAttempt: vi.fn(),
  submitMegaAction: vi.fn(),
  abandonMegaAttempt: vi.fn(),
}));
vi.mock("@/services/client/mega-run", () => ({ startMegaAttempt, submitMegaAction, abandonMegaAttempt }));

import { MegaRaidScreen } from "./MegaRaidScreen";
import { playSfx, playBattleResult } from "@/lib/audio";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import type { MegaEvent } from "@/lib/mega/schedule";
import type { Trivia } from "@/lib/trivia-core";
import type { ItemId } from "@/lib/game-data";
import type { MegaRunRow, SubmitResult } from "@/lib/mega/runs";

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
    correct: -1, // unknown to the client, as served by get_mega_questions_public
    explanation: "",
    category: "Test",
  }));
}

function submitOk(overrides: Partial<MegaRunRow> = {}, rank = 3): SubmitResult {
  return {
    ok: true,
    rank,
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
      ...overrides,
    },
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
  startMegaAttempt.mockRejectedValue(new Error("no attemptId in this test file — see its module doc"));
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

interface RunOpts {
  totalQuestions?: number;
  inventory?: Partial<Record<ItemId, number>>;
  onExit?: () => void;
}

async function runMegaRaid(script: Action[], opts: RunOpts = {}) {
  seedStore(opts.inventory);
  const total = opts.totalQuestions ?? script.length;
  const questions = makeQuestions(total);

  render(
    <MegaRaidScreen
      event={EVENT}
      questions={questions}
      onExit={opts.onExit ?? (() => {})}
      onViewLeaderboard={() => {}}
      onRematch={() => {}}
    />,
  );

  const trace: Array<Record<string, unknown>> = [];

  for (let i = 0; i < script.length; i++) {
    if (screen.queryByTestId("player-hp") == null) break; // raid already ended

    const idx = script[i] === "correct" ? 0 : 1;
    const btn = screen.queryByTestId(`option-${idx}`);
    if (!btn) break;

    await act(async () => {
      fireEvent.click(btn);
    });
    // Resolve revealMegaAnswer's microtask, then run the 1100ms feedback delay.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    const result = screen.queryByTestId("mega-result");
    trace.push({
      action: script[i],
      bossHp: screen.queryByTestId("boss-hp")?.textContent ?? null,
      playerHp: screen.queryByTestId("player-hp")?.textContent ?? null,
      ended: !!result,
      ...(result
        ? {
            outcome: result.getAttribute("data-outcome"),
            accuracy: result.getAttribute("data-accuracy"),
            correct: result.getAttribute("data-correct"),
          }
        : {}),
    });
    if (result) break;
  }

  return trace;
}

describe("MegaRaidScreen characterization (regression baseline)", () => {
  it("ends as a loss when the question set runs out before the boss is depleted", async () => {
    const trace = await runMegaRaid(["wrong", "wrong", "correct", "wrong", "correct", "wrong"]);
    const last = trace[trace.length - 1];
    expect(last.ended).toBe(true);
    expect(last.outcome).toBe("loss");
    expect(last.correct).toBe("2");
    expect(last.accuracy).toBe("33"); // round(2/6*100)
    expect(submitMegaRun).toHaveBeenCalledWith({
      eventId: EVENT.id,
      accuracy: 33,
      correct: 2,
      total: 6,
      timeMs: expect.any(Number),
    });
  });

  it("ends as a loss once player HP is depleted, before the question set runs out", async () => {
    const trace = await runMegaRaid(Array(20).fill("wrong"), { totalQuestions: 20 });
    // 100 HP / 8 dmg per wrong = depleted at the 13th wrong answer. The HP bar
    // itself is unobservable on this final step: `finish()` flips `phase` to
    // "result" within the same timeout callback that computes it, swapping
    // the whole fighting screen (and its player-hp node) out for MegaResults.
    expect(trace.length).toBe(13);
    const last = trace[trace.length - 1];
    expect(last.playerHp).toBeNull();
    expect(last.ended).toBe(true);
    expect(last.outcome).toBe("loss");
    expect(last.correct).toBe("0");
  });

  it("ends as a win once 40 correct answers deplete the boss's 400 HP", async () => {
    const trace = await runMegaRaid(Array(40).fill("correct"), { totalQuestions: 40 });
    expect(trace.length).toBe(40);
    const last = trace[trace.length - 1];
    expect(last.bossHp).toBeNull(); // fighting screen already swapped out, see note above
    expect(last.ended).toBe(true);
    expect(last.outcome).toBe("win");
    expect(last.correct).toBe("40");
    expect(last.accuracy).toBe("100");
    // Juice parity with Regular/Weekly/Elite: a Mega Raid used to end in
    // silence. The clip itself is Elite Four's — mega has none of its own.
    expect(playSfx).toHaveBeenCalledWith("victory");
    expect(playBattleResult).toHaveBeenCalledWith("mega", true);
  });

  it("plays the defeat sting when the raid is lost", async () => {
    await runMegaRaid(Array(13).fill("wrong"), { totalQuestions: 40 });
    expect(playSfx).toHaveBeenCalledWith("defeat");
    expect(playBattleResult).toHaveBeenCalledWith("mega", false);
  });

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

    // Normal correct answer deals 10; X Attack doubles it to 20.
    expect(screen.getByTestId("boss-hp").textContent).toBe("380/400");
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
      fireEvent.click(screen.getByTestId("option-1")); // wrong: -8 HP -> 92
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });
    expect(screen.getByTestId("player-hp").textContent).toBe("92/100");

    await act(async () => {
      fireEvent.click(screen.getByTestId("item-potion")); // +30 HP, capped at 100
    });
    expect(screen.getByTestId("player-hp").textContent).toBe("100/100");
  });

  it("Escape Rope is a free exit that never submits a run", async () => {
    const onExit = vi.fn();
    seedStore({ escape: 1 });
    const questions = makeQuestions(3);
    render(
      <MegaRaidScreen
        event={EVENT}
        questions={questions}
        onExit={onExit}
        onViewLeaderboard={() => {}}
        onRematch={() => {}}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByTestId("bag-button"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("escape-button"));
    });

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(submitMegaRun).not.toHaveBeenCalled();
  });

  it("leaving via the confirm dialog counts as an immediate loss attempt", async () => {
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

    // One correct answer first, so the abandoned run's correctCount is nonzero.
    await act(async () => {
      fireEvent.click(screen.getByTestId("option-0"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1200);
    });

    // Simulate the browser/Android back button, trapped by useForfeitGuard.
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId("confirm-leave-button"));
    });

    expect(submitMegaRun).toHaveBeenCalledWith({
      eventId: EVENT.id,
      accuracy: 10, // round(1/10*100) — leaving early doesn't inflate accuracy
      correct: 1,
      total: 10,
      timeMs: expect.any(Number),
    });
    const result = screen.getByTestId("mega-result");
    expect(result.getAttribute("data-outcome")).toBe("loss");
  });
});
