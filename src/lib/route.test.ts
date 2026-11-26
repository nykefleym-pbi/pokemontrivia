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
} from "./route";
import { isLegendaryOrMythical } from "./legendary-data";

describe("route", () => {
  it("starts at Route 1, Brock, four stops", () => {
    expect(routeNumber(ROUTE_START)).toBe(1);
    expect(routeGym(ROUTE_START).id).toBe("brock");
    expect(gymTown(routeGym(ROUTE_START))).toBe("Pewter Gym");
    expect(stopsLeft(ROUTE_START)).toBe(4);
    expect(stopTrainer(ROUTE_START, 0)).toBe("Youngster Ben");
    expect(stopTrainer(ROUTE_START, 1)).toBe("Lass Ivy");
  });

  it("adds one stop per gym and starts again in each region", () => {
    expect([0, 1, 7].map(stopsForGym)).toEqual([4, 5, 11]);
    let r = ROUTE_START;
    for (let i = 0; i < 8; i++) r = nextRoute(r);
    expect(r).toEqual({ region: 1, gym: 0, beaten: 0 });
    expect(routeGym(r).id).toBe("falkner");
    expect(stopsLeft(r)).toBe(4);
    expect(routeNumber(r)).toBe(9);
  });

  it("covers all 42 gyms, then loops to Kanto", () => {
    let r = ROUTE_START;
    const seen = new Set<string>();
    for (let i = 0; i < 42; i++) {
      seen.add(routeGym(r).id);
      r = nextRoute(r);
    }
    expect(seen.size).toBe(42);
    expect(r).toEqual(ROUTE_START);
    expect(regionGyms(4).length).toBe(10);
  });

  it("gives stops the same trainer every time and a region Pokémon", () => {
    const r = { region: 2, gym: 3, beaten: 1 };
    expect(stopTrainer(r, 1)).toBe(stopTrainer(r, 1));
    for (let i = 0; i < 50; i++) {
      const o = routeOpponent(r, 0);
      expect(o.stop).toBe(1);
      expect(o.enemy.name).toBe(stopTrainer(r, 1));
      expect(o.enemy.pokemon.id).toBeGreaterThanOrEqual(252);
      expect(o.enemy.pokemon.id).toBeLessThanOrEqual(386);
      expect(isLegendaryOrMythical(o.enemy.pokemon.id)).toBe(false);
    }
  });

  it("extra battles after the last stop advance nothing", () => {
    const r = { region: 0, gym: 0, beaten: 4 };
    expect(stopsLeft(r)).toBe(0);
    expect(routeOpponent(r, 0).stop).toBeNull();
  });
});
