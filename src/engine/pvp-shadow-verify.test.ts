import { describe, expect, it } from "vitest";
import {
  reconstructPvpAnswerInput,
  verifyMatchSide,
  type ShadowLogRow,
} from "./pvp-shadow-verify";
import { resolvePvpAnswer, INITIAL_PVP_ENGINE_STATE } from "./pvp-live-answer";

const QUESTION = { question: "Q?", options: ["A", "B", "C", "D"], correct: 0, category: "Test" };

// Bulbasaur (dex 1) — no signature engine, matching this repo's convention
// for a "plain partner" fixture elsewhere (solo-battle-replay.test.ts).
function baseSnapshot(overrides: Partial<ShadowLogRow["runtimeSnapshot"]> = {}) {
  return {
    myDex: 1,
    oppDex: 4,
    myPartnerId: null,
    oppPartnerId: null,
    myHp: 120,
    oppHp: 120,
    myStages: { attack: 0, defense: 0, speed: 0, crit: 0 },
    oppStages: { attack: 0, defense: 0, speed: 0, crit: 0 },
    myStatuses: [],
    myAbilityId: null,
    mySigRuntime: {},
    mySigState: {},
    mySuppressedUntil: 0,
    streakBefore: 0,
    wrongStreakBefore: 0,
    confusedTicksBefore: 0,
    pokedexCount: 0,
    question: QUESTION,
    questionIndex: 0,
    ...overrides,
  };
}

function row(
  questionIndex: number,
  verifiedCorrect: boolean,
  dmg: number,
  snapshotOverrides: Partial<ShadowLogRow["runtimeSnapshot"]> = {},
): ShadowLogRow {
  return {
    id: questionIndex,
    matchId: "m1",
    questionIndex,
    side: "host",
    verifiedCorrect,
    runtimeSnapshot: baseSnapshot({ questionIndex, ...snapshotOverrides }),
    clientReport: {
      correct: verifiedCorrect,
      dmg,
      selfDmg: verifiedCorrect ? 0 : 8,
      timeMs: 3000,
      selectedIndex: verifiedCorrect ? 0 : 1,
    },
  };
}

describe("pvp-shadow-verify", () => {
  it("accepts a client-reported dmg that matches the port's non-crit pass", () => {
    const r = row(0, true, 0);
    // Ground truth from the port itself (rng forced to never crit/miss),
    // exactly as a real client would compute with a non-crit roll.
    const input = reconstructPvpAnswerInput(r, () => 0.99);
    const { dmg } = resolvePvpAnswer(input, INITIAL_PVP_ENGINE_STATE);
    r.clientReport.dmg = dmg;

    const [result] = verifyMatchSide([r]);
    expect(result.match).toBe(true);
    expect(result.expectedDmgSet).toContain(dmg);
    expect(result.expectedDmgSet.length).toBe(2); // not confused: {non-crit, crit}
    expect(result.knownGap).toBeNull();
  });

  it("accepts a client-reported dmg that matches the port's crit pass", () => {
    const r = row(0, true, 0);
    const input = reconstructPvpAnswerInput(r, () => 0);
    const { dmg } = resolvePvpAnswer(input, INITIAL_PVP_ENGINE_STATE);
    r.clientReport.dmg = dmg;

    const [result] = verifyMatchSide([r]);
    expect(result.match).toBe(true);
  });

  it("flags a client-reported dmg outside the port's {crit, non-crit} set", () => {
    const r = row(0, true, 9999);
    const [result] = verifyMatchSide([r]);
    expect(result.match).toBe(false);
    expect(result.expectedDmgSet).not.toContain(9999);
  });

  it("includes the confusion-miss (dmg=0) outcome only when confused", () => {
    const r = row(0, true, 0, { confusedTicksBefore: 1 });
    const [result] = verifyMatchSide([r]);
    expect(result.expectedDmgSet).toContain(0);
    expect(result.expectedDmgSet.length).toBeLessThanOrEqual(3);
  });

  it("folds streak/wrong-streak/confused-ticks across a sequence from each row's own snapshot", () => {
    // Two wrong answers arm confusion (CONFUSE_AT = 2), mirroring the SQL
    // RPC's independent streak/wrong-streak/confused-ticks bookkeeping --
    // this is exactly the cross-check that would catch the two
    // implementations (SQL vs. this TS port) silently diverging.
    const rows = [
      row(0, false, 0, { streakBefore: 0, wrongStreakBefore: 0, confusedTicksBefore: 0 }),
      row(1, false, 0, { streakBefore: 0, wrongStreakBefore: 1, confusedTicksBefore: 0 }),
      row(2, true, 0, { streakBefore: 0, wrongStreakBefore: 2, confusedTicksBefore: 2 }),
    ];
    const results = verifyMatchSide(rows);
    expect(results).toHaveLength(3);
    // Question 2 is answered correctly while confused, so 0 (a possible
    // confusion-miss) must be in its expected set regardless of crit/streak math.
    expect(results[2].expectedDmgSet).toContain(0);
  });

  it("flags Sword of Ruin (dex 1002) rows as a known gap, not a port bug", () => {
    const r = row(0, true, 9999, { myDex: 1002, myPartnerId: 1002 });
    const [result] = verifyMatchSide([r]);
    expect(result.knownGap).toBe("sword_of_ruin_arming");
  });
});
