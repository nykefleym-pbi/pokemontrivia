// Characterization/regression baseline for LivePvpBattleScreen's in-battle math
// (resolveQuestion/handleAnswer), following the exact same discipline as
// battle-screen.characterization.test.tsx (see that file's header comment for
// the full rationale — this codebase has gotten "read the code and guess" wrong
// before on signature-ability logic; CLAUDE.md mandates driving the REAL
// component instead).
//
// This drives the REAL, unmodified LivePvpBattleScreen end-to-end (render +
// simulated clicks) against a MOCKED `resolvePvpLiveTurn` (Phase 4 cutover
// moved the actual damage/correctness computation server-side, into the
// `pvp-live-resolve-turn` Edge Function — see that function's `index.ts`).
// The mock stands in for the Edge Function by calling the exact same shared
// engine (`buildAnswerTurn`/`resolve`/`toastNotices` from
// `engine/pvp-live-turn.ts`) the real Edge Function calls, tracking match
// state (hp/engine state/sig runtime) across questions the same way the real
// DB row would. This still catches real regressions: a bug in how the
// component builds the request (selectedIndex/elapsedMs), threads the
// response through (HP/streak display, toasts, sigEngineTick/bespoke/M4
// calls), or drives the click sequence would show up in the captured trace —
// the ability MATH itself is `resolvePvpAnswer`'s own responsibility, already
// separately verified byte-for-byte in `engine/pvp-live-answer.test.ts`.
//
// COVERAGE: a plain, non-Legendary partner (Bulbasaur) with the type-ability
// fallback (no stored abilityId) through a fixed correct/wrong script, PLUS
// (Phase 2b) six signature-ability-system scenarios: a pure multiplier row
// (Koraidon #1007), a phase/fixedIndex charge-window row (Giratina #487), a
// latchOnTrigger row (Regidrago #895), Chien-Pao's Sword of Ruin (#1002,
// arm + 2-charge ignore-Defense consume), a disable-bearing multiplier row
// driven to disable (Darkrai #491, `revertAfter(1)`), and a 2-consecutive-
// wrong confusion sequence ending in a forced confusion-miss. NOT yet
// covered: freeze, or the item/berry RPC paths — extend this harness in a
// follow-up phase rather than assuming they behave the same way, per
// CLAUDE.md's signature-ability liveness warning.
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

// Every pvp-live.ts RPC caller is mocked. `resolvePvpLiveTurn` is the one
// under characterization — it's spied on AND actually computes a real
// response (via the shared engine, see the header comment above) so the
// component's post-response branches (KO/resolve, Rainbow Rebirth check, HP
// state, toasts) behave like the real server would. `sigEngineTick`/
// `applyPvpSignatureEffect` are ALSO spies (not hardcoded no-ops): most
// signature-engine math (multiplier/fixedIndex/latch) is now computed INSIDE
// the `resolvePvpLiveTurn` mock, so the default `{ ok: false }` no-op is fine
// for those — but Chien-Pao's Sword-of-Ruin arm and any disable-transition
// scenario require the tick/effect RPC to resolve `ok: true` with a specific
// runtime shape (the mock reads `hostSigRuntime`'s `disabled` flag back off a
// resolved tick, mirroring how the real DB row would already reflect it), so
// individual tests override these mocks' implementations where needed.
// Everything else defaults to a safe `{ ok: false }` no-op — exactly what a
// real network hiccup looks like to this component, which every call site
// already handles by skipping the effect.
import type { SigRuntimeMap } from "@/lib/signature-rework-types";

const resolvePvpLiveTurnMock = vi.fn();
const sigEngineTickMock = vi.fn();
const applyPvpSignatureEffectMock = vi.fn();
/** Mirrors the DB row's `host_sig_runtime` column — updated whenever a
 *  (mocked) `sigEngineTick` resolves, read back by the NEXT `resolvePvpLiveTurn`
 *  mock call, exactly like the real Edge Function reads the persisted column. */
let liveSigRuntime: SigRuntimeMap = {};

vi.mock("@/lib/pvp-live", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pvp-live")>();
  const notMocked = async () => ({ ok: false as const, error: "not_mocked" });
  return {
    ...actual,
    resolvePvpLiveTurn: (...args: unknown[]) => resolvePvpLiveTurnMock(...args),
    applyPvpLiveItem: notMocked,
    applyPvpSignatureEffect: (...args: unknown[]) => applyPvpSignatureEffectMock(...args),
    applyPvpTypeAbilityEffect: notMocked,
    setLivePvpTransform: notMocked,
    resolveBotPvpTurn: notMocked,
    applyBotPvpSignatureEffect: notMocked,
    applyBotPvpLiveItem: notMocked,
    sigEngineTick: async (...args: unknown[]) => {
      const res = (await sigEngineTickMock(...args)) as {
        ok: boolean;
        noop?: boolean;
        hostSigRuntime?: SigRuntimeMap;
      };
      if (res.ok && !res.noop && res.hostSigRuntime) liveSigRuntime = res.hostSigRuntime;
      return res;
    },
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
import { toast } from "sonner";
import {
  buildAnswerTurn,
  resolve,
  toastNotices,
  type PvpLiveTurnContext,
} from "@/engine/pvp-live-turn";
import {
  armSwordOfRuinCharges,
  INITIAL_PVP_ENGINE_STATE,
  pvpEngineStateToRow,
  type PvpEngineState,
} from "@/engine/pvp-live-answer";

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
    // Realtime staleness guard; irrelevant to these tests, which drive the
    // component directly rather than through the postgres_changes channel.
    rev: 0,
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
    hostConfusedTicksLive: 0,
    guestConfusedTicksLive: 0,
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
  resolvePvpLiveTurnMock.mockReset();
  sigEngineTickMock.mockReset();
  sigEngineTickMock.mockResolvedValue({ ok: false, reason: "not_mocked" });
  applyPvpSignatureEffectMock.mockReset();
  applyPvpSignatureEffectMock.mockResolvedValue({ ok: false, error: "not_mocked" });
  liveSigRuntime = {};
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

// Mirrors solo's SCRIPT: a fixed correct/wrong sequence exercising streak
// build and break, without driving HP to 0 (that's the attrition case, left
// for a follow-up extension alongside the ability-coverage sweep).
const SCRIPT: Action[] = ["correct", "correct", "wrong", "correct", "correct", "wrong", "correct"];

interface Trace {
  questionIndex: number;
  correct: boolean;
  dmg: number;
  selfDmg: number;
  selectedOriginalIndex?: number | null;
}

interface ScenarioOptions {
  playerPokemon?: typeof PLAYER;
  matchOverrides?: Partial<LivePvpMatch>;
  /** Opponent's stat stages as seen from MY side (`useGameStore.oppStages`) —
   *  independent of `match.guestStages`, which this component never reads for
   *  its own damage calc (see `oppStages`/`myStages` selectors). Non-zero
   *  Defense is needed to make an ignore-Defense window (Sword of Ruin)
   *  observably change the computed damage. */
  oppStages?: { attack: number; defense: number; speed: number; crit: number };
  script: Action[];
  /** Hook run just before the click for script index `i` — lets a scenario
   *  force a single Math.random() roll (e.g. a confusion-miss check) without
   *  disturbing the fixed 0.5 mock every other call relies on. */
  onBeforeClick?: (i: number) => void;
}

async function runScenario({
  playerPokemon = PLAYER,
  matchOverrides = {},
  oppStages,
  script,
  onBeforeClick,
}: ScenarioOptions) {
  seedStore(playerPokemon, oppStages);
  const questions = makeQuestions(QUESTION_COUNT);
  // Same fixed Math.random the component uses for its per-client shuffle, so
  // this predicts which button index is "correct" after that shuffle.
  const { q: shuffledFirst } = shuffleTriviaOptionsWithOrder(questions[0]);
  const correctIdx = shuffledFirst.correct;
  const wrongIdx = correctIdx === 0 ? 1 : 0;

  const match = baseMatch(matchOverrides);
  const opponent = match.guestPartnerId != null ? findPokemon(match.guestPartnerId) : null;

  let hostHp = 120;
  let guestHp = 120;
  let engineState: PvpEngineState = INITIAL_PVP_ENGINE_STATE;
  const trace: Trace[] = [];

  resolvePvpLiveTurnMock.mockImplementation(
    async (_matchId: string, questionIndex: number, selectedIndex: number | null, elapsedMs: number) => {
      const store = useGameStore.getState();
      const ctx: PvpLiveTurnContext = {
        self: {
          dex: match.hostPartnerId,
          partnerId: match.hostPartnerId,
          hp: hostHp,
          stages: store.myStages,
          statuses: store.battleStatuses,
          abilityId: match.hostAbilityId,
          sigRuntime: liveSigRuntime,
          suppressedUntil: match.hostSuppressedUntil,
          pokedexCount: 0,
          engineState: pvpEngineStateToRow(engineState),
        },
        opp: {
          dex: match.guestPartnerId,
          partnerId: match.guestPartnerId,
          hp: guestHp,
          stages: store.oppStages,
          statuses: store.opponentStatuses,
          abilityId: null,
          sigRuntime: {},
          suppressedUntil: 0,
          pokedexCount: 0,
          engineState: pvpEngineStateToRow(INITIAL_PVP_ENGINE_STATE),
        },
        question: questions[Math.max(0, questionIndex)],
        questionIndex,
      };
      const { input, state: beforeState } = buildAnswerTurn(ctx, {
        selectedIndex,
        answerElapsedMs: elapsedMs,
        personalTimerMs: PVP_BASE_TIMER_MS,
        rng: Math.random,
      });
      const outcome = resolve(input, beforeState);
      const notices = toastNotices(input, beforeState, outcome);

      hostHp = Math.max(0, hostHp - Math.round(outcome.selfDmg));
      guestHp = Math.max(0, guestHp - Math.round(outcome.dmg));
      // Mirrors fireCappedPayload + the SQL-side arming this repo's Phase 4/5
      // cutover slice 2 wired into `apply_pvp_signature_effect`'s "manual"
      // phase: once Chien-Pao's own trigger fires (and that RPC resolves,
      // unconditionally here — `applyPvpSignatureEffectMock` below), the
      // 2-charge ignore-Defense window arms before the NEXT step.
      engineState =
        outcome.triggerFired && match.hostPartnerId === 1002
          ? armSwordOfRuinCharges(outcome.state, 1002)
          : outcome.state;

      const resolved = hostHp <= 0 || guestHp <= 0 || questionIndex >= QUESTION_COUNT - 1;
      trace.push({
        questionIndex,
        correct: outcome.confusionMissed ? true : input.correct,
        dmg: outcome.dmg,
        selfDmg: outcome.selfDmg,
        selectedOriginalIndex: selectedIndex,
      });

      return {
        ok: true,
        result: {
          hostHp,
          guestHp,
          resolved,
          winnerId: resolved ? (guestHp <= 0 ? MY_ID : hostHp <= 0 ? OPP_ID : null) : undefined,
          correct: input.correct,
          dmg: outcome.dmg,
          selfDmg: outcome.selfDmg,
          timeMs: elapsedMs,
          confusionMissed: outcome.confusionMissed,
          triggerFired: outcome.triggerFired,
          streak: outcome.state.streak,
          correctCount: outcome.state.correctCount,
          wrongStreak: outcome.state.selfWrongStreak,
          confusedTicks: outcome.state.confusedTicks,
          ...notices,
        },
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
      match={match}
      opponentName="Rival"
      onFinish={onFinish}
    />,
  );
  void opponent; // resolved purely to seed matchOverrides.guestPartnerId in fixtures above

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
    onBeforeClick?.(i);
    await act(async () => {
      fireEvent.click(btn);
    });

    const nextSlotStart = (i + 1) * PVP_BASE_TIMER_MS + 100; // +100ms past the boundary
    await act(async () => {
      await vi.advanceTimersByTimeAsync(nextSlotStart - elapsed);
    });
    elapsed = nextSlotStart;
  }

  return { trace, onFinish };
}

async function runBattle(script: Action[]) {
  return runScenario({ script });
}

describe("live-pvp-battle-screen characterization (regression baseline)", () => {
  it("plain partner (no signature ability) — correct/wrong script", async () => {
    const { trace } = await runBattle(SCRIPT);
    expect(trace).toMatchSnapshot();
  });
});

// Phase 2b: signature-ability-system coverage. Each scenario picks a real
// catalog row (`src/lib/signature-abilities.ts`) exercising a distinct engine
// shape, per CLAUDE.md's mandate to drive the REAL component rather than
// infer behavior from names/comments. Traces are limited to the fields the
// server-authority port cares about (questionIndex/correct/dmg/selfDmg).
function traceOf(trace: Trace[]) {
  return trace.map(({ questionIndex, correct, dmg, selfDmg }) => ({
    questionIndex,
    correct,
    dmg,
    selfDmg,
  }));
}

describe("live-pvp-battle-screen characterization (signature-ability coverage)", () => {
  it("multiplier-only row (Koraidon #1007) — streak-3 x2 vs ice/flying/psychic/dragon/fairy", async () => {
    // Engine: { trigger: streakN(3), multiplier: vsTypes(2, ice/flying/psychic/dragon/fairy),
    // disable: disableMultiplierAfter(2) }. No phase/fixedIndex/latchOnTrigger/bespoke.
    // Articuno (opponent) is ice/flying, so the condition holds once streak >= 3.
    const koraidon = findPokemon(1007)!;
    const { trace } = await runScenario({
      playerPokemon: koraidon,
      matchOverrides: { hostPartnerId: 1007, guestPartnerId: 144 },
      script: ["correct", "correct", "correct"],
    });
    expect(traceOf(trace)).toMatchSnapshot();
  });

  it("phase/fixedIndex row (Giratina #487) — q2 fires a x2 outgoing mark, q1 does not", async () => {
    // Engine: { trigger: onQuestions([2, 12]), fixedIndex: [q1/q11 receiveDamagePct:0
    // (not wired — see engine/damage.ts's evaluateIndexFactor), q2/q12
    // outgoingMultiplier:2], disable: noDisable }. evaluateIndexFactor keys purely
    // off the 1-indexed question number, independent of the `trigger`/`multiplier`
    // channel, so it isn't gated on any RPC — the engine computes it synchronously.
    const giratina = findPokemon(487)!;
    const { trace } = await runScenario({
      playerPokemon: giratina,
      matchOverrides: { hostPartnerId: 487, guestPartnerId: 1 },
      script: ["correct", "correct"],
    });
    expect(traceOf(trace)).toMatchSnapshot();
  });

  it("latchOnTrigger row (Regidrago #895) — HP-tier multiplier stays latched after healthy-only trigger fires once", async () => {
    // Engine: { trigger: start_of_battle, multiplier: { hpTiers: [100->2.5, 80->2.25,
    // 60->2, 40->1.5, 0->1] }, latchOnTrigger: true, disable: disableMultiplierAfter(2)
    // (unimplemented server-side — see damage.ts, so it never actually disables here) }.
    // The trigger arms permanently on the first correct answer (sigLatched); the
    // ladder itself is RE-EVALUATED every question off live self HP (owner ruling
    // 2026-07-12), so 2 wrong answers (16 self-damage) should slide the factor from
    // the 100% tier down to the 80% tier on the following correct answer.
    const regidrago = findPokemon(895)!;
    const { trace } = await runScenario({
      playerPokemon: regidrago,
      matchOverrides: { hostPartnerId: 895, guestPartnerId: 1 },
      script: ["correct", "wrong", "wrong", "correct"],
    });
    expect(traceOf(trace)).toMatchSnapshot();
  });

  it("Chien-Pao #1002 — Sword of Ruin arms on a 5-streak, then consumes a 2-charge ignore-Defense window", async () => {
    // The -2 opp Def "manual capped_payload" phase only fires from
    // `fireCappedPayload`, which is reached from `sigEngineTick`'s resolved
    // (ok:true) callback — the default `{ ok: false }` mock would leave the
    // tracked engine state's Sword-of-Ruin charges at 0 forever, so this
    // scenario overrides both RPC mocks to actually resolve. Opponent Defense
    // stage is seeded to +2 so the ignore-Defense window (defenseStage forced
    // to 0 instead of 2) is visible in the damage numbers, not just a no-op
    // zero-vs-zero comparison.
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
    const { trace } = await runScenario({
      playerPokemon: chienPao,
      matchOverrides: { hostPartnerId: 1002, guestPartnerId: 1 },
      oppStages: { attack: 0, defense: 2, speed: 0, crit: 0 },
      script: ["correct", "correct", "correct", "correct", "correct", "correct", "correct"],
    });
    expect(traceOf(trace)).toMatchSnapshot();
    // The arm fires once the streak hits 5 (the 5th correct answer, index 4).
    expect(applyPvpSignatureEffectMock).toHaveBeenCalledWith(
      MATCH_ID,
      expect.any(Number),
      1002,
      "manual",
      expect.any(Number),
    );
  });

  it("disable-bearing multiplier row (Darkrai #491) — a tracked-disable kind (revertAfter) flips off after 1 wrong", async () => {
    // Engine: { trigger: streakN(3), multiplier: x2 vs psychic/ghost, disable:
    // revertAfter(1) } — a TRACKED disable kind (unlike disableMultiplierAfter,
    // which `engineToTickDisable` collapses to a no-op). The mock's tracked
    // `sigRuntime` only updates from a RESOLVED sigEngineTick response, so this
    // scenario drives the mock itself off a local consecutive-wrong counter
    // mirroring the real SQL rule (`_pvp_sig_engine_apply`), then asserts the
    // resulting "signature on cooldown" cue — a much more direct
    // characterization of the disable transition than trying to infer it from
    // the streak-gated dmg trace (once the row's own trigger stops holding, the
    // multiplier already goes quiet for the ordinary streak-broke reason,
    // which would mask a real assertion about the disable flag itself).
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
    const { trace } = await runScenario({
      playerPokemon: darkrai,
      matchOverrides: { hostPartnerId: 491, guestPartnerId: 150 }, // Mewtwo — psychic
      script: ["correct", "correct", "correct", "wrong"],
    });
    expect(traceOf(trace)).toMatchSnapshot();
    const infoMessages = vi.mocked(toast.info).mock.calls.map(([message]) => message);
    expect(infoMessages).toContain("Dark Void — signature on cooldown");
  });

  it("confusion sequence — 2 consecutive wrong answers confuse, and a forced roll misses the next correct click", async () => {
    // `selfWrongStreak === CONFUSE_AT(2)` arms confusion server-side
    // (`resolvePvpAnswer`'s own state, mirrored locally for the visual badge
    // only). With this suite's Math.random pinned at 0.5, `missedFromConfusion`
    // (isConfused && rng() < 0.25, rolled inside the mocked
    // `resolvePvpLiveTurn` now) can never trip on its own — so this scenario
    // overrides ONE roll, right before the 3rd click, to actually exercise the
    // miss path: a `correct: true` click that still reports `dmg: 0` because
    // confusion ate the hit.
    const { trace } = await runScenario({
      script: ["wrong", "wrong", "correct"],
      onBeforeClick: (i) => {
        if (i === 2) vi.spyOn(Math, "random").mockReturnValueOnce(0.1);
      },
    });
    expect(traceOf(trace)).toMatchSnapshot();
  });
});
