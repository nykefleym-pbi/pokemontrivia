import { describe, expect, it } from "vitest";
import {
  resolveHeartSwap,
  resolveLunarDance,
  slowStartActive,
  SLOW_START_LATE_BUFF,
  photonGeyserStat,
  resolveTransformCopy,
  clampStage,
  nextWrathStacks,
  wrathDischarge,
  WRATH_MAX,
  opponentAnsweredCorrectly,
  thunderclapFires,
  THUNDERCLAP_COOLDOWN,
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

describe("Moltres — Fiery Wrath (146)", () => {
  it("builds a Wrath stack on each wrong answer, capped at WRATH_MAX", () => {
    expect(WRATH_MAX).toBe(3);
    expect(nextWrathStacks(0, false)).toBe(1);
    expect(nextWrathStacks(1, false)).toBe(2);
    expect(nextWrathStacks(2, false)).toBe(3);
    expect(nextWrathStacks(3, false)).toBe(3); // clamped
  });

  it("resets to 0 on a correct answer (the discharge)", () => {
    expect(nextWrathStacks(3, true)).toBe(0);
    expect(nextWrathStacks(0, true)).toBe(0);
  });

  it("tolerates out-of-range/fractional stored values", () => {
    expect(nextWrathStacks(-5, false)).toBe(1);
    expect(nextWrathStacks(9, false)).toBe(3);
  });

  it("discharge grants +1 Attack/stack and a 30%/stack Sleep chance (capped)", () => {
    expect(wrathDischarge(0)).toEqual({ stacks: 0, bonusAttackStage: 0, sleepChance: 0 });
    expect(wrathDischarge(1)).toEqual({ stacks: 1, bonusAttackStage: 1, sleepChance: 0.3 });
    const three = wrathDischarge(3);
    expect(three.bonusAttackStage).toBe(3);
    expect(three.sleepChance).toBeCloseTo(0.9);
    // Never exceeds cap even if a stale value slips through.
    expect(wrathDischarge(5).bonusAttackStage).toBe(3);
    expect(wrathDischarge(5).sleepChance).toBeLessThanOrEqual(1);
  });
});

describe("Opponent-reactive observer (Raging Bolt Thunderclap 1021)", () => {
  it("detects the opponent's correct-counter advancing", () => {
    expect(opponentAnsweredCorrectly(2, 3)).toBe(true);
    expect(opponentAnsweredCorrectly(3, 3)).toBe(false);
    expect(opponentAnsweredCorrectly(3, 2)).toBe(false);
  });

  it("fires only on an advance AND when the per-4-question cooldown has elapsed", () => {
    expect(THUNDERCLAP_COOLDOWN).toBe(4);
    // Never fired yet (lastFired = -cooldown): available from question 0.
    expect(thunderclapFires(0, 1, 0, -THUNDERCLAP_COOLDOWN)).toBe(true);
    // No advance → no fire.
    expect(thunderclapFires(1, 1, 5, -THUNDERCLAP_COOLDOWN)).toBe(false);
    // Advance but still on cooldown (fired at q2, now q4 → only 2 elapsed).
    expect(thunderclapFires(1, 2, 4, 2)).toBe(false);
    // Advance and cooldown satisfied (fired at q2, now q6 → 4 elapsed).
    expect(thunderclapFires(1, 2, 6, 2)).toBe(true);
  });
});
