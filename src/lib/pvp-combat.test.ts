import { describe, expect, it } from "vitest";
import {
  clampStage,
  statStageMultiplier,
  timerMsForSpeedStage,
  critRate,
  computePvpDamage,
  PVP_BASE_TIMER_MS,
  PVP_CRIT_MULT,
} from "./pvp-combat";
import { rollBerryDrops, NEARBY_BERRY_DROP_POOL, BERRIES_PER_NEARBY_BATTLE } from "./game-data";

describe("pvp-combat: stat stages", () => {
  it("clamps stages to -3..+3", () => {
    expect(clampStage(9)).toBe(3);
    expect(clampStage(-9)).toBe(-3);
    expect(clampStage(1.4)).toBe(1);
  });

  it("stage multiplier ranges 0.70 .. 1.30 at ±10% per stage", () => {
    expect(statStageMultiplier(0)).toBeCloseTo(1.0);
    expect(statStageMultiplier(3)).toBeCloseTo(1.3);
    expect(statStageMultiplier(-3)).toBeCloseTo(0.7);
  });
});

describe("pvp-combat: speed → timer", () => {
  it("each speed stage is ±10% of the base timer (matches Atk/Def magnitude)", () => {
    expect(timerMsForSpeedStage(0)).toBe(PVP_BASE_TIMER_MS);
    expect(timerMsForSpeedStage(3)).toBe(Math.round(PVP_BASE_TIMER_MS * 1.3));
    expect(timerMsForSpeedStage(-3)).toBe(Math.round(PVP_BASE_TIMER_MS * 0.7));
  });
});

describe("pvp-combat: crit", () => {
  it("base 5%, +5%/stage, +10% first half, clamped at 50%", () => {
    expect(critRate(0, false)).toBeCloseTo(0.05);
    expect(critRate(0, true)).toBeCloseTo(0.15);
    expect(critRate(1, true)).toBeCloseTo(0.2);
    expect(critRate(3, true)).toBeCloseTo(0.3);
    // Crit stage is itself clamped to +3, so 0.30 is the effective ceiling here;
    // the 0.5 hard cap is defensive (unreachable via stages alone).
    expect(critRate(20, true)).toBeCloseTo(0.3);
  });
});

describe("pvp-combat: damage", () => {
  it("crit multiplies output by 1.5", () => {
    const base = { streak: 0, speedRatio: 0, attackStage: 0, defenseStage: 0, critStage: 0, firstHalf: false };
    const normal = computePvpDamage({ ...base, rng: () => 0.99 });
    const crit = computePvpDamage({ ...base, rng: () => 0.0 });
    expect(crit.didCrit).toBe(true);
    expect(normal.didCrit).toBe(false);
    expect(crit.dmg).toBe(Math.max(1, Math.round(normal.dmg * PVP_CRIT_MULT)));
  });

  it("opponent Defense reduces damage; attacker Attack raises it", () => {
    const base = { streak: 0, speedRatio: 0, critStage: 0, firstHalf: false, rng: () => 0.99 };
    const neutral = computePvpDamage({ ...base, attackStage: 0, defenseStage: 0 });
    const buffed = computePvpDamage({ ...base, attackStage: 3, defenseStage: 0 });
    const defended = computePvpDamage({ ...base, attackStage: 0, defenseStage: 3 });
    expect(buffed.dmg).toBeGreaterThan(neutral.dmg);
    expect(defended.dmg).toBeLessThan(neutral.dmg);
  });

  it("burn cuts output ~15%", () => {
    const base = { streak: 5, speedRatio: 1, attackStage: 0, defenseStage: 0, critStage: 0, firstHalf: true, rng: () => 0.99 };
    const clean = computePvpDamage(base);
    const burned = computePvpDamage({ ...base, burned: true });
    expect(burned.dmg).toBeLessThan(clean.dmg);
  });

  it("always deals at least 1", () => {
    const r = computePvpDamage({ streak: 0, speedRatio: 0, attackStage: -3, defenseStage: 3, critStage: 0, firstHalf: false, rng: () => 0.99 });
    expect(r.dmg).toBeGreaterThanOrEqual(1);
  });
});

describe("berry drops", () => {
  it("rolls exactly BERRIES_PER_NEARBY_BATTLE berries from the common pool", () => {
    const drops = rollBerryDrops(() => 0.5);
    expect(drops.length).toBe(BERRIES_PER_NEARBY_BATTLE);
    for (const d of drops) expect(NEARBY_BERRY_DROP_POOL).toContain(d);
  });

  it("the common drop pool excludes the premium berries (Lum, Starf)", () => {
    expect(NEARBY_BERRY_DROP_POOL).not.toContain("lumberry");
    expect(NEARBY_BERRY_DROP_POOL).not.toContain("starfberry");
  });
});
