import type { PvpStat, StatusKind } from "./game-data";
import { isLegendaryOrMythical, isMascotTier } from "./legendary-data";

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

export type SideRef = "self" | "opponent";

/** How the live loop should handle an ability. */
export type WiringMode =
  /** Standing buff/debuff resolved once at battle start (persistent stage). */
  | "battle_start"
  /** Modifies the CURRENT correct answer's damage calc (ignore def, bonus atk/crit). */
  | "passive_damage"
  /** Fires an effect after an answer resolves (persistent stage / status / heal / hamper). */
  | "post_answer"
  /** Player-fired button; data present but no in-battle UI wired yet. */
  | "manual"
  /** Needs a custom handler the generic engine can't express; data present, not auto-fired. */
  | "bespoke";

export type SignatureTrigger =
  | { type: "battle_start" }
  /** Always-on damage-calc modifier (no roll). */
  | { type: "passive" }
  | { type: "on_correct"; chance?: number }
  | { type: "on_wrong"; chance?: number }
  /** Correct answer while streak (after this answer) ≥ n. */
  | { type: "streak_at_least"; n: number; chance?: number }
  /** A wrong answer that broke a live streak. */
  | { type: "streak_break" }
  /** The (questionIndex+1) is a multiple of n; optionally require the previous answer correct. */
  | { type: "every_nth_question"; n: number; requirePrevCorrect?: boolean }
  /** This is the (n, 2n, 3n…)-th correct answer of the match. */
  | { type: "every_nth_correct"; n: number }
  /** Correct answer locked in the first half of the personal timer. */
  | { type: "first_half_answer"; chance?: number }
  /** Correct answer locked in the last `withinMs` of the timer. */
  | { type: "last_seconds_answer"; withinMs: number }
  /** Correct answer under `underMs`. */
  | { type: "fast_answer"; underMs: number }
  /** Two consecutive correct answers both under `underMs`. */
  | { type: "fast_pair"; underMs: number }
  /** Self/opponent HP crosses a % threshold. */
  | { type: "hp_threshold"; side: SideRef; cmp: "below" | "above"; pct: number }
  /** Reactive to the opponent answering correctly. */
  | { type: "opponent_correct" }
  /** Reactive to the opponent answering wrong. */
  | { type: "opponent_wrong" }
  /** First correct answer on a category not answered correctly before. */
  | { type: "new_category" }
  /** Correct answer whose question category matches `category` exactly. */
  | { type: "question_category_is"; category: string }
  /** Standing Attack stage scaling with total Pokédex entries captured. */
  | { type: "pokedex_scaling"; per: number; max: number }
  /** Auto every N questions (cooldown rotation), optional roll. */
  | { type: "cooldown"; everyN: number; chance?: number }
  /** Player-fired. */
  | { type: "manual"; usesPerBattle: number; cooldownQuestions?: number }
  /** Needs a bespoke handler. */
  | { type: "bespoke"; note: string };

/** Duration semantics. Note: the shipped stage system (store `bumpPvpStage` /
 * migration `_pvp_bump_stage`) does NOT track per-question stage expiry — a
 * bump persists until changed — so `number`/`passive` both mean "bump the
 * stage now"; the number is retained for design fidelity/future tuning.
 * `"one_hit"` effects are applied inside the damage calc for the current
 * answer only and never mutate a persistent stage. */
export type EffectDuration = number | "passive" | "one_hit";

export interface StatStageEffect {
  type: "stat_stage";
  target: SideRef;
  stat: PvpStat | "random" | "highest_self" | "highest_opponent" | "lowest_self";
  delta: number;
  duration: EffectDuration;
}
export interface StatusEffect {
  type: "status";
  target: SideRef;
  status: StatusKind;
  questions: number;
  chance?: number;
}
export interface CureEffect {
  type: "cure";
  target: SideRef;
  status: StatusKind | "any";
}
export interface HealEffect {
  type: "heal";
  target: SideRef;
  amount: number;
}
/** Deal `amount` HP to the opponent and heal self by the same (lifesteal). */
export interface DrainEffect {
  type: "drain";
  amount: number;
}
export interface FlatDamageEffect {
  type: "flat_damage";
  amount: number;
  /** Per-distinct-category scaling (Arceus/Judgment style). */
  perCategory?: boolean;
  /** Fraction of opponent's current HP (Ruination/Nature's Madness style). */
  fracOppHp?: number;
  /** Fraction of opponent's HP LEAD over you (Tapu Koko style). */
  fracOppLead?: number;
  ignoreDefense?: boolean;
}
/** Modifier folded into the CURRENT correct answer's `computePvpDamage` call. */
export interface DamageCalcEffect {
  type: "damage_calc";
  ignoreOppDefenseStage?: boolean;
  ignoreOwnNegativeStages?: boolean;
  bonusAttackStage?: number;
  bonusCritStage?: number;
  /** Double-strike: deal damage a second time at this fraction. */
  secondHitFraction?: number;
}
export interface ImmunityEffect {
  type: "immunity";
  questions: number;
  statuses?: StatusKind[];
}
export interface HamperEffect {
  type: "hamper";
  mode: "scramble" | "hide_options" | "highlight_wrong" | "force_mistap";
}
export interface HelpEffect {
  type: "help";
  mode: "eliminate_option" | "preview_category" | "preview_value";
}
export interface BespokeEffect {
  type: "bespoke";
  note: string;
}
/** Manaphy — Heart Swap: server swaps the caller's lowest (most negative) stage
 * onto the opponent and takes their highest (most positive) onto the caller.
 * Magnitude is entirely server-computed from both live stage maps. */
export interface SwapStagesEffect {
  type: "swap_stages";
}
/** Cresselia — Lunar Dance: spend `hpCostPct`% of current HP to cure all
 * statuses and reset any negative Attack/Defense/Speed stages back to 0. */
export interface CleanseEffect {
  type: "cleanse";
  hpCostPct: number;
}
export interface CompoundEffect {
  type: "compound";
  effects: SignatureEffect[];
}
export type SignatureEffect =
  | StatStageEffect
  | StatusEffect
  | CureEffect
  | HealEffect
  | DrainEffect
  | FlatDamageEffect
  | DamageCalcEffect
  | ImmunityEffect
  | HamperEffect
  | HelpEffect
  | BespokeEffect
  | SwapStagesEffect
  | CleanseEffect
  | CompoundEffect;

export interface SignatureAbility {
  pokemonId: number;
  /** Player-facing name (UI). Never show `internalKey`. */
  signatureMove: string;
  /** Code-only disambiguator (distinct even when signatureMove repeats). */
  internalKey: string;
  rarity: number;
  trigger: SignatureTrigger;
  effect: SignatureEffect;
  wiring: WiringMode;
  /** Design note / ambiguity resolution / secondary-mechanic caveat. */
  note?: string;
  /** True for the 5 roster ids with no v2 doc entry (fill designs). */
  docGap?: boolean;
}

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
  },
  150: {
    pokemonId: 150,
    signatureMove: "Psystrike",
    internalKey: "psystrike",
    rarity: 5,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: ignoreDef({ ignoreOwnNegativeStages: true }),
    wiring: "manual",
    note: "Fire arms a client-side one-hit modifier (manualHitModifiers) folded into the next correct answer's damage calc — ignore opp Defense + own negative stages. Auto-fire-on-last-question if unused is a bespoke secondary, not wired.",
  },
  151: {
    pokemonId: 151,
    signatureMove: "Transform",
    internalKey: "transform",
    rarity: 4,
    trigger: { type: "bespoke", note: "Copy opponent's equipped ability at battle start." },
    effect: { type: "bespoke", note: "Cannot copy a rating-5 ability; rolls a random rating-3 instead." },
    wiring: "bespoke",
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
  },
  249: {
    pokemonId: 249,
    signatureMove: "Aeroblast",
    internalKey: "aeroblast",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 2, cooldownQuestions: 5 },
    effect: oppStage("speed", -2, 2),
    wiring: "manual",
    note: "Charge-and-store (1 per 5 correct, cap 2).",
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
  },
  251: {
    pokemonId: 251,
    signatureMove: "Time Travel",
    internalKey: "time_travel",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: { type: "bespoke", note: "Rewind last wrong: refund HP + restore streak, re-attempt with 4s." },
    wiring: "bespoke",
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
  },
  379: {
    pokemonId: 379,
    signatureMove: "Flash Cannon",
    internalKey: "flash_cannon_registeel",
    rarity: 3,
    trigger: { type: "battle_start" },
    effect: selfStage("defense", 1, "passive"),
    wiring: "battle_start",
    note: "Once-per-battle 40% opp -1 Def shot is a bespoke secondary, not auto-wired.",
  },
  380: {
    pokemonId: 380,
    signatureMove: "Mist Ball",
    internalKey: "mist_ball",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: oppStage("attack", -2, 2),
    wiring: "manual",
    note: "Armed after 3 correct. Non-mascot per file despite mascot-tier flavor (flagged for reconciliation).",
  },
  381: {
    pokemonId: 381,
    signatureMove: "Luster Purge",
    internalKey: "luster_purge",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(oppStage("defense", -2, 2), ignoreDef()),
    wiring: "manual",
    note: "Armed after 3 correct. Non-mascot per file.",
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
  },
  384: {
    pokemonId: 384,
    signatureMove: "Dragon Ascent",
    internalKey: "sky_splitting_ascent",
    rarity: 5,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: { type: "damage_calc", bonusCritStage: 3, bonusAttackStage: 1 },
    wiring: "manual",
    note: "Fire arms a client-side one-hit modifier (manualHitModifiers) onto the next correct answer: +3 Crit / +1 Atk. The self -2 Def-for-1q backlash and passive Air Lock (negate opponent weather/field engines) are bespoke secondaries, not wired.",
  },
  385: {
    pokemonId: 385,
    signatureMove: "Doom Desire",
    internalKey: "doom_desire",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: { type: "flat_damage", amount: 12, ignoreDefense: true },
    wiring: "bespoke",
    note: "Delayed strike: marks current question, resolves 2 questions later if interim answers were correct.",
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
    note: "Self answer-help (preview next category); needs UI hook.",
  },
  481: {
    pokemonId: 481,
    signatureMove: "Future Sight",
    internalKey: "emotion_future_sight",
    rarity: 2,
    trigger: { type: "cooldown", everyN: 4 },
    effect: compound({ type: "help", mode: "preview_value" }, selfStage("speed", 1, 1)),
    wiring: "bespoke",
    note: "Preview high-value question; +1 Speed only when high-value. Needs UI hook.",
  },
  482: {
    pokemonId: 482,
    signatureMove: "Future Sight",
    internalKey: "willpower_future_sight",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 5 },
    effect: { type: "help", mode: "eliminate_option" },
    wiring: "bespoke",
    note: "Auto-eliminate one wrong option; needs UI hook.",
  },
  483: {
    pokemonId: 483,
    signatureMove: "Roar of Time",
    internalKey: "roar_of_time",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 2 },
    effect: selfStage("speed", 2, 1),
    wiring: "manual",
    note: "Fire = +2 Speed (clutch time). The -1-Speed next-question recharge is a bespoke follow-up (persistent-stage system can't auto-expire a one-question delta). Charges 1 per 5 correct, cap 2.",
  },
  484: {
    pokemonId: 484,
    signatureMove: "Spacial Rend",
    internalKey: "spacial_rend",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 2 },
    effect: compound(selfStage("speed", 1, 1), { type: "hamper", mode: "scramble" }),
    wiring: "manual",
  },
  485: {
    pokemonId: 485,
    signatureMove: "Magma Storm",
    internalKey: "magma_storm",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(oppStatus("badly-poisoned", 3), { type: "bespoke", note: "Ability-lock opponent 3q." }),
    wiring: "manual",
    note: "Phase 4 (wired): manual fire locks the opponent's signature ability for 3 questions (server suppress_ability) + Badly Poisoned. The 2 flat chip/question is not modelled.",
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
  },
  487: {
    pokemonId: 487,
    signatureMove: "Shadow Force",
    internalKey: "shadow_force",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: ignoreDef({ bonusCritStage: 2 }),
    wiring: "manual",
    note: "WIRED (client-armed hit, structurally identical to Psystrike 150 / Dragon Ascent 384): Fire arms a client-side one-hit modifier (manualHitModifiers) onto the next correct answer — ignore opp Defense + 2 Crit. Relabeled wiring:'bespoke' -> 'manual' to match reality (behavior-neutral: it applies no server-catalog effect, so hasServerManualEffect stays false and no server Fire path is added). The vanish (skip current question, untargetable) opening is a bespoke secondary, not wired.",
  },
  488: {
    pokemonId: 488,
    signatureMove: "Lunar Dance",
    internalKey: "lunar_dance",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: { type: "cleanse", hpCostPct: 15 },
    wiring: "manual",
    note: "Spend 15% current HP: cure all statuses + reset negative Atk/Def/Spd stages to 0. Server-computed (cleanse kind).",
  },
  489: {
    pokemonId: 489,
    signatureMove: "Bubble Beam",
    internalKey: "bubble_beam",
    rarity: 2,
    trigger: { type: "on_correct", chance: 0.25 },
    effect: oppStage("speed", -1, 1),
    wiring: "post_answer",
  },
  490: {
    pokemonId: 490,
    signatureMove: "Heart Swap",
    internalKey: "heart_swap",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: { type: "swap_stages" },
    wiring: "manual",
    note: "Give opp your lowest (most negative) stage, take their highest (most positive). Server-computed (swap_stages kind); cancels in a mirror if both fire the same question.",
  },
  491: {
    pokemonId: 491,
    signatureMove: "Dark Void",
    internalKey: "dark_void",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: oppStatus("sleep", 2, 0.6),
    wiring: "manual",
    note: "60% land chance (Dark Void's low accuracy).",
  },
  492: {
    pokemonId: 492,
    signatureMove: "Seed Flare",
    internalKey: "seed_flare",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: oppStage("defense", -2, 3),
    wiring: "manual",
    note: "Seed Flare: on fire, -2 opp Defense (Sp. Def crash). The 40%/60%-on-streak land chance is rolled client-side before the fire request; chance-on-streak is bespoke.",
  },
  493: {
    pokemonId: 493,
    signatureMove: "Judgment",
    internalKey: "judgment",
    rarity: 5,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: { type: "flat_damage", amount: 2, perCategory: true, ignoreDefense: true },
    wiring: "bespoke",
    note: "Battle-start attune (+1 Atk on dominant category) is a bespoke passive; Judgment scales ~2 HP per distinct category answered correctly.",
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
  },
  642: {
    pokemonId: 642,
    signatureMove: "Wildbolt Storm",
    internalKey: "wildbolt_storm",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6, chance: 0.5 },
    effect: oppStatus("paralysis", 3),
    wiring: "post_answer",
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
  },
  645: {
    pokemonId: 645,
    signatureMove: "Sandsear Storm",
    internalKey: "sandsear_storm",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 6 },
    effect: compound(oppStatus("burn", 3), selfStage("attack", 1, "passive")),
    wiring: "post_answer",
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
  },
  648: {
    pokemonId: 648,
    signatureMove: "Relic Song",
    internalKey: "relic_song",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 2 },
    effect: compound(selfStage("attack", 1, "passive"), oppStatus("sleep", 1, 0.3)),
    wiring: "manual",
    note: "Aria (+1 Atk, always) / Pirouette (+1 Spd) stance toggle; 30% Sleep on toggle. WIRED: the Sleep is now a genuine 30% roll — the manual RPC applies the +1 Atk row unconditionally and rolls the Sleep row server-side (its catalog payload carries chance:0.3, gated in apply_pvp_signature_effect's status branch). Stance choice is bespoke.",
  },
  649: {
    pokemonId: 649,
    signatureMove: "Techno Blast",
    internalKey: "techno_blast",
    rarity: 3,
    trigger: { type: "battle_start" },
    effect: selfStage("speed", 1, "passive"),
    wiring: "battle_start",
    note: "Genesect — Techno Blast: standing +1 Speed at battle start (default Shock drive encoded). The Drive loadout choice (Shock/Burn/Chill/Douse) + one mid-battle hot-swap is a bespoke secondary, not wired.",
  },

  // ── Generation VI ─────────────────────────────────────────────────────────
  716: {
    pokemonId: 716,
    signatureMove: "Geomancy",
    internalKey: "geomancy",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(selfStage("attack", 2, 3), selfStage("defense", 1, 3), selfStage("speed", 1, 3)),
    wiring: "bespoke",
    note: "Two-stage: charge (skip one question) then release the triple buff.",
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
  },
  718: {
    pokemonId: 718,
    signatureMove: "Thousand Waves",
    internalKey: "thousand_waves",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(oppStage("speed", -1, 3), { type: "bespoke", note: "Ability/escape lock 3q." }),
    wiring: "manual",
    note: "Phase 4 (wired): manual fire binds the opponent's signature ability for 3 questions (server suppress_ability) + -1 Speed. The 10+-correct duration extension to 4q is not modelled.",
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
  },
  790: {
    pokemonId: 790,
    signatureMove: "Cosmic Power",
    internalKey: "cosmic_power",
    rarity: 2,
    trigger: { type: "battle_start" },
    effect: compound(selfStage("defense", 2, "passive"), selfStage("attack", -1, "passive")),
    wiring: "battle_start",
    note: "Every 4 questions survived, +1 Atk back (bespoke slow charge).",
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
  },
  802: {
    pokemonId: 802,
    signatureMove: "Spectral Thief",
    internalKey: "spectral_thief",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(
      { type: "stat_stage", target: "self", stat: "highest_opponent", delta: 1, duration: "passive" },
      { type: "damage_calc", bonusCritStage: 1 },
    ),
    wiring: "bespoke",
    note: "Steal opponent's highest positive stage (remove from them, add to self).",
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
  },

  // ── Generation VIII ───────────────────────────────────────────────────────
  888: {
    pokemonId: 888,
    signatureMove: "Behemoth Blade",
    internalKey: "behemoth_blade",
    rarity: 5,
    trigger: { type: "battle_start" },
    effect: selfStage("attack", 1, "passive"),
    wiring: "battle_start",
    note: "Intrepid Sword entry +1 Atk; extra +1 Atk while opponent leads on HP/stages is a bespoke conditional.",
  },
  889: {
    pokemonId: 889,
    signatureMove: "Behemoth Bash",
    internalKey: "behemoth_bash",
    rarity: 5,
    trigger: { type: "battle_start" },
    effect: selfStage("defense", 1, "passive"),
    wiring: "battle_start",
    note: "Dauntless Shield entry +1 Def (→+2 on a 4+ streak); status-reflect while trailing is bespoke.",
  },
  890: {
    pokemonId: 890,
    signatureMove: "Dynamax Cannon",
    internalKey: "dynamax_cannon",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(oppStage("speed", -2, 2), oppStage("attack", -1, 2)),
    wiring: "bespoke",
    note: "Charge one question then release; Pressure (opp cooldowns 15% slower) is a bespoke passive.",
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
  },
  893: {
    pokemonId: 893,
    signatureMove: "Jungle Healing",
    internalKey: "jungle_healing",
    rarity: 3,
    trigger: { type: "cooldown", everyN: 5 },
    effect: compound({ type: "heal", target: "self", amount: 8 }, { type: "cure", target: "self", status: "any" }),
    wiring: "post_answer",
    note: "Leaf Guard (immune to Burn/Sleep while leading) is a bespoke passive.",
  },
  894: {
    pokemonId: 894,
    signatureMove: "Thunder Cage",
    internalKey: "thunder_cage",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: oppStatus("paralysis", 3),
    wiring: "manual",
    note: "Phase 4 (wired): manual fire cages the opponent's signature ability for 3 questions (server suppress_ability) + Paralysis. Transistor (your sub-5s answers +1 Atk while caged) remains bespoke.",
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
  },

  // ── Generation IX ─────────────────────────────────────────────────────────
  1001: {
    pokemonId: 1001,
    signatureMove: "Ruination",
    internalKey: "ruination_tablets",
    rarity: 3,
    trigger: { type: "battle_start" },
    effect: oppStage("attack", -1, "passive"),
    wiring: "battle_start",
    note: "Wo-Chien — Tablets of Ruin: standing -1 opp Attack all match.",
  },
  1002: {
    pokemonId: 1002,
    signatureMove: "Ruination",
    internalKey: "ruination_sword",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(oppStage("defense", -2, 3), ignoreDef()),
    wiring: "manual",
    note: "Chien-Pao — Sword of Ruin: -2 opp Def (server manual row) + next 2 correct answers ignore the opponent's remaining Defense. WIRED: firing arms a 2-charge client-side ignore-Defense window (swordOfRuinCharges in live-pvp-battle-screen), folded into the next 2 correct hits' damage calc (client-computed, server-clamped, like the armed one-hit manual moves); the window does not persist across a reconnect.",
  },
  1003: {
    pokemonId: 1003,
    signatureMove: "Ruination",
    internalKey: "ruination_vessel",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(selfStage("defense", 2, 3), oppStage("crit", -1, 3)),
    wiring: "manual",
    note: "Ting-Lu — Vessel of Ruin: +2 own Def + -1 opp Crit.",
  },
  1004: {
    pokemonId: 1004,
    signatureMove: "Ruination",
    internalKey: "ruination_beads",
    rarity: 3,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound({ type: "flat_damage", amount: 0, fracOppHp: 0.5, ignoreDefense: true }, oppStatus("burn", 3)),
    wiring: "bespoke",
    note: "Chi-Yu — Beads of Ruin: deal half opponent's current HP (ignore Def) then Burn.",
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
  },
  1016: {
    pokemonId: 1016,
    signatureMove: "Beat Up",
    internalKey: "beat_up",
    rarity: 3,
    trigger: { type: "pokedex_scaling", per: 25, max: 3 },
    effect: selfStage("attack", 1, "passive"),
    wiring: "battle_start",
    note: "Standing +1 Atk per 25 Pokédex entries captured (max +3), checked at battle start (v2 correction). Toxic Chain poison chance is a bespoke secondary.",
  },
  1017: {
    pokemonId: 1017,
    signatureMove: "Ivy Cudgel",
    internalKey: "ivy_cudgel",
    rarity: 4,
    trigger: { type: "battle_start" },
    effect: selfStage("crit", 1, "passive"),
    wiring: "battle_start",
    note: "Ogerpon — Ivy Cudgel: standing +1 Crit at battle start (baseline Teal Mask encoded). The Mask loadout (Teal/Wellspring/Hearthflame/Cornerstone) + Embody Aspect swap is a bespoke secondary, not wired.",
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
  },
  1024: {
    pokemonId: 1024,
    signatureMove: "Tera Starstorm",
    internalKey: "tera_starstorm",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(selfStage("attack", 2, 3), selfStage("defense", 1, 3), selfStage("speed", 2, 1)),
    wiring: "manual",
    note: "Tera for 3 questions: +2 Atk across all categories (ignore Def) + Tera Shell +1 Def + +2 Speed on activation. Non-mascot per file.",
  },
  1025: {
    pokemonId: 1025,
    signatureMove: "Malignant Chain",
    internalKey: "malignant_chain",
    rarity: 4,
    trigger: { type: "manual", usesPerBattle: 1 },
    effect: compound(oppStatus("badly-poisoned", 3), { type: "hamper", mode: "force_mistap" }),
    wiring: "manual",
    note: "Phase 4 (wired): manual fire binds the opponent's signature ability for 3 questions (server suppress_ability) + Badly Poisoned. Poison Puppeteer (scramble + force mis-tap, only if the opponent was already statused) remains a client-only bespoke secondary.",
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
function hitTriggerHolds(trigger: SignatureTrigger, ctx: SignatureContext): boolean {
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
    default:
      return false;
  }
}

function collectDamageCalc(effect: SignatureEffect, out: DamageCalcEffect[]): void {
  if (effect.type === "damage_calc") out.push(effect);
  else if (effect.type === "compound") effect.effects.forEach((e) => collectDamageCalc(e, out));
}

/**
 * Modifiers to apply to the CURRENT correct answer's `computePvpDamage` call
 * for a `passive_damage` ability. Returns `NO_HIT_MODIFIERS` when nothing
 * fires. Only meaningful on a correct answer.
 */
export function evaluateHitModifiers(
  ability: SignatureAbility | null,
  ctx: SignatureContext,
): HitModifiers {
  if (!ability || !ctx.correct || ability.wiring !== "passive_damage") return NO_HIT_MODIFIERS;
  if (!hitTriggerHolds(ability.trigger, ctx)) return NO_HIT_MODIFIERS;

  const calcs: DamageCalcEffect[] = [];
  collectDamageCalc(ability.effect, calcs);
  if (calcs.length === 0) return NO_HIT_MODIFIERS;

  const mods: HitModifiers = { ...NO_HIT_MODIFIERS };
  for (const c of calcs) {
    // Articuno's Freeze-Dry only routes around Defense the opponent actually has.
    if (c.ignoreOppDefenseStage) {
      if (ability.internalKey === "killing_frost" && ctx.oppDefenseStage <= 0) continue;
      mods.ignoreOppDefenseStage = true;
    }
    if (c.ignoreOwnNegativeStages) mods.ignoreOwnNegativeStages = true;
    if (c.bonusAttackStage) mods.bonusAttackStage += c.bonusAttackStage;
    if (c.bonusCritStage) mods.bonusCritStage += c.bonusCritStage;
    if (c.secondHitFraction) mods.secondHitFraction = c.secondHitFraction;
  }
  return mods;
}

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
function postTriggerFires(
  trigger: SignatureTrigger,
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
    default:
      return false;
  }
}

/**
 * Post-answer effects a `post_answer` ability produces this question (stat
 * bumps, statuses, heals, drains, hampers), with any `chance` already rolled.
 * Returns [] when the trigger doesn't fire. `damage_calc` and `bespoke`
 * sub-effects are excluded (handled elsewhere / not auto-fired).
 */
export function evaluatePostAnswer(
  ability: SignatureAbility | null,
  ctx: SignatureContext,
  rng: () => number = Math.random,
): SignatureEffect[] {
  if (!ability || ability.wiring !== "post_answer") return [];
  if (!postTriggerFires(ability.trigger, ctx, rng)) return [];
  const out: SignatureEffect[] = [];
  collectApplicable(ability.effect, out);
  return out;
}

/**
 * The non-`damage_calc` sub-effects a `passive_damage` ability ALSO bundles and
 * that should fire on the SAME correct answer as its damage fold — the compound
 * slice that `evaluateHitModifiers` (damage-calc only) drops on the floor.
 * Returns [] unless the ability is a passive_damage entry, the answer is
 * correct, the hit trigger holds, and there is a non-damage-calc slice that
 * rolls through (a `status` sub-effect may carry a `chance`, rolled here
 * client-side exactly like `evaluatePostAnswer` does for a post_answer status).
 *
 * When non-empty, the live loop routes these through the SAME server-validated
 * `apply_pvp_signature_effect(phase='post_answer')` path as a post_answer
 * ability: the client only names WHICH partner fired; the server applies the
 * fixed magnitude from the `pvp_signature_effects` post_answer rows.
 *
 * Wired abilities (each has exactly one non-damage-calc slice, so a single RPC
 * faithfully delivers it): 243 Raikou (+1 Speed), 386 Deoxys / 801 Magearna
 * (-1 Atk recoil), 643 Zekrom (40% Burn), 809 Melmetal (30% Sleep).
 */
export function evaluatePassiveDamageSideEffects(
  ability: SignatureAbility | null,
  ctx: SignatureContext,
  rng: () => number = Math.random,
): SignatureEffect[] {
  if (!ability || !ctx.correct || ability.wiring !== "passive_damage") return [];
  if (!hitTriggerHolds(ability.trigger, ctx)) return [];
  const applicable: SignatureEffect[] = [];
  collectApplicable(ability.effect, applicable);
  return applicable.filter((e) =>
    e.type === "status" && e.chance != null ? rng() < e.chance : true,
  );
}

/**
 * Standing effects a `battle_start` ability applies once at the start of the
 * match (persistent stat stages, including pokedex-scaled deltas).
 */
export function evaluateBattleStart(
  ability: SignatureAbility | null,
  pokedexCount: number,
): SignatureEffect[] {
  if (!ability || ability.wiring !== "battle_start") return [];
  const out: SignatureEffect[] = [];
  collectApplicable(ability.effect, out);
  if (ability.trigger.type === "pokedex_scaling") {
    const delta = Math.min(ability.trigger.max, Math.floor(pokedexCount / ability.trigger.per));
    return delta <= 0
      ? []
      : [{ type: "stat_stage", target: "self", stat: "attack", delta, duration: "passive" }];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual ("charge and fire") abilities
// ─────────────────────────────────────────────────────────────────────────────
//
// A subset of manual abilities decompose entirely into server-catalog effects
// (stat_stage / status / cure / heal / drain) — Aeroblast, Mist Ball, Luster
// Purge, Dark Void, Seed Flare, Relic Song, the Ruination burst pair, Tera
// Starstorm, etc. These are "server-fireable": the live battle screen shows a
// generic charge/Fire affordance and, on tap, calls the SAME server-validated
// RPC as berries with phase="manual" (magnitude looked up server-side by dex
// id; the server enforces the per-battle use cap). Manual abilities whose fire
// payoff is a damage-calc/one-hit modifier (Psystrike, Spacial Rend, Roar of
// Time, Dragon Ascent) or a bespoke multi-stage sequence (Geomancy, Dynamax
// Cannon, Thunder Cage) are NOT server-fireable yet and are handled elsewhere /
// documented as follow-up — `hasServerManualEffect` returns false for them so
// no dead Fire button is shown.

/** True when a manual ability applies at least one server-catalog effect on
 * fire (i.e. `apply_pvp_signature_effect(phase="manual")` will do something). */
export function hasServerManualEffect(ability: SignatureAbility | null): boolean {
  if (!ability || ability.wiring !== "manual") return false;
  const out: SignatureEffect[] = [];
  collectApplicable(ability.effect, out);
  return out.length > 0;
}

/** Per-battle use cap for a manual ability (0 if not manual). */
export function manualUsesPerBattle(ability: SignatureAbility | null): number {
  if (!ability || ability.trigger.type !== "manual") return 0;
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

/**
 * For a player-fired ability whose Fire payoff is a CLIENT-side one-hit
 * damage-calc modifier (Psystrike, Dragon Ascent, Giratina's Shadow Force) —
 * i.e. it has `damage_calc` sub-effects but NO server-catalog effect to route
 * through the RPC. Pressing Fire "arms" these modifiers onto the player's next
 * correct answer (folded into `computePvpDamage`, exactly like a passive_damage
 * ability — damage is client-computed and server-clamped, so no round trip and
 * no new trust surface). Returns the folded modifiers, or null if this ability
 * isn't a client-armed manual hit.
 */
export function manualHitModifiers(ability: SignatureAbility | null): HitModifiers | null {
  if (!ability || ability.trigger.type !== "manual") return null;
  // If it applies a server-catalog effect, the server RPC owns its Fire.
  if (hasServerManualEffect(ability)) return null;
  // Only arm when the Fire payoff is EXCLUSIVELY a damage-calc modifier — an
  // ability with a bespoke/stat sub-effect (e.g. Spectral Thief's stat-steal)
  // isn't faithfully served by arming only its damage-calc slice.
  const flat: SignatureEffect[] = [];
  const flatten = (e: SignatureEffect): void => {
    if (e.type === "compound") e.effects.forEach(flatten);
    else flat.push(e);
  };
  flatten(ability.effect);
  if (flat.length === 0 || flat.some((e) => e.type !== "damage_calc")) return null;
  const calcs: DamageCalcEffect[] = [];
  collectDamageCalc(ability.effect, calcs);
  if (calcs.length === 0) return null;
  const mods: HitModifiers = { ...NO_HIT_MODIFIERS };
  for (const c of calcs) {
    if (c.ignoreOppDefenseStage) mods.ignoreOppDefenseStage = true;
    if (c.ignoreOwnNegativeStages) mods.ignoreOwnNegativeStages = true;
    if (c.bonusAttackStage) mods.bonusAttackStage += c.bonusAttackStage;
    if (c.bonusCritStage) mods.bonusCritStage += c.bonusCritStage;
    if (c.secondHitFraction) mods.secondHitFraction = c.secondHitFraction;
  }
  return mods;
}

/** True when a manual ability's Fire arms a client-side one-hit damage modifier
 * (rather than routing a server-catalog effect). */
export function hasClientManualHit(ability: SignatureAbility | null): boolean {
  return manualHitModifiers(ability) !== null;
}

/** Ids whose manual ability arms a client-side one-hit modifier on Fire. */
export const CLIENT_HIT_MANUAL_IDS: readonly number[] = Object.values(SIGNATURE_ABILITIES)
  .filter((a) => a.trigger.type === "manual" && hasClientManualHit(a))
  .map((a) => a.pokemonId)
  .sort((a, b) => a - b);

/** Ids whose manual ability the live screen exposes a Fire button for. */
export const SERVER_FIREABLE_MANUAL_IDS: readonly number[] = Object.values(SIGNATURE_ABILITIES)
  .filter((a) => hasServerManualEffect(a))
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
