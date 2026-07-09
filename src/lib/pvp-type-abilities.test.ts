import { describe, it, expect } from "vitest";
import { ABILITY_SETS } from "@/lib/abilities";
import type { AbilityId } from "@/lib/abilities";
import {
  typeAbilityPvp,
  typeAbilityDamageMod,
  typeAbilitySelfDmgMod,
  typeAbilityPostAnswerFires,
  typeAbilityHasBattleStart,
  applyDamageMod,
  applySelfDmgMod,
  resolvePvpTypeAbilityId,
  type TypeAbilityCtx,
} from "@/lib/pvp-type-abilities";

const ALL_IDS = Object.values(ABILITY_SETS).flat().map((a) => a.id);

function ctx(over: Partial<TypeAbilityCtx> = {}): TypeAbilityCtx {
  return {
    correct: true,
    selfHpPct: 1,
    oppHpPct: 1,
    streakAfter: 1,
    answerElapsedMs: 8000,
    personalTimerMs: 20000,
    questionIndex: 0,
    prevCorrect: true,
    hadWrong: false,
    correctCount: 1,
    moxieStacks: 0,
    hasNegativeStatus: false,
    hasConfused: false,
    hasPoisoned: false,
    ...over,
  };
}

describe("pvp-type-abilities catalog", () => {
  it("has a PvP wiring entry for every ability id", () => {
    for (const id of ALL_IDS) {
      expect(typeAbilityPvp(id), `missing wiring for ${id}`).not.toBeNull();
    }
  });

  it("every entry carries an 'in play' note", () => {
    for (const id of ALL_IDS) {
      expect(typeAbilityPvp(id)!.note.length).toBeGreaterThan(0);
    }
  });

  it("returns null for an unknown/absent ability", () => {
    expect(typeAbilityPvp(null)).toBeNull();
    expect(typeAbilityPvp(undefined)).toBeNull();
  });
});

describe("client damage modifiers", () => {
  it("Flash Fire adds a flat +8% on every correct answer", () => {
    const mod = typeAbilityDamageMod("flash-fire", ctx());
    expect(mod.active).toBe(true);
    expect(applyDamageMod(100, mod)).toBe(108);
  });

  it("Blaze only fires below 40% HP", () => {
    expect(typeAbilityDamageMod("blaze", ctx({ selfHpPct: 0.5 })).active).toBe(false);
    expect(typeAbilityDamageMod("blaze", ctx({ selfHpPct: 0.3 })).active).toBe(true);
  });

  it("Overgrow only fires while the opponent is above half HP", () => {
    expect(typeAbilityDamageMod("overgrow", ctx({ oppHpPct: 0.4 })).active).toBe(false);
    expect(typeAbilityDamageMod("overgrow", ctx({ oppHpPct: 0.9 })).active).toBe(true);
  });

  it("Moxie scales with accumulated stacks", () => {
    const mod = typeAbilityDamageMod("moxie", ctx({ moxieStacks: 3 }));
    expect(applyDamageMod(10, mod)).toBe(13);
  });

  it("Swarm / Moonblast need a 3+ streak", () => {
    expect(typeAbilityDamageMod("swarm", ctx({ streakAfter: 2 })).active).toBe(false);
    expect(typeAbilityDamageMod("swarm", ctx({ streakAfter: 3 })).active).toBe(true);
    expect(applyDamageMod(10, typeAbilityDamageMod("moonblast", ctx({ streakAfter: 4 })))).toBe(14);
  });

  it("no damage modifier applies on a wrong answer", () => {
    expect(typeAbilityDamageMod("flash-fire", ctx({ correct: false })).active).toBe(false);
  });
});

describe("client self-damage modifiers", () => {
  it("Iron Barbs shaves a flat 3 off wrong-answer damage", () => {
    const mod = typeAbilitySelfDmgMod("iron-barbs", ctx({ correct: false }));
    expect(applySelfDmgMod(8, mod)).toBe(5);
  });

  it("Filter cuts wrong-answer damage by 25%", () => {
    const mod = typeAbilitySelfDmgMod("filter", ctx({ correct: false }));
    expect(applySelfDmgMod(8, mod)).toBe(6);
  });

  it("Multiscale halves wrong-answer damage only at full HP", () => {
    expect(applySelfDmgMod(8, typeAbilitySelfDmgMod("multiscale", ctx({ correct: false, selfHpPct: 1 })))).toBe(4);
    expect(applySelfDmgMod(8, typeAbilitySelfDmgMod("multiscale", ctx({ correct: false, selfHpPct: 0.5 })))).toBe(8);
  });

  it("Snow Cloak zeroes only the first wrong of the battle", () => {
    expect(applySelfDmgMod(8, typeAbilitySelfDmgMod("snow-cloak", ctx({ correct: false, hadWrong: false })))).toBe(0);
    expect(applySelfDmgMod(8, typeAbilitySelfDmgMod("snow-cloak", ctx({ correct: false, hadWrong: true })))).toBe(8);
  });

  it("random-chance guards honor a seeded rng", () => {
    const hit = typeAbilitySelfDmgMod("flame-body", ctx({ correct: false, rng: () => 0.05 }));
    const miss = typeAbilitySelfDmgMod("flame-body", ctx({ correct: false, rng: () => 0.9 }));
    expect(applySelfDmgMod(8, hit)).toBe(0);
    expect(applySelfDmgMod(8, miss)).toBe(8);
  });

  it("no self-damage modifier applies on a correct answer", () => {
    expect(typeAbilitySelfDmgMod("iron-barbs", ctx({ correct: true })).active).toBe(false);
  });
});

describe("server post_answer timing predicates", () => {
  it("Leech Seed heals on every correct answer", () => {
    expect(typeAbilityPostAnswerFires("leech-seed", ctx({ correct: true }))).toBe(true);
    expect(typeAbilityPostAnswerFires("leech-seed", ctx({ correct: false }))).toBe(false);
  });

  it("Ice Body heals only every 4th correct answer", () => {
    expect(typeAbilityPostAnswerFires("ice-body", ctx({ correct: true, correctCount: 4 }))).toBe(true);
    expect(typeAbilityPostAnswerFires("ice-body", ctx({ correct: true, correctCount: 3 }))).toBe(false);
  });

  it("Stealth Rock chips at the start of each 5-question round", () => {
    expect(typeAbilityPostAnswerFires("stealth-rock", ctx({ questionIndex: 5 }))).toBe(true);
    expect(typeAbilityPostAnswerFires("stealth-rock", ctx({ questionIndex: 0 }))).toBe(false);
    expect(typeAbilityPostAnswerFires("stealth-rock", ctx({ questionIndex: 7 }))).toBe(false);
  });

  it("Shadow Tag / Corrosion trigger on wrong answers", () => {
    expect(typeAbilityPostAnswerFires("shadow-tag", ctx({ correct: false }))).toBe(true);
    expect(typeAbilityPostAnswerFires("corrosion", ctx({ correct: true }))).toBe(false);
  });

  it("cures only fire when the matching status is present", () => {
    expect(typeAbilityPostAnswerFires("hydration", ctx({ hasConfused: true }))).toBe(true);
    expect(typeAbilityPostAnswerFires("hydration", ctx({ hasConfused: false, hasPoisoned: true }))).toBe(false);
    expect(typeAbilityPostAnswerFires("toxic", ctx({ hasPoisoned: true }))).toBe(true);
  });

  it("Pixie Dust heals each time a 3-streak lands", () => {
    expect(typeAbilityPostAnswerFires("pixie-dust", ctx({ correct: true, streakAfter: 3 }))).toBe(true);
    expect(typeAbilityPostAnswerFires("pixie-dust", ctx({ correct: true, streakAfter: 4 }))).toBe(false);
  });
});

describe("battle-start abilities", () => {
  it("stat-mover abilities are flagged for a battle-start server effect", () => {
    for (const id of ["adaptable", "intimidate", "swift-swim", "sand-veil", "aerilate"] as AbilityId[]) {
      expect(typeAbilityHasBattleStart(id), id).toBe(true);
    }
    expect(typeAbilityHasBattleStart("flash-fire")).toBe(false);
  });
});

describe("resolvePvpTypeAbilityId", () => {
  it("falls back to the primary type's legacy ability when no roll is stored", () => {
    expect(resolvePvpTypeAbilityId(["fire"], null)).toBe(ABILITY_SETS.fire[0].id);
  });
  it("honors a stored roll", () => {
    expect(resolvePvpTypeAbilityId(["fire"], "blaze")).toBe("blaze");
  });
  it("returns null without types", () => {
    expect(resolvePvpTypeAbilityId([], null)).toBeNull();
    expect(resolvePvpTypeAbilityId(undefined, null)).toBeNull();
  });
});
