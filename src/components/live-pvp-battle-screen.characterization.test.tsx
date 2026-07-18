// Characterization/regression baseline for LivePvpBattleScreen's in-battle math
// (resolveQuestion/handleAnswer), following the exact same discipline as
// battle-screen.characterization.test.tsx (see that file's header comment for
// the full rationale — this codebase has gotten "read the code and guess" wrong
// before on signature-ability logic; CLAUDE.md mandates driving the REAL
// component instead).
//
// This drives the REAL, unmodified LivePvpBattleScreen end-to-end (render +
// simulated clicks) and captures the EXACT arguments the component sends to
// `submitPvpLiveAnswer` (dmg/selfDmg/correct/streak) per question — that call
// is precisely the payload the live-PvP server-authority initiative is making
// fully server-verified, so this trace is the byte-for-byte baseline the new
// `engine/pvp-live-answer.ts` module (a later phase) must match, exactly as
// solo battle's engine/turn.ts was verified against its own characterization
// harness.
//
// COVERAGE (this PR): a plain, non-Legendary partner (Bulbasaur) with the
// type-ability fallback (no stored abilityId) through a fixed correct/wrong
// script. NOT yet covered: Legendary/Mythical signature rows (multiplier,
// phase/fixedIndex, latchOnTrigger, Chien-Pao's Sword of Ruin, a disable-
// bearing row), confusion, freeze, or the item/berry RPC paths — extend this
// harness in a follow-up phase rather than assuming they behave the same way,
// per CLAUDE.md's signature-ability liveness warning.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

vi.mock("@/lib/audio", () => ({
  playSfx: vi.fn(),
  playCry: vi.fn(),
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

// Same rationale as battle-screen's harness: framer-motion's RAF scheduling
// deadlocks fake timers, and the animation itself is irrelevant to the math
// being characterized.
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

// Every pvp-live.ts RPC caller is mocked. `submitPvpLiveAnswer` is the one
// under characterization — it's spied on AND computes a real HP delta so the
// component's post-response branches (KO/resolve, Rainbow Rebirth check, HP
// state) behave like the real server would for a plain (non-ability) battle.
// Everything else defaults to a safe `{ ok: false }` no-op — exactly what a
// real network hiccup looks like to this component, which every call site
// already handles by skipping the effect — since a plain Bulbasaur-vs-
// Bulbasaur battle never legitimately fires the signature/type-ability RPC
// paths this harness doesn't yet cover (see COVERAGE note above).
const submitPvpLiveAnswerMock = vi.fn();
vi.mock("@/lib/pvp-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pvp-live")>();
  const notMocked = async () => ({ ok: false as const, error: "not_mocked" });
  return {
    ...actual,
    submitPvpLiveAnswer: (...args: unknown[]) => submitPvpLiveAnswerMock(...args),
    applyPvpLiveItem: notMocked,
    applyPvpSignatureEffect: notMocked,
    applyPvpTypeAbilityEffect: notMocked,
    setLivePvpTransform: notMocked,
    submitBotPvpMove: notMocked,
    applyBotPvpSignatureEffect: notMocked,
    applyBotPvpLiveItem: notMocked,
    sigEngineTick: async () => ({ ok: false as const, reason: "not_mocked" }),
    botSigEngineTick: async () => ({ ok: false as const, reason: "not_mocked" }),
    sigEngineStatus: async () => ({ ok: false as const, reason: "not_mocked" }),
    sigM4Fx: notMocked,
    sigM4Window: notMocked,
  };
});

import { LivePvpBattleScreen } from "./live-pvp-battle-screen";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import { shuffleTriviaOptionsWithOrder, type Trivia } from "@/lib/trivia-core";
import type { LivePvpMatch } from "@/lib/pvp-live";
import { PVP_BASE_TIMER_MS } from "@/lib/pvp-combat";

const PLAYER = findPokemon(1)!; // Bulbasaur — no signature ability (not Legendary/Mythical)
const MY_ID = "host-uuid";
const OPP_ID = "guest-uuid";
const MATCH_ID = "match-uuid";
const FIXED_NOW = new Date("2026-01-01T00:00:00Z");
const QUESTION_COUNT = 20;

function makeQuestions(n: number): Trivia[] {
  return Array.from({ length: n }, (_, i) => ({
    question: `Question ${i}?`,
    options: ["A", "B", "C", "D"],
    correct: 0,
    explanation: "because",
    category: "Test",
  }));
}

function baseMatch(overrides: Partial<LivePvpMatch> = {}): LivePvpMatch {
  return {
    id: MATCH_ID,
    hostId: MY_ID,
    guestId: OPP_ID,
    questions: [],
    status: "active",
    startedAt: FIXED_NOW.toISOString(),
    hostCorrect: null,
    hostTotal: null,
    hostTimeMs: null,
    hostStreak: null,
    hostScore: null,
    hostCompletedAt: null,
    guestCorrect: null,
    guestTotal: null,
    guestTimeMs: null,
    guestStreak: null,
    guestScore: null,
    guestCompletedAt: null,
    winnerId: null,
    createdAt: FIXED_NOW.toISOString(),
    expiresAt: new Date(FIXED_NOW.getTime() + 30 * 60 * 1000).toISOString(),
    hostHp: 120,
    guestHp: 120,
    hostStages: { attack: 0, defense: 0, speed: 0, crit: 0 },
    guestStages: { attack: 0, defense: 0, speed: 0, crit: 0 },
    hostStatuses: [],
    guestStatuses: [],
    hostCorrectLive: 0,
    guestCorrectLive: 0,
    hostAnsweredLive: 0,
    guestAnsweredLive: 0,
    hostTimeMsLive: 0,
    guestTimeMsLive: 0,
    hostItemsUsed: 0,
    guestItemsUsed: 0,
    liveResolvedAt: null,
    hostPartnerId: null,
    guestPartnerId: null,
    hostAbilityId: null,
    guestAbilityId: null,
    hostSuppressedUntil: 0,
    guestSuppressedUntil: 0,
    weatherOwner: null,
    hostSigState: {},
    guestSigState: {},
    hostSigRuntime: {},
    guestSigRuntime: {},
    hostRevived: false,
    guestRevived: false,
    isBotMatch: false,
    ...overrides,
  };
}

let initialStoreState: ReturnType<typeof useGameStore.getState>;

beforeEach(() => {
  if (!initialStoreState) initialStoreState = useGameStore.getState();
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
  });
  vi.setSystemTime(FIXED_NOW);
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  submitPvpLiveAnswerMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore() {
  useGameStore.setState(
    {
      ...initialStoreState,
      pokemon: PLAYER,
      level: 5,
      abilityId: null,
      flags: ["tutorial_done"],
      myStages: { attack: 0, defense: 0, speed: 0, crit: 0 },
      oppStages: { attack: 0, defense: 0, speed: 0, crit: 0 },
      battleStatuses: [],
      opponentStatuses: [],
    },
    true,
  );
}

type Action = "correct" | "wrong";

// Mirrors solo's SCRIPT: a fixed correct/wrong sequence exercising streak
// build and break, without driving HP to 0 (that's the attrition case, left
// for a follow-up extension alongside the ability-coverage sweep).
const SCRIPT: Action[] = ["correct", "correct", "wrong", "correct", "correct", "wrong", "correct"];

async function runBattle(script: Action[]) {
  seedStore();
  const questions = makeQuestions(QUESTION_COUNT);
  // Same fixed Math.random the component uses for its per-client shuffle, so
  // this predicts which button index is "correct" after that shuffle.
  const { q: shuffledFirst } = shuffleTriviaOptionsWithOrder(questions[0]);
  const correctIdx = shuffledFirst.correct;
  const wrongIdx = correctIdx === 0 ? 1 : 0;

  let hostHp = 120;
  let guestHp = 120;
  submitPvpLiveAnswerMock.mockImplementation(
    async (
      _matchId: string,
      _questionIndex: number,
      _correct: boolean,
      dmg: number,
      selfDmg: number,
      _timeMs: number,
      _selectedOriginalIndex: number | null,
    ) => {
      hostHp = Math.max(0, hostHp - Math.round(selfDmg));
      guestHp = Math.max(0, guestHp - Math.round(dmg));
      const resolved = hostHp <= 0 || guestHp <= 0 || _questionIndex >= QUESTION_COUNT - 1;
      return {
        ok: true,
        hostHp,
        guestHp,
        resolved,
        winnerId: resolved ? (guestHp <= 0 ? MY_ID : hostHp <= 0 ? OPP_ID : null) : undefined,
      };
    },
  );

  const onFinish = vi.fn();
  render(
    <LivePvpBattleScreen
      matchId={MATCH_ID}
      questions={questions}
      startedAt={FIXED_NOW.toISOString()}
      myId={MY_ID}
      hostId={MY_ID}
      match={baseMatch()}
      opponentName="Rival"
      onFinish={onFinish}
    />,
  );

  // One 100ms interval tick lets the wall-clock question-index effect enter
  // question 0 (startedAt == the fixed mount time, so elapsed is already >=0).
  let elapsed = 0;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  elapsed += 200;

  // Question advancement in a real match comes from either the shared
  // wall-clock slot ceiling (PVP_BASE_TIMER_MS per question) or a "both sides
  // answered" fast path driven by match.hostAnsweredLive/guestAnsweredLive —
  // this harness only drives one side and never re-renders with an updated
  // `match` prop, so the fast path never fires; only the wall clock advances
  // questions. Anchor each click/advance to an EXACT slot boundary (rather
  // than accumulating fixed deltas) so rounding never drifts across a
  // boundary early — a fixed "+3000 then +20000" per cycle does eventually
  // drift close enough to a boundary that the thinking-time advance alone
  // crosses it, orphaning that question as an unanswered auto-resolve.
  for (let i = 0; i < script.length; i++) {
    const action = script[i];
    if (onFinish.mock.calls.length > 0) break;
    if (screen.queryByTestId(`option-${correctIdx}`) == null) break;

    const slotStart = i * PVP_BASE_TIMER_MS;
    const clickAt = slotStart + 3000; // well within the slot — feeds the speed-bonus calc
    await act(async () => {
      await vi.advanceTimersByTimeAsync(clickAt - elapsed);
    });
    elapsed = clickAt;

    const idx = action === "correct" ? correctIdx : wrongIdx;
    const btn = screen.queryByTestId(`option-${idx}`);
    if (!btn) break;
    await act(async () => {
      fireEvent.click(btn);
    });

    const nextSlotStart = (i + 1) * PVP_BASE_TIMER_MS + 100; // +100ms past the boundary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(nextSlotStart - elapsed);
    });
    elapsed = nextSlotStart;
  }

  return { calls: submitPvpLiveAnswerMock.mock.calls, onFinish };
}

describe("live-pvp-battle-screen characterization (regression baseline)", () => {
  it("plain partner (no signature ability) — correct/wrong script", async () => {
    const { calls } = await runBattle(SCRIPT);
    const trace = calls.map(([, questionIndex, correct, dmg, selfDmg, , selectedOriginalIndex]) => ({
      questionIndex,
      correct,
      dmg,
      selfDmg,
      selectedOriginalIndex,
    }));
    expect(trace).toMatchSnapshot();
  });
});
