import { describe, expect, it } from "vitest";
import {
  resolveHeartSwap,
  resolveLunarDance,
  slowStartActive,
  SLOW_START_LATE_BUFF,
  photonGeyserStat,
  resolveTransformCopy,
  clampStage,
  type StageMap,
} from "./signature-bespoke";

const stages = (over: Partial<StageMap> = {}): StageMap => ({
  attack: 0,
  defense: 0,
  speed: 0,
  crit: 0,
  ...over,
});

describe("clampStage", () => {
  it("clamps to the shipped -3..+3 window", () => {
    expect(clampStage(5)).toBe(3);
    expect(clampStage(-9)).toBe(-3);
    expect(clampStage(2)).toBe(2);
  });
});

describe("Manaphy — Heart Swap (490)", () => {
  it("sheds your worst debuff onto the opponent and steals their best buff", () => {
    // You Def -2, opponent Atk +2 → you hold Atk +2, they hold Def -2.
    const r = resolveHeartSwap(stages({ defense: -2 }), stages({ attack: 2 }));
    expect(r.noop).toBe(false);
    expect(r.self.attack).toBe(2);
    expect(r.self.defense).toBe(0);
    expect(r.opp.attack).toBe(0);
    expect(r.opp.defense).toBe(-2);
  });

  it("is a noop when there's nothing worth swapping", () => {
    const r = resolveHeartSwap(stages(), stages());
    expect(r.noop).toBe(true);
    expect(r.self).toEqual(stages());
    expect(r.opp).toEqual(stages());
  });

  it("clamps swapped values to the stage window", () => {
    // You already Atk +2, steal opponent's Atk +2 → clamped at +3, not +4.
    const r = resolveHeartSwap(stages({ attack: 2 }), stages({ attack: 2 }));
    expect(r.self.attack).toBe(3);
  });
});

describe("Cresselia — Lunar Dance (488)", () => {
  it("resets negative Attack/Defense/Speed to 0 and costs 15% HP", () => {
    const r = resolveLunarDance(stages({ attack: -2, speed: -1, defense: 1 }), 100);
    expect(r.self.attack).toBe(0);
    expect(r.self.speed).toBe(0);
    expect(r.self.defense).toBe(1); // positive stages untouched
    expect(r.hpCost).toBe(15);
    expect(r.changed).toBe(true);
  });

  it("reports no change when you hold no negative stages", () => {
    const r = resolveLunarDance(stages({ attack: 2 }), 80);
    expect(r.changed).toBe(false);
    expect(r.hpCost).toBe(12);
  });
});

describe("Regigigas — Slow Start (486)", () => {
  it("locks stages for questions 1-5 (0-based < 5) then lifts", () => {
    expect(slowStartActive(0)).toBe(true);
    expect(slowStartActive(4)).toBe(true);
    expect(slowStartActive(5)).toBe(false); // the 6th question
    expect(SLOW_START_LATE_BUFF).toEqual([
      { stat: "attack", delta: 2 },
      { stat: "speed", delta: 1 },
    ]);
  });
});

describe("Necrozma — Photon Geyser (800)", () => {
  it("buffs whichever of Attack/Speed is currently higher (ties → Attack)", () => {
    expect(photonGeyserStat(stages({ attack: 1, speed: 2 }))).toBe("speed");
    expect(photonGeyserStat(stages({ attack: 2, speed: 1 }))).toBe("attack");
    expect(photonGeyserStat(stages())).toBe("attack");
  });
});

describe("Mew — Transform (151)", () => {
  it("copies a non-mascot opponent ability outright", () => {
    expect(resolveTransformCopy(244, 3, [1, 2, 3])).toBe(244);
  });

  it("cannot copy a rating-5 ability — rolls a rating-3 instead", () => {
    expect(resolveTransformCopy(150, 5, [638, 639, 640], () => 0)).toBe(638);
    expect(resolveTransformCopy(150, 5, [638, 639, 640], () => 0.99)).toBe(640);
  });

  it("returns null when there's nothing to copy and no pool", () => {
    expect(resolveTransformCopy(null, null, [])).toBeNull();
  });
});
