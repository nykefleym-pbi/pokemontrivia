import { describe, expect, it } from "vitest";
import { isValidSoloBattleCfg } from "./solo-battle-config";
import { isValidBattleAction } from "./turn";
import type { SoloBattleCfg } from "./solo-battle-config";

const VALID_ITEMS = {
  assaultVestActive: false,
  kingsRockActive: false,
  leftoversActive: false,
  metronomeActive: false,
  silkScarfAvailable: false,
  focusBandAvailable: false,
  reviveAvailable: false,
  oranBerryAvailable: false,
};

function validCfg(): SoloBattleCfg {
  return {
    questions: [{ question: "Q?", options: ["A", "B"], correct: 0, explanation: "e", category: "c" }],
    playerPokemonId: 1,
    playerTypes: ["grass"],
    abilityId: null,
    level: 5,
    mode: "battle",
    enemyPokemonId: 4,
    enemyTypes: ["fire"],
    trainingPoints: 0,
    items: VALID_ITEMS,
  };
}

describe("isValidSoloBattleCfg", () => {
  it("accepts a well-formed cfg", () => {
    expect(isValidSoloBattleCfg(validCfg())).toBe(true);
  });

  it("rejects non-objects", () => {
    expect(isValidSoloBattleCfg(null)).toBe(false);
    expect(isValidSoloBattleCfg(undefined)).toBe(false);
    expect(isValidSoloBattleCfg("cfg")).toBe(false);
    expect(isValidSoloBattleCfg(42)).toBe(false);
  });

  it("rejects an empty questions array", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), questions: [] })).toBe(false);
  });

  it("rejects a malformed question", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), questions: [{ question: "Q?" }] })).toBe(false);
  });

  it("rejects an invalid mode", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), mode: "daily" })).toBe(false);
  });

  it("rejects an empty playerTypes array", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), playerTypes: [] })).toBe(false);
  });

  it("accepts a null abilityId but rejects a non-string one", () => {
    expect(isValidSoloBattleCfg({ ...validCfg(), abilityId: null })).toBe(true);
    expect(isValidSoloBattleCfg({ ...validCfg(), abilityId: 5 })).toBe(false);
  });

  it("rejects a missing items config", () => {
    const { items: _items, ...rest } = validCfg();
    expect(isValidSoloBattleCfg(rest)).toBe(false);
  });

  it("rejects an items config missing a required flag", () => {
    const { metronomeActive: _metronomeActive, ...restItems } = VALID_ITEMS;
    expect(isValidSoloBattleCfg({ ...validCfg(), items: restItems })).toBe(false);
  });

  it("rejects an items config with a non-boolean flag", () => {
    expect(
      isValidSoloBattleCfg({ ...validCfg(), items: { ...VALID_ITEMS, assaultVestActive: "yes" } }),
    ).toBe(false);
  });
});

describe("isValidBattleAction", () => {
  it("accepts a well-formed submit_answer", () => {
    expect(isValidBattleAction({ type: "submit_answer", questionIdx: 0, choiceIdx: 1, elapsedMs: 3000 })).toBe(
      true,
    );
  });

  it("accepts forfeit with no other fields", () => {
    expect(isValidBattleAction({ type: "forfeit" })).toBe(true);
  });

  it("accepts a well-formed use_item", () => {
    expect(isValidBattleAction({ type: "use_item", itemId: "potion" })).toBe(true);
  });

  it("rejects a use_item missing itemId", () => {
    expect(isValidBattleAction({ type: "use_item" })).toBe(false);
  });

  it("rejects a submit_answer missing a required field", () => {
    expect(isValidBattleAction({ type: "submit_answer", questionIdx: 0, choiceIdx: 1 })).toBe(false);
  });

  it("rejects an unknown action type", () => {
    expect(isValidBattleAction({ type: "cheat" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidBattleAction(null)).toBe(false);
    expect(isValidBattleAction("forfeit")).toBe(false);
  });
});
