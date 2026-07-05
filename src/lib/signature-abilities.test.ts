import { describe, expect, it } from "vitest";
import {
  SIGNATURE_ABILITIES,
  signatureAbilityFor,
  signatureMoveName,
  evaluateHitModifiers,
  evaluatePostAnswer,
  evaluateBattleStart,
  checkCatalogIntegrity,
  NO_HIT_MODIFIERS,
  type SignatureContext,
  type StatStageEffect,
  type StatusEffect,
} from "./signature-abilities";
import { ALL_LEGENDARY_MYTHICAL_IDS } from "./legendary-data";

function ctx(over: Partial<SignatureContext> = {}): SignatureContext {
  return {
    questionIndex: 0,
    correct: true,
    prevCorrect: true,
    streak: 1,
    streakBefore: 0,
    correctCount: 1,
    answerElapsedMs: 5000,
    prevAnswerElapsedMs: 5000,
    personalTimerMs: 20000,
    selfHpPct: 1,
    oppHpPct: 1,
    newCategory: false,
    pokedexCount: 0,
    oppDefenseStage: 0,
    ...over,
  };
}

describe("catalog integrity", () => {
  it("has exactly one entry per real Legendary/Mythical id, with unique internalKeys", () => {
    expect(checkCatalogIntegrity(ALL_LEGENDARY_MYTHICAL_IDS)).toEqual([]);
  });

  it("covers all 95 roster ids", () => {
    expect(ALL_LEGENDARY_MYTHICAL_IDS.length).toBe(95);
    expect(Object.keys(SIGNATURE_ABILITIES).length).toBe(95);
  });

  it("the four Sacred Sword users all display 'Sacred Sword' but have distinct internalKeys", () => {
    const swords = [638, 639, 640, 647].map((id) => SIGNATURE_ABILITIES[id]);
    expect(swords.every((a) => a.signatureMove === "Sacred Sword")).toBe(true);
    expect(new Set(swords.map((a) => a.internalKey)).size).toBe(4);
  });

  it("Keldeo's Sacred Sword and Fezandipiti's pokedex scaling match the v2 corrections", () => {
    expect(SIGNATURE_ABILITIES[647].signatureMove).toBe("Sacred Sword");
    const fez = SIGNATURE_ABILITIES[1016];
    expect(fez.trigger).toEqual({ type: "pokedex_scaling", per: 25, max: 3 });
  });
});

describe("gating", () => {
  it("only Legendary/Mythical partners get an ability", () => {
    expect(signatureAbilityFor(25)).toBeNull(); // Pikachu
    expect(signatureAbilityFor(150)?.signatureMove).toBe("Psystrike"); // Mewtwo
    expect(signatureAbilityFor(null)).toBeNull();
  });

  it("signatureMoveName returns the UI name, never the internalKey", () => {
    expect(signatureMoveName(150)).toBe("Psystrike");
    expect(SIGNATURE_ABILITIES[150].internalKey).toBe("psystrike");
    expect(signatureMoveName(25)).toBeNull();
  });
});

describe("evaluateHitModifiers (passive_damage family)", () => {
  it("Cobalion ignores both own negative stages and opp Defense, always", () => {
    const m = evaluateHitModifiers(SIGNATURE_ABILITIES[638], ctx());
    expect(m.ignoreOppDefenseStage).toBe(true);
    expect(m.ignoreOwnNegativeStages).toBe(true);
  });

  it("returns nothing on a wrong answer", () => {
    expect(evaluateHitModifiers(SIGNATURE_ABILITIES[638], ctx({ correct: false }))).toEqual(
      NO_HIT_MODIFIERS,
    );
  });

  it("Articuno's Freeze-Dry only ignores Defense while opp Def stage > 0", () => {
    expect(evaluateHitModifiers(SIGNATURE_ABILITIES[144], ctx({ oppDefenseStage: 0 })).ignoreOppDefenseStage).toBe(false);
    expect(evaluateHitModifiers(SIGNATURE_ABILITIES[144], ctx({ oppDefenseStage: 2 })).ignoreOppDefenseStage).toBe(true);
  });

  it("Regirock's Stone Edge grants +2 crit only on a last-3s answer", () => {
    const early = evaluateHitModifiers(SIGNATURE_ABILITIES[377], ctx({ answerElapsedMs: 1000 }));
    const clutch = evaluateHitModifiers(SIGNATURE_ABILITIES[377], ctx({ answerElapsedMs: 18000 }));
    expect(early.bonusCritStage).toBe(0);
    expect(clutch.bonusCritStage).toBe(2);
  });

  it("Raikou's Thunder fires every 4th question only when the previous answer was correct", () => {
    const charged = evaluateHitModifiers(SIGNATURE_ABILITIES[243], ctx({ questionIndex: 3, prevCorrect: true }));
    const whiff = evaluateHitModifiers(SIGNATURE_ABILITIES[243], ctx({ questionIndex: 3, prevCorrect: false }));
    const off = evaluateHitModifiers(SIGNATURE_ABILITIES[243], ctx({ questionIndex: 2, prevCorrect: true }));
    expect(charged.bonusCritStage).toBe(2);
    expect(whiff.bonusCritStage).toBe(0);
    expect(off.bonusCritStage).toBe(0);
  });

  it("Deoxys' Psycho Boost gives +3 Attack this hit every 5th question", () => {
    const m = evaluateHitModifiers(SIGNATURE_ABILITIES[386], ctx({ questionIndex: 4 }));
    expect(m.bonusAttackStage).toBe(3);
  });

  it("Melmetal's Double Iron Bash adds a half-value second hit every 5th question", () => {
    const m = evaluateHitModifiers(SIGNATURE_ABILITIES[809], ctx({ questionIndex: 4 }));
    expect(m.secondHitFraction).toBe(0.5);
  });
});

describe("evaluatePostAnswer (post_answer family)", () => {
  it("Suicune's Aurora Veil grants +1 Defense on a live 3+ streak", () => {
    const none = evaluatePostAnswer(SIGNATURE_ABILITIES[245], ctx({ streak: 2 }));
    const fired = evaluatePostAnswer(SIGNATURE_ABILITIES[245], ctx({ streak: 3 }));
    expect(none).toEqual([]);
    const def = fired.find((e): e is StatStageEffect => e.type === "stat_stage" && e.stat === "defense");
    expect(def?.delta).toBe(1);
  });

  it("Meltan's Flash Cannon grants +1 Attack every 3rd correct answer", () => {
    expect(evaluatePostAnswer(SIGNATURE_ABILITIES[808], ctx({ correctCount: 2 }))).toEqual([]);
    const fired = evaluatePostAnswer(SIGNATURE_ABILITIES[808], ctx({ correctCount: 3 }));
    expect((fired[0] as StatStageEffect).delta).toBe(1);
  });

  it("Entei's Sacred Fire rolls a 40% Burn on correct answers", () => {
    const lands = evaluatePostAnswer(SIGNATURE_ABILITIES[244], ctx(), () => 0.1);
    const whiffs = evaluatePostAnswer(SIGNATURE_ABILITIES[244], ctx(), () => 0.9);
    expect((lands[0] as StatusEffect).status).toBe("burn");
    expect(whiffs).toEqual([]);
  });

  it("Thundurus' Wildbolt Storm is a 50% Paralysis on a 6-question cooldown", () => {
    const offCd = evaluatePostAnswer(SIGNATURE_ABILITIES[642], ctx({ questionIndex: 4 }), () => 0.1);
    const onCdLands = evaluatePostAnswer(SIGNATURE_ABILITIES[642], ctx({ questionIndex: 5 }), () => 0.1);
    const onCdWhiff = evaluatePostAnswer(SIGNATURE_ABILITIES[642], ctx({ questionIndex: 5 }), () => 0.9);
    expect(offCd).toEqual([]);
    expect((onCdLands[0] as StatusEffect).status).toBe("paralysis");
    expect(onCdWhiff).toEqual([]);
  });

  it("Zapdos' Thunderous Kick fires on a fast sub-5s pair (opp -1 Def + scramble)", () => {
    const slow = evaluatePostAnswer(SIGNATURE_ABILITIES[145], ctx({ answerElapsedMs: 6000 }));
    const fast = evaluatePostAnswer(
      SIGNATURE_ABILITIES[145],
      ctx({ answerElapsedMs: 3000, prevAnswerElapsedMs: 3000, prevCorrect: true }),
    );
    expect(slow).toEqual([]);
    expect(fast.some((e) => e.type === "stat_stage" && e.target === "opponent")).toBe(true);
    expect(fast.some((e) => e.type === "hamper")).toBe(true);
  });

  it("Yveltal's Oblivion Wing drains on every correct answer", () => {
    const fired = evaluatePostAnswer(SIGNATURE_ABILITIES[717], ctx());
    expect(fired.some((e) => e.type === "drain")).toBe(true);
    expect(evaluatePostAnswer(SIGNATURE_ABILITIES[717], ctx({ correct: false }))).toEqual([]);
  });

  it("passive_damage and manual abilities produce no post-answer effects", () => {
    expect(evaluatePostAnswer(SIGNATURE_ABILITIES[638], ctx())).toEqual([]); // Cobalion (passive_damage)
    expect(evaluatePostAnswer(SIGNATURE_ABILITIES[150], ctx())).toEqual([]); // Mewtwo (manual)
  });
});

describe("evaluateBattleStart (battle_start family)", () => {
  it("Registeel takes a standing +1 Defense at battle start", () => {
    const fx = evaluateBattleStart(SIGNATURE_ABILITIES[379], 0);
    expect((fx[0] as StatStageEffect)).toMatchObject({ target: "self", stat: "defense", delta: 1 });
  });

  it("Wo-Chien puts a standing -1 Attack on the opponent", () => {
    const fx = evaluateBattleStart(SIGNATURE_ABILITIES[1001], 0);
    expect((fx[0] as StatStageEffect)).toMatchObject({ target: "opponent", stat: "attack", delta: -1 });
  });

  it("Fezandipiti's Beat Up scales +1 Attack per 25 Pokédex entries (max +3)", () => {
    expect(evaluateBattleStart(SIGNATURE_ABILITIES[1016], 10)).toEqual([]);
    expect((evaluateBattleStart(SIGNATURE_ABILITIES[1016], 60)[0] as StatStageEffect).delta).toBe(2);
    expect((evaluateBattleStart(SIGNATURE_ABILITIES[1016], 200)[0] as StatStageEffect).delta).toBe(3);
  });

  it("Cosmoem's Cosmic Power locks +2 Def / -1 Atk at start", () => {
    const fx = evaluateBattleStart(SIGNATURE_ABILITIES[790], 0) as StatStageEffect[];
    expect(fx.find((e) => e.stat === "defense")?.delta).toBe(2);
    expect(fx.find((e) => e.stat === "attack")?.delta).toBe(-1);
  });
});

describe("bespoke & doc-gap bookkeeping", () => {
  it("the 5 roster ids with no v2 doc entry are flagged docGap", () => {
    const gaps = [494, 803, 804, 805, 806];
    for (const id of gaps) expect(SIGNATURE_ABILITIES[id].docGap).toBe(true);
    // ...and nothing else is.
    const flagged = Object.values(SIGNATURE_ABILITIES).filter((a) => a.docGap);
    expect(flagged.map((a) => a.pokemonId).sort((a, b) => a - b)).toEqual(gaps);
  });

  it("Mew's Transform is bespoke (copy opponent ability at start)", () => {
    expect(SIGNATURE_ABILITIES[151].wiring).toBe("bespoke");
  });
});
