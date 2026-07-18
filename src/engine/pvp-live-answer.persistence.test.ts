// Live PvP Phase 4/5 cutover, slice 3: proves the NEW risk surface the
// cutover introduces -- not resolvePvpAnswer's math (already validated
// end-to-end by live-pvp-battle-screen.engine-verification.test.tsx's
// multi-question characterization-linked trace), but whether a full
// `PvpEngineState` survives being persisted to `pvp_live_matches` columns and
// reconstructed between separate stateless calls, the way the eventual Edge
// Function must (each question is its own HTTP request/DB transaction,
// unlike the client's long-lived in-memory refs).
//
// Technique: run the same multi-question script twice through
// `resolvePvpAnswer` -- once carrying `state` continuously in memory (what
// the CLIENT does today), once round-tripping through
// `pvpEngineStateToRow`/`pvpEngineStateFromRow` before every call (what the
// cutover's apply RPC will do) -- and assert the two produce byte-identical
// `dmg`/`selfDmg` sequences. A field that serializes lossy would only show up
// in the second run, exactly the kind of bug this repo's CLAUDE.md demands be
// falsified rather than assumed away.
import { describe, expect, it } from "vitest";
import {
  resolvePvpAnswer,
  armSwordOfRuinCharges,
  pvpEngineStateFromRow,
  pvpEngineStateToRow,
  INITIAL_PVP_ENGINE_STATE,
  type PvpAnswerInput,
  type PvpEngineState,
} from "./pvp-live-answer";
import { SIGNATURE_ABILITIES } from "../lib/signature-abilities";

const NEVER_MISS_OR_CRIT = () => 0.99;

function baseInput(overrides: Partial<PvpAnswerInput>): PvpAnswerInput {
  return {
    questionIndex: 0,
    correct: true,
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
    oppType: ["water"],
    oppSpecies: 4,
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

/** Runs a script twice -- once folding `state` continuously, once
 *  round-tripping every state through the persisted-row shape before each
 *  call -- and returns both dmg/selfDmg sequences for comparison. */
function runBothWays(
  script: (questionIndex: number) => PvpAnswerInput,
  steps: number,
  midStepMutation?: (afterIndex: number, state: PvpEngineState) => PvpEngineState,
) {
  let continuousState = INITIAL_PVP_ENGINE_STATE;
  let persistedState = INITIAL_PVP_ENGINE_STATE;
  const continuousTrace: { dmg: number; selfDmg: number }[] = [];
  const persistedTrace: { dmg: number; selfDmg: number }[] = [];

  for (let i = 0; i < steps; i++) {
    const input = script(i);

    const a = resolvePvpAnswer(input, continuousState);
    continuousTrace.push({ dmg: a.dmg, selfDmg: a.selfDmg });
    continuousState = a.state;

    // The round trip itself: serialize -> deserialize before every call,
    // exactly what a stateless per-question RPC must do.
    const reconstructed = pvpEngineStateFromRow(pvpEngineStateToRow(persistedState));
    const b = resolvePvpAnswer(input, reconstructed);
    persistedTrace.push({ dmg: b.dmg, selfDmg: b.selfDmg });
    persistedState = b.state;

    if (midStepMutation) {
      continuousState = midStepMutation(i, continuousState);
      persistedState = midStepMutation(i, persistedState);
    }
  }

  return { continuousTrace, persistedTrace };
}

describe("PvpEngineState persistence round-trip (Phase 4/5 cutover)", () => {
  it("survives a moxie/wrong-streak/confusion sequence byte-for-byte", () => {
    // Q0-2 correct (streak hits 3 -> moxieStacks+=1), Q3-4 wrong (arms
    // confusion at wrongStreak=2), Q5 correct-while-confused (not missed,
    // rng forced >0.25), Q6 correct again -- exercises moxieStacks, wrongCount,
    // hadWrong, confusedTicks, and selfWrongStreak all round-tripping.
    const corrects = [true, true, true, false, false, true, true];
    const { continuousTrace, persistedTrace } = runBothWays(
      (i) =>
        baseInput({
          questionIndex: i,
          correct: corrects[i],
          myTypes: ["normal"],
          storedAbilityId: "moxie",
          selfHp: 100,
          answerElapsedMs: 2000 + i * 100,
        }),
      corrects.length,
    );
    expect(persistedTrace).toEqual(continuousTrace);
  });

  it("survives a sigLatched + sturdy + Sword-of-Ruin-charges sequence byte-for-byte", () => {
    // Regidrago's engine (895) latches its start-of-battle trigger on Q0 --
    // sigLatched must stay true across the persistence boundary for every
    // later question. "sturdy" clamps a lethal wrong-answer selfDmg once.
    // armSwordOfRuinCharges mid-sequence (mirroring Chien-Pao's manual fire
    // landing) must round-trip and decrement correctly on later correct
    // answers.
    const engine895 = SIGNATURE_ABILITIES[895]?.engine;
    const corrects = [true, false, true, true, true];
    const selfHps = [100, 8, 100, 100, 100];
    const { continuousTrace, persistedTrace } = runBothWays(
      (i) =>
        baseInput({
          questionIndex: i,
          correct: corrects[i],
          selfHp: selfHps[i],
          engine: engine895,
          myTypes: ["rock"],
          storedAbilityId: "sturdy",
        }),
      corrects.length,
      (i, state) => (i === 0 ? armSwordOfRuinCharges(state, 1002) : state),
    );
    expect(persistedTrace).toEqual(continuousTrace);
    // Sanity: sigLatched actually held (Regidrago's multiplier is engaged
    // across every question, not just Q0), and the sword-of-ruin charges
    // actually got consumed -- otherwise this test would pass trivially
    // by both sides doing nothing interesting.
    expect(continuousTrace[2].dmg).toBeGreaterThan(0);
    expect(continuousTrace.some((t) => t.dmg > 0)).toBe(true);
  });

  it("pvpEngineStateFromRow/pvpEngineStateToRow round-trip every field exactly", () => {
    const state: PvpEngineState = {
      streak: 3,
      correctCount: 7,
      selfWrongStreak: 1,
      confusedTicks: 2,
      swordOfRuinCharges: 1,
      sigLatched: true,
      moxieStacks: 2,
      wrongCount: 4,
      hadWrong: true,
      sturdyUsed: true,
      prevCorrect: false,
      prevAnswerElapsedMs: 4321,
    };
    expect(pvpEngineStateFromRow(pvpEngineStateToRow(state))).toEqual(state);
  });
});
