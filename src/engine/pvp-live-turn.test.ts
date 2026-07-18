import { describe, expect, it } from "vitest";
import { buildAnswerTurn, rollBotTurn, resolve } from "./pvp-live-turn";
import { INITIAL_PVP_ENGINE_STATE, type PvpEngineStateRow } from "./pvp-live-answer";
import type { BotProfile } from "../lib/pvp-bot";

const QUESTION = { question: "Q?", options: ["A", "B", "C", "D"], correct: 2, category: "General" };

const EMPTY_ENGINE_ROW: PvpEngineStateRow = {
  streakLive: 0,
  correctLive: 0,
  wrongStreakLive: 0,
  confusedTicksLive: 0,
  swordOfRuinCharges: 0,
  sigLatched: false,
  moxieStacks: 0,
  wrongCount: 0,
  hadWrong: false,
  sturdyUsed: false,
  prevCorrect: false,
  prevAnswerElapsedMs: 0,
};

function baseCtx() {
  return {
    self: {
      dex: 1,
      partnerId: 1,
      hp: 100,
      stages: { attack: 0, defense: 0, speed: 0, crit: 0 },
      statuses: [],
      abilityId: null,
      sigRuntime: {},
      suppressedUntil: 0,
      pokedexCount: 0,
      engineState: EMPTY_ENGINE_ROW,
    },
    opp: {
      dex: 4,
      partnerId: 4,
      hp: 100,
      stages: { attack: 0, defense: 0, speed: 0, crit: 0 },
      statuses: [],
      abilityId: null,
      sigRuntime: {},
      suppressedUntil: 0,
      pokedexCount: 0,
      engineState: EMPTY_ENGINE_ROW,
    },
    question: QUESTION,
    questionIndex: 0,
  };
}

describe("pvp-live-turn: buildAnswerTurn (human path)", () => {
  it("derives correctness from selectedIndex vs the immutable question.correct, not a client claim", () => {
    const ctx = baseCtx();
    const right = buildAnswerTurn(ctx, { selectedIndex: 2, answerElapsedMs: 3000, personalTimerMs: 15000, rng: () => 0.99 });
    expect(right.correct).toBe(true);
    const wrong = buildAnswerTurn(ctx, { selectedIndex: 0, answerElapsedMs: 3000, personalTimerMs: 15000, rng: () => 0.99 });
    expect(wrong.correct).toBe(false);
    const timedOut = buildAnswerTurn(ctx, { selectedIndex: null, answerElapsedMs: 15000, personalTimerMs: 15000, rng: () => 0.99 });
    expect(timedOut.correct).toBe(false);
  });

  it("produces positive damage on a correct answer via the shared resolvePvpAnswer engine", () => {
    const ctx = baseCtx();
    const { input, state } = buildAnswerTurn(ctx, {
      selectedIndex: 2,
      answerElapsedMs: 3000,
      personalTimerMs: 15000,
      rng: () => 0.99,
    });
    const outcome = resolve(input, state);
    expect(outcome.dmg).toBeGreaterThan(0);
  });

  it("folds engine state from the row (streak carries forward correctly)", () => {
    const ctx = baseCtx();
    ctx.self.engineState = { ...EMPTY_ENGINE_ROW, streakLive: 5, correctLive: 5 };
    const { state } = buildAnswerTurn(ctx, { selectedIndex: 2, answerElapsedMs: 3000, personalTimerMs: 15000, rng: () => 0.99 });
    expect(state.streak).toBe(5);
    expect(state.correctCount).toBe(5);
    expect(state).not.toEqual(INITIAL_PVP_ENGINE_STATE);
  });
});

describe("pvp-live-turn: rollBotTurn (bot-mirror path)", () => {
  const profile: BotProfile = {
    tier: "ace",
    accuracy: 0.9,
    speed: { meanMs: 4000, jitter: 500 },
    aggression: 0.7,
  };

  it("rolls correctness/timing from the persisted profile with no client input at all", () => {
    const ctx = baseCtx();
    // rng < accuracy (0.9) -> correct
    const hit = rollBotTurn(ctx, profile, { personalTimerMs: 15000, rng: () => 0.1 });
    expect(hit.correct).toBe(true);
    expect(hit.answerElapsedMs).toBeGreaterThan(0);

    // rng > accuracy -> wrong
    const miss = rollBotTurn(ctx, profile, { personalTimerMs: 15000, rng: () => 0.99 });
    expect(miss.correct).toBe(false);
  });

  it("a confused bot's confusion-miss roll happens inside resolvePvpAnswer itself, needing no separate helper", () => {
    const ctx = baseCtx();
    ctx.self.engineState = { ...EMPTY_ENGINE_ROW, confusedTicksLive: 2 };
    // First rng() call (0.1) drives botAnswersCorrectly -> correct (accuracy 0.9).
    // Second rng() call (0.1) drives botAnswerTimeMs (jitter only, always "succeeds").
    // Third rng() call is resolvePvpAnswer's OWN confusion-miss roll (0.1 < 0.25 -> missed).
    const queue = [0.1, 0.1, 0.1, 0.99, 0.99];
    const rng = () => queue.shift() ?? 0.99;
    const { input, state } = rollBotTurn(ctx, profile, { personalTimerMs: 15000, rng });
    const outcome = resolve(input, state);
    expect(outcome.confusionMissed).toBe(true);
    expect(outcome.dmg).toBe(0);
  });
});
