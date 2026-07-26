// Shield Dust's confusion immunity in Nearby/Training battles.
//
// The bug this locks down (owner report 2026-07-26, match cccd677f): a Caterpie
// holding Shield Dust was confused on its 2nd consecutive wrong answer and
// stayed confused for the rest of the battle. Shield Dust's PvP wiring was a
// server-catalog *cure* keyed on `hasConfusedStatus` — the synced status jsonb
// — but PvP confusion does not live there. It lives in the engine's
// `confusedTicks`, which no `cure` row can reach, so the ability was inert
// against the one source of confusion the mode actually has.
//
// The fix is prevention, matching Solo (engine/turn.ts's `abilityId !==
// "shield-dust"` guard). These tests assert against `confusedTicks` directly
// rather than a toast or a badge, because that counter is what drives the 25%
// miss roll — the part the player feels.
import { describe, expect, it } from "vitest";
import {
  resolvePvpAnswer,
  INITIAL_PVP_ENGINE_STATE,
  CONFUSE_AT,
  CONFUSE_TICKS,
  type PvpAnswerInput,
  type PvpEngineState,
} from "./pvp-live-answer";

const NEVER_MISS_OR_CRIT = () => 0.99;

function wrongAnswer(overrides: Partial<PvpAnswerInput> = {}): PvpAnswerInput {
  return {
    questionIndex: 0,
    correct: false,
    frozen: false,
    answerElapsedMs: 3000,
    personalTimerMs: 15000,
    selfHp: 100,
    oppHp: 100,
    maxHp: 120,
    myAttackStage: 0,
    myCritStage: 0,
    oppDefenseStage: 0,
    burned: false,
    suppressed: false,
    engine: undefined,
    sigDisabled: false,
    oppType: ["electric"],
    oppSpecies: 644,
    myTypes: undefined,
    storedAbilityId: null,
    hasAnyStatus: false,
    hasConfusedStatus: false,
    hasPoisonedStatus: false,
    newCategory: false,
    questionCategory: "General",
    pokedexCount: 0,
    rng: NEVER_MISS_OR_CRIT,
    ...overrides,
  };
}

// Caterpie: Bug type, Shield Dust rolled — exactly the partner in the report.
// Both fields matter: `resolvePvpTypeAbilityId` returns null without types, so
// a stored id alone resolves to no ability at all.
const CATERPIE: Partial<PvpAnswerInput> = { myTypes: ["bug"], storedAbilityId: "shield-dust" };
/** Same Bug partner, different roll — the control for every assertion below. */
const BUG_NO_IMMUNITY: Partial<PvpAnswerInput> = { myTypes: ["bug"], storedAbilityId: "swarm" };

/** Answer wrong `n` times in a row, threading engine state, and return it. */
function missStreak(n: number, overrides: Partial<PvpAnswerInput> = {}): PvpEngineState {
  let state = INITIAL_PVP_ENGINE_STATE;
  for (let i = 0; i < n; i++) {
    state = resolvePvpAnswer(wrongAnswer({ questionIndex: i, ...overrides }), state).state;
  }
  return state;
}

describe("consecutive-wrong → Confused", () => {
  it("arms at CONFUSE_AT for a partner with no confusion immunity", () => {
    const state = missStreak(CONFUSE_AT, BUG_NO_IMMUNITY);
    expect(state.selfWrongStreak).toBe(CONFUSE_AT);
    expect(state.confusedTicks).toBe(CONFUSE_TICKS);
  });

  it("has not armed yet one wrong answer short of the threshold", () => {
    expect(missStreak(CONFUSE_AT - 1, BUG_NO_IMMUNITY).confusedTicks).toBe(0);
  });
});

describe("Shield Dust", () => {
  it("never arms confusion, however long the wrong streak runs", () => {
    // The reported battle reached a 3-wrong streak; go past it so a guard that
    // merely shifted the threshold by one would still fail here.
    const state = missStreak(6, CATERPIE);
    expect(state.selfWrongStreak).toBe(6);
    expect(state.confusedTicks).toBe(0);
  });

  it("still takes the ordinary wrong-answer chip — immunity is to confusion only", () => {
    const out = resolvePvpAnswer(wrongAnswer(CATERPIE), INITIAL_PVP_ENGINE_STATE);
    expect(out.selfDmg).toBe(8);
  });

  it("leaves a same-type partner with a different rolled ability confusable", () => {
    // Guards against a fix keyed on the TYPE rather than the ability: Bug
    // alone must not confer immunity.
    expect(missStreak(CONFUSE_AT, BUG_NO_IMMUNITY).confusedTicks).toBe(CONFUSE_TICKS);
  });

  it("has nothing for the miss roll to eat on a later correct answer", () => {
    const state = missStreak(CONFUSE_AT, CATERPIE);
    const out = resolvePvpAnswer(
      wrongAnswer({ ...CATERPIE, correct: true, questionIndex: 9, rng: () => 0 }),
      state,
    );
    // rng() === 0 would ALWAYS trigger the 25% confusion miss if confusion had
    // armed, so this pins the immunity to the thing the player actually feels.
    expect(out.confusionMissed).toBe(false);
    expect(out.state.confusedTicks).toBe(0);
  });
});
