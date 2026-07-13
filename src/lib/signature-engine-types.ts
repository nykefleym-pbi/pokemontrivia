// Type vocabulary + tuning constants for the signature-ability engine.
// Shared by the catalog (signature-abilities) and the plain-language
// renderer (signature-engine-describe) without either importing the other.
import type { PvpStat } from "../engine/state";
import type { StatusKind } from "../content/statuses/status-def";

export type SideRef = "self" | "opponent";

/** How the live loop should handle an ability. */
export type WiringMode =
  /** No legacy client path at all — the `engine` spec is the sole delivery.
   *
   * There used to be a `"battle_start"` mode here: a standing buff applied once
   * at the start of the match. It has been removed. Every one of the 104 rows is
   * engine-owned, so `evaluateBattleStart` bailed on all of them (`isEngineOwned`)
   * and the phase could never fire — the eight rows that carried the label, and
   * the five `pvp_signature_effects` rows the SQL generator emitted from it, were
   * inert. Their entry buffs are delivered by their own engine spec or not at all
   * (owner ruling 2026-07-13). Do not reintroduce the mode: `gen-signature-sql`
   * keys off `wiring`, so a `battle_start` label silently recreates dead rows. */
  | "engine"
  /** Modifies the CURRENT correct answer's damage calc (ignore def, bonus atk/crit). */
  | "passive_damage"
  /** Fires an effect after an answer resolves (persistent stage / status / heal / hamper). */
  | "post_answer"
  /** Player-fired button; data present but no in-battle UI wired yet. */
  | "capped_payload"
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
  | { type: "capped_payload"; usesPerBattle: number; cooldownQuestions?: number }
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
  /** signature-rework M1 engine spec (00-owner-spec.md, 71 rows). Optional so the
   * catalog still compiles for the ~33 non-owner-spec ids that have no rework
   * data yet (pending Legendary/Mythical roster, per 00-owner-spec.md "Notes for
   * the pipeline"). When present, this SUPERSEDES `trigger`/`effect` above for
   * the generalized engine (server `pvp_sig_engine_tick`); `trigger`/`effect`
   * stay in place for the legacy client wiring (`wiring`/`evaluateHitModifiers`/
   * `evaluatePostAnswer`/etc.) until Backend cuts the engine over. */
  engine?: SignatureEngineSpec;
}

// ─────────────────────────────────────────────────────────────────────────────
// signature-rework (00-owner-spec.md / 01b-owner-decisions.md / 02-architecture.md)
// M1 engine vocabulary — merged from the frozen stub `signature-rework-types.ts`
// rather than duplicated. Reuses this file's own `SideRef` and the imported
// `PvpStat`/`StatusKind` (game-data.ts) instead of the stub's parallel aliases.
// `signature-rework-types.ts` now just re-exports these (kept compiling).
// ─────────────────────────────────────────────────────────────────────────────

/** Battle length is FIXED. PVP_QUESTIONS = 20 (pvp-combat.ts). All question
 *  indices below are 1-indexed (q1..q20); "2nd-to-last" = q19. */
export const SIG_BATTLE_QUESTIONS = 20;
/** Global stage clamp (unchanged, ±3) and per-ability ramp cap (+3 total, owner ruling 3). */
export const SIG_STAGE_CLAMP = 3;
export const SIG_STACK_CAP = 3;

/** Which layer authoritatively evaluates a new-trigger predicate.
 *  "client" — deterministic self-predicate; client computes, server applies.
 *  "server" — reactive to the OTHER side; server observes and applies. */
export type TriggerEvalSite = "client" | "server";

/** The 10 trigger primitives 00-owner-spec.md needs beyond the legacy
 * `SignatureTrigger` vocabulary. Kept as a SEPARATE union (used only on
 * `SignatureEngineSpec.trigger`), NOT merged into `SignatureTrigger`, so the
 * legacy exhaustive switches (`describeSignatureTrigger`, damage/toast helpers)
 * stay complete over the original union. The two predicate evaluators
 * (`hitTriggerHolds`/`postTriggerFires`) accept the widened
 * `SignatureTrigger | NewSignatureTrigger` and handle both (they have a
 * `default: return false`, so no exhaustiveness obligation). No `type` value
 * collides between the two unions. */
export type NewSignatureTrigger =
  /** Streak of N correct (N=3|5). Fire = ramp stack #1 (owner ruling 3). */
  | { type: "streak_in_a_row"; n: number; where: "client" }
  /** Fires once before Q1 resolves. */
  | { type: "start_of_battle"; where: "client" }
  /** Fires on every question resolution. */
  | { type: "every_question"; where: "client" }
  /** Parity of the 1-indexed question number. */
  | { type: "every_even_question"; where: "client" }
  | { type: "every_odd_question"; where: "client" }
  /** Only on these 1-indexed question numbers (Giratina [2,12], Azelf [5,10,15,20]). */
  | { type: "on_questions"; indices: number[]; where: "client" }
  /** Reactive self: carrying a status (`SignatureContext.selfAfflicted`) OR self
   *  HP below `pct` (whole percent, compared against `selfHpPct`). M4 fix: `pct`
   *  is now genuinely honoured. It used to be dead — every caller pre-baked a
   *  `< 0.5` HP test into `selfAfflicted` and the predicate just read that flag,
   *  which was harmless while all 7 rows used 50 but silently mis-fired Zarude
   *  #893 (the only 25% row) at half health. */
  | { type: "self_afflicted_or_hp_below"; pct: number; where: "client" }
  /** Reactive to opponent firing a signature. Server-eval — returns false in
   *  `hitTriggerHolds`/`postTriggerFires` until the M2 server observer lands. */
  | { type: "opponent_signature"; where: "server" }
  /** Self HP would reach 0 → revive hook fires before faint finalizes.
   *  Server-eval; already wired for Ho-Oh via `submit_pvp_live_answer`. */
  | { type: "hp_reaches_zero"; where: "server" }
  /** Reactive to opponent consuming an item. Server-eval, M3. */
  | { type: "opponent_uses_item"; where: "server" }
  /** signature-rework M4: the opponent's CURRENT HP is at least `factor`x the
   *  caller's own current HP (Terapagos #1024 — "if Opponent HP is twice the
   *  user HP"). A pure desperation gate: it can only hold while you are losing
   *  badly. Client-eval from `SignatureContext.selfHpPct`/`oppHpPct`. */
  | { type: "opp_hp_multiple_of_self"; factor: number; where: "client" };

// ── Stat-change model: stacks / one-shot / decay (owner rulings 1–3) ─────────
/** Ramp: trigger fire = stack #1 (+perCorrect), each later correct +perCorrect,
 *  capped at SIG_STACK_CAP total for this ability, inside the ±3 stage clamp.
 *  Used only where the owner-spec cell literally says "stacks up to 3 ...". */
export interface RampStatSpec {
  mode: "ramp";
  stat: PvpStat;
  target: SideRef;
  perCorrect: number; // signed; e.g. +1, or -1 for opponent debuffs
}
/** One-shot: applied once; re-fires add nothing ("does not stack"). Default
 *  interpretation when the owner-spec cell states neither "stacks up to 3" nor
 *  "does not stack" (see 03-frontend-a.md ambiguity ruling). */
export interface OneShotStatSpec {
  mode: "one_shot";
  stat: PvpStat | "random";
  target: SideRef;
  delta: number;
}
/** Decay: set to `initial` on fire, then step by `perQuestion` each following
 *  question (stacking), floored at `floor`, inside the ±3 clamp. Deoxys/Magearna. */
export interface DecayStatSpec {
  mode: "decay";
  stat: PvpStat;
  target: SideRef;
  initial: number;
  perQuestion: number; // signed step, e.g. -1
  floor: number; // e.g. -3
}
export type StatChangeSpec = RampStatSpec | OneShotStatSpec | DecayStatSpec;

// ── Disable / expiry model ("Cooldown" column, owner rulings 1–2) ───────────
export type DisableSpec =
  /** Revert this ability's stat contribution to 0 after N CONSECUTIVE incorrect;
   *  re-meeting the trigger re-arms (owner rulings 1–2). The dominant pattern
   *  ("Disable[s] stat change after N incorrect answers"). */
  | { kind: "revert_stat_after_incorrect"; n: number }
  /** Only the increase portion stops after N incorrect; decay continues (Deoxys/Magearna). */
  | { kind: "disable_increase_after_incorrect"; n: number }
  /** The whole effect disables after N incorrect (Mesprit/Azelf/Xerneas). */
  | { kind: "disable_effect_after_incorrect"; n: number }
  /** Conditional damage multiplier / ignore-Defense stops after N incorrect
   *  (used where the row has no `stat` to revert, e.g. Cobalion/Articuno). */
  | { kind: "disable_multiplier_after_incorrect"; n: number }
  /** Healing stops N questions after the trigger fired (Suicune). */
  | { kind: "disable_healing_after_questions"; n: number }
  /** Pragmatic extension of `disable_healing_after_questions`: the whole effect
   *  disables N questions after the trigger fired, regardless of correctness
   *  (Moltres "...or after 3 questions" clause — the frozen stub only had a
   *  healing-specific variant; generalized here, flagged in 03-frontend-a.md). */
  | { kind: "disable_effect_after_questions"; n: number }
  /** After the effect resolves, disabled for exactly the next question, then
   *  resumes (Mewtwo/Entei/Jirachi). */
  | { kind: "disable_next_question_after_effect" }
  /** Fires at most once per battle (Uxie/Cresselia/Tapu/Cosmog/Mew). */
  | { kind: "once_per_battle" }
  /** Compound: disables when EITHER sub-condition first met (Moltres). */
  | { kind: "any_of"; of: DisableSpec[] }
  /** signature-rework M4: this ability is inert for the WHOLE battle when the
   *  opponent is one of `dexIds` (Eternatus #890 — "Disable effect if opponent
   *  is Zacian or Zamazenta"). A hard matchup counter, evaluated once at battle
   *  start; unlike the incorrect-answer disables it can never re-arm. */
  | { kind: "disabled_if_opponent_species"; dexIds: number[] }
  /** signature-rework M4: this ability disables permanently once its owner has
   *  consumed ANY healing item this battle (Terapagos #1024). Server-eval — the
   *  server owns item consumption (`use_pvp_live_item` / `pvp_live_effects`), so
   *  a client cannot lie about having stayed "clean". */
  | { kind: "disabled_if_used_healing_item" }
  /** No disable — permanent for the battle (Arceus/Yveltal/Hoopa/Marshadow, ruling 6). */
  | { kind: "none" };

// ── Conditional damage multiplier + ignore-Defense (answer-damage scope, ruling 7) ──
export type MultiplierCondition =
  | { on: "opponent_type"; typeName: string } // Articuno x2 vs Water
  | { on: "opponent_species"; dexId: number } // Kyogre<->Groudon etc.
  | { on: "opponent_type_any"; typeNames: string[] } // Rayquaza vs Kyogre|Groudon (types)
  | { on: "opponent_species_any"; dexIds: number[] } // Rayquaza vs Kyogre|Groudon (species), Kyurem vs Zekrom|Reshiram
  /** Pragmatic extension: trivially-true condition for the unconditional
   *  ignore-Defense rows (Cobalion/Terrakion/Virizion/Keldeo/Hoopa) that carry
   *  no "if opponent is X" gate at all — the frozen stub's `MultiplierCondition`
   *  had no "always" arm. */
  | { on: "always" };
export interface DamageMultiplierSpec {
  type: "damage_multiplier";
  factor: number; // e.g. 2, 3 (1 = no-op, used only to carry ignoreDefense/onSuccess)
  condition: MultiplierCondition;
  /** Applied when the condition HOLDS, alongside/instead of the multiplier
   *  (Regice: conditional +1 Atk with no real damage multiplier attached —
   *  factor:1 + this field). Pragmatic extension mirroring `fallback` below;
   *  the frozen stub only defined the on-fail case. */
  onSuccess?: StatChangeSpec[];
  /** Applied when the condition FAILS (Zygarde: else +1 Atk/+1 Def). */
  fallback?: StatChangeSpec[];
  ignoreDefense?: boolean;
  /** signature-rework M2/M3 (§6/§T3): ignore the opponent's Defense stage
   *  UNCONDITIONALLY — independent of `condition` — so a row can pair an
   *  always-on ignore-Def with a rare conditional `factor` (Solgaleo #791:
   *  every-battle ignore-Def AND ×2 only vs Lunala #792). `evaluateHitModifiers`
   *  (pvp-combat.ts) ORs this with the condition-gated `ignoreDefense`. */
  ignoreDefenseAlways?: boolean;
  /** signature-rework M2/M3 (§T3): the `factor` used when `condition` FAILS
   *  (default 1). Pairs with the existing on-fail `fallback` STAT specs. */
  fallbackFactor?: number;
  /** signature-rework M4: the factor is read from a ladder keyed on the OWNER's
   *  own live HP instead of the flat `factor` (Regidrago #895 — x3 at 100%, x2.5
   *  at >=80%, x2 at >=60%, x1.5 at >=40%, x1 at <=20%). Owner ruling 2026-07-12:
   *  RE-EVALUATED EVERY QUESTION off current HP, so Regidrago hits like a truck
   *  while healthy and fades to nothing as it is worn down. Tiers are matched
   *  highest-`atLeastPct`-first; `factor` is the fallback when none match. */
  hpTiers?: { atLeastPct: number; factor: number }[];
}

// ── Phase windows / fixed-index damage (needs question-index awareness) ─────
export interface PhaseWindowSpec {
  type: "phase_window";
  /** Questions 1..windowN scale OUTGOING damage to `scaleToPct` (0 = no damage). */
  windowN: number;
  scaleToPct: number; // 0, 50, 75, ...
  /** Payoff on question windowN+1 (or an explicit index). */
  payoffAtIndex?: number;
  payoffMultiplier?: number; // x1.5/x2/x2.5/x3
  /** signature-rework M2/M3 (§T3): gate the payoff multiplier on a live HP
   *  comparison (Regigigas #486 — ×2.5 only if opponent HP > self HP at the
   *  payoff question). Evaluated client-side from `SignatureContext.oppHpPct`/
   *  `selfHpPct`; the server re-clamps the final delta. */
  payoffCondition?: "opp_hp_gt_self";
  payoffEffect?: BespokeEffectRef; // e.g. halve HP (Cosmog q4)
}
/** Fixed-index defensive/offensive marks (Giratina q1/q11 receive-0, q2/q12 x2;
 *  Blacephalon q1 x5, q19 outgoing x75%). */
export interface FixedIndexSpec {
  type: "fixed_index";
  index: number; // 1-indexed
  receiveDamagePct?: number; // 0 = immune that question (DEFENSIVE — server-enforced)
  outgoingMultiplier?: number;
}

// ── Bespoke effect references (catalogue; delivery split M2/M3) ─────────────
export type BespokeEffectRef =
  /** Fraction of the opponent's CURRENT HP (0.5 = halve it) — Tapu quartet,
   *  Cosmog, and the M4 Ruination four. A 0..1 fraction, matching the `pct` the
   *  server's `m4_fx`/`frac_hp_current` row carries; the Gen-VII rows used to
   *  carry a whole `50` here, which no reader consumed but which read as a 100x
   *  discrepancy against the M4 rows. One field, one unit. */
  | { fx: "frac_hp_damage"; pctOfOppCurrentHp: number } // Tapu halve, Cosmog
  /** Arceus #493: 1–10% chip every question its trigger holds (no `questions`).
   *  Regieleki #894 (M4): 1–15% each question for a 5-question WINDOW opened by
   *  the trigger — `questions: 5`. Owner ruling 2026-07-12: the pct is of the
   *  opponent's MAX HP (a flat 1–18 of 120), not their current HP, so it stays
   *  lethal at low HP instead of decaying to nothing. */
  | { fx: "frac_hp_random"; minPct: number; maxPct: number; questions?: number }
  /** signature-rework M4: reduce the opponent to 0 HP outright with probability
   *  `chance` (Urshifu #892 30%, Fezandipiti #1016 10%, Terapagos #1024 50%).
   *  SERVER-ROLLED and server-applied — a client never reports "I KO'd them".
   *  The gates are what keep this fair: Urshifu needs a 5-streak, Terapagos can
   *  only fire while being doubled on HP and having used no healing item. */
  | { fx: "instant_ko"; chance: number }
  | { fx: "dot_frac_hp"; pct: number; questions: number } // Heatran: opp HP -= round(oppMaxHp × pct) each of `questions` turns (§2c) — TODO(M3)
  | { fx: "flat_next_question_damage"; amount: number } // Jirachi +20 — TODO(M3)
  | { fx: "lifesteal_pct_of_damage"; pct: number } // Yveltal 75%
  | { fx: "revive"; hpPct: number; cure: boolean } // Ho-Oh (already-wired)
  | { fx: "full_heal_cure" } // Cresselia (already-wired)
  /** Pragmatic extension: cure-status + heal-back-a-fraction-of-damage-taken for
   *  N questions (Suicune) — distinct from `full_heal_cure` (Cresselia's
   *  one-shot heal-to-100%) and not in the frozen stub's catalogue. */
  | { fx: "heal_pct_of_damage_taken"; pct: number; questions: number } // Suicune 50%/3q
  | { fx: "disable_opponent_ability" } // Celebi/Solgaleo/Lunala — M2 (opponent_signature)
  | { fx: "item_lockout" } // Mesprit — TODO(M3)
  | { fx: "eliminate_choices"; min: number; max: number; onIndices: number[] } // Azelf — TODO(M3)
  | { fx: "predicted_status_reveal"; applyIfOppHpBelowPct: number } // Uxie — TODO(M3)
  | { fx: "copy_opponent_ability" } // Mew (already-wired)
  | { fx: "reflect_opponent_stat"; factor: number } // Manaphy x(-1) — TODO(M3)
  | { fx: "use_opponent_item" }; // Marshadow — TODO(M3)

// ── Aggregated per-row engine spec (data authored in the catalog) ───────────
/** Attached to a catalog row (`SignatureAbility.engine`) to drive the
 *  generalized M1 engine. Optional fields are absent when the row doesn't use
 *  that mechanic. `status.status` additionally allows `"random"` (Genesect) —
 *  a small extension of `StatusKind` alongside the stat model's existing
 *  `"random"` (OneShotStatSpec.stat). */
export interface SignatureEngineSpec {
  trigger: NewSignatureTrigger;
  stat?: StatChangeSpec[];
  /** signature-rework M2/M3 (§T1): stat change(s) applied on a WRONG answer
   *  (Hoopa #720 −2 self Def), distinct from the correct-answer `stat`. Tracked
   *  into `netByStat`; on a row with no `disable` they accumulate within ±3 and
   *  never revert. */
  incorrectStat?: StatChangeSpec[];
  /** `ifOpponentSpeciesAny` (M4) gates the roll on the opponent's species —
   *  Ogerpon #1017 only badly-poisons the three Loyal Three (Okidogi/Munkidori/
   *  Fezandipiti). Absent = unconditional, the existing behaviour. */
  status?: {
    status: StatusKind | "random";
    target: SideRef;
    chance: number;
    questions: number;
    ifOpponentSpeciesAny?: number[];
  }[];
  multiplier?: DamageMultiplierSpec;
  phase?: PhaseWindowSpec;
  fixedIndex?: FixedIndexSpec[];
  bespoke?: BespokeEffectRef[];
  /** signature-rework M4: for `questions` questions after the trigger fires, the
   *  OWNER receives `receivePct` of the damage the opponent deals them (0 = a
   *  total shield). Zamazenta #889 ("damage from opponent is 0", 3q) and Iron
   *  Boulder #1022 (owner ruling 2026-07-12: the spreadsheet's "damage to
   *  opponent" is a wording slip — it is a shield, as its sibling rows are).
   *  DEFENSIVE, therefore SERVER-ENFORCED: the attacker's client computes the
   *  damage, so only the server can be trusted to zero it — it clamps `_dmg` in
   *  `submit_pvp_live_answer` by reading the DEFENDER's shield window. */
  shield?: { questions: number; receivePct: number };
  /** signature-rework M4: while this ability is live, the owner's SELF-damage —
   *  the HP a wrong answer costs you (`submit_pvp_live_answer._self_dmg`) — is
   *  forced to 0 (Eternatus #890 "self inflicting damage is 0"). Owner ruling
   *  2026-07-12: this is the self-harm channel ONLY; Eternatus still takes full
   *  damage from the opponent's correct answers. Wrong answers simply cost it
   *  nothing. Server-clamped for the same reason as `shield`. */
  nullifySelfDamage?: boolean;
  /** signature-rework M4: force the OPPONENT's per-question answer timer down to
   *  `ms` for `questions` questions (the Loyal Three — Okidogi/Munkidori/
   *  Fezandipiti — "reduce timer of the enemy to 5 seconds for 5 questions").
   *  Base is PVP_BASE_TIMER_MS (20s), so this is a brutal 4x squeeze. Written to
   *  the owner's sig_runtime and read CROSS-SIDE by the opponent's client, which
   *  is the only place a timer can actually be enforced; it overrides the
   *  Speed-stage timer (`timerMsForSpeedStage`) rather than stacking with it. */
  opponentTimer?: { ms: number; questions: number };
  /** signature-rework M4: once the trigger has fired even once, treat it as
   *  permanently held for the rest of the battle (Walking Wake #1009 / Iron
   *  Leaves #1010 — "x2 ... for the rest of the battle" off an HP-below-50%
   *  trigger). Owner ruling 2026-07-12: healing back above 50% does NOT revoke
   *  it — the comeback is banked. Without this the multiplier would blink off
   *  the moment a potion took them back over the line. */
  latchOnTrigger?: boolean;
  /** signature-rework M2/M3 (§T1): disable+revert this ability N questions after
   *  it fired, regardless of correctness (Moltres #146 "...or after 3 questions").
   *  Composes with `disable`. */
  expireAfterQuestions?: number;
  disable: DisableSpec;
}
