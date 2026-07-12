import { describe, expect, it } from "vitest";
import {
  SIGNATURE_ABILITIES,
  signatureAbilityFor,
  signatureMoveName,
  describeSignatureEffect,
  describeSignatureFull,
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
  SIG_ENGINE_DEX_IDS,
  engineTriggerFired,
  postTriggerFires,
  type NewSignatureTrigger,
  type SignatureContext,
  type SignatureAbility,
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

// ── The legacy path is DEAD (owner ruling 2026-07-12: "remove the legacy") ───
//
// These four evaluators — evaluateHitModifiers, evaluatePassiveDamageSideEffects,
// evaluatePostAnswer, evaluateBattleStart — used to be how Legendary/Mythical
// abilities actually did anything. They are now inert for any row carrying an
// `engine` spec, which (as of M4) is ALL 104 of them. The owner's spreadsheets are
// the single source of truth; the engine tick, `engine_status`, and the bespoke /
// m4_fx phases deliver every effect.
//
// This block is the guard that keeps them dead. It is not ceremony: several rows
// carry BOTH a legacy post_answer catalog row AND a new engine_status row (Zekrom
// #643, Munkidori #1015, Melmetal #809...). If the legacy path were ever resurrected
// alongside the engine, every one of those would inflict its status TWICE and every
// buff would be applied twice. The tests that used to assert the legacy behaviour
// were deleted with the behaviour itself.
describe("the legacy signature path is inert for engine-owned rows", () => {
  it("evaluateHitModifiers no longer fires for an engine row", () => {
    // Cobalion #638 (ignore-Defense) is a passive_damage row whose legacy path used
    // to fold modifiers into the hit. Its engine spec owns that now.
    expect(evaluateHitModifiers(SIGNATURE_ABILITIES[638], ctx())).toEqual(NO_HIT_MODIFIERS);
  });

  it("evaluatePassiveDamageSideEffects no longer fires for an engine row", () => {
    // Zekrom #643's 40% Burn — now delivered by engine_status, server-rolled.
    expect(evaluatePassiveDamageSideEffects(SIGNATURE_ABILITIES[643], ctx(), () => 0)).toEqual([]);
  });

  it("evaluatePostAnswer no longer fires for an engine row", () => {
    expect(evaluatePostAnswer(SIGNATURE_ABILITIES[243], ctx())).toEqual([]); // Raikou
    expect(evaluatePostAnswer(SIGNATURE_ABILITIES[717], ctx())).toEqual([]); // Yveltal
  });

  it("evaluateBattleStart no longer fires for an engine row", () => {
    expect(evaluateBattleStart(SIGNATURE_ABILITIES[379], 0)).toEqual([]); // Registeel
    expect(evaluateBattleStart(SIGNATURE_ABILITIES[1001], 0)).toEqual([]); // Wo-Chien
  });

  it("holds for EVERY row on the roster — no legacy leak anywhere", () => {
    for (const id of SIG_ENGINE_DEX_IDS) {
      const a = SIGNATURE_ABILITIES[id];
      expect(evaluatePostAnswer(a, ctx()), `#${id} post_answer`).toEqual([]);
      expect(evaluateBattleStart(a, 200), `#${id} battle_start`).toEqual([]);
      expect(evaluatePassiveDamageSideEffects(a, ctx(), () => 0), `#${id} side-fx`).toEqual([]);
      expect(evaluateHitModifiers(a, ctx()), `#${id} hit-mods`).toEqual(NO_HIT_MODIFIERS);
    }
  });
});

describe("manual charge-and-fire abilities", () => {
  it("exposes a Fire button only for manual abilities with a server effect", () => {
    // Aeroblast (249) fires -2 opp Speed – server-fireable.
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[249])).toBe(true);
    // Psystrike (150) fires a damage-calc one-hit modifier – NOT server-fireable.
    expect(hasServerManualEffect(SIGNATURE_ABILITIES[150])).toBe(false);
    // Dragon Ascent (384) is damage-calc only after the refactor – not fireable.
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
  // M4: Koraidon's legacy "first correct of a NEW category" spike is GONE. The
  // owner's spreadsheet replaces it with a 3-streak x2 into ice/flying/psychic/
  // dragon/fairy, and the legacy path no longer runs for engine rows. The
  // `new_category` primitive itself still exists and is exercised below.
  it("Koraidon runs the owner-spec x2 now, not the old new-category spike", () => {
    const koraidon = SIGNATURE_ABILITIES[1007];
    expect(koraidon.engine?.trigger).toEqual({ type: "streak_in_a_row", n: 3, where: "client" });
    expect(koraidon.engine?.multiplier).toMatchObject({
      factor: 2,
      condition: {
        on: "opponent_type_any",
        typeNames: ["ice", "flying", "psychic", "dragon", "fairy"],
      },
    });
    // ...and the old spike is inert.
    expect(evaluateHitModifiers(koraidon, ctx({ newCategory: true }))).toEqual(NO_HIT_MODIFIERS);
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
    // A pikachu-tier non-legendary partner id (25) has no ability – fallback.
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

describe("describeSignatureFull (tappable popover — effect + when triggered)", () => {
  it("states the effect AND the trigger clause", () => {
    // 1017 Ogerpon — Ivy Cudgel: battle_start +1 Crit.
    expect(describeSignatureFull(1017)).toBe("+1 Crit at the start of battle.");
    // 144 Articuno — Freeze-Dry: passive, ignores their Defense.
    expect(describeSignatureFull(144)).toBe("Ignores their Defense on every hit.");
    // 145 Zapdos — Thunderous Kick: fast_pair under 5s, −1 opponent Defense.
    expect(describeSignatureFull(145)).toBe(
      "−1 opponent Defense on two answers in a row under 5s.",
    );
  });

  it("appends the proc chance when the trigger has one", () => {
    // 244 Entei — Sacred Fire: on_correct 40%, inflicts Burn.
    expect(describeSignatureFull(244)).toBe("Inflicts Burn when you answer correctly (40% chance).");
  });

  it("gives Splash's deliberate no-op a plain explanation instead of a blank", () => {
    // 789 Cosmog — Splash: the short effect text is null (blank popover before).
    expect(describeSignatureFull(789)).toBe("Nothing happens. Has no effect whatsoever.");
  });

  it("returns null for a non-legendary or a purely-bespoke ability with no generic phrasing", () => {
    expect(describeSignatureFull(25)).toBeNull();
    expect(describeSignatureFull(null)).toBeNull();
    // 151 Mew — Transform: bespoke trigger + bespoke effect, no generic text.
    expect(describeSignatureFull(151)).toBeNull();
  });
});

describe("signature engine: the reworked-row boundary", () => {
  // SIG_ENGINE_DEX_IDS is the single source of "which rows the engine drives". The
  // server DELETEs the legacy stat rows for exactly these ids and the client skips
  // the legacy stat path for exactly these ids — if the two sets ever disagree,
  // buffs silently apply twice or not at all.
  // M4 (2026-07-12) added the 33 Gen VIII/IX legendaries from the owner's second
  // spreadsheet, taking the engine from the original 71 rows to the full roster.
  it("covers the 104 reworked rows and matches the rows carrying an `engine` spec", () => {
    expect(SIG_ENGINE_DEX_IDS).toHaveLength(104);
    const fromCatalog = Object.values(SIGNATURE_ABILITIES)
      .filter((a) => a.engine !== undefined)
      .map((a) => a.pokemonId)
      .sort((a, b) => a - b);
    expect([...SIG_ENGINE_DEX_IDS]).toEqual(fromCatalog);
  });

  it("gives every engine row a trigger the tick can resolve", () => {
    for (const id of SIG_ENGINE_DEX_IDS) {
      const engine = SIGNATURE_ABILITIES[id]?.engine;
      expect(engine, `#${id} should carry an engine spec`).toBeDefined();
      expect(["client", "server"]).toContain(engine!.trigger.where);
    }
  });
});

describe("signature engine: engineTriggerFired", () => {
  it("never fires a server-site trigger on the client (the observer owns those)", () => {
    expect(
      engineTriggerFired({ type: "opponent_signature", where: "server" }, ctx({ correct: true })),
    ).toBe(false);
    expect(
      engineTriggerFired({ type: "hp_reaches_zero", where: "server" }, ctx({ correct: true })),
    ).toBe(false);
  });

  it("fires a streak trigger only once the streak is met, and only on a correct answer", () => {
    const trig = { type: "streak_in_a_row", n: 3, where: "client" } as const;
    expect(engineTriggerFired(trig, ctx({ correct: true, streak: 2 }))).toBe(false);
    expect(engineTriggerFired(trig, ctx({ correct: true, streak: 3 }))).toBe(true);
    expect(engineTriggerFired(trig, ctx({ correct: false, streak: 3 }))).toBe(false);
  });

  it("resolves parity and fixed-index triggers off the 1-indexed question number", () => {
    // questionIndex 1 (0-based) is question 2 (1-indexed) – even.
    expect(
      engineTriggerFired(
        { type: "every_even_question", where: "client" },
        ctx({ questionIndex: 1 }),
      ),
    ).toBe(true);
    expect(
      engineTriggerFired({ type: "every_odd_question", where: "client" }, ctx({ questionIndex: 1 })),
    ).toBe(false);
    // Giratina fires on questions 2 and 12.
    const onQs: NewSignatureTrigger = {
      type: "on_questions",
      indices: [2, 12],
      where: "client",
    };
    expect(engineTriggerFired(onQs, ctx({ questionIndex: 1 }))).toBe(true);
    expect(engineTriggerFired(onQs, ctx({ questionIndex: 2 }))).toBe(false);
  });

  it("agrees with postTriggerFires — it is a wrapper, not a second implementation", () => {
    const trig = { type: "every_question", where: "client" } as const;
    const c = ctx({ correct: true });
    expect(engineTriggerFired(trig, c)).toBe(postTriggerFires(trig, c, () => 0));
  });
});

// ── M4: the 33 Gen VIII/IX rows from the owner's second spreadsheet ──────────

describe("M4: self_afflicted_or_hp_below honours its own pct", () => {
  // REGRESSION. Every caller used to pre-bake `hp < 0.5` into `selfAfflicted`
  // and the predicate just read that flag, so the trigger's `pct` was dead. That
  // was invisible while all 7 rows were 50% — but Zarude #893 is the only 25%
  // row in the game, and it would have fired at half health: a full heal handed
  // out twice as easily as designed.
  const zarude: NewSignatureTrigger = { type: "self_afflicted_or_hp_below", pct: 25, where: "client" };
  const paradox: NewSignatureTrigger = { type: "self_afflicted_or_hp_below", pct: 50, where: "client" };

  it("does NOT fire Zarude's 25% gate at 40% HP — but the 50% rows do", () => {
    const at40 = ctx({ correct: true, selfAfflicted: false, selfHpPct: 0.4 });
    expect(engineTriggerFired(zarude, at40)).toBe(false);
    expect(engineTriggerFired(paradox, at40)).toBe(true);
  });

  it("fires Zarude once it is genuinely under 25%", () => {
    expect(
      engineTriggerFired(zarude, ctx({ correct: true, selfAfflicted: false, selfHpPct: 0.2 })),
    ).toBe(true);
  });

  it("still fires on a status at full HP (the 'afflicted' half of the OR)", () => {
    expect(
      engineTriggerFired(zarude, ctx({ correct: true, selfAfflicted: true, selfHpPct: 1 })),
    ).toBe(true);
  });
});

describe("M4: Terapagos #1024 opp_hp_multiple_of_self", () => {
  const trig: NewSignatureTrigger = { type: "opp_hp_multiple_of_self", factor: 2, where: "client" };

  it("fires only once the opponent actually holds 2x your HP", () => {
    expect(engineTriggerFired(trig, ctx({ selfHpPct: 0.5, oppHpPct: 0.99 }))).toBe(false);
    expect(engineTriggerFired(trig, ctx({ selfHpPct: 0.5, oppHpPct: 1 }))).toBe(true);
    expect(engineTriggerFired(trig, ctx({ selfHpPct: 0.25, oppHpPct: 0.6 }))).toBe(true);
  });

  it("never fires while you are level or ahead", () => {
    expect(engineTriggerFired(trig, ctx({ selfHpPct: 1, oppHpPct: 1 }))).toBe(false);
    expect(engineTriggerFired(trig, ctx({ selfHpPct: 1, oppHpPct: 0.3 }))).toBe(false);
  });

  it("does not divide by a dead player", () => {
    expect(engineTriggerFired(trig, ctx({ selfHpPct: 0, oppHpPct: 1 }))).toBe(false);
  });
});

describe("M4: the 33 new rows are authored as the owner spec reads", () => {
  it("Urshifu, Fezandipiti and Terapagos are the only instant-KO rows, at 30/10/50%", () => {
    const koRows = SIG_ENGINE_DEX_IDS.flatMap((id) => {
      const ko = SIGNATURE_ABILITIES[id]?.engine?.bespoke?.find((b) => b.fx === "instant_ko");
      return ko ? [[id, ko.chance] as const] : [];
    });
    expect(koRows).toEqual([
      [892, 0.3],
      [1016, 0.1],
      [1024, 0.5],
    ]);
  });

  it("Zamazenta and Iron Boulder are shields (owner ruling: NOT a self-nerf)", () => {
    expect(SIGNATURE_ABILITIES[889].engine?.shield).toEqual({ questions: 3, receivePct: 0 });
    expect(SIGNATURE_ABILITIES[1022].engine?.shield).toEqual({ questions: 3, receivePct: 0 });
    // Eternatus is the self-damage row, and is NOT a shield — it still takes hits.
    expect(SIGNATURE_ABILITIES[890].engine?.nullifySelfDamage).toBe(true);
    expect(SIGNATURE_ABILITIES[890].engine?.shield).toBeUndefined();
  });

  it("Eternatus is hard-countered by the two wolves", () => {
    expect(SIGNATURE_ABILITIES[890].engine?.disable).toEqual({
      kind: "disabled_if_opponent_species",
      dexIds: [888, 889],
    });
  });

  it("the Loyal Three all crush the enemy timer to 5s for 5 questions", () => {
    for (const id of [1014, 1015, 1016]) {
      expect(SIGNATURE_ABILITIES[id].engine?.opponentTimer).toEqual({ ms: 5000, questions: 5 });
    }
  });

  it("Walking Wake and Iron Leaves latch their x2 for the rest of the battle", () => {
    for (const id of [1009, 1010]) {
      expect(SIGNATURE_ABILITIES[id].engine?.latchOnTrigger).toBe(true);
      expect(SIGNATURE_ABILITIES[id].engine?.disable).toEqual({ kind: "none" });
    }
    // Gouging Fire shares the below-50% trigger but explicitly does NOT latch —
    // its cell says "disables effect after 3 questions".
    expect(SIGNATURE_ABILITIES[1020].engine?.latchOnTrigger).toBeUndefined();
  });

  it("the Ruination quartet each halve current HP once per battle on a 5-streak", () => {
    for (const id of [1001, 1002, 1003, 1004]) {
      const e = SIGNATURE_ABILITIES[id].engine;
      expect(e?.trigger).toEqual({ type: "streak_in_a_row", n: 5, where: "client" });
      expect(e?.bespoke).toEqual([{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }]);
      expect(e?.disable).toEqual({ kind: "once_per_battle" });
      expect(e?.status?.[0].chance).toBe(0.1);
    }
  });

  it("Ogerpon only badly-poisons the Loyal Three", () => {
    expect(SIGNATURE_ABILITIES[1017].engine?.status?.[0].ifOpponentSpeciesAny).toEqual([
      1014, 1015, 1016,
    ]);
  });
});
