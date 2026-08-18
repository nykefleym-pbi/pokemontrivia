// @vitest-environment jsdom
//
// The damage multiplier reads LIFETIME Training Points (balance + spent), not
// the balance — owner ruling 2026-08-17, after the evolution cost came down far
// enough that people started actually evolving and watching their partner drop
// from x1.20 to x1.00 for doing it.
//
// jsdom because the store persists to localStorage on every `set`.
import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/store";
import { getTpMultiplier, lifetimeTp, EVOLUTION_TP_COST } from "@/lib/game-data";
import { findPokemon } from "@/lib/pokemon-data";

const BULBASAUR = 1;
const IVYSAUR = 2;

beforeEach(() => {
  window.localStorage.clear();
  useGameStore.setState({
    pokemon: findPokemon(BULBASAUR)!,
    trainingPoints: {},
    trainingPointsSpent: {},
  });
});

describe("lifetimeTp", () => {
  it("is the balance when nothing has been spent", () => {
    expect(lifetimeTp({ 1: 900 }, {}, 1)).toBe(900);
  });

  it("adds back what was spent", () => {
    expect(lifetimeTp({ 1: 100 }, { 1: 1500 }, 1)).toBe(1600);
  });

  it("is 0 for a Pokémon with no history", () => {
    expect(lifetimeTp({}, {}, 42)).toBe(0);
  });
});

describe("evolving", () => {
  it("keeps the damage multiplier it was earned with", () => {
    const cost = EVOLUTION_TP_COST[1];
    const earned = cost + 200;
    useGameStore.setState({ trainingPoints: { [BULBASAUR]: earned } });

    const before = useGameStore.getState();
    expect(
      getTpMultiplier(lifetimeTp(before.trainingPoints, before.trainingPointsSpent, BULBASAUR)),
    ).toBe(1.2);

    expect(useGameStore.getState().evolvePartner(findPokemon(IVYSAUR)!)).toBe(true);

    const after = useGameStore.getState();
    // The BALANCE is spent down, which is what the evolution cost means...
    expect(after.trainingPoints[IVYSAUR]).toBe(200);
    // ...but lifetime — and so the multiplier — carries over whole.
    expect(lifetimeTp(after.trainingPoints, after.trainingPointsSpent, IVYSAUR)).toBe(earned);
    expect(
      getTpMultiplier(lifetimeTp(after.trainingPoints, after.trainingPointsSpent, IVYSAUR)),
    ).toBe(1.2);
  });

  it("carries a second evolution's spend on top of the first", () => {
    const first = EVOLUTION_TP_COST[1];
    useGameStore.setState({ trainingPoints: { [BULBASAUR]: first } });
    useGameStore.getState().evolvePartner(findPokemon(IVYSAUR)!);

    const s = useGameStore.getState();
    expect(s.trainingPointsSpent[IVYSAUR]).toBe(first);
    // The pre-evolution's own row is cleared, not left to double-count.
    expect(s.trainingPointsSpent[BULBASAUR]).toBeUndefined();
    expect(s.trainingPoints[BULBASAUR]).toBeUndefined();
  });

  it("is still refused when the BALANCE is short, however much was earned", () => {
    // Lifetime is what powers damage; it is not currency. Someone who evolved
    // once cannot immediately evolve again on the strength of the TP they
    // already spent.
    useGameStore.setState({
      trainingPoints: { [BULBASAUR]: 10 },
      trainingPointsSpent: { [BULBASAUR]: 99999 },
    });
    expect(useGameStore.getState().evolvePartner(findPokemon(IVYSAUR)!)).toBe(false);
  });
});
