import { describe, expect, it } from "vitest";
import {
  ROUTE_START,
  nextRoute,
  regionGyms,
  routeGym,
  routeNumber,
  routeOpponent,
  stopTrainer,
  stopsForGym,
  stopsLeft,
  gymTown,
  regionRoute,
  nextStep,
  wildStops,
  battleKind,
  regionWildPokemon,
} from "./route";
import { findPokemon } from "./pokemon-data";
import { isLegendaryOrMythical } from "./legendary-data";

describe("route", () => {
  it("starts at Route 1, Brock, four stops", () => {
    expect(routeNumber(ROUTE_START)).toBe(1);
    expect(routeGym(ROUTE_START).id).toBe("brock");
    expect(gymTown(routeGym(ROUTE_START))).toBe("Pewter Gym");
    expect(stopsLeft(ROUTE_START)).toBe(4);
    // stops 0-1 are wild; Route 1's named trainers start at the trainer half
    expect(stopTrainer(ROUTE_START, 2)).toBe("Youngster Ben");
    expect(stopTrainer(ROUTE_START, 3)).toBe("Lass Ivy");
  });

  it("adds one stop per gym; each region has its own route", () => {
    expect([0, 1, 7].map(stopsForGym)).toEqual([4, 5, 11]);
    const johto = regionRoute(1, ROUTE_START, {});
    expect(routeGym(johto).id).toBe("falkner");
    expect(stopsLeft(johto)).toBe(4);
    expect(routeNumber(johto)).toBe(9);
    expect(regionRoute(1, ROUTE_START, { 1: { gym: 2, beaten: 3 } })).toEqual({ region: 1, gym: 2, beaten: 3 });
  });

  it("walks a region's gyms in order, then starts that route again", () => {
    let r = ROUTE_START;
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      seen.push(routeGym(r).id);
      r = nextRoute(r);
    }
    expect(seen.slice(0, 3)).toEqual(["brock", "misty", "lt-surge"]);
    expect(new Set(seen).size).toBe(8);
    expect(r).toEqual(ROUTE_START);
    expect(regionGyms(4).length).toBe(10);
  });

  it("gives stops the same trainer every time and a region Pokémon", () => {
    const r = { region: 2, gym: 3, beaten: 4, whos: true };
    expect(stopTrainer(r, 4)).toBe(stopTrainer(r, 4));
    for (let i = 0; i < 50; i++) {
      const o = routeOpponent(r, 0);
      expect(o.stop).toBe(4);
      expect(o.kind).toBe("trainer");
      expect(o.enemy.name).toBe(stopTrainer(r, 4));
      expect(o.enemy.pokemon.id).toBeGreaterThanOrEqual(252);
      expect(o.enemy.pokemon.id).toBeLessThanOrEqual(386);
      expect(isLegendaryOrMythical(o.enemy.pokemon.id)).toBe(false);
    }
  });

  it("extra battles after the last stop advance nothing", () => {
    const r = { region: 0, gym: 0, beaten: 4, whos: true };
    expect(stopsLeft(r)).toBe(0);
    expect(routeOpponent(r, 0).stop).toBeNull();
    expect(routeOpponent(r, 0).kind).toBe("trainer");
  });

  it("walks wild half, Who's That, trainer half, Daily Quest, then the gym (Paul, 28 Nov)", () => {
    expect([0, 1, 2, 7].map(wildStops)).toEqual([2, 2, 3, 5]); // 4, 5, 6, 11 stops: the extra one is a trainer
    const r = (beaten: number, extra: object = {}) => ({ region: 0, gym: 1, beaten, ...extra }); // 5 stops: 2 wild, 3 trainers
    expect(nextStep(r(0), false)).toEqual({ kind: "wild", stop: 0 });
    expect(nextStep(r(1), false)).toEqual({ kind: "wild", stop: 1 });
    expect(nextStep(r(2), false)).toEqual({ kind: "whos" });
    expect(nextStep(r(2, { whos: true }), false)).toEqual({ kind: "trainer", stop: 2 });
    expect(nextStep(r(5, { whos: true }), false)).toEqual({ kind: "daily" });
    expect(nextStep(r(5, { whos: true }), true)).toEqual({ kind: "gym" });
    expect(nextStep(r(5, { whos: true, gymLost: true }), true)).toEqual({ kind: "trainer", stop: null });
  });

  it("a wild stop is a wild base form of the region; a waiting Who's That keeps battles wild", () => {
    const wild = { region: 0, gym: 0, beaten: 0 };
    for (let i = 0; i < 80; i++) {
      const o = routeOpponent(wild, 0);
      expect(o.kind).toBe("wild");
      expect(o.enemy.wild).toBe(true);
      expect(o.enemy.name).toBe(`Wild ${o.enemy.pokemon.name}`);
      const p = o.enemy.pokemon;
      expect(p.id).toBeLessThanOrEqual(151);
      expect(isLegendaryOrMythical(p.id)).toBe(false);
      if (p.evolvesFromId != null) expect(p.evolvesFromId).toBeGreaterThan(151); // only a later-region pre-evolution
    }
    expect(battleKind({ region: 0, gym: 0, beaten: 2 })).toBe("wild"); // Who's That waits: extras stay wild
    expect(routeOpponent({ region: 0, gym: 0, beaten: 2 }, 0).stop).toBeNull();
    // Pikachu (pre-evolution Pichu is Johto's) can be met wild in Kanto; Raichu cannot
    const ids = new Set(Array.from({ length: 2000 }, () => regionWildPokemon(0).id));
    expect(ids.has(findPokemon(25)!.id)).toBe(true);
    expect(ids.has(26)).toBe(false);
  });
});
