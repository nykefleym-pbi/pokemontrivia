import { describe, expect, it } from "vitest";
import {
  clampStage,
  statStageMultiplier,
  timerMsForSpeedStage,
  critRate,
  computePvpDamage,
  evaluateHitModifiers,
  evaluateIndexFactor,
  phasePayoffIndex,
  NO_SIGNATURE_HIT_MODIFIERS,
  PVP_BASE_TIMER_MS,
  PVP_CRIT_MULT,
} from "./pvp-combat";
import { SIGNATURE_ABILITIES } from "./signature-abilities";
import type { DamageMultiplierSpec } from "./signature-abilities";
import { rollBerryDrops, NEARBY_BERRY_DROP_POOL, BERRIES_PER_NEARBY_BATTLE } from "./game-data";

describe("pvp-combat: Regidrago #895 HP-tier multiplier (M4)", () => {
  // Owner ruling 2026-07-12: re-read every question off Regidrago's OWN live HP,
  // so it opens at x3 and fades to x1 as it is worn down.
  const regidrago: DamageMultiplierSpec = {
    type: "damage_multiplier",
    factor: 1,
    condition: { on: "always" },
    hpTiers: [
      { atLeastPct: 100, factor: 3 },
      { atLeastPct: 80, factor: 2.5 },
      { atLeastPct: 60, factor: 2 },
      { atLeastPct: 40, factor: 1.5 },
      { atLeastPct: 0, factor: 1 },
    ],
  };
  const at = (selfHpPct: number) =>
    evaluateHitModifiers(regidrago, { correct: true, oppType: [], oppSpecies: 1, selfHpPct }).factor;

  it("slides down the ladder as Regidrago loses HP", () => {
    expect(at(1)).toBe(3); // full
    expect(at(0.9)).toBe(2.5); // >=80
    expect(at(0.8)).toBe(2.5); // boundary is inclusive
    expect(at(0.7)).toBe(2); // >=60
    expect(at(0.5)).toBe(1.5); // >=40
    expect(at(0.2)).toBe(1); // spent
    expect(at(0.01)).toBe(1);
  });

  it("falls back to the flat factor when the caller carries no HP", () => {
    expect(
      evaluateHitModifiers(regidrago, { correct: true, oppType: [], oppSpecies: 1 }).factor,
    ).toBe(1);
  });

  it("leaves rows without hpTiers alone", () => {
    const flat: DamageMultiplierSpec = {
      type: "damage_multiplier",
      factor: 2,
      condition: { on: "always" },
    };
    expect(
      evaluateHitModifiers(flat, { correct: true, oppType: [], oppSpecies: 1, selfHpPct: 0.1 })
        .factor,
    ).toBe(2);
  });
});

describe("pvp-combat: engine damage multipliers", () => {
  const ctx = { correct: true, oppType: ["water"], oppSpecies: 800 };

  it("is neutral with no spec, or on a wrong answer", () => {
    expect(evaluateHitModifiers(null, ctx)).toEqual(NO_SIGNATURE_HIT_MODIFIERS);
    const spec: DamageMultiplierSpec = {
      type: "damage_multiplier",
      factor: 2,
      condition: { on: "opponent_type", typeName: "water" },
    };
    expect(evaluateHitModifiers(spec, { ...ctx, correct: false })).toEqual(
      NO_SIGNATURE_HIT_MODIFIERS,
    );
  });

  it("applies the factor only when the condition holds", () => {
    const spec: DamageMultiplierSpec = {
      type: "damage_multiplier",
      factor: 2,
      condition: { on: "opponent_type", typeName: "water" },
    };
    expect(evaluateHitModifiers(spec, ctx).factor).toBe(2);
    expect(evaluateHitModifiers(spec, { ...ctx, oppType: ["fire"] }).factor).toBe(1);
  });

  it("falls back to fallbackFactor when the condition fails", () => {
    const spec: DamageMultiplierSpec = {
      type: "damage_multiplier",
      factor: 2.5,
      fallbackFactor: 0.5,
      condition: { on: "opponent_species", dexId: 800 },
    };
    expect(evaluateHitModifiers(spec, ctx).factor).toBe(2.5);
    expect(evaluateHitModifiers(spec, { ...ctx, oppSpecies: 1 }).factor).toBe(0.5);
  });

  // Solgaleo #791 is the row that forces the two axes apart: ignore Defense in
  // EVERY battle, but x2 only into Lunala. A single `always` condition can't say both.
  it("ignoreDefenseAlways applies even when the conditional factor does not", () => {
    const solgaleo: DamageMultiplierSpec = {
      type: "damage_multiplier",
      factor: 2,
      ignoreDefenseAlways: true,
      condition: { on: "opponent_species", dexId: 792 }, // Lunala
    };
    const vsLunala = evaluateHitModifiers(solgaleo, { ...ctx, oppSpecies: 792 });
    expect(vsLunala).toEqual({ factor: 2, ignoreDefense: true });
    const vsOther = evaluateHitModifiers(solgaleo, { ...ctx, oppSpecies: 1 });
    expect(vsOther).toEqual({ factor: 1, ignoreDefense: true });
  });

  it("conditional ignoreDefense drops when the condition fails", () => {
    const spec: DamageMultiplierSpec = {
      type: "damage_multiplier",
      factor: 2,
      ignoreDefense: true,
      condition: { on: "opponent_type", typeName: "water" },
    };
    expect(evaluateHitModifiers(spec, ctx).ignoreDefense).toBe(true);
    expect(evaluateHitModifiers(spec, { ...ctx, oppType: ["fire"] }).ignoreDefense).toBe(false);
  });
});

describe("pvp-combat: question-indexed outgoing damage (M5)", () => {
  const engineOf = (dex: number) => SIGNATURE_ABILITIES[dex].engine!;
  const at = (dex: number, questionNo: number, hp?: { selfHpPct: number; oppHpPct: number }) =>
    evaluateIndexFactor(engineOf(dex), { correct: true, questionNo, ...hp });

  it("Blacephalon #806 opens on x5 and then burns out to 75% for the rest of the battle", () => {
    expect(at(806, 1)).toBe(5);
    // The owner's correction: 75% covers questions 2 THROUGH 19, not just q19.
    for (let q = 2; q <= 19; q++) expect(at(806, q), `q${q}`).toBe(0.75);
    // q20 is off the end of the spec — neutral, not 75%.
    expect(at(806, 20)).toBe(1);
  });

  it("Giratina #487 doubles on its two marked questions only", () => {
    expect(at(487, 2)).toBe(2);
    expect(at(487, 12)).toBe(2);
    expect(at(487, 3)).toBe(1);
    // q1/q11 are the DEFENSIVE marks (receiveDamagePct) — they must not touch
    // Giratina's own outgoing damage.
    expect(at(487, 1)).toBe(1);
    expect(at(487, 11)).toBe(1);
  });

  it("Naganadel #803 charges at 50% then triples on the payoff question", () => {
    for (let q = 1; q <= 5; q++) expect(at(803, q), `q${q}`).toBe(0.5);
    expect(at(803, 6)).toBe(3);
    expect(at(803, 7)).toBe(1);
  });

  it("a zero phase window really is zero, not the 1-HP damage floor", () => {
    expect(at(805, 1)).toBe(0);
    const { dmg } = computePvpDamage({
      streak: 5,
      speedRatio: 1,
      attackStage: 3,
      defenseStage: 0,
      critStage: 0,
      firstHalf: true,
      outgoingFactor: 0,
      rng: () => 1,
    });
    expect(dmg).toBe(0);
  });

  it("Regigigas #486 only pays off while it is behind on HP", () => {
    expect(at(486, 4, { selfHpPct: 0.3, oppHpPct: 0.9 })).toBe(2.5);
    expect(at(486, 4, { selfHpPct: 0.9, oppHpPct: 0.3 })).toBe(1);
    // No HP supplied → the gate cannot be shown to hold, so no payoff.
    expect(at(486, 4)).toBe(1);
  });

  it("is inert on a wrong answer and on rows with no indexed damage", () => {
    expect(evaluateIndexFactor(engineOf(806), { correct: false, questionNo: 1 })).toBe(1);
    expect(evaluateIndexFactor(engineOf(1001), { correct: true, questionNo: 1 })).toBe(1);
    expect(evaluateIndexFactor(null, { correct: true, questionNo: 1 })).toBe(1);
  });

  it("reads the payoff question off the spec, explicit or implied", () => {
    expect(phasePayoffIndex({ type: "phase_window", windowN: 3, scaleToPct: 0 })).toBe(4);
    expect(
      phasePayoffIndex({ type: "phase_window", windowN: 5, scaleToPct: 50, payoffAtIndex: 6 }),
    ).toBe(6);
  });
});

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
