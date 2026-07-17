import { describe, expect, it } from "vitest";
import { applyNextAction, replayBattle, SoloBattleActionError } from "./solo-battle-replay";
import type { SoloBattleCfg } from "./solo-battle-config";
import type { BattleAction, BattleItemConfig } from "./turn";

// Bulbasaur (grass, id 1) vs Charmander (fire, id 4) — same fixture as
// battle-screen.characterization.test.tsx / battle-screen-engine-verification.test.tsx.
const QUESTIONS = Array.from({ length: 16 }, (_, i) => ({
  question: `Question ${i}?`,
  options: ["A", "B", "C", "D"],
  correct: 0,
  explanation: "because",
  category: "Test",
}));

const NO_ITEMS: BattleItemConfig = {
  assaultVestActive: false,
  kingsRockActive: false,
  leftoversActive: false,
  metronomeActive: false,
  silkScarfAvailable: false,
  focusBandAvailable: false,
  reviveAvailable: false,
  oranBerryAvailable: false,
};

function cfgFor(abilityId: SoloBattleCfg["abilityId"]): SoloBattleCfg {
  return {
    questions: QUESTIONS,
    playerPokemonId: 1,
    playerTypes: ["grass"],
    abilityId,
    level: 5,
    mode: "battle",
    enemyPokemonId: 4,
    enemyTypes: ["fire"],
    trainingPoints: 0,
    items: NO_ITEMS,
  };
}

function submitAnswer(questionIdx: number, choiceIdx: number, elapsedMs = 3000): BattleAction {
  return { type: "submit_answer", questionIdx, choiceIdx, elapsedMs };
}

describe("replayBattle / applyNextAction", () => {
  it("replays a growing log the same way one action at a time as it does all at once", () => {
    const cfg = cfgFor("guts");
    const seed = "test-seed-1";
    const script: BattleAction[] = [
      submitAnswer(0, 0), // correct
      submitAnswer(1, 1), // wrong
      submitAnswer(2, 0), // correct
    ];

    // Apply one at a time via applyNextAction, growing the log exactly like
    // repeated submit_action calls would.
    let log: BattleAction[] = [];
    let lastState;
    for (const action of script) {
      const result = applyNextAction(cfg, log, seed, action);
      log = [...log, action];
      lastState = result.state;
    }

    // Replaying the whole log at once from scratch must land on the exact
    // same state.
    const bulkReplay = replayBattle(cfg, log, seed);
    expect(bulkReplay.state).toEqual(lastState);
  });

  it("is deterministic: replaying the same cfg+log+seed twice gives byte-identical state", () => {
    const cfg = cfgFor("static");
    const seed = "determinism-check";
    const log: BattleAction[] = [submitAnswer(0, 1), submitAnswer(1, 1), submitAnswer(2, 1)];
    const first = replayBattle(cfg, log, seed);
    const second = replayBattle(cfg, log, seed);
    expect(second).toEqual(first);
  });

  it("a different seed can change a probabilistic ability's outcome", () => {
    const cfg = cfgFor("static"); // static: 20% chance to halve wrong-answer damage
    const log: BattleAction[] = [submitAnswer(0, 1)]; // wrong
    // Try several seeds; at least one should proc and at least one shouldn't,
    // proving the seed actually drives the roll (not a hardcoded outcome).
    const results = ["a", "b", "c", "d", "e", "f", "g", "h"].map(
      (seed) => replayBattle(cfg, log, seed).state.playerHp,
    );
    expect(new Set(results).size).toBeGreaterThan(1);
  });

  it("rejects an answer for the wrong question index", () => {
    const cfg = cfgFor(null);
    expect(() => applyNextAction(cfg, [], "seed", submitAnswer(1, 0))).toThrow(SoloBattleActionError);
    expect(() => applyNextAction(cfg, [], "seed", submitAnswer(1, 0))).toThrow(/expected an answer for question 0/);
  });

  it("rejects a question index outside the battle's question set", () => {
    const cfg: SoloBattleCfg = { ...cfgFor(null), questions: QUESTIONS.slice(0, 2) };
    const log: BattleAction[] = [submitAnswer(0, 0), submitAnswer(1, 0)];
    expect(() => applyNextAction(cfg, log, "seed", submitAnswer(2, 0))).toThrow(
      /outside this battle's 2-question set/,
    );
  });

  it("rejects any action once the battle has already ended", () => {
    const cfg = cfgFor(null);
    // Ten wrong answers in a row is enough to knock out a fresh 100 HP
    // partner against a disadvantaged matchup (15 dmg each).
    const log: BattleAction[] = Array.from({ length: 10 }, (_, i) => submitAnswer(i, 1));
    const ended = replayBattle(cfg, log, "seed");
    expect(ended.state.phase).not.toBe("in_progress");
    expect(() => applyNextAction(cfg, log, "seed", submitAnswer(log.length, 0))).toThrow(
      SoloBattleActionError,
    );
    expect(() => applyNextAction(cfg, log, "seed", submitAnswer(log.length, 0))).toThrow(
      /already ended/,
    );
  });

  it("forfeit ends the battle as a loss regardless of HP", () => {
    const cfg = cfgFor(null);
    const log: BattleAction[] = [submitAnswer(0, 0), { type: "forfeit" }];
    const result = replayBattle(cfg, log, "seed");
    expect(result.state.phase).toBe("lost");
  });
});
