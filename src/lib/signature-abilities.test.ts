import { describe, expect, it } from "vitest";
import {
  SIGNATURE_ABILITIES,
  signatureAbilityFor,
  signatureMoveName,
  describeSignatureEffect,
  describeSignatureFull,
  hasCappedPayload,
  mergeHitModifiers,
  cappedPayloadUses,
  CAPPED_PAYLOAD_IDS,
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

// ── The legacy delivery layer is GONE ────────────────────────────────────────
//
// `evaluateHitModifiers`, `evaluatePassiveDamageSideEffects`, `evaluatePostAnswer` and
// `evaluateBattleStart` used to be how Legendary/Mythical abilities did anything. All
// four were deleted on 2026-07-13. Every one of them opened with
// `if (isEngineOwned(ability)) return []`, and all 104 rows have an engine — so they
// returned empty on every call and the RPCs gated on their output never fired.
//
// The tests that asserted "they stay inert" went with them: you cannot leak from a
// function that does not exist. What replaces that guard is `scripts/balance-sim/
// liveness.ts`, which reads the real source, finds the guards, and shouts if a dead
// path is resurrected. It is checked into CLAUDE.md as a required step before deleting
// anything here.
//
// Why the guard mattered, and still does: several rows carry BOTH a legacy post_answer
// catalog row AND an engine_status row (Zekrom #643, Munkidori #1015, Melmetal #809).
// Resurrect the legacy path alongside the engine and every one of them inflicts its
// status TWICE.
describe("the roster is fully engine-owned", () => {
  // The eight rows that used to carry `wiring: "battle_start"` now say "engine".
  // Their entry buff, if they still have one, comes from their own engine spec.
  // A regression here means someone reintroduced a legacy delivery path.
  it("every engine-wired row is in fact engine-owned", () => {
    const engineWired = SIG_ENGINE_DEX_IDS.filter((id) => SIGNATURE_ABILITIES[id]?.wiring === "engine");
    expect(engineWired).toEqual([379, 649, 790, 888, 889, 1001, 1016, 1017]);
    for (const id of engineWired) {
      expect(SIGNATURE_ABILITIES[id].engine, `#${id} must have an engine spec`).toBeDefined();
    }
  });
});

describe("manual charge-and-fire abilities", () => {
  it("exposes a Fire button only for manual abilities with a server effect", () => {
    // Aeroblast (249) fires -2 opp Speed – server-fireable.
    expect(hasCappedPayload(SIGNATURE_ABILITIES[249])).toBe(true);
    // Psystrike (150) fires a damage-calc one-hit modifier – NOT server-fireable.
    expect(hasCappedPayload(SIGNATURE_ABILITIES[150])).toBe(false);
    // Dragon Ascent (384) is damage-calc only after the refactor – not fireable.
    expect(hasCappedPayload(SIGNATURE_ABILITIES[384])).toBe(false);
    // Non-manual abilities are never server-fireable.
    expect(hasCappedPayload(SIGNATURE_ABILITIES[638])).toBe(false);
    expect(hasCappedPayload(null)).toBe(false);
  });

  it("reports the per-battle use cap", () => {
    expect(cappedPayloadUses(SIGNATURE_ABILITIES[249])).toBe(2); // Aeroblast
    expect(cappedPayloadUses(SIGNATURE_ABILITIES[380])).toBe(1); // Mist Ball
    expect(cappedPayloadUses(SIGNATURE_ABILITIES[638])).toBe(0); // passive
  });

  it("CAPPED_PAYLOAD_IDS matches the server-catalogued manual abilities", () => {
    // Includes Phase 2 additions Cresselia (488, cleanse) / Manaphy (490,
    // swap_stages) and the Phase 4 ability-suppressors Heatran (485),
    // Zygarde (718), Regieleki (894) and Pecharunt (1025).
    expect([...CAPPED_PAYLOAD_IDS]).toEqual([
      249, 380, 381, 483, 484, 485, 488, 490, 491, 492, 648, 718, 894, 1002, 1003, 1024, 1025,
    ]);
  });

  it("the four ability-suppressors are wired as server-fireable manual (Phase 4)", () => {
    for (const id of [485, 718, 894, 1025]) {
      expect(SIGNATURE_ABILITIES[id].wiring).toBe("capped_payload");
      expect(hasCappedPayload(SIGNATURE_ABILITIES[id])).toBe(true);
      expect(cappedPayloadUses(SIGNATURE_ABILITIES[id])).toBe(1);
    }
  });

  it("Cresselia (488) and Manaphy (490) are now server-fireable manual, not bespoke", () => {
    expect(SIGNATURE_ABILITIES[488].wiring).toBe("capped_payload");
    // Balance pass 2026-07-13: the cleanse used to cost 15% of current HP, which
    // cancelled out the engine's own free heal and left Cresselia second-weakest
    // in the game (36% win rate). It is free now.
    expect(SIGNATURE_ABILITIES[488].effect).toEqual({ type: "cleanse", hpCostPct: 0 });
    expect(hasCappedPayload(SIGNATURE_ABILITIES[488])).toBe(true);

    expect(SIGNATURE_ABILITIES[490].wiring).toBe("capped_payload");
    expect(SIGNATURE_ABILITIES[490].effect).toEqual({ type: "swap_stages" });
    expect(hasCappedPayload(SIGNATURE_ABILITIES[490])).toBe(true);
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
  });

  // This used to assert through `evaluatePostAnswer`, which was deleted with the rest
  // of the legacy layer. The thing it actually exercises is the trigger predicate, so
  // it now calls that directly — same coverage, no dead wrapper.
  it("question_category_is holds only when the category matches, and only when correct", () => {
    const trigger = { type: "question_category_is", category: "History" } as const;
    const always = () => 0; // no chance roll on this trigger; pin the rng anyway
    expect(postTriggerFires(trigger, ctx({ questionCategory: "History" }), always)).toBe(true);
    expect(postTriggerFires(trigger, ctx({ questionCategory: "Science" }), always)).toBe(false);
    // Not on a wrong answer.
    expect(
      postTriggerFires(trigger, ctx({ questionCategory: "History", correct: false }), always),
    ).toBe(false);
  });
});

// The "client-armed one-hit manual abilities" suite lived here (Psystrike #150 /
// Dragon Ascent #384 / Shadow Force #487). Deleted 2026-07-13 with the behaviour it
// tested: pressing Fire armed a damage bonus onto your next correct answer. The
// engine replaced that on 2026-07-12, and the battle screen gated the path on
// `!ability.engine` — false for all 104 rows — so nothing ever armed it.
// `scripts/balance-sim/liveness.ts` now guards this: it recomputes which delivery
// paths can run and shouts if a dead one comes back.

describe("mergeHitModifiers", () => {
  // Still live: the battle screen folds Chien-Pao's ignore-Defense charges and the
  // engine's own modifiers through this.
  it("folds two sets of modifiers together", () => {
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

// ─────────────────────────────────────────────────────────────────────────────
// The describers must narrate the ENGINE, not the inert legacy fields.
//
// These blocks used to assert the pre-rework text ("heals 8 HP, cures status"
// for Zarude). That text was still being SHOWN in battle long after the engine
// took over the mechanics — the popover confidently described an ability the
// game no longer had. The rule this locks in: for an engine-owned row the words
// come from `engine`, so the description and the behaviour cannot drift.
// ─────────────────────────────────────────────────────────────────────────────

describe("describeSignatureEffect (terse in-battle toast)", () => {
  it("narrates the engine, not the legacy effect tree", () => {
    // 893 Zarude — legacy said "heals 8 HP, cures status" on a 5-question cooldown.
    // The engine heals to FULL, and only below 25%.
    expect(describeSignatureEffect(893)).toBe(
      "-1 your defence and heal to full and clear every status condition",
    );
  });

  it("renders already-percent fields as percents, not fractions", () => {
    // 717 Yveltal — lifesteal `pct` is a WHOLE 75, not 0.75. Rendering it through
    // the 0..1 helper produced "7500% of the damage you deal".
    expect(describeSignatureEffect(717)).toBe("Heal yourself for 75% of the damage you deal");
  });

  it("returns null for a non-legendary partner", () => {
    expect(describeSignatureEffect(25)).toBeNull();
    expect(describeSignatureEffect(null)).toBeNull();
  });
});

describe("describeSignatureFull (tappable popover — effect + when + cooldown)", () => {
  it("states the effect, the trigger, and the cooldown", () => {
    expect(describeSignatureFull(144)).toBe(
      "A 10% chance to inflict Freeze on the opponent for 2 questions and double damage against water types once you get 3 answers right in a row. The damage bonus switches off after 1 wrong answer.",
    );
  });

  it("honours the row's own HP threshold rather than a hard-coded 50%", () => {
    // Zarude is the only 25% row; the legacy predicate ignored `pct` entirely.
    expect(describeSignatureFull(893)).toContain("your HP is below 25%");
    expect(describeSignatureFull(893)).toContain("Once per battle.");
  });

  it("describes the M4 instant-KO gates, which are what keep it fair", () => {
    // Balance pass 2026-07-13: 50% -> 15%. The gate reads as a hard one but is not —
    // "the opponent has twice your HP" only means you are losing, which is common,
    // and a coin-flip to win outright from there measured a 73% win rate.
    expect(describeSignatureFull(1024)).toBe(
      "A 15% chance to knock the opponent out on the spot while the opponent has at least twice your HP. It switches off permanently the moment you use a healing item.",
    );
  });

  it("names the species in a matchup lockout", () => {
    // 890 Eternatus is inert against Zacian/Zamazenta.
    expect(describeSignatureFull(890)).toContain("does nothing at all against Zacian and Zamazenta");
  });

  it("drops the trigger clause when the effects already name their questions", () => {
    // 487 Giratina marks q1/q2/q11/q12 explicitly — appending "on questions 2
    // and 12" would repeat what the effect text just said. Questions carrying the
    // same mark fold into one clause (M5) rather than repeating it per question.
    expect(describeSignatureFull(487)).toBe(
      "You take no damage on questions 1 and 11 and double damage on questions 2 and 12.",
    );
  });

  // Cosmog #789 USED to be the joke row, and the describer read it as one — it tested
  // `isNoOpSignature` before the engine, so Splash still said "Nothing happens. Has no
  // effect whatsoever." long after the rework armed it. Owner ruling 2026-07-12: keep
  // the joke in the TEXT (Splash looks useless right up until it isn't), but the text
  // must go on to say what it really does, and must be explicit that the cut comes off
  // the opponent's CURRENT HP at the payoff question.
  it("keeps Splash's joke but then tells the truth about the halve", () => {
    const text = describeSignatureFull(789)!;
    expect(text).toBe(
      "Nothing seems to happen for the first 3 questions — you deal no damage at all, " +
        "and then on question 4 you knock 50% off the opponent's current HP — taken off " +
        "whatever they are actually on at that moment, not off their starting HP. Once per battle.",
    );
    expect(text).not.toContain("Has no effect whatsoever");
  });

  it("describes Blacephalon's burnout as the owner specced it (q2-19, permanent)", () => {
    // Owner correction 2026-07-12: x5 on q1, then 75% for questions 2 THROUGH 19 —
    // and the burnout is permanent, so no "undone after a wrong answer" clause.
    expect(describeSignatureFull(806)).toBe(
      "x5 damage on question 1 and you deal 75% damage on questions 2-19.",
    );
  });

  it("does not invent a stat drawback on a row that changes no stat", () => {
    // Regigigas #486 carries `revert_stat_after_incorrect` but has no `stat` spec, so
    // there is nothing to revert. Printing "the stat change is undone…" would be a
    // penalty the ability does not actually have.
    expect(describeSignatureFull(486)).not.toContain("stat change");
    // Stakataka #805 DOES buff Attack, so its revert clause is real and must stay.
    expect(describeSignatureFull(805)).toContain("stat change is undone");
  });

  it("returns null for a non-legendary partner", () => {
    expect(describeSignatureFull(25)).toBeNull();
    expect(describeSignatureFull(null)).toBeNull();
  });

  it("has real text for every one of the 104 engine rows", () => {
    // The whole point: no engine row may fall back to a blank or a legacy string.
    for (const dex of SIG_ENGINE_DEX_IDS) {
      const text = describeSignatureFull(dex);
      expect(text, `dex ${dex}`).toBeTruthy();
      expect(text, `dex ${dex}`).not.toContain("undefined");
      expect(text, `dex ${dex}`).not.toContain("NaN");
    }
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

  // A battle-start row is setup, not a reward for answering q1. It fires once and
  // most carry `once_per_battle`, so gating it on a correct q1 used to kill Uxie
  // #480, Mesprit #481, Regidrago #895, Ogerpon #1017 and six others outright for
  // the rest of the battle. Owner ruling 2026-07-13: it fires either way.
  it("fires a battle-start trigger on question 1 whether or not q1 was answered right", () => {
    const trig: NewSignatureTrigger = { type: "start_of_battle", where: "client" };
    expect(engineTriggerFired(trig, ctx({ questionIndex: 0, correct: true }))).toBe(true);
    expect(engineTriggerFired(trig, ctx({ questionIndex: 0, correct: false }))).toBe(true);
    // …but only on question 1.
    expect(engineTriggerFired(trig, ctx({ questionIndex: 1, correct: true }))).toBe(false);
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
  // Balance pass 2026-07-13: Terapagos went 50% -> 15% (see describeSignatureFull).
  it("Urshifu, Fezandipiti and Terapagos are the only instant-KO rows, at 30/10/15%", () => {
    const koRows = SIG_ENGINE_DEX_IDS.flatMap((id) => {
      const ko = SIGNATURE_ABILITIES[id]?.engine?.bespoke?.find((b) => b.fx === "instant_ko");
      return ko ? [[id, ko.chance] as const] : [];
    });
    expect(koRows).toEqual([
      [892, 0.3],
      [1016, 0.1],
      [1024, 0.15],
    ]);
  });

  // Balance pass 2026-07-13: Zamazenta now HALVES incoming damage rather than
  // nullifying it (three questions of total invulnerability, re-earned the moment
  // the streak came back, measured a 70% win rate). Iron Boulder keeps its total
  // shield — safe now that its window genuinely closes after 3 questions.
  it("Zamazenta and Iron Boulder are shields (owner ruling: NOT a self-nerf)", () => {
    expect(SIGNATURE_ABILITIES[889].engine?.shield).toEqual({ questions: 3, receivePct: 50 });
    expect(SIGNATURE_ABILITIES[1022].engine?.shield).toEqual({ questions: 3, receivePct: 0 });
    // Eternatus is the self-damage row, and is NOT a shield — it still takes hits.
    expect(SIGNATURE_ABILITIES[890].engine?.nullifySelfDamage).toBe(true);
    expect(SIGNATURE_ABILITIES[890].engine?.shield).toBeUndefined();
  });

  // ── Balance pass 2026-07-13 ────────────────────────────────────────────────
  // The four Paradox rows trigger on "self HP below 50%". That is a STATE, not an
  // event: it stays true for every remaining question of the battle. Their authored
  // cooldown ("disables the effect after 3 questions") was only ever evaluated on a
  // question where the trigger did NOT fire, so it never ran — Iron Boulder's "take
  // no damage for 3 questions" became "take no damage for the rest of the battle"
  // (86% win rate against the field; 95% into Rayquaza). The server tick now anchors
  // the window to the question it OPENED on and closes it regardless.
  //
  // This test pins the property that made the bug possible, so nobody re-introduces
  // it by assuming the trigger is a one-off event.
  it("the Paradox rows' HP trigger is a STATE — it keeps firing while you are hurt", () => {
    for (const id of [1020, 1021, 1022, 1023]) {
      const trig = SIGNATURE_ABILITIES[id].engine!.trigger;
      expect(trig).toEqual({ type: "self_afflicted_or_hp_below", pct: 50, where: "client" });
      // Under half health, it fires on EVERY question — which is precisely why the
      // expiry may not be gated on the trigger going quiet.
      for (const q of [0, 5, 12, 19]) {
        expect(
          engineTriggerFired(trig, ctx({ questionIndex: q, selfHpPct: 0.45, oppHpPct: 0.9 })),
          `#${id} q${q + 1}`,
        ).toBe(true);
      }
      // And all four carry the 3-question window that has to close over the top of it.
      expect(SIGNATURE_ABILITIES[id].engine!.disable).toEqual({
        kind: "disable_effect_after_questions",
        n: 3,
      });
    }
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
