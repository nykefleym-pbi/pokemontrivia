import { describe, it, expect } from "vitest";
import {
  pairTypeMultiplier,
  typeMatchup,
  rolledAttackType,
  IMMUNE_FLOOR_MULT,
} from "./type-chart";
import type { PokeType } from "./pokemon-data.generated";

describe("pairTypeMultiplier — mainline single-type bands", () => {
  it("super-effective pairs are 2×", () => {
    expect(pairTypeMultiplier("fire", "grass")).toBe(2);
    expect(pairTypeMultiplier("water", "fire")).toBe(2);
    expect(pairTypeMultiplier("fighting", "steel")).toBe(2);
  });
  it("resisted pairs are 0.5×", () => {
    expect(pairTypeMultiplier("fire", "water")).toBe(0.5);
    expect(pairTypeMultiplier("grass", "steel")).toBe(0.5);
    expect(pairTypeMultiplier("dragon", "steel")).toBe(0.5);
  });
  it("immune pairs are 0× (including the restored Ground↯Electric)", () => {
    expect(pairTypeMultiplier("normal", "ghost")).toBe(0);
    expect(pairTypeMultiplier("ground", "flying")).toBe(0);
    expect(pairTypeMultiplier("electric", "ground")).toBe(0);
  });
  it("everything else is neutral 1×", () => {
    expect(pairTypeMultiplier("fire", "ghost")).toBe(1);
    expect(pairTypeMultiplier("normal", "normal")).toBe(1);
  });
});

describe("typeMatchup — product across the defender's types, immune floored", () => {
  it("double super-effective reaches 4×", () => {
    // Some question index rolls fire; the defender grass/bug is 2×·2× = 4×.
    const m = matchupForType("fire", ["grass", "bug"]);
    expect(m.multiplier).toBe(4);
    expect(m.band).toBe("super");
  });
  it("double resist reaches 0.25×", () => {
    const m = matchupForType("fire", ["water", "rock"]);
    expect(m.multiplier).toBe(0.25);
    expect(m.band).toBe("resisted");
  });
  it("a 0× matchup floors to IMMUNE_FLOOR_MULT but still reads as immune", () => {
    const m = matchupForType("normal", ["ghost"]);
    expect(m.rawMultiplier).toBe(0);
    expect(m.multiplier).toBe(IMMUNE_FLOOR_MULT);
    expect(m.band).toBe("immune");
  });
  it("neutral is exactly 1×", () => {
    const m = matchupForType("fire", ["ghost"]);
    expect(m.multiplier).toBe(1);
    expect(m.band).toBe("neutral");
  });
});

describe("rolledAttackType — deterministic per-question RNG", () => {
  it("a mono-type attacker always swings with its one type", () => {
    for (let q = 0; q < 20; q++) {
      expect(rolledAttackType(["fire"], ["water"], q)).toBe("fire");
    }
  });
  it("the same inputs always roll the same type (client/server agree)", () => {
    const a = rolledAttackType(["grass", "poison"], ["water"], 7);
    const b = rolledAttackType(["grass", "poison"], ["water"], 7);
    expect(a).toBe(b);
  });
  it("a dual-type attacker rolls both of its types across a battle's questions", () => {
    const seen = new Set<PokeType>();
    for (let q = 0; q < 20; q++) seen.add(rolledAttackType(["grass", "poison"], ["water"], q));
    expect(seen).toEqual(new Set<PokeType>(["grass", "poison"]));
  });
});

/** Force `typeMatchup` to evaluate a specific attacking type by finding the
 *  question index that rolls it — the roll is deterministic, so this is stable. */
function matchupForType(attack: PokeType, defenderTypes: PokeType[]) {
  const attackerTypes: PokeType[] = [attack];
  return typeMatchup(attackerTypes, defenderTypes, 0);
}
