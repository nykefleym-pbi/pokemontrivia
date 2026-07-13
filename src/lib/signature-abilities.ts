import type { PvpStat, StatusKind } from "./game-data";
import { isLegendaryOrMythical, isMascotTier } from "./legendary-data";
import { describeEngineEffects, describeEngineSpec } from "./signature-engine-describe";
import type {
  SideRef,
  SignatureTrigger,
  EffectDuration,
  StatStageEffect,
  StatusEffect,
  CureEffect,
  HealEffect,
  DrainEffect,
  FlatDamageEffect,
  DamageCalcEffect,
  ImmunityEffect,
  HamperEffect,
  HelpEffect,
  BespokeEffect,
  SwapStagesEffect,
  CleanseEffect,
  CompoundEffect,
  SignatureEffect,
  SignatureAbility,
  NewSignatureTrigger,
  StatChangeSpec,
  DisableSpec,
  MultiplierCondition,
  DamageMultiplierSpec,
  PhaseWindowSpec,
  FixedIndexSpec,
  BespokeEffectRef,
  SignatureEngineSpec,
  WiringMode,
  TriggerEvalSite,
  RampStatSpec,
  OneShotStatSpec,
  DecayStatSpec,
} from "./signature-engine-types";
export * from "./signature-engine-types";

/**
 * Legendary / Mythical PARTNER signature abilities for Nearby Battle (live PvP).
 *
 * This is a data-driven "signature ability engine" in the same spirit as the
 * `pvp_item_effects` berry catalog: rather than 95 one-off functions, every
 * ability decomposes into a small set of {trigger, effect} primitives, and the
 * pure evaluators below decide — given the current battle state — whether an
 * ability fires this question and what effect it produces. Kept pure/testable
 * like `pvp-combat.ts`; the live loop (`live-pvp-battle-screen.tsx`) calls the
 * evaluators and routes persistent effects through the server-validated path.
 *
 * SCOPE: PvP (Nearby Battle) only. The v2 design doc's "Solo Effect" column is
 * intentionally ignored. Only Legendary/Mythical partners get an ability
 * (gated by `isLegendaryOrMythical`); non-legendary partners get nothing.
 *
 * UI RULE: players always see the `signatureMove` name (e.g. "Sacred Sword").
 * `internalKey` is a code-only identifier used to disambiguate the four Sacred
 * Sword users / three Ruination users etc. — never shown to the player.
 *
 * ROSTER NOTE: `ALL_LEGENDARY_MYTHICAL_IDS` holds 104 ids. 5 ids without a doc
 * entry (494 Victini, 803-806 Ultra Beasts) get on-theme fill designs flagged
 * `docGap: true`. The eight species that used to be missing from the roster
 * (772 Type: Null, 773 Silvally, 1009 Walking Wake, 1010 Iron Leaves, 1020
 * Gouging Fire, 1021 Raging Bolt, 1022 Iron Boulder, 1023 Iron Crown) are now
 * present and mapped to their v2 doc entries. Calyrex ships as TWO independent
 * roster entries: dex 898 = Ice Rider Calyrex (As One — Glacial Reign), synthetic
 * id 10194 = Shadow Rider Calyrex (As One — Spectral Reign); see
 * CALYREX_SHADOW_RIDER_ID in pokemon-data.ts for the forme-id precedent.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// Compact builders (keep catalog rows readable)
// ─────────────────────────────────────────────────────────────────────────────

const compound = (...effects: SignatureEffect[]): CompoundEffect => ({ type: "compound", effects });
const selfStage = (
  stat: StatStageEffect["stat"],
  delta: number,
  duration: EffectDuration = "passive",
): StatStageEffect => ({ type: "stat_stage", target: "self", stat, delta, duration });
const oppStage = (
  stat: StatStageEffect["stat"],
  delta: number,
  duration: EffectDuration = 3,
): StatStageEffect => ({ type: "stat_stage", target: "opponent", stat, delta, duration });
const oppStatus = (status: StatusKind, questions: number, chance?: number): StatusEffect => ({
  type: "status",
  target: "opponent",
  status,
  questions,
  chance,
});
const ignoreDef = (extra: Partial<DamageCalcEffect> = {}): DamageCalcEffect => ({
  type: "damage_calc",
  ignoreOppDefenseStage: true,
  ...extra,
});

// ── signature-rework engine-spec builders (keep `engine:` rows readable) ────
const ramp = (stat: PvpStat, target: SideRef, perCorrect: number): RampStatSpec => ({
  mode: "ramp",
  stat,
  target,
  perCorrect,
});
const oneShot = (stat: PvpStat | "random", target: SideRef, delta: number): OneShotStatSpec => ({
  mode: "one_shot",
  stat,
  target,
  delta,
});
const decay = (stat: PvpStat, target: SideRef, initial: number, perQuestion: number, floor: number): DecayStatSpec => ({
  mode: "decay",
  stat,
  target,
  initial,
  perQuestion,
  floor,
});
const streakN = (n: number): NewSignatureTrigger => ({ type: "streak_in_a_row", n, where: "client" });
const startOfBattleTrigger: NewSignatureTrigger = { type: "start_of_battle", where: "client" };
const everyQuestionTrigger: NewSignatureTrigger = { type: "every_question", where: "client" };
const everyEvenTrigger: NewSignatureTrigger = { type: "every_even_question", where: "client" };
const everyOddTrigger: NewSignatureTrigger = { type: "every_odd_question", where: "client" };
const onQuestions = (indices: number[]): NewSignatureTrigger => ({ type: "on_questions", indices, where: "client" });
/** Inclusive question range, e.g. `qRange(2, 19)` → [2..19]. */
const qRange = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);
/** The same outgoing multiplier pinned across a run of questions. */
const outgoingOver = (indices: number[], outgoingMultiplier: number): FixedIndexSpec[] =>
  indices.map((index) => ({ type: "fixed_index", index, outgoingMultiplier }));
const selfAfflictedTrigger = (pct: number): NewSignatureTrigger => ({
  type: "self_afflicted_or_hp_below",
  pct,
  where: "client",
});
const opponentSignatureTrigger: NewSignatureTrigger = { type: "opponent_signature", where: "server" };
const hpZeroTrigger: NewSignatureTrigger = { type: "hp_reaches_zero", where: "server" };
const opponentItemTrigger: NewSignatureTrigger = { type: "opponent_uses_item", where: "server" };

const oppHpMultipleTrigger = (factor: number): NewSignatureTrigger => ({
  type: "opp_hp_multiple_of_self",
  factor,
  where: "client",
});

// ── signature-rework M4 builders ────────────────────────────────────────────
/** x`factor` damage when the opponent carries ANY of `typeNames` (the dominant
 *  Gen VIII/IX pattern: Glastrier, Spectrier, both Calyrex, Koraidon, Miraidon,
 *  Walking Wake, Iron Leaves). */
const vsTypes = (factor: number, ...typeNames: string[]): DamageMultiplierSpec => ({
  type: "damage_multiplier",
  factor,
  condition: { on: "opponent_type_any", typeNames },
});
/** Unconditional x`factor` (Melmetal x1.5, Zacian x2, the HP-below-50% x2 rows). */
const flatMultiplier = (factor: number): DamageMultiplierSpec => ({
  type: "damage_multiplier",
  factor,
  condition: { on: "always" },
});
const disabledIfOpponentSpecies = (...dexIds: number[]): DisableSpec => ({
  kind: "disabled_if_opponent_species",
  dexIds,
});
const disabledIfUsedHealingItem: DisableSpec = { kind: "disabled_if_used_healing_item" };

const revertAfter = (n: number): DisableSpec => ({ kind: "revert_stat_after_incorrect", n });
const disableIncreaseAfter = (n: number): DisableSpec => ({ kind: "disable_increase_after_incorrect", n });
const disableEffectAfter = (n: number): DisableSpec => ({ kind: "disable_effect_after_incorrect", n });
const disableMultiplierAfter = (n: number): DisableSpec => ({ kind: "disable_multiplier_after_incorrect", n });
const disableHealingAfter = (n: number): DisableSpec => ({ kind: "disable_healing_after_questions", n });
const disableNextQuestion: DisableSpec = { kind: "disable_next_question_after_effect" };
const oncePerBattleDisable: DisableSpec = { kind: "once_per_battle" };
const noDisable: DisableSpec = { kind: "none" };
const anyOfDisable = (...of: DisableSpec[]): DisableSpec => ({ kind: "any_of", of });

// ─────────────────────────────────────────────────────────────────────────────
// The catalog — keyed by National Dex id (95 real Legendary/Mythical ids)
// ─────────────────────────────────────────────────────────────────────────────

export const SIGNATURE_ABILITIES: Record<number, SignatureAbility> = {
  // ── Generation I ──────────────────────────────────────────────────────────
  144: {
    pokemonId: 144,
    signatureMove: "Freeze-Dry",
    internalKey: "killing_frost",
    rarity: 3,
    trigger: { type: "passive" },
    effect: ignoreDef(),
    wiring: "passive_damage",
    note: "Ignore-defense only applies while opp Defense stage ≥ +1 (checked in evaluateHitModifiers). Secondary once-per-battle Freeze on opp's first 2-streak is bespoke and not auto-wired.",
    // 00-owner-spec.md row 1: SUPERSEDES trigger/effect above for the M1 engine.
    engine: {
      trigger: streakN(3),
      status: [{ status: "freeze", target: "opponent", chance: 0.1, questions: 2 }],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_type", typeName: "water" } },
      disable: disableMultiplierAfter(1),
    },
  },
  145: {
    pokemonId: 145,
    signatureMove: "Thunderous Kick",
    internalKey: "thunderous_kick",
    rarity: 3,
    trigger: { type: "fast_pair", underMs: 5000 },
    effect: compound(oppStage("defense", -1, 3), { type: "hamper", mode: "scramble" }),
    wiring: "post_answer",
    note: "3-question cooldown between fires is not enforced by the generic engine.",
    // 00-owner-spec.md row 2.
    engine: {
      trigger: streakN(3),
      stat: [ramp("defense", "opponent", -1)],
      disable: revertAfter(1),
    },
  },
  146: {
    pokemonId: 146,
    signatureMove: "Fiery Wrath",
    internalKey: "fiery_wrath",
    rarity: 3,
    trigger: { type: "bespoke", note: "Wrath stacks (max 3) on wrong answers, consumed on next correct." },
    effect: compound(selfStage("attack", 1, "one_hit"), oppStatus("sleep", 1, 0.3)),
    wiring: "bespoke",
    note: "WIRED (Phase 1): Wrath stacks tracked per-battle in pvp_live_matches.*_sig_state (server-clamped 0..3 via apply_pvp_signature_effect phase='sig_state'). Build +1 on each wrong answer; the next correct answer discharges — folds +1 Atk/stack into that hit's client-computed damage and rolls 30%/stack to inflict Sleep (1q) on the opponent via the server post_answer catalog row. See signature-bespoke.ts nextWrathStacks/wrathDischarge.",
    // 00-owner-spec.md row 3 / M2 fidelity F-a (owner ruling 2026-07-11): revert
    // on 1 incorrect AND auto-expire 3 questions after firing. The questions-elapsed
    // half now maps to the dedicated `expireAfterQuestions` engine field; the M1
    // `any_of(revert(1), disable_effect_after_questions(3))` proxy is retired for
    // it. See 03-frontend-a-m2m3.md.
    engine: {
      trigger: streakN(3),
      status: [{ status: "sleep", target: "opponent", chance: 0.2, questions: 2 }],
      stat: [ramp("attack", "self", 1)],
      expireAfterQuestions: 3,
      disable: revertAfter(1),
    },
  },
  150: {
    pokemonId: 150,
    signatureMove: "Psystrike",
    internalKey: "psystrike",
    rarity: 5,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: ignoreDef({ ignoreOwnNegativeStages: true }),
    wiring: "capped_payload",
    note: "Fire arms a client-side one-hit modifier (manualHitModifiers) folded into the next correct answer's damage calc — ignore opp Defense + own negative stages. Auto-fire-on-last-question if unused is a bespoke secondary, not wired.",
    // 00-owner-spec.md row 4. "On the next correct, inflict -1 Defense" modelled
    // as a one-shot fired alongside the trigger (see 03-frontend-a.md ambiguity notes).
    engine: {
      trigger: streakN(3),
      stat: [oneShot("defense", "opponent", -1)],
      multiplier: { type: "damage_multiplier", factor: 1, condition: { on: "always" }, ignoreDefense: true },
      disable: disableNextQuestion,
    },
  },
  151: {
    pokemonId: 151,
    signatureMove: "Transform",
    internalKey: "transform",
    rarity: 4,
    trigger: { type: "bespoke", note: "Copy opponent's equipped ability at battle start." },
    effect: { type: "bespoke", note: "Cannot copy a rating-5 ability; rolls a random rating-3 instead." },
    wiring: "bespoke",
    // 00-owner-spec.md row 5. Copy-ability itself already-wired (resolveMewTransform);
    // the copied ability's OWN cooldown/disable then governs, per the owner-spec
    // cell ("use cooldown requirement of the copied ability") — not expressible as
    // a single static DisableSpec here, so `once_per_battle` covers just the
    // Transform-fires-once-at-battle-start half.
    engine: {
      trigger: startOfBattleTrigger,
      bespoke: [{ fx: "copy_opponent_ability" }],
      disable: oncePerBattleDisable,
    },
  },

  // ── Generation II ─────────────────────────────────────────────────────────
  243: {
    pokemonId: 243,
    signatureMove: "Thunder",
    internalKey: "rolling_thunder",
    rarity: 3,
    trigger: { type: "every_nth_question", n: 4, requirePrevCorrect: true },
    effect: compound({ type: "damage_calc", bonusCritStage: 2 }, selfStage("speed", 1, 1)),
    wiring: "passive_damage",
    note: "Whiffs entirely if the previous answer was wrong. WIRED: the +1 Speed side-effect now applies via the post_answer catalog row (243), routed on the same hit through evaluatePassiveDamageSideEffects (was silently dropped — a passive_damage entry only folds its damage_calc slice).",
    // 00-owner-spec.md row 6.
    engine: {
      trigger: streakN(3),
      status: [{ status: "paralysis", target: "opponent", chance: 0.3, questions: 3 }],
      stat: [oneShot("speed", "self", 1)],
      disable: revertAfter(2),
    },
  },
  244: {
    pokemonId: 244,
    signatureMove: "Sacred Fire",
    internalKey: "sacred_flame",
    rarity: 3,
    trigger: { type: "on_correct", chance: 0.4 },
    effect: oppStatus("burn", 3),
    wiring: "post_answer",
    note: "Below-30%-HP mode (cure self + +1 Def) is a bespoke reactive branch, not auto-wired.",
    // 00-owner-spec.md row 7. "+50% damage for 1 question" modelled as a
    // no-condition x1.5 multiplier that self-disables via disable_next_question_after_effect.
    engine: {
      trigger: streakN(3),
      status: [{ status: "burn", target: "opponent", chance: 0.5, questions: 3 }],
      multiplier: { type: "damage_multiplier", factor: 1.5, condition: { on: "always" } },
      disable: disableNextQuestion,
    },
  },
  245: {
    pokemonId: 245,
    signatureMove: "Aurora Beam",
    internalKey: "aurora_veil",
    rarity: 3,
    trigger: { type: "streak_at_least", n: 3 },
    effect: compound(selfStage("defense", 1, "passive"), { type: "cure", target: "self", status: "any" }),
    wiring: "post_answer",
    note: "Buff should drop when streak breaks (persistent-stage system can't auto-expire; approximated as apply-on-streak).",
    // 00-owner-spec.md row 8. `heal_pct_of_damage_taken` is a pragmatic
    // BespokeEffectRef extension (see the union's doc comment) — not in the
    // frozen stub catalogue.
    engine: {
      trigger: selfAfflictedTrigger(50),
      bespoke: [{ fx: "heal_pct_of_damage_taken", pct: 50, questions: 3 }],
      disable: anyOfDisable(disableHealingAfter(3), oncePerBattleDisable),
    },
  },
  249: {
    pokemonId: 249,
    signatureMove: "Aeroblast",
    internalKey: "aeroblast",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 2, cooldownQuestions: 5 },
    effect: oppStage("speed", -2, 2),
    wiring: "capped_payload",
    note: "Charge-and-store (1 per 5 correct, cap 2).",
    // 00-owner-spec.md row 9.
    engine: {
      trigger: streakN(3),
      stat: [ramp("crit", "self", 1)],
      disable: revertAfter(1),
    },
  },
  250: {
    pokemonId: 250,
    signatureMove: "Sacred Fire",
    internalKey: "rainbow_rebirth",
    rarity: 4,
    trigger: { type: "hp_threshold", side: "self", cmp: "below", pct: 0.0 },
    effect: compound(
      { type: "heal", target: "self", amount: 48 },
      { type: "cure", target: "self", status: "any" },
      selfStage("attack", 1, 2),
    ),
    wiring: "bespoke",
    note: "WIRED (live in submit_pvp_live_answer): the first time you would hit 0 HP — from your own wrong-answer chip OR the opponent's correct-answer damage — Rainbow Rebirth revives you once to 25% max HP (30), cures all statuses, grants +1 Attack, and opens a 2-question Burn-on-correct window. One-time per match (gated by the *_revived flag). The revived-player toast fires on both paths (self-KO from the submit response; opponent-inflicted KO off the realtime-synced *_revived flag). Handled bespoke inside submit_pvp_live_answer, so it stays wiring:'bespoke'.",
    // 00-owner-spec.md row 10. Revive itself already-wired (M1); this `engine`
    // row re-authors the data (+1 Atk one-shot, revert-after-2 disable).
    engine: {
      trigger: hpZeroTrigger,
      stat: [oneShot("attack", "self", 1)],
      bespoke: [{ fx: "revive", hpPct: 25, cure: true }],
      disable: revertAfter(2),
    },
  },
  251: {
    pokemonId: 251,
    signatureMove: "Time Travel",
    internalKey: "time_travel",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: { type: "bespoke", note: "Rewind last wrong: refund HP + restore streak, re-attempt with 4s." },
    wiring: "bespoke",
    // 00-owner-spec.md row 11 SUPERSEDES the legacy trigger/effect above (rewind
    // → react-to-opponent-signature + disable). TODO(M2/M3): `opponent_signature`
    // is server-eval; hitTriggerHolds/postTriggerFires return false for it until
    // the server observer lands (architecture §9 R3) — this row is authored but inert client-side.
    engine: {
      trigger: opponentSignatureTrigger,
      stat: [oneShot("speed", "self", 2)],
      bespoke: [{ fx: "disable_opponent_ability" }],
      // M2 §5: whole effect (spd + opp-disable) stops after 2 incorrect.
      disable: disableEffectAfter(2),
    },
  },

  // ── Generation III ────────────────────────────────────────────────────────
  377: {
    pokemonId: 377,
    signatureMove: "Stone Edge",
    internalKey: "stone_edge",
    rarity: 3,
    trigger: { type: "last_seconds_answer", withinMs: 3000 },
    effect: { type: "damage_calc", bonusCritStage: 2 },
    wiring: "passive_damage",
    // 00-owner-spec.md row 12.
    engine: {
      trigger: streakN(3),
      stat: [ramp("crit", "self", 2)],
      disable: revertAfter(1),
    },
  },
  378: {
    pokemonId: 378,
    signatureMove: "Blizzard",
    internalKey: "blizzard",
    rarity: 3,
    trigger: { type: "streak_at_least", n: 4 },
    effect: oppStage("speed", -1, 2),
    wiring: "post_answer",
    note: "WIRED: a 4+ streak chills the opponent — standing -1 opp Speed via the post_answer catalog row (378), the frostbite-adjacent Speed drop of Blizzard's mainline flavor. (Replaces the old hide_options hamper, which had no delivery path to the opponent's client.) 4-question cooldown not enforced by the generic engine.",
    // 00-owner-spec.md row 13. Regice's conditional +1 Atk (only if opponent has
    // Flying/Grass/Ground typing) has no accompanying damage multiplier — modelled
    // via `onSuccess` on a no-op (factor:1) multiplier spec (see DamageMultiplierSpec doc comment).
    engine: {
      trigger: streakN(3),
      status: [{ status: "freeze", target: "opponent", chance: 0.1, questions: 2 }],
      multiplier: {
        type: "damage_multiplier",
        factor: 1,
        condition: { on: "opponent_type_any", typeNames: ["flying", "grass", "ground"] },
        onSuccess: [oneShot("attack", "self", 1)],
      },
      disable: revertAfter(1),
    },
  },
  379: {
    pokemonId: 379,
    signatureMove: "Flash Cannon",
    internalKey: "flash_cannon_registeel",
    rarity: 3,
    trigger: { type: "battle_start" },
    effect: selfStage("defense", 1, "passive"),
    wiring: "engine",
    note: "Once-per-battle 40% opp -1 Def shot is a bespoke secondary, not auto-wired.",
    // 00-owner-spec.md row 14.
    engine: {
      trigger: selfAfflictedTrigger(50),
      stat: [ramp("defense", "opponent", -1), oneShot("attack", "self", 1)],
      disable: revertAfter(1),
    },
  },
  380: {
    pokemonId: 380,
    signatureMove: "Mist Ball",
    internalKey: "mist_ball",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: oppStage("attack", -2, 2),
    wiring: "capped_payload",
    note: "Armed after 3 correct. Non-mascot per file despite mascot-tier flavor (flagged for reconciliation).",
    // 00-owner-spec.md row 15.
    engine: {
      trigger: streakN(3),
      stat: [ramp("attack", "opponent", -2)],
      disable: revertAfter(1),
    },
  },
  381: {
    pokemonId: 381,
    signatureMove: "Luster Purge",
    internalKey: "luster_purge",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(oppStage("defense", -2, 2), ignoreDef()),
    wiring: "capped_payload",
    note: "Armed after 3 correct. Non-mascot per file.",
    // 00-owner-spec.md row 16.
    engine: {
      trigger: streakN(3),
      stat: [ramp("defense", "opponent", -2)],
      disable: revertAfter(1),
    },
  },
  382: {
    pokemonId: 382,
    signatureMove: "Origin Pulse",
    internalKey: "primordial_deluge",
    rarity: 5,
    trigger: { type: "streak_at_least", n: 3 },
    effect: compound(selfStage("attack", 1, "passive"), selfStage("speed", 1, "passive")),
    wiring: "post_answer",
    note: "Standing weather while streak holds; lifts on 2 consecutive misses. Latest-weather-wins vs Groudon is bespoke.",
    // 00-owner-spec.md row 17. No "stacks"/"does not stack" language → one_shot
    // default (03-frontend-a.md ambiguity ruling).
    engine: {
      trigger: selfAfflictedTrigger(50),
      stat: [oneShot("attack", "self", 1), oneShot("crit", "self", 1), oneShot("speed", "self", 1)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species", dexId: 383 } },
      disable: revertAfter(1),
    },
  },
  383: {
    pokemonId: 383,
    signatureMove: "Precipice Blades",
    internalKey: "scorched_earth",
    rarity: 5,
    trigger: { type: "streak_at_least", n: 3 },
    effect: compound(selfStage("attack", 1, "passive"), oppStage("speed", -1, 1)),
    wiring: "post_answer",
    note: "Standing sun while streak holds; lifts on 2 consecutive misses. Latest-weather-wins vs Kyogre is bespoke.",
    // 00-owner-spec.md row 18.
    engine: {
      trigger: selfAfflictedTrigger(50),
      stat: [oneShot("attack", "opponent", -1), oneShot("crit", "opponent", -1), oneShot("speed", "opponent", -1)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species", dexId: 382 } },
      disable: revertAfter(1),
    },
  },
  384: {
    pokemonId: 384,
    signatureMove: "Dragon Ascent",
    internalKey: "sky_splitting_ascent",
    rarity: 5,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: { type: "damage_calc", bonusCritStage: 3, bonusAttackStage: 1 },
    wiring: "capped_payload",
    note: "Fire arms a client-side one-hit modifier (manualHitModifiers) onto the next correct answer: +3 Crit / +1 Atk. The self -2 Def-for-1q backlash and passive Air Lock (negate opponent weather/field engines) are bespoke secondaries, not wired.",
    // 00-owner-spec.md row 19.
    engine: {
      trigger: selfAfflictedTrigger(50),
      stat: [oneShot("crit", "self", 3), oneShot("defense", "self", -2)],
      multiplier: { type: "damage_multiplier", factor: 3, condition: { on: "opponent_species_any", dexIds: [382, 383] } },
      disable: revertAfter(1),
    },
  },
  385: {
    pokemonId: 385,
    signatureMove: "Doom Desire",
    internalKey: "doom_desire",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: { type: "flat_damage", amount: 12, ignoreDefense: true },
    wiring: "bespoke",
    note: "WIRED (M3): stepBespokeFx arms the strike on the trigger and resolves it DOOM_DESIRE_DELAY_Q questions later; the server owns the magnitude (pvp_signature_effects bespoke/flat_next_question_damage, 20). An in-flight strike blocks a second one.",
    // 00-owner-spec.md row 20.
    engine: {
      trigger: selfAfflictedTrigger(50),
      bespoke: [{ fx: "flat_next_question_damage", amount: 20 }],
      disable: disableNextQuestion,
    },
  },
  386: {
    pokemonId: 386,
    signatureMove: "Psycho Boost",
    internalKey: "psycho_boost",
    rarity: 3,
    trigger: { type: "every_nth_question", n: 5 },
    effect: compound({ type: "damage_calc", bonusAttackStage: 3 }, selfStage("attack", -1, 2)),
    wiring: "passive_damage",
    note: "First correct answer arms it, then re-armable every 5. WIRED: the -1 Atk recoil now follows the nuke via the post_answer catalog row (386), routed on the same hit through evaluatePassiveDamageSideEffects (was silently dropped, making it strictly stronger than designed).",
    // 00-owner-spec.md row 21. DecayStatSpec alone captures "+3 then -1/question,
    // stacking" — fire sets Attack to +3 (its `initial`), then steps -1/question.
    engine: {
      trigger: streakN(3),
      stat: [decay("attack", "self", 3, -1, -3)],
      disable: disableIncreaseAfter(1),
    },
  },

  // ── Generation IV ─────────────────────────────────────────────────────────
  480: {
    pokemonId: 480,
    signatureMove: "Future Sight",
    internalKey: "knowledge_future_sight",
    rarity: 2,
    trigger: { type: "cooldown", everyN: 4 },
    effect: { type: "help", mode: "preview_category" },
    wiring: "bespoke",
    note: "WIRED (M3): the SERVER rolls the status at battle start (engineToTickSpec bridges the bespoke fx into a `predicted_status` stat spec; _pvp_sig_engine_apply rolls it and echoes it back on sig_runtime.predictedStatus) and reveals it to the player. It is inflicted — provably the same status — the first time the opponent falls below 50% HP, via bespoke/predicted_status_apply.",
    // 00-owner-spec.md row 23.
    engine: {
      trigger: startOfBattleTrigger,
      bespoke: [{ fx: "predicted_status_reveal", applyIfOppHpBelowPct: 50 }],
      disable: oncePerBattleDisable,
    },
  },
  481: {
    pokemonId: 481,
    signatureMove: "Future Sight",
    internalKey: "emotion_future_sight",
    rarity: 2,
    trigger: { type: "cooldown", everyN: 4 },
    effect: compound({ type: "help", mode: "preview_value" }, selfStage("speed", 1, 1)),
    wiring: "bespoke",
    note: "WIRED (M3): resolved entirely server-side — `use_pvp_live_item` refuses the OPPONENT's item with `item_locked` while Mesprit's sig_runtime shows firedThisBattle and not disabled. No client scheduling (reacting in stepBespokeFx would double-apply it).",
    // 00-owner-spec.md row 24.
    engine: {
      trigger: startOfBattleTrigger,
      bespoke: [{ fx: "item_lockout" }],
      disable: disableEffectAfter(3),
    },
  },
  482: {
    pokemonId: 482,
    signatureMove: "Future Sight",
    internalKey: "willpower_future_sight",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 5 },
    effect: { type: "help", mode: "eliminate_option" },
    wiring: "bespoke",
    note: "WIRED (M3): a correct answer on q5/q10/q15/q20 rolls 1-3 wrong options to cull and schedules them onto the NEXT question; live-pvp-battle-screen greys them out via eliminatedChoiceIndices. Self-help only, so it stays client-side — the correct answer is never culled. (The q20 fire has no q21 to land on and is inert by design.)",
    // 00-owner-spec.md row 25.
    engine: {
      // M2 §5: fires ON questions 5/10/15/20 (the effect windows), not at start.
      trigger: onQuestions([5, 10, 15, 20]),
      bespoke: [{ fx: "eliminate_choices", min: 1, max: 3, onIndices: [5, 10, 15, 20] }],
      disable: disableEffectAfter(3),
    },
  },
  483: {
    pokemonId: 483,
    signatureMove: "Roar of Time",
    internalKey: "roar_of_time",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 2 },
    effect: selfStage("speed", 2, 1),
    wiring: "capped_payload",
    note: "Fire = +2 Speed (clutch time). The -1-Speed next-question recharge is a bespoke follow-up (persistent-stage system can't auto-expire a one-question delta). Charges 1 per 5 correct, cap 2.",
    // 00-owner-spec.md row 26.
    engine: {
      trigger: streakN(3),
      stat: [oneShot("speed", "self", 3)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species", dexId: 484 } },
      disable: revertAfter(1),
    },
  },
  484: {
    pokemonId: 484,
    signatureMove: "Spacial Rend",
    internalKey: "spacial_rend",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 2 },
    effect: compound(selfStage("speed", 1, 1), { type: "hamper", mode: "scramble" }),
    wiring: "capped_payload",
    // 00-owner-spec.md row 27.
    engine: {
      trigger: streakN(3),
      stat: [oneShot("crit", "self", 3)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species", dexId: 483 } },
      disable: revertAfter(1),
    },
  },
  485: {
    pokemonId: 485,
    signatureMove: "Magma Storm",
    internalKey: "magma_storm",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(oppStatus("badly-poisoned", 3), { type: "bespoke", note: "Ability-lock opponent 3q." }),
    wiring: "capped_payload",
    note: "WIRED (M3): a 5-streak opens a 5-question damage-over-time window that chips the opponent for 12.5% of max HP (15) each question, server-applied via bespoke/dot_frac_hp; two misses slam it shut. The manual fire (ability-lock 3q + Badly Poisoned) still stands alongside it.",
    // 00-owner-spec.md row 28.
    engine: {
      trigger: streakN(5),
      bespoke: [{ fx: "dot_frac_hp", pct: 0.125, questions: 5 }],
      // M2 §5: the 5-question DoT stops if Heatran misses twice.
      disable: disableEffectAfter(2),
    },
  },
  486: {
    pokemonId: 486,
    signatureMove: "Crush Grip",
    internalKey: "slow_start",
    rarity: 3,
    trigger: { type: "bespoke", note: "Stages locked at 0 for questions 1-5; +2 Atk/+1 Spd from q6." },
    effect: compound(selfStage("attack", 2, "passive"), selfStage("speed", 1, "passive")),
    wiring: "bespoke",
    note: "Phase change at q6; damage also scales with HP lead (Crush Grip).",
    // 00-owner-spec.md row 29 / M2 fidelity F-c (owner ruling 2026-07-11): q1-3
    // deal 0 damage, q4 pays off ×2.5 ONLY if opponent HP > self HP — now
    // expressed via the new `payoffCondition`, evaluated client-side from
    // SignatureContext.oppHpPct/selfHpPct (server re-clamps). See 03-frontend-a-m2m3.md.
    // BALANCE (owner ruling 2026-07-13): the charge window was `scaleToPct: 0` —
    // three questions dealing NOTHING to earn a x2.5 that only pays out if you are
    // ALREADY behind. Measured, that is the second-worst ability in the game (39%).
    // Charging at half damage instead of zero keeps the slow-start identity without
    // making the first three questions a write-off.
    engine: {
      trigger: onQuestions([4]),
      phase: {
        type: "phase_window",
        windowN: 3,
        scaleToPct: 50,
        payoffAtIndex: 4,
        payoffMultiplier: 2.5,
        payoffCondition: "opp_hp_gt_self",
      },
      disable: revertAfter(2),
    },
  },
  487: {
    pokemonId: 487,
    signatureMove: "Shadow Force",
    internalKey: "shadow_force",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: ignoreDef({ bonusCritStage: 2 }),
    wiring: "capped_payload",
    note: "WIRED (client-armed hit, structurally identical to Psystrike 150 / Dragon Ascent 384): Fire arms a client-side one-hit modifier (manualHitModifiers) onto the next correct answer — ignore opp Defense + 2 Crit. Relabeled wiring:'bespoke' -> 'manual' to match reality (behavior-neutral: it applies no server-catalog effect, so hasCappedPayload stays false and no server Fire path is added). The vanish (skip current question, untargetable) opening is a bespoke secondary, not wired.",
    // 00-owner-spec.md row 30. q1/q11 defensive immunity is `receiveDamagePct: 0`
    // — DEFENSIVE, must be server-enforced (architecture §5). Cooldown column
    // ("Applied only on selected questions") maps to `none`: the fixedIndex
    // gating itself is the only constraint, no incorrect-answer disable.
    engine: {
      trigger: onQuestions([2, 12]),
      fixedIndex: [
        { type: "fixed_index", index: 1, receiveDamagePct: 0 },
        { type: "fixed_index", index: 11, receiveDamagePct: 0 },
        { type: "fixed_index", index: 2, outgoingMultiplier: 2 },
        { type: "fixed_index", index: 12, outgoingMultiplier: 2 },
      ],
      disable: noDisable,
    },
  },
  488: {
    pokemonId: 488,
    signatureMove: "Lunar Dance",
    internalKey: "lunar_dance",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    // BALANCE (owner ruling 2026-07-13): the cleanse used to COST 15% of current HP,
    // which cancelled out the engine's free heal below and left Cresselia the
    // second-weakest row in the game (36%). The cost is now 0 — the migration sets
    // `hpCostPct` to 0 on its `pvp_signature_effects` row, which is where the server
    // reads it from.
    effect: { type: "cleanse", hpCostPct: 0 },
    wiring: "capped_payload",
    note: "Cure all statuses + reset negative Atk/Def/Spd stages to 0, at no HP cost. Server-computed (cleanse kind).",
    // 00-owner-spec.md row 31 SUPERSEDES the legacy 15%-HP-cost cleanse above
    // with a free 100%-heal + cure.
    engine: {
      trigger: selfAfflictedTrigger(50),
      bespoke: [{ fx: "full_heal_cure" }],
      disable: oncePerBattleDisable,
    },
  },
  489: {
    pokemonId: 489,
    signatureMove: "Bubble Beam",
    internalKey: "bubble_beam",
    rarity: 2,
    trigger: { type: "on_correct", chance: 0.25 },
    effect: oppStage("speed", -1, 1),
    wiring: "post_answer",
    // 00-owner-spec.md row 32.
    engine: {
      trigger: streakN(3),
      stat: [ramp("speed", "opponent", -1), ramp("speed", "self", 1)],
      disable: revertAfter(2),
    },
  },
  490: {
    pokemonId: 490,
    signatureMove: "Heart Swap",
    internalKey: "heart_swap",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: { type: "swap_stages" },
    wiring: "capped_payload",
    note: "Give opp your lowest (most negative) stage, take their highest (most positive). Server-computed (swap_stages kind); cancels in a mirror if both fire the same question.",
    // 00-owner-spec.md row 33 SUPERSEDES the legacy swap_stages above with a
    // reactive negate. WIRED (M2/M3): `opponent_signature` is server-eval, so the
    // live loop's observer watches the OPPONENT's sig_runtime phaseIdx advance —
    // that IS the fact their signature fired — then ticks this row with
    // triggerFired and calls bespoke/reflect_opponent_stat, which flips Manaphy's
    // own negative stages positive. No-ops when it carries no debuff to reflect.
    engine: {
      trigger: opponentSignatureTrigger,
      bespoke: [{ fx: "reflect_opponent_stat", factor: -1 }],
      // M2 §5: the reflect effect stops after 2 incorrect.
      disable: disableEffectAfter(2),
    },
  },
  491: {
    pokemonId: 491,
    signatureMove: "Dark Void",
    internalKey: "dark_void",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: oppStatus("sleep", 2, 0.6),
    wiring: "capped_payload",
    note: "60% land chance (Dark Void's low accuracy).",
    // 00-owner-spec.md row 34.
    engine: {
      trigger: streakN(3),
      status: [{ status: "sleep", target: "opponent", chance: 1.0, questions: 2 }],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_type_any", typeNames: ["psychic", "ghost"] } },
      disable: revertAfter(1),
    },
  },
  492: {
    pokemonId: 492,
    signatureMove: "Seed Flare",
    internalKey: "seed_flare",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: oppStage("defense", -2, 3),
    wiring: "capped_payload",
    note: "Seed Flare: on fire, -2 opp Defense (Sp. Def crash). The 40%/60%-on-streak land chance is rolled client-side before the fire request; chance-on-streak is bespoke.",
    // 00-owner-spec.md row 35.
    engine: {
      trigger: streakN(3),
      stat: [oneShot("defense", "opponent", -2), oneShot("attack", "self", 1)],
      disable: revertAfter(1),
    },
  },
  493: {
    pokemonId: 493,
    signatureMove: "Judgment",
    internalKey: "judgment",
    rarity: 5,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: { type: "flat_damage", amount: 2, perCategory: true, ignoreDefense: true },
    wiring: "bespoke",
    note: "Battle-start attune (+1 Atk on dominant category) is a bespoke passive; Judgment scales ~2 HP per distinct category answered correctly.",
    // 00-owner-spec.md row 36. TODO(M3): frac_hp_random is hard bespoke
    // (architecture §6/§7) — authored, not yet wired; graceful no-op downstream.
    // BALANCE (owner ruling 2026-07-13): the roll was 1-10% of MAX HP, fired every
    // question, with NO cooldown at all — averaging ~6.6 HP a question over 20
    // questions is ~132 free damage against a 120 HP bar, i.e. more than a whole
    // health bar handed over for nothing. 1-5% halves it to ~72.
    engine: {
      // §2c: server rolls a fraction in [minPct,maxPct] → opp HP -= round(oppMaxHp × pct).
      trigger: everyQuestionTrigger,
      bespoke: [{ fx: "frac_hp_random", minPct: 0.01, maxPct: 0.05 }],
      disable: noDisable,
    },
  },
  494: {
    pokemonId: 494,
    signatureMove: "V-create",
    internalKey: "victory_star",
    rarity: 3,
    docGap: true,
    trigger: { type: "first_half_answer" },
    effect: { type: "damage_calc", bonusCritStage: 1 },
    wiring: "passive_damage",
    note: "NOT in v2 doc — fill design (Victory Star: confident early answers hit truer). Confirm with product owner.",
    // 00-owner-spec.md row 22.
    engine: {
      trigger: streakN(3),
      stat: [oneShot("crit", "self", 3), oneShot("defense", "self", -2), oneShot("speed", "self", -1)],
      disable: revertAfter(1),
    },
  },

  // ── Generation V ──────────────────────────────────────────────────────────
  638: {
    pokemonId: 638,
    signatureMove: "Sacred Sword",
    internalKey: "steadfast_blade",
    rarity: 3,
    trigger: { type: "passive" },
    effect: ignoreDef({ ignoreOwnNegativeStages: true }),
    wiring: "passive_damage",
    note: "Cobalion — neutral always-on: compute through both your negative stages and opp Defense.",
    // 00-owner-spec.md row 37. No `stat` entries to revert, so "Disable stat
    // change after 1 incorrect" is read as disabling the ignore-Defense benefit
    // (03-frontend-a.md ambiguity ruling).
    engine: {
      trigger: everyQuestionTrigger,
      multiplier: { type: "damage_multiplier", factor: 1, condition: { on: "always" }, ignoreDefense: true },
      disable: disableMultiplierAfter(1),
    },
  },
  639: {
    pokemonId: 639,
    signatureMove: "Sacred Sword",
    internalKey: "rock_cleaving_blade",
    rarity: 3,
    trigger: { type: "passive" },
    effect: ignoreDef(),
    wiring: "passive_damage",
    note: "Terrakion — offense: always ignore Def; on 3+ streak also +1 Atk (streak ramp is a bespoke secondary).",
    // 00-owner-spec.md row 38.
    engine: {
      trigger: everyEvenTrigger,
      stat: [oneShot("defense", "self", 1)],
      multiplier: { type: "damage_multiplier", factor: 1, condition: { on: "always" }, ignoreDefense: true },
      disable: revertAfter(1),
    },
  },
  640: {
    pokemonId: 640,
    signatureMove: "Sacred Sword",
    internalKey: "verdant_blade",
    rarity: 3,
    trigger: { type: "passive" },
    effect: ignoreDef(),
    wiring: "passive_damage",
    note: "Virizion — evasion: always ignore Def; stacking debuff-evasion (15%/stack) is a bespoke secondary.",
    // 00-owner-spec.md row 39.
    engine: {
      trigger: everyOddTrigger,
      stat: [oneShot("attack", "self", 1)],
      multiplier: { type: "damage_multiplier", factor: 1, condition: { on: "always" }, ignoreDefense: true },
      disable: revertAfter(1),
    },
  },
  641: {
    pokemonId: 641,
    signatureMove: "Bleakwind Storm",
    internalKey: "bleakwind_storm",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6 },
    effect: oppStage("speed", -2, 2),
    wiring: "post_answer",
    note: "Also denies opp first-half crit bonus during it (bespoke).",
    // 00-owner-spec.md row 40.
    engine: {
      trigger: streakN(3),
      status: [{ status: "confused", target: "opponent", chance: 0.2, questions: 2 }],
      stat: [oneShot("speed", "self", 3)],
      disable: revertAfter(2),
    },
  },
  642: {
    pokemonId: 642,
    signatureMove: "Wildbolt Storm",
    internalKey: "wildbolt_storm",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6, chance: 0.5 },
    effect: oppStatus("paralysis", 3),
    wiring: "post_answer",
    // 00-owner-spec.md row 41.
    engine: {
      trigger: streakN(3),
      status: [{ status: "paralysis", target: "opponent", chance: 0.2, questions: 3 }],
      stat: [oneShot("speed", "self", 3)],
      disable: revertAfter(2),
    },
  },
  643: {
    pokemonId: 643,
    signatureMove: "Blue Flare",
    internalKey: "blue_flare",
    rarity: 4,
    trigger: { type: "first_half_answer" },
    effect: compound(
      { type: "damage_calc", bonusAttackStage: 1, bonusCritStage: 1 },
      oppStatus("burn", 3, 0.4),
    ),
    wiring: "passive_damage",
    note: "WIRED: the trigger no longer carries a chance (so hitTriggerHolds accepts it) — the +1 Atk/+1 Crit damage-calc bonus is deterministic on any first-half correct answer. The bundled Burn is routed on that same hit through the post_answer catalog row (643), with its 40% roll done client-side in evaluatePassiveDamageSideEffects (mirrors 244/809's client-rolled statuses). Fast WRONG answers self-inflict -1 Def (bespoke penalty branch, not wired).",
    // 00-owner-spec.md row 42.
    engine: {
      trigger: streakN(3),
      status: [{ status: "burn", target: "opponent", chance: 0.2, questions: 3 }],
      stat: [oneShot("attack", "self", 1), oneShot("crit", "self", 1)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species", dexId: 644 } },
      disable: revertAfter(2),
    },
  },
  644: {
    pokemonId: 644,
    signatureMove: "Bolt Strike",
    internalKey: "bolt_strike",
    rarity: 4,
    trigger: { type: "streak_at_least", n: 3, chance: 0.4 },
    effect: compound(oppStatus("paralysis", 3), selfStage("attack", 1, "passive")),
    wiring: "post_answer",
    note: "-1 Speed backlash on streak break is a bespoke secondary.",
    // 00-owner-spec.md row 43.
    engine: {
      trigger: streakN(3),
      status: [{ status: "paralysis", target: "opponent", chance: 0.2, questions: 3 }],
      stat: [oneShot("attack", "self", 1), oneShot("crit", "self", 1)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species", dexId: 643 } },
      disable: revertAfter(2),
    },
  },
  645: {
    pokemonId: 645,
    signatureMove: "Sandsear Storm",
    internalKey: "sandsear_storm",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6 },
    effect: compound(oppStatus("burn", 3), selfStage("attack", 1, "passive")),
    wiring: "post_answer",
    // 00-owner-spec.md row 44.
    engine: {
      trigger: streakN(3),
      status: [{ status: "burn", target: "opponent", chance: 0.2, questions: 3 }],
      stat: [oneShot("speed", "self", 3)],
      disable: revertAfter(2),
    },
  },
  646: {
    pokemonId: 646,
    signatureMove: "Glaciate",
    internalKey: "glaciate",
    rarity: 4,
    trigger: { type: "every_nth_correct", n: 3 },
    effect: oppStage("speed", -1, 2),
    wiring: "post_answer",
    note: "If opp already at negative Speed → Freeze instead; whole effect doubled while you trail on HP (bespoke escalation). Non-mascot per file.",
    // 00-owner-spec.md row 45.
    engine: {
      trigger: streakN(3),
      status: [{ status: "freeze", target: "opponent", chance: 0.2, questions: 2 }],
      stat: [ramp("speed", "opponent", -2)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species_any", dexIds: [644, 643] } },
      disable: revertAfter(2),
    },
  },
  647: {
    pokemonId: 647,
    signatureMove: "Sacred Sword",
    internalKey: "colts_blade",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 4 },
    effect: ignoreDef(),
    wiring: "passive_damage",
    note: "Keldeo — 4th Sword of Justice: ignore opp's highest Def stage once every 4 questions.",
    // 00-owner-spec.md row 46. No stack language → one_shot default.
    engine: {
      trigger: everyQuestionTrigger,
      stat: [oneShot("defense", "self", 2), oneShot("attack", "self", 2)],
      multiplier: { type: "damage_multiplier", factor: 1, condition: { on: "always" }, ignoreDefense: true },
      disable: revertAfter(2),
    },
  },
  648: {
    pokemonId: 648,
    signatureMove: "Relic Song",
    internalKey: "relic_song",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 2 },
    effect: compound(selfStage("attack", 1, "passive"), oppStatus("sleep", 1, 0.3)),
    wiring: "capped_payload",
    note: "Aria (+1 Atk, always) / Pirouette (+1 Spd) stance toggle; 30% Sleep on toggle. WIRED: the Sleep is now a genuine 30% roll — the manual RPC applies the +1 Atk row unconditionally and rolls the Sleep row server-side (its catalog payload carries chance:0.3, gated in apply_pvp_signature_effect's status branch). Stance choice is bespoke.",
    // 00-owner-spec.md row 47.
    engine: {
      trigger: streakN(3),
      status: [{ status: "sleep", target: "opponent", chance: 0.2, questions: 2 }],
      stat: [oneShot("attack", "self", 1)],
      disable: revertAfter(2),
    },
  },
  649: {
    pokemonId: 649,
    signatureMove: "Techno Blast",
    internalKey: "techno_blast",
    rarity: 3,
    trigger: { type: "battle_start" },
    effect: selfStage("speed", 1, "passive"),
    wiring: "engine",
    note: "Genesect — Techno Blast: standing +1 Speed at battle start (default Shock drive encoded). The Drive loadout choice (Shock/Burn/Chill/Douse) + one mid-battle hot-swap is a bespoke secondary, not wired.",
    // 00-owner-spec.md row 48. "Random status condition" has no dedicated
    // primitive — extended `status.status` to accept "random" alongside the
    // stat model's existing `"random"` (OneShotStatSpec.stat); no duration/chance
    // given by the owner spec, defaulted to chance 1.0 / questions 3.
    engine: {
      trigger: streakN(3),
      status: [{ status: "random", target: "opponent", chance: 1.0, questions: 3 }],
      stat: [oneShot("random", "self", 1)],
      disable: revertAfter(2),
    },
  },

  // ── Generation VI ─────────────────────────────────────────────────────────
  716: {
    pokemonId: 716,
    signatureMove: "Geomancy",
    internalKey: "geomancy",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(selfStage("attack", 2, 3), selfStage("defense", 1, 3), selfStage("speed", 1, 3)),
    wiring: "bespoke",
    note: "Two-stage: charge (skip one question) then release the triple buff.",
    // 00-owner-spec.md row 49. Payoff is a stat buff, not a multiplier, so
    // `phase` only carries the q1 0-damage window; the +2/+2/+2 buff lives in `stat`,
    // timed by `trigger: on_questions([2])`.
    engine: {
      trigger: onQuestions([2]),
      stat: [oneShot("attack", "self", 2), oneShot("defense", "self", 2), oneShot("speed", "self", 2)],
      phase: { type: "phase_window", windowN: 1, scaleToPct: 0 },
      disable: disableEffectAfter(3),
    },
  },
  717: {
    pokemonId: 717,
    signatureMove: "Oblivion Wing",
    internalKey: "oblivion_wing",
    rarity: 4,
    trigger: { type: "on_correct" },
    effect: { type: "drain", amount: 2 },
    wiring: "post_answer",
    note: "Drain doubles on a 4+ streak (bespoke scaling); once-per-battle Death Wing (~10 HP) is bespoke.",
    // 00-owner-spec.md row 50.
    engine: {
      trigger: everyQuestionTrigger,
      bespoke: [{ fx: "lifesteal_pct_of_damage", pct: 75 }],
      disable: noDisable,
    },
  },
  718: {
    pokemonId: 718,
    signatureMove: "Thousand Waves",
    internalKey: "thousand_waves",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(oppStage("speed", -1, 3), { type: "bespoke", note: "Ability/escape lock 3q." }),
    wiring: "capped_payload",
    note: "Phase 4 (wired): manual fire binds the opponent's signature ability for 3 questions (server suppress_ability) + -1 Speed. The 10+-correct duration extension to 4q is not modelled.",
    // 00-owner-spec.md row 51. Multiplier with `fallback` (Zygarde: else +1 Atk/+1 Def).
    engine: {
      trigger: streakN(3),
      multiplier: {
        type: "damage_multiplier",
        factor: 2,
        condition: { on: "opponent_type", typeName: "flying" },
        fallback: [oneShot("attack", "self", 1), oneShot("defense", "self", 1)],
      },
      disable: revertAfter(2),
    },
  },
  719: {
    pokemonId: 719,
    signatureMove: "Diamond Storm",
    internalKey: "diamond_storm",
    rarity: 3,
    trigger: { type: "on_correct", chance: 0.5 },
    effect: selfStage("defense", 1, "passive"),
    wiring: "post_answer",
    note: "Once-per-battle status-reflect (spend the Defense buffer) is a bespoke secondary.",
    // 00-owner-spec.md row 52.
    engine: {
      trigger: streakN(3),
      stat: [ramp("defense", "self", 2)],
      disable: revertAfter(2),
    },
  },
  720: {
    pokemonId: 720,
    signatureMove: "Hyperspace Hole",
    internalKey: "hyperspace_hole",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 5 },
    effect: ignoreDef(),
    wiring: "passive_damage",
    note: "20% misfire grants opponent +1 random stage (bespoke self-sabotage).",
    // 00-owner-spec.md row 53 / M2 fidelity F-d (owner ruling 2026-07-11): on a
    // CORRECT answer ignore opp Defense; on a WRONG answer −2 self Def via the new
    // `incorrectStat` engine arm (no disable → accumulates within ±3, never reverts).
    // Blank Cooldown → `none` (ruling 6). ignoreDefense only on the correct answer (ruling 7).
    // BALANCE (owner ruling 2026-07-13): the wrong-answer penalty was -2 self Def
    // with `disable: none`, so it accumulated to the -3 floor and NEVER came back.
    // Hoopa was the worst ability in the game (34%) — the only one that reliably
    // loses you the match. Now it strips 1, and `expireAfterQuestions` gives it back
    // 3 questions later, so a bad patch hurts without being permanent.
    engine: {
      trigger: everyQuestionTrigger,
      multiplier: { type: "damage_multiplier", factor: 1, condition: { on: "always" }, ignoreDefense: true },
      incorrectStat: [oneShot("defense", "self", -1)],
      expireAfterQuestions: 3,
      disable: noDisable,
    },
  },
  721: {
    pokemonId: 721,
    signatureMove: "Steam Eruption",
    internalKey: "steam_eruption",
    rarity: 3,
    trigger: { type: "on_correct", chance: 0.3 },
    effect: oppStatus("burn", 3),
    wiring: "post_answer",
    note: "Every-3-questions self-cleanse + once-per-battle full eruption are bespoke secondaries.",
    // 00-owner-spec.md row 54.
    engine: {
      trigger: streakN(3),
      status: [{ status: "burn", target: "opponent", chance: 0.3, questions: 3 }],
      stat: [oneShot("crit", "self", 2)],
      disable: revertAfter(1),
    },
  },

  // ── Generation VII ────────────────────────────────────────────────────────
  772: {
    pokemonId: 772,
    signatureMove: "Multi-Attack",
    internalKey: "chained_vigor",
    rarity: 2,
    trigger: { type: "battle_start" },
    effect: selfStage("attack", 1, "passive"),
    wiring: "bespoke",
    note: "Type: Null — Chained Vigor: a single locked +1 Attack on ONE preset category only (chosen at start, no adaptation). Category-gating is bespoke; the restrained shadow of Silvally.",
    // 00-owner-spec.md row 55. "Disable stat change after 2 incorrect" mapped to
    // revert_stat_after_incorrect uniformly (per task disable-mapping table);
    // this row has no `stat`, so the revert is a harmless no-op — the phase
    // payoff is the real effect.
    engine: {
      trigger: startOfBattleTrigger,
      phase: { type: "phase_window", windowN: 1, scaleToPct: 0, payoffAtIndex: 2, payoffMultiplier: 1.5 },
      disable: revertAfter(2),
    },
  },
  773: {
    pokemonId: 773,
    signatureMove: "Multi-Attack",
    internalKey: "rks_adaptation",
    rarity: 3,
    trigger: { type: "battle_start" },
    effect: compound(selfStage("attack", 1, "passive"), selfStage("crit", 1, "passive")),
    wiring: "bespoke",
    note: "Silvally — RKS Adaptation: attune to the battle's dominant category (+1 Atk & +1 Crit on it) with one mid-battle re-attune. Category-attune + swap is bespoke.",
    // 00-owner-spec.md row 56.
    engine: {
      trigger: startOfBattleTrigger,
      phase: { type: "phase_window", windowN: 1, scaleToPct: 0, payoffAtIndex: 2, payoffMultiplier: 2 },
      disable: revertAfter(2),
    },
  },
  785: {
    pokemonId: 785,
    signatureMove: "Nature's Madness",
    internalKey: "electric_terrain",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6 },
    effect: compound(
      { type: "flat_damage", amount: 0, fracOppLead: 0.5, ignoreDefense: true },
      { type: "immunity", questions: 2, statuses: ["sleep", "paralysis", "freeze"] },
      oppStage("speed", -1, 1),
    ),
    wiring: "bespoke",
    note: "Cut half the opponent's HP LEAD (never past parity) + Electric Terrain anti-status. Lead-cut is bespoke.",
    // 00-owner-spec.md row 57.
    engine: {
      trigger: streakN(5),
      stat: [oneShot("speed", "self", 1)],
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      disable: oncePerBattleDisable,
    },
  },
  786: {
    pokemonId: 786,
    signatureMove: "Nature's Madness",
    internalKey: "psychic_terrain",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6 },
    effect: oppStage("crit", -1, 3),
    wiring: "post_answer",
    note: "Psychic Terrain: opponent can't activate priority/auto-trigger abilities 2q (bespoke lock).",
    // 00-owner-spec.md row 58.
    engine: {
      trigger: streakN(5),
      stat: [oneShot("crit", "self", 1)],
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      disable: oncePerBattleDisable,
    },
  },
  787: {
    pokemonId: 787,
    signatureMove: "Nature's Madness",
    internalKey: "grassy_terrain",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6 },
    effect: compound({ type: "heal", target: "self", amount: 4 }, selfStage("defense", 1, 3)),
    wiring: "post_answer",
    note: "Grassy Terrain regen ~4 HP/question for 3q; here applied as a one-shot heal + Def. Per-question regen is bespoke.",
    // 00-owner-spec.md row 59.
    engine: {
      trigger: streakN(5),
      stat: [oneShot("attack", "self", 1)],
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      disable: oncePerBattleDisable,
    },
  },
  788: {
    pokemonId: 788,
    signatureMove: "Nature's Madness",
    internalKey: "misty_terrain",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6 },
    effect: { type: "cure", target: "self", status: "any" },
    wiring: "post_answer",
    note: "Misty Terrain: neither side can inflict status 3q + halve opp positive-stage durations (bespoke truce).",
    // 00-owner-spec.md row 60.
    engine: {
      trigger: streakN(5),
      stat: [oneShot("defense", "self", 1)],
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      disable: oncePerBattleDisable,
    },
  },
  789: {
    pokemonId: 789,
    signatureMove: "Splash",
    internalKey: "splash_useless",
    rarity: 1,
    trigger: { type: "bespoke", note: "Deliberate no-op." },
    effect: { type: "bespoke", note: "No mechanical battle effect (joke ability)." },
    wiring: "bespoke",
    note: "Intentionally does nothing in battle (Cosmog).",
    // 00-owner-spec.md row 61 SUPERSEDES the legacy no-op. Payoff is a frac-HP
    // effect (not a multiplier), carried on `phase.payoffEffect`.
    engine: {
      trigger: startOfBattleTrigger,
      phase: {
        type: "phase_window",
        windowN: 3,
        scaleToPct: 0,
        payoffAtIndex: 4,
        payoffEffect: { fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 },
      },
      disable: oncePerBattleDisable,
    },
  },
  790: {
    pokemonId: 790,
    signatureMove: "Cosmic Power",
    internalKey: "cosmic_power",
    rarity: 2,
    trigger: { type: "battle_start" },
    effect: compound(selfStage("defense", 2, "passive"), selfStage("attack", -1, "passive")),
    wiring: "engine",
    note: "Every 4 questions survived, +1 Atk back (bespoke slow charge).",
    // 00-owner-spec.md row 62.
    engine: {
      trigger: streakN(3),
      stat: [ramp("defense", "self", 2), oneShot("attack", "self", 1)],
      disable: revertAfter(1),
    },
  },
  791: {
    pokemonId: 791,
    signatureMove: "Sunsteel Strike",
    internalKey: "sunsteel_strike",
    rarity: 4,
    trigger: { type: "streak_at_least", n: 2 },
    effect: ignoreDef(),
    wiring: "passive_damage",
    note: "Full Metal Body (own stages can't be lowered) + once-per-battle nova are bespoke secondaries.",
    // 00-owner-spec.md row 63 / M2 fidelity F-b (owner ruling 2026-07-11):
    // UNCONDITIONAL ignore-Defense (every fire) AND ×2 only vs Lunala (#792) — now
    // both expressible: `ignoreDefenseAlways` is independent of the species
    // condition that gates the ×2 `factor` (§6). opponent_signature is server-eval
    // (M2 observer) + disable_opponent_ability (rest-of-battle suppression).
    engine: {
      trigger: opponentSignatureTrigger,
      multiplier: {
        type: "damage_multiplier",
        factor: 2,
        condition: { on: "opponent_species", dexId: 792 },
        ignoreDefenseAlways: true,
      },
      bespoke: [{ fx: "disable_opponent_ability" }],
      disable: revertAfter(1),
    },
  },
  792: {
    pokemonId: 792,
    signatureMove: "Moongeist Beam",
    internalKey: "moongeist_beam",
    rarity: 4,
    trigger: { type: "cooldown", everyN: 5 },
    effect: { type: "help", mode: "eliminate_option" },
    wiring: "bespoke",
    note: "Eliminated-option answer ignores Def; Shadow Shield (+2 Def while at full HP) is a bespoke passive.",
    // 00-owner-spec.md row 64. Cleanly conditional (no unconditional ignoreDef):
    // +2 Def one-shot + x2 vs Solgaleo (791) + disable opp ability. Server-eval trigger.
    engine: {
      trigger: opponentSignatureTrigger,
      stat: [oneShot("defense", "self", 2)],
      multiplier: { type: "damage_multiplier", factor: 2, condition: { on: "opponent_species", dexId: 791 } },
      bespoke: [{ fx: "disable_opponent_ability" }],
      disable: revertAfter(1),
    },
  },
  800: {
    pokemonId: 800,
    signatureMove: "Photon Geyser",
    internalKey: "photon_geyser",
    rarity: 3,
    trigger: { type: "bespoke", note: "Each question buff whichever of Attack/Speed is currently higher." },
    effect: selfStage("highest_self", 1, 1),
    wiring: "bespoke",
    note: "Auto-optimize (convert surplus); prism-split (+1 Atk & Spd) once per battle is bespoke.",
    // 00-owner-spec.md row 65.
    engine: {
      trigger: streakN(3),
      status: [{ status: "confused", target: "opponent", chance: 0.5, questions: 2 }],
      stat: [oneShot("attack", "self", 1)],
      disable: revertAfter(1),
    },
  },
  801: {
    pokemonId: 801,
    signatureMove: "Fleur Cannon",
    internalKey: "fleur_cannon",
    rarity: 3,
    trigger: { type: "every_nth_question", n: 5 },
    effect: compound({ type: "damage_calc", bonusAttackStage: 3 }, selfStage("attack", -1, 2)),
    wiring: "passive_damage",
    note: "WIRED: the -1 Atk recoil now follows the nuke via the post_answer catalog row (801), routed on the same hit through evaluatePassiveDamageSideEffects (was silently dropped, making it over-strong). Soul-Heart (+1 Crit per opponent wrong) is a bespoke reactive secondary.",
    // 00-owner-spec.md row 66. Decay: +3 Atk now, then -1 Def/question stacking.
    // Note the DECREASE is on Defense (not Attack) here — two distinct stats, so
    // the initial +3 Atk one-shot and the decaying -1/q Defense are separate specs.
    engine: {
      trigger: streakN(3),
      stat: [oneShot("attack", "self", 3), decay("defense", "self", 0, -1, -3)],
      disable: disableIncreaseAfter(1),
    },
  },
  802: {
    pokemonId: 802,
    signatureMove: "Spectral Thief",
    internalKey: "spectral_thief",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(
      { type: "stat_stage", target: "self", stat: "highest_opponent", delta: 1, duration: "passive" },
      { type: "damage_calc", bonusCritStage: 1 },
    ),
    wiring: "bespoke",
    note: "Steal opponent's highest positive stage (remove from them, add to self).",
    // 00-owner-spec.md row 67 SUPERSEDES the legacy steal-stage. WIRED (M3):
    // resolved entirely inside `use_pvp_live_item` — when the opponent consumes an
    // item, the server mirrors that same item's effect onto Marshadow (spending one
    // of its own 3 item uses). Server-eval by necessity: only the server sees the
    // opponent's item. Blank cooldown → none (ruling 6).
    engine: {
      trigger: opponentItemTrigger,
      bespoke: [{ fx: "use_opponent_item" }],
      disable: noDisable,
    },
  },
  803: {
    pokemonId: 803,
    signatureMove: "Fell Stinger",
    internalKey: "beast_boost_poipole",
    rarity: 2,
    docGap: true,
    trigger: { type: "every_nth_correct", n: 3 },
    effect: selfStage("attack", 1, "passive"),
    wiring: "post_answer",
    note: "NOT in v2 doc — fill design (Beast Boost: grow Attack). Confirm with product owner.",
    // 00-owner-spec.md row 68.
    // BALANCE (owner ruling 2026-07-13): payoff x3 -> x4. Poipole spends five
    // questions at HALF damage to earn one big hit, and measured that trade simply
    // loses (40% win rate). Raising the payoff is the owner's chosen fix.
    engine: {
      trigger: startOfBattleTrigger,
      phase: { type: "phase_window", windowN: 5, scaleToPct: 50, payoffAtIndex: 6, payoffMultiplier: 4 },
      disable: revertAfter(1),
    },
  },
  804: {
    pokemonId: 804,
    signatureMove: "Air Slash",
    internalKey: "beast_boost_naganadel",
    rarity: 3,
    docGap: true,
    trigger: { type: "every_nth_correct", n: 3 },
    effect: selfStage("speed", 1, "passive"),
    wiring: "post_answer",
    note: "NOT in v2 doc — fill design (Beast Boost: grow Speed). Confirm with product owner.",
    // 00-owner-spec.md row 69.
    engine: {
      trigger: startOfBattleTrigger,
      phase: { type: "phase_window", windowN: 3, scaleToPct: 75, payoffAtIndex: 4, payoffMultiplier: 2 },
      disable: revertAfter(1),
    },
  },
  805: {
    pokemonId: 805,
    signatureMove: "Gyro Ball",
    internalKey: "beast_boost_stakataka",
    rarity: 2,
    docGap: true,
    trigger: { type: "every_nth_correct", n: 3 },
    effect: selfStage("defense", 1, "passive"),
    wiring: "post_answer",
    note: "NOT in v2 doc — fill design (Beast Boost: grow Defense). Confirm with product owner.",
    // 00-owner-spec.md row 70. The +2 Atk one-shot fires with the q4 payoff
    // (timing carried by the phase's payoffAtIndex; the engine applies `stat`
    // when the phase pays off).
    // BALANCE (owner ruling 2026-07-13): payoff x1.5 -> x3 and the one-shot Attack
    // +2 -> +3. Stakataka deals NO damage for three questions to earn a x1.5 — the
    // worst trade in the roster (38% win rate, third from bottom).
    engine: {
      trigger: startOfBattleTrigger,
      stat: [oneShot("attack", "self", 3)],
      phase: { type: "phase_window", windowN: 3, scaleToPct: 0, payoffAtIndex: 4, payoffMultiplier: 3 },
      disable: revertAfter(1),
    },
  },
  806: {
    pokemonId: 806,
    signatureMove: "Mind Blown",
    internalKey: "beast_boost_blacephalon",
    rarity: 3,
    docGap: true,
    trigger: { type: "every_nth_correct", n: 3 },
    effect: selfStage("crit", 1, "passive"),
    wiring: "post_answer",
    note: "NOT in v2 doc — fill design (Beast Boost: grow Crit). Confirm with product owner.",
    // 00-owner-spec.md row 71, as CORRECTED by the owner 2026-07-12: Mind Blown goes
    // off once — x5 on question 1 — and Blacephalon spends the rest of the battle
    // burnt out, dealing 75% damage on questions 2 THROUGH 19 (not just q19, which is
    // how the cell was first read). The burnout is permanent: no wrong answer undoes
    // it, hence `none` rather than the revert-after-1 it used to carry.
    engine: {
      trigger: onQuestions(qRange(1, 19)),
      fixedIndex: [
        { type: "fixed_index", index: 1, outgoingMultiplier: 5 },
        ...outgoingOver(qRange(2, 19), 0.75),
      ],
      disable: noDisable,
    },
  },
  807: {
    pokemonId: 807,
    signatureMove: "Plasma Fists",
    internalKey: "plasma_fists",
    rarity: 3,
    trigger: { type: "fast_pair", underMs: 6000 },
    effect: compound(selfStage("speed", 1, "passive"), selfStage("crit", 1, "passive")),
    wiring: "post_answer",
    note: "WIRED (approximation): each sub-6s correct PAIR grants +1 Speed & +1 Crit (server post_answer, clamp-capped +3) — the chain's ramp. The doc's 'reset to 0 on any slow/wrong answer' is NOT modelled: the shipped stage system has no per-source stage accounting, so it cannot subtract exactly the chain-contributed Speed/Crit on a break without also clobbering stages from other sources. Documented as a deliberate limitation (see Phase 1 report) rather than force a lossy stage-decrement.",
    // M4 owner spec: 3-in-a-row -> +2 Atk & +2 Speed. Cell says neither "stacks
    // up to 3" nor "per correct", so one_shot (re-fires clamp at +3).
    engine: {
      trigger: streakN(3),
      stat: [oneShot("attack", "self", 2), oneShot("speed", "self", 2)],
      disable: revertAfter(1),
    },
  },
  808: {
    pokemonId: 808,
    signatureMove: "Flash Cannon",
    internalKey: "flash_cannon_meltan",
    rarity: 2,
    trigger: { type: "every_nth_correct", n: 3 },
    effect: selfStage("attack", 1, "passive"),
    wiring: "post_answer",
    note: "Molten Growth: permanent +1 Atk every 3 correct (compounds to clamp).",
    // M4 owner spec: 3-in-a-row -> -1 opp Def & -1 opp Speed, "stacks up to 3
    // PER CORRECT after the trigger" — the literal ramp wording, so ramp (not
    // one_shot, unlike its Zeraora sibling).
    engine: {
      trigger: streakN(3),
      stat: [ramp("defense", "opponent", -1), ramp("speed", "opponent", -1)],
      disable: revertAfter(2),
    },
  },
  809: {
    pokemonId: 809,
    signatureMove: "Double Iron Bash",
    internalKey: "double_iron_bash",
    rarity: 3,
    trigger: { type: "every_nth_question", n: 5 },
    effect: compound({ type: "damage_calc", secondHitFraction: 0.5 }, oppStatus("sleep", 1, 0.3)),
    wiring: "passive_damage",
    note: "WIRED: the second-hit fold plus a 30% Sleep sub-effect via the post_answer catalog row (809), routed on the same hit through evaluatePassiveDamageSideEffects (the 30% roll is done client-side, mirroring 244/643). Iron Fist passive +1 Atk all match is a bespoke secondary, not wired.",
    // M4 owner spec: 3-in-a-row -> 30% Sleep + x1.5 damage. No `stat` to revert,
    // so the "disable stat change after 2 incorrect" cell lands on the multiplier.
    engine: {
      trigger: streakN(3),
      status: [{ status: "sleep", target: "opponent", chance: 0.3, questions: 3 }],
      multiplier: flatMultiplier(1.5),
      disable: disableMultiplierAfter(2),
    },
  },

  // ── Generation VIII ───────────────────────────────────────────────────────
  888: {
    pokemonId: 888,
    signatureMove: "Behemoth Blade",
    internalKey: "behemoth_blade",
    rarity: 5,
    trigger: { type: "battle_start" },
    effect: selfStage("attack", 1, "passive"),
    wiring: "engine",
    note: "Intrepid Sword entry +1 Atk; extra +1 Atk while opponent leads on HP/stages is a bespoke conditional.",
    // M4 owner spec: 3-in-a-row -> x2 damage for 3 questions. The "or after 3
    // questions" half of the cooldown cell is `expireAfterQuestions`; the "after
    // 1 incorrect" half is the disable. Whichever lands first ends the window.
    engine: {
      trigger: streakN(3),
      multiplier: flatMultiplier(2),
      expireAfterQuestions: 3,
      disable: disableMultiplierAfter(1),
    },
  },
  889: {
    pokemonId: 889,
    signatureMove: "Behemoth Bash",
    internalKey: "behemoth_bash",
    rarity: 5,
    trigger: { type: "battle_start" },
    effect: selfStage("defense", 1, "passive"),
    wiring: "engine",
    note: "Dauntless Shield entry +1 Def (→+2 on a 4+ streak); status-reflect while trailing is bespoke.",
    // M4 owner spec: 3-in-a-row -> "For 3 questions, damage from opponent is 0".
    // The mirror of its Zacian sibling: Zacian doubles output, Zamazenta blunts
    // input. Server-enforced (see `shield`) — the ATTACKER computes damage, so
    // only the server can be trusted to throw it away.
    //
    // BALANCE (owner ruling 2026-07-13): `receivePct` was 0 — three questions of
    // total invulnerability, re-earned the moment the streak came back. It
    // measured a 70% win rate. Halving incoming damage keeps the "wall" identity
    // without making a good player untouchable.
    engine: {
      trigger: streakN(3),
      shield: { questions: 3, receivePct: 50 },
      expireAfterQuestions: 3,
      disable: disableEffectAfter(1),
    },
  },
  890: {
    pokemonId: 890,
    signatureMove: "Dynamax Cannon",
    internalKey: "dynamax_cannon",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(oppStage("speed", -2, 2), oppStage("attack", -1, 2)),
    wiring: "bespoke",
    note: "Charge one question then release; Pressure (opp cooldowns 15% slower) is a bespoke passive.",
    // M4 owner spec: 3-in-a-row -> self-inflicted damage 0 + 5% Badly Poisoned.
    // Owner ruling 2026-07-12: "self inflicting damage" is the WRONG-ANSWER
    // self-damage channel (`submit_pvp_live_answer._self_dmg`), NOT the damage
    // the opponent deals — Eternatus still takes their hits in full, it just
    // stops paying for its own mistakes. Hard-countered by the two wolves.
    engine: {
      trigger: streakN(3),
      nullifySelfDamage: true,
      status: [{ status: "badly-poisoned", target: "opponent", chance: 0.05, questions: 3 }],
      disable: disabledIfOpponentSpecies(888, 889),
    },
  },
  891: {
    pokemonId: 891,
    signatureMove: "Focus Energy",
    internalKey: "focus_energy",
    rarity: 2,
    trigger: { type: "on_correct" },
    effect: selfStage("crit", 1, "passive"),
    wiring: "post_answer",
    note: "Crit resets to 0 on a wrong answer (bespoke reset). No finisher (that's Urshifu).",
    // M4 owner spec: 3-in-a-row -> +3 own Crit (straight to the +3 clamp).
    engine: {
      trigger: streakN(3),
      stat: [oneShot("crit", "self", 3)],
      disable: revertAfter(1),
    },
  },
  892: {
    pokemonId: 892,
    signatureMove: "Surging Strikes",
    internalKey: "surging_strikes",
    rarity: 3,
    trigger: { type: "bespoke", note: "Pick style at start: Single Strike vs Rapid Strike." },
    effect: ignoreDef({ bonusCritStage: 3 }),
    wiring: "bespoke",
    note: "Single = one +3-crit ignore-Def hit; Rapid = next 3 answers +2 crit ignore-Def. Inherits Kubfu crit-ramp.",
    // M4 owner spec: FIVE-in-a-row -> ignore the opponent's Defense entirely +
    // 30% instant KO. The hardest streak gate in the game guards the single most
    // violent payoff; the KO roll is server-side (see `instant_ko`).
    engine: {
      trigger: streakN(5),
      multiplier: {
        type: "damage_multiplier",
        factor: 1,
        condition: { on: "always" },
        ignoreDefense: true,
      },
      bespoke: [{ fx: "instant_ko", chance: 0.3 }],
      disable: disableMultiplierAfter(1),
    },
  },
  893: {
    pokemonId: 893,
    signatureMove: "Jungle Healing",
    internalKey: "jungle_healing",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 5 },
    effect: compound({ type: "heal", target: "self", amount: 8 }, { type: "cure", target: "self", status: "any" }),
    // BALANCE (owner ruling 2026-07-13): `wiring` was "post_answer", which kept the
    // LEGACY heal-8-and-cure firing every 5th question ON TOP of the engine's
    // once-per-battle big heal — a sustain engine nobody authored. Moving the row
    // to "bespoke" wiring stops `evaluatePostAnswer` firing it; the engine below is
    // now Zarude's only healing. Its `pvp_signature_effects` post_answer rows are
    // dropped in the same migration. The big heal itself drops 100% -> 60%.
    wiring: "bespoke",
    note: "Leaf Guard (immune to Burn/Sleep while leading) is a bespoke passive.",
    // M4 owner spec: HP below 25% -> heal + clear status, paying -1 own Defence.
    // Once per battle: a single get-out-of-jail card, not a fountain.
    engine: {
      trigger: selfAfflictedTrigger(25),
      bespoke: [{ fx: "full_heal_cure" }],
      stat: [oneShot("defense", "self", -1)],
      disable: oncePerBattleDisable,
    },
  },
  894: {
    pokemonId: 894,
    signatureMove: "Thunder Cage",
    internalKey: "thunder_cage",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: oppStatus("paralysis", 3),
    wiring: "capped_payload",
    note: "Phase 4 (wired): manual fire cages the opponent's signature ability for 3 questions (server suppress_ability) + Paralysis. Transistor (your sub-5s answers +1 Atk while caged) remains bespoke.",
    // M4 owner spec: 3-in-a-row -> a random 1-15% chip EACH of the next 5
    // questions. Owner ruling 2026-07-12: percent of the opponent's MAX HP
    // (1-18 of 120), so the cage keeps biting even at low HP.
    engine: {
      trigger: streakN(3),
      bespoke: [{ fx: "frac_hp_random", minPct: 0.01, maxPct: 0.15, questions: 5 }],
      expireAfterQuestions: 5,
      disable: disableEffectAfter(1),
    },
  },
  895: {
    pokemonId: 895,
    signatureMove: "Dragon Energy",
    internalKey: "dragon_energy",
    rarity: 3,
    trigger: { type: "hp_threshold", side: "self", cmp: "above", pct: 0.8 },
    effect: selfStage("attack", 2, "passive"),
    wiring: "bespoke",
    note: "HP-scaling Attack: +2 at ≥80%, +1 at ≥50%, 0 below (needs continuous re-evaluation). Dragon's Maw full bonus on dragon/legend categories is bespoke.",
    // M4 owner spec: live from question 1 with no streak needed, damage scaled by
    // Regidrago's OWN remaining HP. Owner ruling 2026-07-12: re-evaluated every
    // question (a battle-start lock would just be a permanent x3), so it opens
    // devastating and fades as it is worn down. `latchOnTrigger` keeps the
    // start_of_battle trigger "held" all match so the ladder stays live.
    engine: {
      trigger: startOfBattleTrigger,
      multiplier: {
        type: "damage_multiplier",
        factor: 1,
        condition: { on: "always" },
        // BALANCE (owner ruling 2026-07-13): the top tier was x3. Regidrago opens
        // every battle at full HP, so x3 was what it hit with for the questions
        // that decide the match — a 65% win rate against the field. x2.5 keeps the
        // "devastating while healthy, fades as it is worn down" shape.
        hpTiers: [
          { atLeastPct: 100, factor: 2.5 },
          { atLeastPct: 80, factor: 2.25 },
          { atLeastPct: 60, factor: 2 },
          { atLeastPct: 40, factor: 1.5 },
          { atLeastPct: 0, factor: 1 },
        ],
      },
      latchOnTrigger: true,
      disable: disableMultiplierAfter(2),
    },
  },
  896: {
    pokemonId: 896,
    signatureMove: "Glacial Lance",
    internalKey: "glacial_lance_steed",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 5 },
    effect: compound(oppStage("speed", -1, 2), { type: "hamper", mode: "highlight_wrong" }),
    wiring: "post_answer",
    note: "Chilling Neigh ramp (+1 Atk every 3 correct) is a bespoke secondary.",
    // M4 owner spec: FIVE-in-a-row -> Freeze + x2 into grass/flying/ground. The
    // unfused steed pays a 5-streak for what Calyrex-Ice gets at 3.
    //
    // BALANCE (owner ruling 2026-07-13): Freeze chance was 1. Same turn-deletion
    // problem as its fused form; 40% here rather than Calyrex-Ice's 35% because
    // the 5-streak gate is genuinely harder to reach.
    engine: {
      trigger: streakN(5),
      status: [{ status: "freeze", target: "opponent", chance: 0.4, questions: 3 }],
      multiplier: vsTypes(2, "grass", "flying", "ground"),
      disable: disableMultiplierAfter(1),
    },
  },
  897: {
    pokemonId: 897,
    signatureMove: "Astral Barrage",
    internalKey: "astral_barrage_steed",
    rarity: 3,
    trigger: { type: "on_correct" },
    effect: { type: "drain", amount: 2 },
    wiring: "post_answer",
    note: "Grim Neigh +1 Speed every 3 correct + once-per-5 barrage (-1 Spd, ~6 HP drain) are bespoke secondaries.",
    // M4 owner spec: FIVE-in-a-row -> guaranteed Badly Poisoned + x2 into
    // psychic/ghost. Spectrier is to Calyrex-Shadow what Glastrier is to
    // Calyrex-Ice: same payoff, harder gate, narrower type list.
    engine: {
      trigger: streakN(5),
      status: [{ status: "badly-poisoned", target: "opponent", chance: 1, questions: 3 }],
      multiplier: vsTypes(2, "psychic", "ghost"),
      disable: disableMultiplierAfter(1),
    },
  },
  898: {
    pokemonId: 898,
    signatureMove: "Glacial Lance",
    internalKey: "as_one_glacial_reign",
    rarity: 4,
    trigger: { type: "cooldown", everyN: 4 },
    effect: compound(oppStage("speed", -2, 2), { type: "heal", target: "self", amount: 3 }),
    wiring: "post_answer",
    note: "Dex id 898 = ICE RIDER Calyrex (As One — Glacial Reign), unchanged. Shadow Rider Calyrex is a separate roster entry under synthetic id 10194 (below). Ramp (+1 Atk every 2 correct) + Unnerve are bespoke secondaries.",
    // M4 owner spec (CALYREX-ICE row): 3-in-a-row -> Freeze + x2 into
    // grass/flying/ground/ICE. The fusion upgrade over Glastrier: a 3-streak
    // instead of 5, and ice added to the type list.
    //
    // BALANCE (owner ruling 2026-07-13): the Freeze chance was 1 (guaranteed).
    // A frozen player forfeits the question outright, so a guaranteed Freeze on a
    // 3-streak simply deletes the opponent's turns — and the streak keeps
    // re-freezing them. It measured a 75% win rate against the whole Legendary
    // field, second only to Iron Boulder. 35% keeps the moment without the lock.
    engine: {
      trigger: streakN(3),
      status: [{ status: "freeze", target: "opponent", chance: 0.35, questions: 3 }],
      multiplier: vsTypes(2, "grass", "flying", "ground", "ice"),
      disable: disableMultiplierAfter(1),
    },
  },
  10194: {
    pokemonId: 10194,
    signatureMove: "Astral Barrage",
    internalKey: "as_one_spectral_reign",
    rarity: 4,
    trigger: { type: "on_correct" },
    effect: { type: "drain", amount: 3 },
    wiring: "post_answer",
    note: "SHADOW RIDER Calyrex (synthetic forme id 10194; Ice Rider keeps dex 898). As One — Spectral Reign: Grim Neigh drains ~3 HP each correct answer. +1 Speed every 2 correct + once-per-4q Unnerve/barrage (~7 HP drain) are bespoke secondaries. Distinct from Spectrier (897, drain 2) as the stronger fusion.",
    // M4 owner spec (CALYREX-SHADOW row): 3-in-a-row -> guaranteed Badly Poisoned
    // + x2 into psychic/ghost/FIGHTING/NORMAL. Fusion upgrade over Spectrier:
    // 3-streak instead of 5, and the type list doubles.
    engine: {
      trigger: streakN(3),
      status: [{ status: "badly-poisoned", target: "opponent", chance: 1, questions: 3 }],
      multiplier: vsTypes(2, "psychic", "ghost", "fighting", "normal"),
      disable: disableMultiplierAfter(1),
    },
  },

  // ── Generation IX ─────────────────────────────────────────────────────────
  1001: {
    pokemonId: 1001,
    signatureMove: "Ruination",
    internalKey: "ruination_tablets",
    rarity: 3,
    trigger: { type: "battle_start" },
    effect: oppStage("attack", -1, "passive"),
    wiring: "engine",
    note: "Wo-Chien — Tablets of Ruin: standing -1 opp Attack all match.",
    // M4 owner spec: the Ruination quartet all read the same — FIVE-in-a-row ->
    // halve the opponent's CURRENT HP + a 10% status, once per battle. A single
    // guaranteed 50% bite that can never finish anyone off on its own.
    engine: {
      trigger: streakN(5),
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      status: [{ status: "poisoned", target: "opponent", chance: 0.1, questions: 3 }],
      disable: oncePerBattleDisable,
    },
  },
  1002: {
    pokemonId: 1002,
    signatureMove: "Ruination",
    internalKey: "ruination_sword",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(oppStage("defense", -2, 3), ignoreDef()),
    wiring: "capped_payload",
    note: "Chien-Pao — Sword of Ruin: -2 opp Def (server manual row) + next 2 correct answers ignore the opponent's remaining Defense. WIRED: firing arms a 2-charge client-side ignore-Defense window (swordOfRuinCharges in live-pvp-battle-screen), folded into the next 2 correct hits' damage calc (client-computed, server-clamped, like the armed one-hit manual moves); the window does not persist across a reconnect.",
    // M4 owner spec: Ruination — halve current HP + 10% Freeze, once per battle.
    engine: {
      trigger: streakN(5),
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      status: [{ status: "freeze", target: "opponent", chance: 0.1, questions: 3 }],
      disable: oncePerBattleDisable,
    },
  },
  1003: {
    pokemonId: 1003,
    signatureMove: "Ruination",
    internalKey: "ruination_vessel",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(selfStage("defense", 2, 3), oppStage("crit", -1, 3)),
    wiring: "capped_payload",
    note: "Ting-Lu — Vessel of Ruin: +2 own Def + -1 opp Crit.",
    // M4 owner spec: Ruination — halve current HP + 10% Confusion, once per battle.
    engine: {
      trigger: streakN(5),
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      status: [{ status: "confused", target: "opponent", chance: 0.1, questions: 3 }],
      disable: oncePerBattleDisable,
    },
  },
  1004: {
    pokemonId: 1004,
    signatureMove: "Ruination",
    internalKey: "ruination_beads",
    rarity: 3,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound({ type: "flat_damage", amount: 0, fracOppHp: 0.5, ignoreDefense: true }, oppStatus("burn", 3)),
    wiring: "bespoke",
    note: "Chi-Yu — Beads of Ruin: deal half opponent's current HP (ignore Def) then Burn.",
    // M4 owner spec: Ruination — halve current HP + 10% Burn, once per battle.
    engine: {
      trigger: streakN(5),
      bespoke: [{ fx: "frac_hp_damage", pctOfOppCurrentHp: 0.5 }],
      status: [{ status: "burn", target: "opponent", chance: 0.1, questions: 3 }],
      disable: oncePerBattleDisable,
    },
  },
  1007: {
    pokemonId: 1007,
    signatureMove: "Collision Course",
    internalKey: "collision_course",
    rarity: 5,
    trigger: { type: "new_category" },
    effect: { type: "damage_calc", bonusAttackStage: 1, bonusCritStage: 1 },
    wiring: "passive_damage",
    note: "Per-new-category spike: the first correct answer on each new question category hits harder (+1 Atk & +1 Crit for that hit). Orichalcum Pulse (+1 Atk standing while leading on HP) remains a bespoke conditional passive.",
    // M4 owner spec: 3-in-a-row -> x2 into ice/flying/psychic/dragon/fairy.
    engine: {
      trigger: streakN(3),
      multiplier: vsTypes(2, "ice", "flying", "psychic", "dragon", "fairy"),
      disable: disableMultiplierAfter(2),
    },
  },
  1008: {
    pokemonId: 1008,
    signatureMove: "Electro Drift",
    internalKey: "electro_drift",
    rarity: 5,
    trigger: { type: "fast_answer", underMs: 5000 },
    effect: selfStage("speed", 1, "passive"),
    wiring: "post_answer",
    note: "Hadron Engine (opp -1 Speed while you lead) + once-per-battle 2-category preview are bespoke secondaries.",
    // M4 owner spec: 3-in-a-row -> x2 into ice/ground/dragon/fairy (one type
    // narrower than its Koraidon counterpart).
    engine: {
      trigger: streakN(3),
      multiplier: vsTypes(2, "ice", "ground", "dragon", "fairy"),
      disable: disableMultiplierAfter(2),
    },
  },
  1009: {
    pokemonId: 1009,
    signatureMove: "Hydro Steam",
    internalKey: "hydro_steam",
    rarity: 3,
    trigger: { type: "bespoke", note: "Active only under adversity: opponent holds any positive stage OR leads on HP." },
    effect: selfStage("attack", 2, "one_hit"),
    wiring: "bespoke",
    note: "Walking Wake — Hydro Steam: +2 Attack on correct answers WHILE the opponent is buffed or leading (dead weight when you're ahead). Protosynthesis (fast answers boost highest stat) is a bespoke secondary. Adversity gating is bespoke.",
    // M4 owner spec: drop below 50% HP -> x2 into water/dragon FOR THE REST OF
    // THE BATTLE. Owner ruling 2026-07-12: healing back above 50% does NOT
    // revoke it (`latchOnTrigger`) — once you've been on the ropes, the comeback
    // is banked. Blank cooldown cell = permanent (frozen ruling).
    engine: {
      trigger: selfAfflictedTrigger(50),
      multiplier: vsTypes(2, "water", "dragon"),
      latchOnTrigger: true,
      disable: noDisable,
    },
  },
  1010: {
    pokemonId: 1010,
    signatureMove: "Psyblade",
    internalKey: "psyblade",
    rarity: 3,
    trigger: { type: "bespoke", note: "Active only while any terrain/field effect is present." },
    effect: compound({ type: "damage_calc", bonusAttackStage: 1, bonusCritStage: 1 }),
    wiring: "bespoke",
    note: "Iron Leaves — Psyblade: +1 Atk & +1 Crit on correct answers WHILE any terrain/field effect is active (yours or a teammate's). Quark Drive (fast answers boost highest stat) is a bespoke secondary. Terrain gating is bespoke.",
    // M4 owner spec: the future-paradox mirror of Walking Wake — drop below 50%
    // HP -> x2 into grass/psychic for the rest of the battle. Same latch ruling.
    engine: {
      trigger: selfAfflictedTrigger(50),
      multiplier: vsTypes(2, "grass", "psychic"),
      latchOnTrigger: true,
      disable: noDisable,
    },
  },
  1014: {
    pokemonId: 1014,
    signatureMove: "Upper Hand",
    internalKey: "upper_hand",
    rarity: 3,
    trigger: { type: "bespoke", note: "Reactive: interrupt an incoming opponent ability activation (once per 4q)." },
    effect: oppStatus("poisoned", 3),
    wiring: "bespoke",
    note: "NOT WIREABLE with the current architecture (see Phase 2 report). The defining effect is to interrupt/cancel the opponent's signature ability BEFORE it applies. Ability activations are server-side (a per-player apply_pvp_signature_effect call) and only surface to the other client AFTER the fact via the pvp_live_effects INSERT — there is no client-observable 'opponent is about to activate' signal, and one player cannot pre-empt another player's server RPC in this trust model. Wiring only the Poison half would misrepresent the ability, so it is intentionally left unwired.",
    // M4 owner spec SUPERSEDES the un-wireable "interrupt" design above: the
    // Loyal Three now share one shape — 3-in-a-row -> crush the opponent's answer
    // timer to 5s (from PVP_BASE_TIMER_MS 20s) for 5 questions, plus a 10% status.
    // Okidogi's is Confusion.
    engine: {
      trigger: streakN(3),
      opponentTimer: { ms: 5000, questions: 5 },
      status: [{ status: "confused", target: "opponent", chance: 0.1, questions: 3 }],
      disable: { kind: "disable_effect_after_questions", n: 5 },
    },
  },
  1015: {
    pokemonId: 1015,
    signatureMove: "Sludge Wave",
    internalKey: "sludge_wave",
    rarity: 3,
    trigger: { type: "on_correct", chance: 0.4 },
    effect: oppStatus("poisoned", 3),
    wiring: "post_answer",
    note: "Toxic Chain: on a 3+ streak the proc inflicts Badly Poisoned instead (bespoke upgrade).",
    // M4 owner spec: Loyal Three shape — 5s timer for 5 questions + 10% Poison.
    engine: {
      trigger: streakN(3),
      opponentTimer: { ms: 5000, questions: 5 },
      status: [{ status: "poisoned", target: "opponent", chance: 0.1, questions: 3 }],
      disable: { kind: "disable_effect_after_questions", n: 5 },
    },
  },
  1016: {
    pokemonId: 1016,
    signatureMove: "Beat Up",
    internalKey: "beat_up",
    rarity: 3,
    trigger: { type: "pokedex_scaling", per: 25, max: 3 },
    effect: selfStage("attack", 1, "passive"),
    wiring: "engine",
    note: "Standing +1 Atk per 25 Pokédex entries captured (max +3), checked at battle start (v2 correction). Toxic Chain poison chance is a bespoke secondary.",
    // M4 owner spec: Loyal Three shape, but the nastiest of the three — the 5s
    // timer squeeze comes with a 10% INSTANT KO instead of a status. Also
    // re-authors dex 1016, whose R2 stat_scale branch was removed as a no-op in
    // the M2 migration (see 20260711133000).
    engine: {
      trigger: streakN(3),
      opponentTimer: { ms: 5000, questions: 5 },
      bespoke: [{ fx: "instant_ko", chance: 0.1 }],
      disable: { kind: "disable_effect_after_questions", n: 5 },
    },
  },
  1017: {
    pokemonId: 1017,
    signatureMove: "Ivy Cudgel",
    internalKey: "ivy_cudgel",
    rarity: 4,
    trigger: { type: "battle_start" },
    effect: selfStage("crit", 1, "passive"),
    wiring: "engine",
    note: "Ogerpon — Ivy Cudgel: standing +1 Crit at battle start (baseline Teal Mask encoded). The Mask loadout (Teal/Wellspring/Hearthflame/Cornerstone) + Embody Aspect swap is a bespoke secondary, not wired.",
    // M4 owner spec: the only row with TWO independent opponent conditions.
    // (a) +3 own Crit at battle start, but ONLY into grass/water/fire/rock —
    //     carried as a factor:1 multiplier whose `onSuccess` is the stat bump.
    // (b) Badly-poison the opponent on sight if they are one of the Loyal Three
    //     (1014/1015/1016) — Ogerpon's grudge, via `ifOpponentSpeciesAny`.
    engine: {
      trigger: startOfBattleTrigger,
      multiplier: {
        type: "damage_multiplier",
        factor: 1,
        condition: { on: "opponent_type_any", typeNames: ["grass", "water", "fire", "rock"] },
        onSuccess: [oneShot("crit", "self", 3)],
      },
      status: [
        {
          status: "badly-poisoned",
          target: "opponent",
          chance: 1,
          questions: 3,
          ifOpponentSpeciesAny: [1014, 1015, 1016],
        },
      ],
      disable: revertAfter(2),
    },
  },
  1020: {
    pokemonId: 1020,
    signatureMove: "Burning Bulwark",
    internalKey: "burning_bulwark",
    rarity: 3,
    trigger: { type: "bespoke", note: "Reactive: arm a bulwark once every 4 questions; blocks the next wrong answer + reflects an inflicted debuff as Burn." },
    effect: oppStatus("burn", 3),
    wiring: "bespoke",
    note: "Gouging Fire — Burning Bulwark: once per 4q, your next wrong answer takes 0 HP damage, and if the opponent inflicted a status/debuff on you that question it is reflected back as Burn. Reactive protect + reflect is bespoke.",
    // M4 owner spec: drop below 50% HP -> x2 damage for 3 questions + a
    // GUARANTEED Burn. Unlike Walking Wake this does NOT latch — it burns out
    // after 3 questions ("disables effect after 3 questions").
    engine: {
      trigger: selfAfflictedTrigger(50),
      multiplier: flatMultiplier(2),
      status: [{ status: "burn", target: "opponent", chance: 1, questions: 3 }],
      disable: { kind: "disable_effect_after_questions", n: 3 },
    },
  },
  1021: {
    pokemonId: 1021,
    signatureMove: "Thunderclap",
    internalKey: "thunderclap",
    rarity: 3,
    trigger: { type: "opponent_correct" },
    effect: compound(selfStage("attack", 1, "passive"), oppStage("attack", -1, 1)),
    wiring: "bespoke",
    note: "WIRED (Phase 2): reactive to the opponent answering correctly — derived from the synced match row's opponent *_correct_live counter incrementing between realtime renders (opponentAnsweredCorrectly / thunderclapFires in signature-bespoke.ts). Gated once per 4 of MY questions. On fire: +1 self Attack & -1 opp Attack via the server post_answer catalog (durations collapse to standing bumps, matching the shipped stage system which has no per-question expiry). Whiffs when the opponent is idle/wrong. Protosynthesis (fast answers boost highest stat) remains a bespoke secondary.",
    // M4 owner spec: Gouging Fire's twin — below 50% HP -> x2 for 3 questions +
    // a guaranteed Paralysis.
    engine: {
      trigger: selfAfflictedTrigger(50),
      multiplier: flatMultiplier(2),
      status: [{ status: "paralysis", target: "opponent", chance: 1, questions: 3 }],
      disable: { kind: "disable_effect_after_questions", n: 3 },
    },
  },
  1022: {
    pokemonId: 1022,
    signatureMove: "Mighty Cleave",
    internalKey: "mighty_cleave",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 4 },
    effect: ignoreDef(),
    wiring: "passive_damage",
    note: "Iron Boulder — Mighty Cleave: once every 4 questions your correct answer ignores the opponent's Defense stage. The extra -1 Def strip + Quark Drive are bespoke secondaries.",
    // M4 owner spec: below 50% HP -> take NO damage for 3 questions + a
    // guaranteed Confusion. Owner ruling 2026-07-12: the spreadsheet's "decrease
    // damage to opponent to 0" is a wording slip — read literally it would be a
    // pure self-nerf. It is a shield, like Zamazenta's.
    engine: {
      trigger: selfAfflictedTrigger(50),
      shield: { questions: 3, receivePct: 0 },
      status: [{ status: "confused", target: "opponent", chance: 1, questions: 3 }],
      disable: { kind: "disable_effect_after_questions", n: 3 },
    },
  },
  1023: {
    pokemonId: 1023,
    signatureMove: "Tachyon Cutter",
    internalKey: "tachyon_cutter",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 4 },
    effect: { type: "damage_calc", secondHitFraction: 0.15 },
    wiring: "passive_damage",
    note: "Iron Crown — Tachyon Cutter: once every 4 questions your correct answer strikes twice (full, then +15%). The 'no-miss' refund-on-wrong safety net + Quark Drive are bespoke secondaries.",
    // M4 owner spec: below 50% HP -> x2 for 3 questions + a guaranteed Confusion.
    engine: {
      trigger: selfAfflictedTrigger(50),
      multiplier: flatMultiplier(2),
      status: [{ status: "confused", target: "opponent", chance: 1, questions: 3 }],
      disable: { kind: "disable_effect_after_questions", n: 3 },
    },
  },
  1024: {
    pokemonId: 1024,
    signatureMove: "Tera Starstorm",
    internalKey: "tera_starstorm",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(selfStage("attack", 2, 3), selfStage("defense", 1, 3), selfStage("speed", 2, 1)),
    wiring: "capped_payload",
    note: "Tera for 3 questions: +2 Atk across all categories (ignore Def) + Tera Shell +1 Def + +2 Speed on activation. Non-mascot per file.",
    // M4 owner spec: the pure comeback button — while the opponent has at least
    // TWICE your HP, a 50% instant KO. Priced by two hard gates: you must be
    // getting crushed, and it switches off forever the moment you drink a potion
    // (`disabled_if_used_healing_item`) — you cannot heal into range and still
    // hold the trigger.
    // BALANCE (owner ruling 2026-07-13): the KO chance was 50%. The gate reads as
    // a hard one but it is not — "the opponent has twice your HP" just means you
    // are losing, which is common, and a coin-flip to win outright from there
    // measured a 73% win rate. 15% keeps it as a genuine last hope rather than a
    // reliable comeback.
    engine: {
      trigger: oppHpMultipleTrigger(2),
      bespoke: [{ fx: "instant_ko", chance: 0.15 }],
      disable: disabledIfUsedHealingItem,
    },
  },
  1025: {
    pokemonId: 1025,
    signatureMove: "Malignant Chain",
    internalKey: "malignant_chain",
    rarity: 4,
    trigger: { type: "capped_payload", usesPerBattle: 1 },
    effect: compound(oppStatus("badly-poisoned", 3), { type: "hamper", mode: "force_mistap" }),
    wiring: "capped_payload",
    note: "Phase 4 (wired): manual fire binds the opponent's signature ability for 3 questions (server suppress_ability) + Badly Poisoned. Poison Puppeteer (scramble + force mis-tap, only if the opponent was already statused) remains a client-only bespoke secondary.",
    // M4 owner spec: a clockwork row — on questions 5, 10 and 15 exactly, a 75%
    // Badly Poisoned. No streak, no HP gate, blank cooldown = never disables.
    engine: {
      trigger: onQuestions([5, 10, 15]),
      status: [{ status: "badly-poisoned", target: "opponent", chance: 0.75, questions: 3 }],
      disable: noDisable,
    },
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup
// ─────────────────────────────────────────────────────────────────────────────

/** The signature ability for a partner, ONLY if that partner is
 * Legendary/Mythical. Non-legendary partners return null (they get nothing). */
export function signatureAbilityFor(pokemonId: number | null | undefined): SignatureAbility | null {
  if (pokemonId == null) return null;
  if (!isLegendaryOrMythical(pokemonId)) return null;
  return SIGNATURE_ABILITIES[pokemonId] ?? null;
}

/** UI display name for a partner's signature move (or null). */
export function signatureMoveName(pokemonId: number | null | undefined): string | null {
  return signatureAbilityFor(pokemonId)?.signatureMove ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mew — Transform (dex 151): become the OPPONENT's ability for the battle
// ─────────────────────────────────────────────────────────────────────────────

/** Mew's own dex id — never a valid Transform target (can't copy itself). */
export const MEW_ID = 151;

/** Every real ability id that is NOT mascot-tier (rating-5) and not Mew — the
 * pool Transform draws from when the opponent has no signature ability. */
export const NON_MASCOT_ABILITY_IDS: readonly number[] = Object.values(SIGNATURE_ABILITIES)
  .filter((a) => a.pokemonId !== MEW_ID && !(isMascotTier(a.pokemonId) && a.rarity >= 5))
  .map((a) => a.pokemonId)
  .sort((a, b) => a - b);

/** Rating-3 ability ids (the pool Transform falls back to when the opponent's
 * ability is mascot-tier and can't be copied). */
export const RATING_THREE_ABILITY_IDS: readonly number[] = Object.values(SIGNATURE_ABILITIES)
  .filter((a) => a.pokemonId !== MEW_ID && a.rarity === 3)
  .map((a) => a.pokemonId)
  .sort((a, b) => a - b);

/** Every dex id whose catalog row carries an `engine` spec — i.e. the rows the
 * signature ENGINE drives (stat lifecycle owned by `sigEngineTick`), as opposed
 * to the older rows still driven purely by the legacy effect tables.
 *
 * This is the de-dup boundary: the legacy `stat_stage` rows for exactly these ids
 * are deleted server-side (migration 20260711133000), and the client must skip the
 * legacy stat path for them (`!ability.engine`). Both halves key off this set — if
 * they ever disagree, engine rows apply their stats twice or not at all.
 *
 * Derived from the catalog so it cannot drift as rows gain an `engine`. */
export const SIG_ENGINE_DEX_IDS: readonly number[] = Object.values(SIGNATURE_ABILITIES)
  .filter((a) => a.engine !== undefined)
  .map((a) => a.pokemonId)
  .sort((a, b) => a - b);

/**
 * Resolve which ability Mew "becomes" this battle, given the OPPONENT's partner
 * dex id (now known via Phase 1's `*_partner_id` columns). Pure and
 * deterministic given `rng`. Rules (from the v2 doc's Mew/Transform entry):
 *   • opponent runs a non-mascot signature ability  → copy it outright.
 *   • opponent runs a MASCOT (rating-5) ability      → can't copy; roll a
 *       random rating-3 ability instead (ceiling cap).
 *   • opponent has NO signature ability (non-Legendary partner, or unknown) →
 *       gain a random non-mascot ability from the roster (documented fallback).
 * Returns the dex id Mew should run all its evaluations / server lookups as, or
 * null only if a pool is somehow empty (defensive; never in practice).
 */
export function resolveMewTransform(
  opponentPartnerId: number | null | undefined,
  rng: () => number = Math.random,
): number | null {
  const pick = (pool: readonly number[]): number | null =>
    pool.length === 0 ? null : pool[Math.floor(rng() * pool.length) % pool.length];

  const oppAbility = signatureAbilityFor(opponentPartnerId);
  if (!oppAbility) {
    // No opponent ability to copy — gain a random non-mascot roster ability.
    return pick(NON_MASCOT_ABILITY_IDS);
  }
  if (isMascotTier(oppAbility.pokemonId) && oppAbility.rarity >= 5) {
    // Can't copy a mascot-tier ability — roll a random rating-3 instead.
    return pick(RATING_THREE_ABILITY_IDS);
  }
  return oppAbility.pokemonId;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure evaluation
// ─────────────────────────────────────────────────────────────────────────────

export interface SignatureContext {
  /** 0-based index of the question just answered. */
  questionIndex: number;
  /** Was this answer correct? */
  correct: boolean;
  /** Was the immediately previous answer correct? */
  prevCorrect: boolean;
  /** Streak AFTER this answer (0 if this answer was wrong). */
  streak: number;
  /** Streak BEFORE this answer. */
  streakBefore: number;
  /** Total correct answers so far this match, INCLUDING this one. */
  correctCount: number;
  /** ms elapsed when the answer locked. */
  answerElapsedMs: number;
  /** ms elapsed when the PREVIOUS answer locked (for fast_pair). */
  prevAnswerElapsedMs: number;
  /** The player's effective personal timer for this question, ms. */
  personalTimerMs: number;
  /** Self HP as a fraction 0..1. */
  selfHpPct: number;
  /** Opponent HP as a fraction 0..1. */
  oppHpPct: number;
  /** Is this question's category one not answered correctly before? */
  newCategory: boolean;
  /** The current question's category tag (for question_category_is). */
  questionCategory: string;
  /** Total Pokédex entries captured (for pokedex_scaling). */
  pokedexCount: number;
  /** Opponent's current Defense stage (for conditional ignore-defense). */
  oppDefenseStage: number;
  /** Did the opponent just answer correctly (reactive triggers)? */
  opponentAnsweredCorrect?: boolean;

  // ── signature-rework additions (00-owner-spec.md engine; buildSigContext
  // populates these — see docs/handoffs/signature-rework/03-frontend-a.md).
  // OPTIONAL so existing SignatureContext constructors (buildSigContext in
  // live-pvp-battle-screen.tsx, the QA test fixture) keep compiling before
  // Frontend-B/QA populate them. The predicates below treat `undefined` as
  // "this index/self-reactive trigger cannot fire yet" (safe no-op). ──
  /** 1-indexed question number (q1..q20) — `questionIndex + 1`. Used by
   *  `every_even_question`/`every_odd_question`/`on_questions`. When absent, the
   *  predicates derive it from `questionIndex + 1` where possible. */
  questionNo?: number;
  /** Self has an active status condition OR self HP is below the owner-spec's
   *  frozen 50% threshold (every "If inflicted by a status OR HP is below 50%"
   *  row in 00-owner-spec.md uses the same 50% cutoff, so this is precomputed
   *  once here rather than re-deriving `NewSignatureTrigger.pct` per row).
   *  Absent → treated as `false`. */
  selfAfflicted?: boolean;
  /** Opponent partner's types (for `MultiplierCondition` "opponent_type"/"opponent_type_any"). */
  oppType?: string[];
  /** Opponent partner's National Dex id (for "opponent_species"/"opponent_species_any"). */
  oppSpecies?: number;
}

/** Aggregated modifiers folded into the CURRENT correct answer's damage calc. */
export interface HitModifiers {
  ignoreOppDefenseStage: boolean;
  ignoreOwnNegativeStages: boolean;
  bonusAttackStage: number;
  bonusCritStage: number;
  secondHitFraction: number;
}

export const NO_HIT_MODIFIERS: HitModifiers = {
  ignoreOppDefenseStage: false,
  ignoreOwnNegativeStages: false,
  bonusAttackStage: 0,
  bonusCritStage: 0,
  secondHitFraction: 0,
};

/**
 * Does a trigger's (deterministic) gating condition hold this question? Used
 * for CURRENT-HIT modifiers, which never carry a random `chance` in the
 * catalog. `chance`-bearing triggers return false here and are handled by
 * `evaluatePostAnswer` (which rolls the dice).
 */
/** 1-indexed question number for the answer just resolved. Prefers the
 *  explicitly-populated `questionNo`; falls back to `questionIndex + 1` so the
 *  new client-eval triggers still fire before Frontend-B wires `questionNo`. */
function questionNoOf(ctx: SignatureContext): number {
  return ctx.questionNo ?? ctx.questionIndex + 1;
}

/**
 * Is this row driven by the engine? Owner ruling 2026-07-12 ("remove the legacy"):
 * the owner's spreadsheets are the single source of truth, so for any row carrying
 * an `engine` spec the legacy `trigger`/`effect`/`wiring` fields are DEAD — the
 * engine tick, `engine_status` and the bespoke/m4 phases deliver everything.
 *
 * As of M4 that is all 104 roster rows, so in practice the legacy evaluators are
 * inert everywhere. The gate stays because it is what makes that true by
 * construction: running both paths would double-apply every buff and inflict every
 * status twice (several rows carry BOTH a legacy post_answer catalog row and a new
 * engine_status one). The legacy `effect` data is retained only because
 * `describeSignatureEffect` still renders it in the UI.
 */
function isEngineOwned(ability: SignatureAbility): boolean {
  return ability.engine !== undefined;
}

/** `hpPct` (a 0..1 fraction) is strictly below `pct` (a whole percent). Absent HP
 *  never satisfies the gate — a context that didn't bother to carry HP must not
 *  accidentally hand out a desperation buff. */
function hpBelow(hpPct: number | undefined, pct: number): boolean {
  return hpPct !== undefined && hpPct < pct / 100;
}

/** Terapagos #1024: the opponent is sitting on at least `factor`x our HP. Both
 *  sides share PVP_MAX_HP, so the fractions compare directly. A dead player
 *  (selfHpPct <= 0) is excluded rather than treated as infinitely behind. */
function oppHpAtLeastMultiple(
  ctx: Pick<SignatureContext, "selfHpPct" | "oppHpPct">,
  factor: number,
): boolean {
  const self = ctx.selfHpPct;
  const opp = ctx.oppHpPct;
  if (self === undefined || opp === undefined || self <= 0) return false;
  return opp >= self * factor;
}

export function hitTriggerHolds(
  trigger: SignatureTrigger | NewSignatureTrigger,
  ctx: SignatureContext,
): boolean {
  switch (trigger.type) {
    case "passive":
      return true;
    case "every_nth_question":
      return (
        (ctx.questionIndex + 1) % trigger.n === 0 &&
        (!trigger.requirePrevCorrect || ctx.prevCorrect)
      );
    case "every_nth_correct":
      return ctx.correctCount > 0 && ctx.correctCount % trigger.n === 0;
    case "streak_at_least":
      return trigger.chance == null && ctx.streak >= trigger.n;
    case "first_half_answer":
      return trigger.chance == null && ctx.answerElapsedMs <= ctx.personalTimerMs / 2;
    case "last_seconds_answer":
      return ctx.personalTimerMs - ctx.answerElapsedMs <= trigger.withinMs;
    case "fast_answer":
      return ctx.answerElapsedMs < trigger.underMs;
    case "fast_pair":
      return (
        ctx.prevCorrect &&
        ctx.answerElapsedMs < trigger.underMs &&
        ctx.prevAnswerElapsedMs < trigger.underMs
      );
    case "cooldown":
      return trigger.chance == null && (ctx.questionIndex + 1) % trigger.everyN === 0;
    case "new_category":
      return ctx.newCategory;
    case "question_category_is":
      return ctx.questionCategory === trigger.category;
    // ── signature-rework (00-owner-spec.md) client-eval triggers ────────────
    case "streak_in_a_row":
      return ctx.streak >= trigger.n;
    case "start_of_battle":
      return ctx.questionIndex === 0;
    case "every_question":
      return true;
    case "every_even_question":
      return questionNoOf(ctx) % 2 === 0;
    case "every_odd_question":
      return questionNoOf(ctx) % 2 === 1;
    case "on_questions":
      return trigger.indices.includes(questionNoOf(ctx));
    case "self_afflicted_or_hp_below":
      return ctx.selfAfflicted === true || hpBelow(ctx.selfHpPct, trigger.pct);
    case "opp_hp_multiple_of_self":
      return oppHpAtLeastMultiple(ctx, trigger.factor);
    // Server-eval (reactive-to-opponent) triggers — the client never fires
    // these itself; a server-side observer applies them (M2/M3, architecture
    // §2a/§9 R3). Kept as explicit cases (not `default`) so the intent reads.
    case "opponent_signature":
    case "hp_reaches_zero":
    case "opponent_uses_item":
      return false;
    default:
      return false;
  }
}

function collectDamageCalc(effect: SignatureEffect, out: DamageCalcEffect[]): void {
  if (effect.type === "damage_calc") out.push(effect);
  else if (effect.type === "compound") effect.effects.forEach((e) => collectDamageCalc(e, out));
}

// `evaluateHitModifiers` lived here. Deleted 2026-07-13.
//
// Two things made it worth removing rather than leaving alone. It was DEAD — it opened
// with `if (isEngineOwned(ability)) return NO_HIT_MODIFIERS` and all 104 rows have an
// engine. And its NAME COLLIDED with a completely different, LIVE `evaluateHitModifiers`
// in `pvp-combat.ts` (the engine's damage multiplier). Both were imported into
// live-pvp-battle-screen, one aliased to `evaluateSigMultiplier` — so you could not read
// a call there and know which function you were looking at. There is now exactly one
// `evaluateHitModifiers` in the codebase, and it is the live one.

/** An effect the caller should actually apply (post-answer, non-damage-calc). */
export interface AppliedSignatureEffect {
  effect: SignatureEffect;
}

function collectApplicable(effect: SignatureEffect, out: SignatureEffect[]): void {
  if (effect.type === "compound") effect.effects.forEach((e) => collectApplicable(e, out));
  else if (effect.type === "damage_calc" || effect.type === "bespoke") return;
  else out.push(effect);
}

/** Does a post-answer trigger fire this question (rolling any `chance`)? */
export function postTriggerFires(
  trigger: SignatureTrigger | NewSignatureTrigger,
  ctx: SignatureContext,
  rng: () => number,
): boolean {
  const roll = (chance?: number) => chance == null || rng() < chance;
  switch (trigger.type) {
    case "on_correct":
      return ctx.correct && roll(trigger.chance);
    case "on_wrong":
      return !ctx.correct && roll(trigger.chance);
    case "streak_at_least":
      return ctx.correct && ctx.streak >= trigger.n && roll(trigger.chance);
    case "streak_break":
      return !ctx.correct && ctx.streakBefore > 0;
    case "every_nth_question":
      return (
        (ctx.questionIndex + 1) % trigger.n === 0 &&
        (!trigger.requirePrevCorrect || ctx.prevCorrect)
      );
    case "every_nth_correct":
      return ctx.correct && ctx.correctCount > 0 && ctx.correctCount % trigger.n === 0;
    case "first_half_answer":
      return ctx.correct && ctx.answerElapsedMs <= ctx.personalTimerMs / 2 && roll(trigger.chance);
    case "last_seconds_answer":
      return ctx.correct && ctx.personalTimerMs - ctx.answerElapsedMs <= trigger.withinMs;
    case "fast_answer":
      return ctx.correct && ctx.answerElapsedMs < trigger.underMs;
    case "fast_pair":
      return (
        ctx.correct &&
        ctx.prevCorrect &&
        ctx.answerElapsedMs < trigger.underMs &&
        ctx.prevAnswerElapsedMs < trigger.underMs
      );
    case "cooldown":
      return (ctx.questionIndex + 1) % trigger.everyN === 0 && roll(trigger.chance);
    case "new_category":
      return ctx.correct && ctx.newCategory;
    case "question_category_is":
      return ctx.correct && ctx.questionCategory === trigger.category;
    case "opponent_correct":
      return ctx.opponentAnsweredCorrect === true;
    case "opponent_wrong":
      return ctx.opponentAnsweredCorrect === false;
    case "hp_threshold":
      return trigger.side === "self"
        ? trigger.cmp === "below"
          ? ctx.selfHpPct <= trigger.pct
          : ctx.selfHpPct >= trigger.pct
        : trigger.cmp === "below"
          ? ctx.oppHpPct <= trigger.pct
          : ctx.oppHpPct >= trigger.pct;
    // ── signature-rework (00-owner-spec.md) client-eval triggers — mirrors
    // hitTriggerHolds; these are all deterministic (no `chance` to roll), gated
    // additionally on `ctx.correct` here since post-answer effects only fire on
    // a correct answer (parity with every other case in this switch). ────────
    case "streak_in_a_row":
      return ctx.correct && ctx.streak >= trigger.n;
    // …with ONE exception: a battle-start ability is setup, not a reward for the
    // first answer. Requiring `correct` here silently killed it for the whole
    // battle whenever q1 was missed — the row fires once at q1 and most carry
    // `once_per_battle`, so there was never a second chance. That took out Uxie
    // #480, Mesprit #481, Regidrago #895, Ogerpon #1017, Cosmog #789, Mew #151,
    // Type: Null #772, Silvally #773 and the three Ultra Beasts. Owner ruling
    // (2026-07-13): it fires at the start of the battle, win or lose q1 — which
    // is what `NewSignatureTrigger.start_of_battle` ("fires once before Q1
    // resolves") always said it did.
    case "start_of_battle":
      return ctx.questionIndex === 0;
    case "every_question":
      return ctx.correct;
    case "every_even_question":
      return ctx.correct && questionNoOf(ctx) % 2 === 0;
    case "every_odd_question":
      return ctx.correct && questionNoOf(ctx) % 2 === 1;
    case "on_questions":
      return ctx.correct && trigger.indices.includes(questionNoOf(ctx));
    case "self_afflicted_or_hp_below":
      return ctx.correct && (ctx.selfAfflicted === true || hpBelow(ctx.selfHpPct, trigger.pct));
    case "opp_hp_multiple_of_self":
      return ctx.correct && oppHpAtLeastMultiple(ctx, trigger.factor);
    // Server-eval triggers — see hitTriggerHolds comment above.
    case "opponent_signature":
    case "hp_reaches_zero":
    case "opponent_uses_item":
      return false;
    default:
      return false;
  }
}

/** The only `SignatureContext` fields a `NewSignatureTrigger` can read. Narrowed
 *  so the bot path can drive the engine without fabricating a full context
 *  (timers, category, pokédex count… none of which any engine arm consults). */
export type EngineTriggerContext = Pick<SignatureContext, "correct" | "streak" | "questionIndex"> &
  Partial<Pick<SignatureContext, "questionNo" | "selfAfflicted" | "selfHpPct" | "oppHpPct">>;

/**
 * Resolve `sigEngineTick`'s `_trigger_fired` for a row's `engine.trigger` on THIS
 * answer — the single entry point both the human and bot tick paths call.
 *
 * Server-site arms (`opponent_signature` / `hp_reaches_zero` / `opponent_uses_item`)
 * are decided by the server observer, never here, so they resolve to `false`.
 * Every client-site arm delegates to `postTriggerFires`, which is the ONE
 * definition of these predicates — callers must not re-implement the switch.
 */
export function engineTriggerFired(
  trigger: NewSignatureTrigger,
  ctx: EngineTriggerContext,
  rng: () => number = Math.random,
): boolean {
  if (trigger.where === "server") return false;
  // Safe widening: the arms reachable here read only the fields EngineTriggerContext
  // carries — guaranteed by NewSignatureTrigger's shape (7 client arms), asserted in tests.
  return postTriggerFires(trigger, ctx as SignatureContext, rng);
}

// `evaluatePostAnswer`, `evaluatePassiveDamageSideEffects` and `evaluateBattleStart`
// lived here. All three deleted 2026-07-13 (owner ruling), and for one reason:
//
//     if (!ability || isEngineOwned(ability)) return [];
//
// `isEngineOwned` is `ability.engine !== undefined`, and every one of the 104
// Legendary/Mythical rows has an engine. So all three returned empty on every call,
// for every Pokemon, in every match — the entire legacy delivery layer was inert.
// The live screen gated its RPCs on their output, so those RPCs never fired either.
//
// This is the trap the whole system sets: a function can be exported, imported, called
// from the live battle screen and backed by rows in production, and still do nothing.
// `scripts/balance-sim/liveness.ts` now computes that from source instead of trusting
// a comment like this one. Run it before deleting — or resurrecting — anything here.
//
// Everything they used to deliver comes from the engine tick now (`sigEngineTick` +
// the `engine_status` / `m4_fx` / `m4_window` phases).

// ─────────────────────────────────────────────────────────────────────────────
// Manual ("charge and fire") abilities
// ─────────────────────────────────────────────────────────────────────────────
//
// A subset of manual abilities decompose entirely into server-catalog effects
// (stat_stage / status / cure / heal / drain) — Aeroblast, Mist Ball, Luster
// Purge, Dark Void, Seed Flare, Relic Song, the Ruination burst pair, Tera
// Starstorm, etc. These are "server-fireable": the live battle screen shows a
// generic charge/Fire affordance and, on tap, calls the SAME server-validated
// RPC as berries with phase="capped_payload" (magnitude looked up server-side by dex
// id; the server enforces the per-battle use cap). Manual abilities whose fire
// payoff is a damage-calc/one-hit modifier (Psystrike, Spacial Rend, Roar of
// Time, Dragon Ascent) or a bespoke multi-stage sequence (Geomancy, Dynamax
// Cannon, Thunder Cage) are NOT server-fireable yet and are handled elsewhere /
// documented as follow-up — `hasCappedPayload` returns false for them so
// no dead Fire button is shown.

/** True when a manual ability applies at least one server-catalog effect on
 * fire (i.e. `apply_pvp_signature_effect(phase="capped_payload")` will do something). */
export function hasCappedPayload(ability: SignatureAbility | null): boolean {
  if (!ability || ability.wiring !== "capped_payload") return false;
  const out: SignatureEffect[] = [];
  collectApplicable(ability.effect, out);
  return out.length > 0;
}

/** Per-battle use cap for a manual ability (0 if not manual). */
export function cappedPayloadUses(ability: SignatureAbility | null): number {
  if (!ability || ability.trigger.type !== "capped_payload") return 0;
  return ability.trigger.usesPerBattle;
}

/** Merge two sets of hit modifiers (used to fold an armed manual one-hit
 * modifier on top of any passive_damage modifiers for the same answer). */
export function mergeHitModifiers(a: HitModifiers, b: HitModifiers): HitModifiers {
  return {
    ignoreOppDefenseStage: a.ignoreOppDefenseStage || b.ignoreOppDefenseStage,
    ignoreOwnNegativeStages: a.ignoreOwnNegativeStages || b.ignoreOwnNegativeStages,
    bonusAttackStage: a.bonusAttackStage + b.bonusAttackStage,
    bonusCritStage: a.bonusCritStage + b.bonusCritStage,
    // A second-hit fraction doesn't sum meaningfully; the larger wins.
    secondHitFraction: Math.max(a.secondHitFraction, b.secondHitFraction),
  };
}

/**
 * Plain-language summary of whichever modifiers actually fired on this hit,
 * for the passive_damage toast-gap fix — describes the resolved
 * `HitModifiers` directly (never a hardcoded per-ability string), so it can
 * never drift from what the ability's own `damage_calc` payload produced.
 * Returns null when nothing fired (nothing to announce).
 */
export function describeHitModifiers(mods: HitModifiers): string | null {
  const parts: string[] = [];
  if (mods.ignoreOppDefenseStage) parts.push("ignores their Defense");
  if (mods.ignoreOwnNegativeStages) parts.push("shrugs off its own stat drop");
  if (mods.bonusAttackStage > 0) parts.push(`+${mods.bonusAttackStage} Attack this hit`);
  if (mods.bonusCritStage > 0) parts.push(`+${mods.bonusCritStage} Crit this hit`);
  if (mods.secondHitFraction > 0) parts.push("extra hit");
  return parts.length > 0 ? parts.join(", ") : null;
}

// Plain-language nouns for the statuses an ability can inflict (kept local so
// the describer stays a self-contained pure helper — no game-data value import).
const STATUS_NOUN: Record<StatusKind, string> = {
  burn: "Burn",
  sleep: "Sleep",
  paralysis: "Paralysis",
  freeze: "Freeze",
  poisoned: "Poison",
  "badly-poisoned": "Bad Poison",
  confused: "Confusion",
};

function statStageLabel(stat: StatStageEffect["stat"]): string {
  switch (stat) {
    case "attack":
      return "Attack";
    case "defense":
      return "Defense";
    case "speed":
      return "Speed";
    case "crit":
      return "Crit";
    case "random":
      return "a random stat";
    case "highest_self":
      return "its highest stat";
    case "highest_opponent":
      return "the opponent's highest stat";
    case "lowest_self":
      return "its lowest stat";
  }
}

/** `+2` / `−1` (using the same minus glyph as the in-battle stat chips). */
function signedStage(delta: number): string {
  return `${delta > 0 ? "+" : "−"}${Math.abs(delta)}`;
}

/** Describe a single (non-compound) signature effect leaf, or null when it has
 * no player-visible plain-language effect (client-only hamper/help/bespoke). */
function describeEffectLeaf(effect: SignatureEffect): string | null {
  switch (effect.type) {
    case "stat_stage":
      return effect.target === "self"
        ? `${signedStage(effect.delta)} ${statStageLabel(effect.stat)}`
        : `${signedStage(effect.delta)} opponent ${statStageLabel(effect.stat)}`;
    case "status":
      return effect.target === "opponent"
        ? `inflicts ${STATUS_NOUN[effect.status]}`
        : `${STATUS_NOUN[effect.status]} on self`;
    case "heal":
      return `heals ${effect.amount} HP`;
    case "drain":
      return `drains ${effect.amount} HP`;
    case "cure":
      return "cures status";
    case "cleanse":
      return "cures status & resets drops";
    case "swap_stages":
      return "swaps stat changes";
    case "immunity":
      return "status immunity";
    case "flat_damage":
      return effect.fracOppHp
        ? "cuts opponent's HP"
        : effect.fracOppLead
          ? "cuts opponent's lead"
          : `deals ${effect.amount} damage`;
    case "damage_calc": {
      const mods: HitModifiers = {
        ...NO_HIT_MODIFIERS,
        ignoreOppDefenseStage: !!effect.ignoreOppDefenseStage,
        ignoreOwnNegativeStages: !!effect.ignoreOwnNegativeStages,
        bonusAttackStage: effect.bonusAttackStage ?? 0,
        bonusCritStage: effect.bonusCritStage ?? 0,
        secondHitFraction: effect.secondHitFraction ?? 0,
      };
      return describeHitModifiers(mods);
    }
    default:
      // hamper / help / bespoke — no server-magnitude, client-only or custom.
      return null;
  }
}

/**
 * Concise plain-language explainer of a partner's signature-ability effect,
 * derived straight from the catalog `effect` payload (never invented). Used for
 * BOTH the acting-player toast and the opponent-facing relay (which resolves it
 * locally from the effect's dex id — text is never trusted off the wire). Self
 * effects read plainly ("+1 Attack"); opponent-targeted effects say "opponent"
 * ("inflicts Burn", "−1 opponent Defense"). Returns null for abilities whose
 * effect has no plain-language slice (pure hamper/help/bespoke), so the caller
 * can fall back to the bare move name.
 */
export function describeSignatureEffect(pokemonId: number | null | undefined): string | null {
  const ability = signatureAbilityFor(pokemonId);
  if (!ability) return null;
  // An engine-owned row's legacy `effect` tree is inert (see `isEngineOwned`) —
  // describing it would narrate an ability the game no longer has. The engine is
  // the only honest source for all 104 Legendary/Mythical rows.
  if (ability.engine) return describeEngineEffects(ability.engine);
  const leaves: SignatureEffect[] = [];
  const walk = (e: SignatureEffect): void => {
    if (e.type === "compound") e.effects.forEach(walk);
    else leaves.push(e);
  };
  walk(ability.effect);
  const parts = leaves.map(describeEffectLeaf).filter((s): s is string => s != null);
  return parts.length > 0 ? parts.join(", ") : null;
}

/** `2` → "2nd", `4` → "4th". Used by the trigger describer. */
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Seconds label from a millisecond window ("5s", "1.5s"). */
function msSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
}

/**
 * Plain-language "when it triggers" clause for the TAPPABLE ability popover.
 * Kept out of the transient in-battle toast (which stays terse). Returns null
 * for a bespoke trigger with no generic phrasing so the caller can degrade.
 */
function describeSignatureTrigger(trigger: SignatureTrigger): string | null {
  switch (trigger.type) {
    case "battle_start":
      return "at the start of battle";
    case "passive":
      return "on every hit";
    case "on_correct":
      return "when you answer correctly";
    case "on_wrong":
      return "when you answer wrong";
    case "streak_at_least":
      return `on a correct answer at a streak of ${trigger.n}+`;
    case "streak_break":
      return "when a wrong answer breaks your streak";
    case "every_nth_question":
      return trigger.requirePrevCorrect
        ? `every ${ordinal(trigger.n)} question, if the previous was correct`
        : `every ${ordinal(trigger.n)} question`;
    case "every_nth_correct":
      return `on every ${ordinal(trigger.n)} correct answer`;
    case "first_half_answer":
      return "when you answer in the first half of the timer";
    case "last_seconds_answer":
      return `when you answer in the last ${msSeconds(trigger.withinMs)}`;
    case "fast_answer":
      return `when you answer within ${msSeconds(trigger.underMs)}`;
    case "fast_pair":
      return `on two answers in a row under ${msSeconds(trigger.underMs)}`;
    case "hp_threshold":
      return `when ${trigger.side === "self" ? "your" : "the opponent's"} HP ${
        trigger.cmp === "below" ? "drops below" : "rises above"
      } ${trigger.pct}%`;
    case "opponent_correct":
      return "when the opponent answers correctly";
    case "opponent_wrong":
      return "when the opponent answers wrong";
    case "new_category":
      return "the first time you answer a new category correctly";
    case "question_category_is":
      return `on a correct ${trigger.category} question`;
    case "pokedex_scaling":
      return "scaling with your Pokédex progress";
    case "cooldown":
      return `every ${trigger.everyN} questions`;
    case "capped_payload":
      return "when you tap Fire";
    case "bespoke":
      return null;
  }
}

/** True for a deliberately-useless joke ability (e.g. Cosmog's Splash). */
function isNoOpSignature(ability: SignatureAbility): boolean {
  return ability.internalKey === "splash_useless";
}

/**
 * Fuller, sentence-form explainer for the TAPPABLE ability popover — states the
 * effect AND when it triggers, plus any proc chance. The transient in-battle
 * toast deliberately stays terse (see `describeSignatureEffect`); this richer
 * text is safe here because the player opens it on demand. Degrades gracefully:
 * effect-only when the trigger has no generic phrasing, "Triggers …" when the
 * effect is purely client-side/bespoke, and a fixed line for a no-op joke
 * ability. Returns null only when the partner has no signature ability at all.
 */
export function describeSignatureFull(pokemonId: number | null | undefined): string | null {
  const ability = signatureAbilityFor(pokemonId);
  if (!ability) return null;
  // Same reason as `describeSignatureEffect`: for an engine-owned row the legacy
  // trigger/effect pair describes the PRE-rework ability. Render the engine.
  //
  // This MUST come before the no-op check. Cosmog #789 is the only joke row, and the
  // rework gave it real teeth — it charges for three questions and then halves the
  // opponent's HP. Testing `isNoOpSignature` first told every Cosmog owner "nothing
  // happens, has no effect whatsoever" while it was taking 60 HP off them.
  if (ability.engine) return describeEngineSpec(ability.engine);
  if (isNoOpSignature(ability)) return "Nothing happens. Has no effect whatsoever.";
  const effect = describeSignatureEffect(pokemonId);
  const when = describeSignatureTrigger(ability.trigger);
  const chance =
    "chance" in ability.trigger && ability.trigger.chance != null
      ? ` (${Math.round(ability.trigger.chance * 100)}% chance)`
      : "";
  if (effect && when) return `${capitalize(effect)} ${when}${chance}.`;
  if (effect) return `${capitalize(effect)}.`;
  if (when) return `Triggers ${when}${chance}.`;
  return null;
}

// `manualHitModifiers`, `hasClientManualHit` and `CLIENT_HIT_MANUAL_IDS` lived here.
// Deleted 2026-07-13.
//
// They powered the client-armed one-hit modifier: pressing Fire on Psystrike /
// Dragon Ascent / Shadow Force "armed" a damage bonus onto your next correct answer.
// The engine replaced that on 2026-07-12 (those three fire off their own trigger
// now), and the battle screen gated the whole path on `!ability.engine` — true for
// none of the 104 rows. Nothing ever armed the ref, so the code that consumed it was
// dead too. Verified by `scripts/balance-sim/liveness.ts`.

/** Ids whose `manual`-phase effects the engine trigger auto-delivers via the server
 *  RPC. (Not a Fire button — see `fireCappedPayload`; the name `manual` is historical.) */
export const CAPPED_PAYLOAD_IDS: readonly number[] = Object.values(SIGNATURE_ABILITIES)
  .filter((a) => hasCappedPayload(a))
  .map((a) => a.pokemonId)
  .sort((a, b) => a - b);

// ─────────────────────────────────────────────────────────────────────────────
// Build-time integrity (mirrors impl-note #6, adapted to the real roster)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every real Legendary/Mythical id must have exactly one ability entry, and
 * `internalKey`s must be unique even where `signatureMove` repeats. Returns a
 * list of problems (empty = OK) so a test can assert on it.
 */
export function checkCatalogIntegrity(ids: readonly number[]): string[] {
  const problems: string[] = [];
  const keys = new Set<string>();
  for (const id of ids) {
    const a = SIGNATURE_ABILITIES[id];
    if (!a) {
      problems.push(`missing ability for id ${id}`);
      continue;
    }
    if (a.pokemonId !== id) problems.push(`id ${id} entry has pokemonId ${a.pokemonId}`);
    if (keys.has(a.internalKey)) problems.push(`duplicate internalKey ${a.internalKey}`);
    keys.add(a.internalKey);
  }
  const extra = Object.keys(SIGNATURE_ABILITIES)
    .map(Number)
    .filter((id) => !ids.includes(id));
  for (const id of extra) problems.push(`catalog has id ${id} not in the roster`);
  return problems;
}

/** Whether a partner's ability is mascot-tier (rating-5 flavor / gold ring). */
export function isMascotAbility(pokemonId: number): boolean {
  return isMascotTier(pokemonId) && (SIGNATURE_ABILITIES[pokemonId]?.rarity ?? 0) >= 5;
}
