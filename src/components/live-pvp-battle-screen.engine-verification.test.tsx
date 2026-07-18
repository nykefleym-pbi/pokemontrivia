// Verifies `engine/pvp-live-answer.ts`'s `resolvePvpAnswer` against the REAL,
// unmodified `LivePvpBattleScreen` component, in the same test run — not
// against a possibly-stale committed snapshot. Same technique as
// `battle-screen-engine-verification.test.tsx`: drive the real component (RTL)
// through a fixed script and separately drive the pure engine through the
// identical script, then assert the captured `submitPvpLiveAnswer` trace
// (questionIndex/correct/dmg/selfDmg) is exactly equal.
//
// This file intentionally DUPLICATES
// `live-pvp-battle-screen.characterization.test.tsx`'s mocks/fixtures rather
// than importing them, so this verification stays self-contained (same
// rationale as the Solo engine-verification file). If the two ever diverge,
// that's a signal to look at, not a bug to silently reconcile.
//
// SCOPE MATCHES `resolvePvpAnswer`'s own documented gaps (see that module's
// header): `sigDisabled` (the engine-runtime cooldown flag) and Sword of
// Ruin's charge ARMING are async/RPC-driven and NOT computed by
// `resolvePvpAnswer` itself — this file supplies them the same way a future
// Edge Function would, by mirroring the exact rule the mocked RPC uses.
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

const submitPvpLiveAnswerMock = vi.fn();
const sigEngineTickMock = vi.fn();
const applyPvpSignatureEffectMock = vi.fn();
vi.mock("@/lib/pvp-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pvp-live")>();
  const notMocked = async () => ({ ok: false as const, error: "not_mocked" });
  return {
    ...actual,
    submitPvpLiveAnswer: (...args: unknown[]) => submitPvpLiveAnswerMock(...args),
    applyPvpLiveItem: notMocked,
    applyPvpSignatureEffect: (...args: unknown[]) => applyPvpSignatureEffectMock(...args),
    applyPvpTypeAbilityEffect: notMocked,
    setLivePvpTransform: notMocked,
    submitBotPvpMove: notMocked,
    applyBotPvpSignatureEffect: notMocked,
    applyBotPvpLiveItem: notMocked,
    sigEngineTick: (...args: unknown[]) => sigEngineTickMock(...args),
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
import { PVP_MAX_HP } from "@/engine/state";
import { signatureAbilityFor } from "@/lib/signature-abilities";
import {
  armSwordOfRuinCharges,
  INITIAL_PVP_ENGINE_STATE,
  resolvePvpAnswer,
  type PvpEngineState,
} from "@/engine/pvp-live-answer";

const PLAYER = findPokemon(1)!; // Bulbasaur — no signature ability
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
    hostStreakLive: 0,
    guestStreakLive: 0,
    hostWrongStreakLive: 0,
    guestWrongStreakLive: 0,
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
  sigEngineTickMock.mockReset();
  sigEngineTickMock.mockResolvedValue({ ok: false, reason: "not_mocked" });
  applyPvpSignatureEffectMock.mockReset();
  applyPvpSignatureEffectMock.mockResolvedValue({ ok: false, error: "not_mocked" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore(
  playerPokemon = PLAYER,
  oppStages: { attack: number; defense: number; speed: number; crit: number } = {
    attack: 0,
    defense: 0,
    speed: 0,
    crit: 0,
  },
) {
  useGameStore.setState(
    {
      ...initialStoreState,
      pokemon: playerPokemon,
      level: 5,
      abilityId: null,
      flags: ["tutorial_done"],
      myStages: { attack: 0, defense: 0, speed: 0, crit: 0 },
      oppStages,
      battleStatuses: [],
      opponentStatuses: [],
    },
    true,
  );
}

type Action = "correct" | "wrong";

interface Trace {
  questionIndex: number;
  correct: boolean;
  dmg: number;
  selfDmg: number;
}

interface ScenarioOptions {
  playerPokemon?: typeof PLAYER;
  opponentId?: number;
  matchOverrides?: Partial<LivePvpMatch>;
  oppStages?: { attack: number; defense: number; speed: number; crit: number };
  script: Action[];
  onBeforeClick?: (i: number) => void;
}

async function runDomScenario({
  playerPokemon = PLAYER,
  matchOverrides = {},
  oppStages,
  script,
  onBeforeClick,
}: ScenarioOptions): Promise<Trace[]> {
  seedStore(playerPokemon, oppStages);
  const questions = makeQuestions(QUESTION_COUNT);
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
      match={baseMatch(matchOverrides)}
      opponentName="Rival"
      onFinish={onFinish}
    />,
  );

  let elapsed = 0;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200);
  });
  elapsed += 200;

  for (let i = 0; i < script.length; i++) {
    const action = script[i];
    if (onFinish.mock.calls.length > 0) break;
    if (screen.queryByTestId(`option-${correctIdx}`) == null) break;

    const slotStart = i * PVP_BASE_TIMER_MS;
    const clickAt = slotStart + 3000;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(clickAt - elapsed);
    });
    elapsed = clickAt;

    const idx = action === "correct" ? correctIdx : wrongIdx;
    const btn = screen.queryByTestId(`option-${idx}`);
    if (!btn) break;
    onBeforeClick?.(i);
    await act(async () => {
      fireEvent.click(btn);
    });

    const nextSlotStart = (i + 1) * PVP_BASE_TIMER_MS + 100;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(nextSlotStart - elapsed);
    });
    elapsed = nextSlotStart;
  }

  return submitPvpLiveAnswerMock.mock.calls.map(([, questionIndex, correct, dmg, selfDmg]) => ({
    questionIndex,
    correct,
    dmg,
    selfDmg,
  }));
}

/** A per-step RNG that returns `overrideValue` (if provided) exactly once,
 *  then falls back to the suite-wide flat 0.5 — mirrors a single
 *  `mockReturnValueOnce` landing on the first `Math.random()` call within
 *  one answer's resolution (confusion-miss and crit are mutually exclusive
 *  per answer, so at most one call happens per step in these scenarios). */
function makeStepRng(overrideValue: number | null): () => number {
  let used = false;
  return () => {
    if (!used && overrideValue !== null) {
      used = true;
      return overrideValue;
    }
    return 0.5;
  };
}

interface PureScenarioOptions {
  playerPokemon?: typeof PLAYER;
  opponentId?: number;
  oppDefenseStage?: number;
  script: Action[];
  /** Per-step rng override (index → forced first-roll value), mirroring the
   *  DOM scenario's `onBeforeClick`. */
  rngOverrideAt?: Record<number, number>;
  /** The engine-runtime `disabled` flag to use for step `i`, derived from the
   *  PREVIOUS step's outcome — mirrors a scenario's mocked `sigEngineTick`
   *  response the same way the real component only updates `sigDisabledRef`
   *  from a resolved tick. Defaults to always-false (the suite's default
   *  `{ok:false}` no-op mock never updates it). */
  sigDisabledForStep?: (i: number, prevOutcomeCorrect: boolean | null) => boolean;
  /** Called after each step with that step's engine `triggerFired` verdict —
   *  lets a scenario arm Sword of Ruin's charges the same way
   *  `fireCappedPayload` does once its RPC resolves, before the NEXT step. */
  afterStep?: (i: number, triggerFired: boolean, state: PvpEngineState) => PvpEngineState;
}

function runPureScenario({
  playerPokemon = PLAYER,
  opponentId = 1,
  oppDefenseStage = 0,
  script,
  rngOverrideAt = {},
  sigDisabledForStep = () => false,
  afterStep = (_i, _fired, state) => state,
}: PureScenarioOptions): Trace[] {
  const ability = signatureAbilityFor(playerPokemon.id);
  const opponent = findPokemon(opponentId)!;
  const trace: Trace[] = [];
  let state = INITIAL_PVP_ENGINE_STATE;
  let selfHp = 120;
  let oppHp = 120;
  let prevCorrect: boolean | null = null;

  for (let i = 0; i < script.length; i++) {
    const correct = script[i] === "correct";
    const sigDisabled = sigDisabledForStep(i, prevCorrect);
    const outcome = resolvePvpAnswer(
      {
        questionIndex: i,
        correct,
        frozen: false,
        answerElapsedMs: 3000,
        personalTimerMs: PVP_BASE_TIMER_MS,
        selfHp,
        oppHp,
        maxHp: PVP_MAX_HP,
        myAttackStage: 0,
        myCritStage: 0,
        oppDefenseStage,
        burned: false,
        suppressed: false,
        engine: ability?.engine,
        sigDisabled,
        oppType: opponent.types,
        oppSpecies: opponent.id,
        myTypes: playerPokemon.types,
        storedAbilityId: null,
        hasAnyStatus: false,
        hasConfusedStatus: false,
        hasPoisonedStatus: false,
        newCategory: false,
        questionCategory: "Test",
        pokedexCount: 0,
        rng: makeStepRng(rngOverrideAt[i] ?? null),
      },
      state,
    );

    trace.push({
      questionIndex: i,
      correct: outcome.confusionMissed ? true : correct,
      dmg: outcome.dmg,
      selfDmg: outcome.selfDmg,
    });

    selfHp = Math.max(0, selfHp - Math.round(outcome.selfDmg));
    oppHp = Math.max(0, oppHp - Math.round(outcome.dmg));
    state = afterStep(i, outcome.triggerFired, outcome.state);
    prevCorrect = correct;
  }

  return trace;
}

describe("live-pvp-battle-screen engine-verification (resolvePvpAnswer vs. the real component)", () => {
  it("plain partner (no signature ability) — correct/wrong script", async () => {
    const script: Action[] = ["correct", "correct", "wrong", "correct", "correct", "wrong", "correct"];
    const domTrace = await runDomScenario({ script });
    const pureTrace = runPureScenario({ script });
    expect(pureTrace).toEqual(domTrace);
  });

  it("multiplier-only row (Koraidon #1007) — streak-3 x2 vs ice/flying/psychic/dragon/fairy", async () => {
    const koraidon = findPokemon(1007)!;
    const script: Action[] = ["correct", "correct", "correct"];
    const domTrace = await runDomScenario({
      playerPokemon: koraidon,
      matchOverrides: { hostPartnerId: 1007, guestPartnerId: 144 },
      script,
    });
    const pureTrace = runPureScenario({ playerPokemon: koraidon, opponentId: 144, script });
    expect(pureTrace).toEqual(domTrace);
  });

  it("phase/fixedIndex row (Giratina #487) — q2 fires a x2 outgoing mark, q1 does not", async () => {
    const giratina = findPokemon(487)!;
    const script: Action[] = ["correct", "correct"];
    const domTrace = await runDomScenario({
      playerPokemon: giratina,
      matchOverrides: { hostPartnerId: 487, guestPartnerId: 1 },
      script,
    });
    const pureTrace = runPureScenario({ playerPokemon: giratina, opponentId: 1, script });
    expect(pureTrace).toEqual(domTrace);
  });

  it("latchOnTrigger row (Regidrago #895) — HP-tier multiplier stays latched after healthy-only trigger fires once", async () => {
    const regidrago = findPokemon(895)!;
    const script: Action[] = ["correct", "wrong", "wrong", "correct"];
    const domTrace = await runDomScenario({
      playerPokemon: regidrago,
      matchOverrides: { hostPartnerId: 895, guestPartnerId: 1 },
      script,
    });
    const pureTrace = runPureScenario({ playerPokemon: regidrago, opponentId: 1, script });
    expect(pureTrace).toEqual(domTrace);
  });

  it("Chien-Pao #1002 — Sword of Ruin arms on a 5-streak, then consumes a 2-charge ignore-Defense window", async () => {
    sigEngineTickMock.mockResolvedValue({
      ok: true,
      hostSigRuntime: {
        "1002": {
          stacks: 0,
          netByStat: {},
          consecutiveWrong: 0,
          disabled: false,
          increaseDisabled: false,
          firedThisBattle: true,
        },
      },
      guestSigRuntime: {},
    });
    applyPvpSignatureEffectMock.mockImplementation(
      async (_matchId: string, _questionIndex: number, pokemonId: number, phase: string) =>
        phase === "manual" && pokemonId === 1002
          ? { ok: true, noop: false }
          : { ok: false, error: "not_mocked" },
    );

    const chienPao = findPokemon(1002)!;
    const script: Action[] = [
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
      "correct",
    ];
    const domTrace = await runDomScenario({
      playerPokemon: chienPao,
      matchOverrides: { hostPartnerId: 1002, guestPartnerId: 1 },
      oppStages: { attack: 0, defense: 2, speed: 0, crit: 0 },
      script,
    });
    // Mirrors `fireCappedPayload`: once the row's OWN trigger fires (and the
    // mocked RPC resolves, unconditionally here), arm the 2-charge window
    // before the NEXT step.
    const pureTrace = runPureScenario({
      playerPokemon: chienPao,
      opponentId: 1,
      oppDefenseStage: 2,
      script,
      afterStep: (_i, triggerFired, state) =>
        triggerFired ? armSwordOfRuinCharges(state, 1002) : state,
    });
    expect(pureTrace).toEqual(domTrace);
  });

  it("disable-bearing multiplier row (Darkrai #491) — a tracked-disable kind (revertAfter) flips off after 1 wrong", async () => {
    let consecutiveWrong = 0;
    sigEngineTickMock.mockImplementation(async (..._args: unknown[]) => {
      const correct = _args[3] as boolean;
      consecutiveWrong = correct ? 0 : consecutiveWrong + 1;
      return {
        ok: true,
        hostSigRuntime: {
          "491": {
            stacks: 0,
            netByStat: {},
            consecutiveWrong,
            disabled: consecutiveWrong >= 1,
            increaseDisabled: false,
            firedThisBattle: true,
          },
        },
        guestSigRuntime: {},
      };
    });

    const darkrai = findPokemon(491)!;
    const script: Action[] = ["correct", "correct", "correct", "wrong"];
    const domTrace = await runDomScenario({
      playerPokemon: darkrai,
      matchOverrides: { hostPartnerId: 491, guestPartnerId: 150 },
      script,
    });
    // Mirrors the mocked sigEngineTick's own rule, applied to THIS step's
    // predecessor (the real component only ever sees the PREVIOUS answer's
    // resolved tick response by the time it computes THIS answer's damage).
    let priorConsecutiveWrong = 0;
    const pureTrace = runPureScenario({
      playerPokemon: darkrai,
      opponentId: 150,
      script,
      sigDisabledForStep: () => priorConsecutiveWrong >= 1,
      afterStep: (_i, _fired, state) => {
        const correct = script[_i] === "correct";
        priorConsecutiveWrong = correct ? 0 : priorConsecutiveWrong + 1;
        return state;
      },
    });
    expect(pureTrace).toEqual(domTrace);
  });

  it("confusion sequence — 2 consecutive wrong answers confuse, and a forced roll misses the next correct click", async () => {
    const script: Action[] = ["wrong", "wrong", "correct"];
    const domTrace = await runDomScenario({
      script,
      onBeforeClick: (i) => {
        if (i === 2) vi.spyOn(Math, "random").mockReturnValueOnce(0.1);
      },
    });
    const pureTrace = runPureScenario({ script, rngOverrideAt: { 2: 0.1 } });
    expect(pureTrace).toEqual(domTrace);
  });
});
