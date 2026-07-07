import { describe, expect, it } from "vitest";
import {
  SIGNATURE_ABILITIES,
  signatureAbilityFor,
  signatureMoveName,
  describeSignatureEffect,
  evaluateHitModifiers,
  evaluatePostAnswer,
  evaluatePassiveDamageSideEffects,
  evaluateBattleStart,
  hasServerManualEffect,
  hasClientManualHit,
  manualHitModifiers,
  mergeHitModifiers,
  manualUsesPerBattle,
  SERVER_FIREABLE_MANUAL_IDS,
  CLIENT_HIT_MANUAL_IDS,
  checkCatalogIntegrity,
  NO_HIT_MODIFIERS,
  resolveMewTransform,
  MEW_ID,
  NON_MASCOT_ABILITY_IDS,
  RATING_THREE_ABILITY_IDS,
  type SignatureContext,
  type SignatureAbility,
  type StatStageEffect,
  type StatusEffect,
} from "./signature-abilities";
import { ALL_LEGENDARY_MYTHICAL_IDS, isMascotTier } from "./legendary-data";

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
    questionCategory: "Science",
    pokedexCount: 0,
    oppDefenseStage: 0,
    ...over,
  };
}

describe("catalog integrity", () => {
  it("has exactly one entry per real Legendary/Mythical id, with unique internalKeys", () => {
    expect(checkCatalogIntegrity(ALL_LEGENDARY_MYTHICAL_IDS)).toEqual([]);
  });

  it("covers all 104 roster ids", () => {
    expect(ALL_LEGENDARY_MYTHICAL_IDS.length).toBe(104);
    expect(Object.keys(SIGNATURE_ABILITIES).length).toBe(104);
  });

  it("the 8 formerly-missing species now have ability entries", () => {
    const added = [772, 773, 1009, 1010, 1020, 1021, 1022, 1023];
    for (const id of added) {
      expect(SIGNATURE_ABILITIES[id]).toBeTruthy();
      expect(SIGNATURE_ABILITIES[id].pokemonId).toBe(id);
    }
    expect(SIGNATURE_ABILITIES[772].signatureMove).toBe("Multi-Attack");
    expect(SIGNATURE_ABILITIES[1023].signatureMove).toBe("Tachyon Cutter");
  });

  it("both Calyrex Rider formes are distinct hatchable entries", () => {
    // Ice Rider keeps dex 898; Shadow Rider gets synthetic id 10194.
    expect(SIGNATURE_ABILITIES[898].signatureMove).toBe("Glacial Lance");
    expect(SIGNATURE_ABILITIES[898].internalKey).toBe("as_one_glacial_reign");
    expect(SIGNATURE_ABILITIES[10194].signatureMove).toBe("Astral Barrage");
    expect(SIGNATURE_ABILITIES[10194].internalKey).toBe("as_one_spectral_reign");
    expect(SIGNATURE_ABILITIES[898].internalKey).not.toBe(SIGNATURE_ABILITIES[10194].internalKey);
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

  it("Zekrom's Blue Flare damage-calc bonus is deterministic on any first-half correct answer (no chance)", () => {
    expect(SIGNATURE_ABILITIES[643].trigger).toEqual({ type: "first_half_answer" });
    const early = evaluateHitModifiers(SIGNATURE_ABILITIES[643], ctx({ answerElapsedMs: 1000, personalTimerMs: 20000 }));
    const late = evaluateHitModifiers(SIGNATURE_ABILITIES[643], ctx({ answerElapsedMs: 19000, personalTimerMs: 20000 }));
    expect(early.bonusAttackStage).toBe(1);
    expect(early.bonusCritStage).toBe(1);
    expect(late).toEqual(NO_HIT_MODIFIERS);
  });

  it("Regice's Blizzard is now a post_answer opponent Speed debuff, not a hamper", () => {
    expect(SIGNATURE_ABILITIES[378].wiring).toBe("post_answer");
    const fx = evaluatePostAnswer(SIGNATURE_ABILITIES[378], ctx({ streak: 4 }));
    expect(fx).toEqual([{ type: "stat_stage", target: "opponent", stat: "speed", delta: -1, duration: 2 }]);
    expect(evaluatePostAnswer(SIGNATURE_ABILITIES[378], ctx({ streak: 3 }))).toEqual([]);
  });
});

describe("evaluatePassiveDamageSideEffects (dropped compound sub-effects, fix #3)", () => {
  it("Raikou's Thunder bundles a +1 Speed side effect on the same 4th-question hit", () => {
    const fx = evaluatePassiveDamageSideEffects(
      SIGNATURE_ABILITIES[243],
      ctx({ questionIndex: 3, prevCorrect: true }),
    );
    expect(fx).toEqual([{ type: "stat_stage", target: "self", stat: "speed", delta: 1, duration: 1 }]);
    // Whiffs when the hit trigger itself doesn't hold (previous answer wrong).
    expect(evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[243], ctx({ questionIndex: 3, prevCorrect: false }))).toEqual([]);
  });

  it("Deoxys' Psycho Boost and Magearna's Fleur Cannon bundle a -1 Attack recoil on the nuke hit", () => {
    for (const id of [386, 801]) {
      const fx = evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[id], ctx({ questionIndex: 4 }));
      expect(fx).toEqual([{ type: "stat_stage", target: "self", stat: "attack", delta: -1, duration: 2 }]);
    }
  });

  it("Zekrom's Burn and Melmetal's Sleep roll their documented chance", () => {
    const zekromLands = evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[643], ctx({ answerElapsedMs: 1000 }), () => 0.1);
    const zekromWhiffs = evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[643], ctx({ answerElapsedMs: 1000 }), () => 0.9);
    expect(zekromLands).toEqual([{ type: "status", target: "opponent", status: "burn", questions: 3, chance: 0.4 }]);
    expect(zekromWhiffs).toEqual([]);

    const melmetalLands = evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[809], ctx({ questionIndex: 4 }), () => 0.1);
    const melmetalWhiffs = evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[809], ctx({ questionIndex: 4 }), () => 0.9);
    expect(melmetalLands).toEqual([{ type: "status", target: "opponent", status: "sleep", questions: 1, chance: 0.3 }]);
    expect(melmetalWhiffs).toEqual([]);
  });

  it("produces nothing on a wrong answer, when the hit trigger doesn't hold, or for non-passive_damage abilities", () => {
    expect(evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[243], ctx({ questionIndex: 3, correct: false }))).toEqual([]);
    expect(evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[243], ctx({ questionIndex: 2 }))).toEqual([]);
    expect(evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[638], ctx())).toEqual([]); // Cobalion has no bundled sub-effect
    expect(evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[245], ctx())).toEqual([]); // post_answer, not passive_damage
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

describe("manual charge-and-fire abilities", () => {
  it("exposes a Fire button only for manual abilities with a server effect", () => {
    // Aeroblast (249) fires -2 opp Speed → server-fireable.
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[249])).toBe(true);
    // Psystrike (150) fires a damage-calc one-hit modifier → NOT server-fireable.
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[150])).toBe(false);
    // Dragon Ascent (384) is damage-calc only after the refactor → not fireable.
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[384])).toBe(false);
    // Non-manual abilities are never server-fireable.
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[638])).toBe(false);
    expect(hasServerManualEffect(null)).toBe(false);
  });

  it("reports the per-battle use cap", () => {
    expect(manualUsesPerBattle(SIGNATURE_ABILITIES[249])).toBe(2); // Aeroblast
    expect(manualUsesPerBattle(SIGNATURE_ABILITIES[380])).toBe(1); // Mist Ball
    expect(manualUsesPerBattle(SIGNATURE_ABILITIES[638])).toBe(0); // passive
  });

  it("SERVER_FIREABLE_MANUAL_IDS matches the server-catalogued manual abilities", () => {
    // Includes Phase 2 additions Cresselia (488, cleanse) / Manaphy (490,
    // swap_stages) and the Phase 4 ability-suppressors Heatran (485),
    // Zygarde (718), Regieleki (894) and Pecharunt (1025).
    expect([...SERVER_FIREABLE_MANUAL_IDS]).toEqual([
      249, 380, 381, 483, 484, 485, 488, 490, 491, 492, 648, 718, 894, 1002, 1003, 1024, 1025,
    ]);
  });

  it("the four ability-suppressors are wired as server-fireable manual (Phase 4)", () => {
    for (const id of [485, 718, 894, 1025]) {
      expect(SIGNATURE_ABILITIES[id].wiring).toBe("manual");
      expect(hasServerManualEffect(SIGNATURE_ABILITIES[id])).toBe(true);
      expect(manualUsesPerBattle(SIGNATURE_ABILITIES[id])).toBe(1);
      // They arm no client-side one-hit modifier — the server owns the fire.
      expect(manualHitModifiers(SIGNATURE_ABILITIES[id])).toBeNull();
    }
  });

  it("Cresselia (488) and Manaphy (490) are now server-fireable manual, not bespoke", () => {
    expect(SIGNATURE_ABILITIES[488].wiring).toBe("manual");
    expect(SIGNATURE_ABILITIES[488].effect).toEqual({ type: "cleanse", hpCostPct: 15 });
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[488])).toBe(true);
    expect(manualHitModifiers(SIGNATURE_ABILITIES[488])).toBeNull(); // server owns the fire

    expect(SIGNATURE_ABILITIES[490].wiring).toBe("manual");
    expect(SIGNATURE_ABILITIES[490].effect).toEqual({ type: "swap_stages" });
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[490])).toBe(true);
    expect(manualHitModifiers(SIGNATURE_ABILITIES[490])).toBeNull();
  });
});

describe("question-category trigger primitive (Phase 3)", () => {
  it("Koraidon's Collision Course spikes only on the first correct of a NEW category", () => {
    const koraidon = SIGNATURE_ABILITIES[1007];
    expect(koraidon.wiring).toBe("passive_damage");
    expect(koraidon.trigger).toEqual({ type: "new_category" });
    const spike = evaluateHitModifiers(koraidon, ctx({ newCategory: true }));
    expect(spike).toMatchObject({ bonusAttackStage: 1, bonusCritStage: 1 });
    const repeat = evaluateHitModifiers(koraidon, ctx({ newCategory: false }));
    expect(repeat).toEqual(NO_HIT_MODIFIERS);
    // Only on correct answers.
    expect(evaluateHitModifiers(koraidon, ctx({ newCategory: true, correct: false }))).toEqual(
      NO_HIT_MODIFIERS,
    );
  });

  it("question_category_is fires a post_answer effect only when the category matches", () => {
    const probe: SignatureAbility = {
      pokemonId: 999999,
      signatureMove: "Probe",
      internalKey: "probe_category",
      rarity: 1,
      trigger: { type: "question_category_is", category: "History" },
      effect: { type: "stat_stage", target: "self", stat: "attack", delta: 1, duration: "passive" },
      wiring: "post_answer",
    };
    expect(evaluatePostAnswer(probe, ctx({ questionCategory: "History" })).length).toBe(1);
    expect(evaluatePostAnswer(probe, ctx({ questionCategory: "Science" })).length).toBe(0);
    // Not on a wrong answer.
    expect(
      evaluatePostAnswer(probe, ctx({ questionCategory: "History", correct: false })).length,
    ).toBe(0);
  });
});

describe("client-armed one-hit manual abilities (Psystrike / Dragon Ascent / Shadow Force)", () => {
  it("Psystrike arms an ignore-defense + ignore-own-negatives one-hit modifier", () => {
    const mods = manualHitModifiers(SIGNATURE_ABILITIES[150]);
    expect(mods).not.toBeNull();
    expect(mods!.ignoreOppDefenseStage).toBe(true);
    expect(mods!.ignoreOwnNegativeStages).toBe(true);
    expect(hasClientManualHit(SIGNATURE_ABILITIES[150])).toBe(true);
  });

  it("Dragon Ascent arms +3 Crit / +1 Attack for one hit", () => {
    const mods = manualHitModifiers(SIGNATURE_ABILITIES[384]);
    expect(mods).toMatchObject({ bonusCritStage: 3, bonusAttackStage: 1 });
  });

  it("Giratina's Shadow Force arms ignore-defense + 2 Crit for one hit", () => {
    const mods = manualHitModifiers(SIGNATURE_ABILITIES[487]);
    expect(mods).toMatchObject({ ignoreOppDefenseStage: true, bonusCritStage: 2 });
  });

  it("server-fireable and passive manual/other abilities do NOT arm a client hit", () => {
    expect(manualHitModifiers(SIGNATURE_ABILITIES[249])).toBeNull(); // Aeroblast (server)
    expect(manualHitModifiers(SIGNATURE_ABILITIES[484])).toBeNull(); // Spacial Rend (server)
    expect(manualHitModifiers(SIGNATURE_ABILITIES[638])).toBeNull(); // Cobalion (passive)
    expect(manualHitModifiers(null)).toBeNull();
  });

  it("CLIENT_HIT_MANUAL_IDS is exactly the three damage-calc manual moves", () => {
    expect([...CLIENT_HIT_MANUAL_IDS]).toEqual([150, 384, 487]);
  });

  it("mergeHitModifiers folds an armed modifier on top of passive modifiers", () => {
    const merged = mergeHitModifiers(
      { ...NO_HIT_MODIFIERS, bonusCritStage: 1 },
      { ...NO_HIT_MODIFIERS, bonusCritStage: 2, ignoreOppDefenseStage: true },
    );
    expect(merged.bonusCritStage).toBe(3);
    expect(merged.ignoreOppDefenseStage).toBe(true);
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

describe("Mew — Transform copy resolution (Phase 2)", () => {
  const rng = (v: number) => () => v;

  it("copies a non-mascot opponent ability outright", () => {
    // 244 Entei (rarity 3, non-mascot) — copied as-is.
    expect(resolveMewTransform(244, rng(0.5))).toBe(244);
    // 718 Zygarde (rarity 3, non-mascot).
    expect(resolveMewTransform(718, rng(0.1))).toBe(718);
  });

  it("cannot copy a mascot (rating-5) ability — rolls a random rating-3 instead", () => {
    // 384 Rayquaza is mascot rating-5. Result must be a rating-3 id, never 384.
    const picked = resolveMewTransform(384, rng(0));
    expect(picked).not.toBe(384);
    expect(RATING_THREE_ABILITY_IDS).toContain(picked);
    expect(SIGNATURE_ABILITIES[picked!].rarity).toBe(3);
    // A different rng lands on a different rating-3 id (deterministic pick).
    const last = resolveMewTransform(384, rng(0.999));
    expect(RATING_THREE_ABILITY_IDS).toContain(last);
  });

  it("with no opponent ability (non-legendary or unknown), gains a random non-mascot roster ability", () => {
    const a = resolveMewTransform(null, rng(0));
    const b = resolveMewTransform(undefined, rng(0.999));
    for (const picked of [a, b]) {
      expect(picked).not.toBeNull();
      expect(NON_MASCOT_ABILITY_IDS).toContain(picked);
      // never a mascot-tier ability, never Mew itself.
      expect(picked).not.toBe(MEW_ID);
      expect(isMascotTier(picked!) && SIGNATURE_ABILITIES[picked!].rarity >= 5).toBe(false);
    }
    // A pikachu-tier non-legendary partner id (25) has no ability → fallback.
    expect(NON_MASCOT_ABILITY_IDS).toContain(resolveMewTransform(25, rng(0.3)));
  });

  it("never copies Mew itself, and both pools exclude Mew and mascots", () => {
    expect(NON_MASCOT_ABILITY_IDS).not.toContain(MEW_ID);
    expect(RATING_THREE_ABILITY_IDS).not.toContain(MEW_ID);
    // Every id the copy can resolve to is a real catalog entry.
    for (const id of [...NON_MASCOT_ABILITY_IDS, ...RATING_THREE_ABILITY_IDS]) {
      expect(SIGNATURE_ABILITIES[id]).toBeDefined();
    }
  });
});

describe("describeSignatureEffect", () => {
  it("describes self stat-stage bumps plainly", () => {
    // 1017 Ogerpon — Ivy Cudgel: battle_start +1 Crit.
    expect(describeSignatureEffect(1017)).toBe("+1 Crit");
    // 382 Kyogre — Origin Pulse: compound +1 Attack, +1 Speed.
    expect(describeSignatureEffect(382)).toBe("+1 Attack, +1 Speed");
  });

  it("describes opponent-targeted stat drops with the − glyph and 'opponent'", () => {
    // 1001 Wo-Chien — Ruination: standing -1 opponent Attack.
    expect(describeSignatureEffect(1001)).toBe("−1 opponent Attack");
  });

  it("describes inflicted statuses", () => {
    // 244 Entei — Sacred Fire: on-correct Burn.
    expect(describeSignatureEffect(244)).toBe("inflicts Burn");
    // 648 Meloetta — Relic Song: +1 Attack, then Sleep on the opponent.
    expect(describeSignatureEffect(648)).toBe("+1 Attack, inflicts Sleep");
  });

  it("describes heals, drains, and swaps", () => {
    // 717 Yveltal — Oblivion Wing: drain 2 HP.
    expect(describeSignatureEffect(717)).toBe("drains 2 HP");
    // 893 Zarude — Jungle Healing: heal 8 + cure.
    expect(describeSignatureEffect(893)).toBe("heals 8 HP, cures status");
    // 490 Manaphy — Heart Swap.
    expect(describeSignatureEffect(490)).toBe("swaps stat changes");
  });

  it("reuses the hit-modifier phrasing for pure damage-calc abilities", () => {
    // 144 Articuno — Freeze-Dry: ignore opponent Defense.
    expect(describeSignatureEffect(144)).toBe("ignores their Defense");
  });

  it("returns null for a non-legendary partner or a purely-bespoke effect", () => {
    expect(describeSignatureEffect(25)).toBeNull();
    expect(describeSignatureEffect(null)).toBeNull();
    // 789 Cosmog — Splash: deliberate no-op (bespoke effect).
    expect(describeSignatureEffect(789)).toBeNull();
  });
});
