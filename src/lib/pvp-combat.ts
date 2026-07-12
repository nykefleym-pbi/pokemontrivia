import { streakMultiplier } from "./game-data";
import type {
  DamageMultiplierSpec,
  FixedIndexSpec,
  MultiplierCondition,
  PhaseWindowSpec,
} from "./signature-abilities";

/**
 * Pure combat math for the Nearby-Battle HP-endurance PvP loop.
 *
 * All Pokémon share flat/uniform baseline stats (PokeEntry carries no per-species
 * stat fields), so a battle is decided entirely by answer skill plus the stat
 * STAGES that items/statuses push during the match. Stages are the mainline-style
 * countable model the store already favours (mirrors `curesRemaining`): integers
 * clamped to PVP_STAGE_MIN..PVP_STAGE_MAX, each worth ±10% for Attack/Defense.
 */

// ── Stat stages (Attack / Defense / Speed) ────────────────────────────────
export const PVP_STAGE_MIN = -3;
export const PVP_STAGE_MAX = 3;
/** Each Attack/Defense stage is worth ±10% → range 70%..130% of baseline. */
export const PVP_STAGE_STEP = 0.1;

export function clampStage(stage: number): number {
  return Math.max(PVP_STAGE_MIN, Math.min(PVP_STAGE_MAX, Math.round(stage)));
}

/** Attack/Defense multiplier for a stage: 0.70 (−3) … 1.00 (0) … 1.30 (+3). */
export function statStageMultiplier(stage: number): number {
  return 1 + PVP_STAGE_STEP * clampStage(stage);
}

// ── Speed → per-question timer ─────────────────────────────────────────────
export const PVP_BASE_TIMER_MS = 20_000;
/**
 * Speed is a first-class stat now (not a timer-item hack). Each Speed stage
 * lengthens/shortens the holder's OWN per-question timer by 10% — matching the
 * Attack/Defense magnitude, so at the ±3 clamp a holder's own timer ranges
 * 70%–130% of base (20s → 14s–26s): +3 → 130%, −3 → 70%. So buffing your Speed
 * gives you more thinking time, and an opponent-facing Speed debuff
 * (Salac/Colbur) shortens the target's timer.
 */
export const PVP_SPEED_PER_STAGE = 0.1;

export function timerMsForSpeedStage(stage: number, baseMs = PVP_BASE_TIMER_MS): number {
  return Math.round(baseMs * (1 + PVP_SPEED_PER_STAGE * clampStage(stage)));
}

// ── Crit ───────────────────────────────────────────────────────────────────
export const PVP_BASE_CRIT = 0.05;
/** Each Crit stage adds +5% crit chance. */
export const PVP_CRIT_PER_STAGE = 0.05;
/** Answers locked in during the first half of the timer get +10% crit chance. */
export const PVP_FIRST_HALF_CRIT_BONUS = 0.1;
export const PVP_CRIT_MULT = 1.5;
export const PVP_CRIT_MAX = 0.5;

export function critRate(critStage: number, firstHalf: boolean): number {
  const raw =
    PVP_BASE_CRIT +
    PVP_CRIT_PER_STAGE * clampStage(critStage) +
    (firstHalf ? PVP_FIRST_HALF_CRIT_BONUS : 0);
  return Math.max(0, Math.min(PVP_CRIT_MAX, raw));
}

// ── HP pool & damage ─────────────────────────────────────────────────────────
export const PVP_MAX_HP = 120;
export const PVP_QUESTIONS = 20;
export const PVP_BASE_DAMAGE = 6;
/** Burn saps correct-answer output by 15% (mirrors mainline's Attack cut). */
export const PVP_BURN_OUTPUT_MULT = 0.85;

export interface PvpDamageParams {
  baseDamage?: number;
  /** Attacker's current streak (feeds the shared streak curve). */
  streak: number;
  /** Fraction of the timer still remaining when the answer locked, 0..1. */
  speedRatio: number;
  /** Attacker's Attack stage. */
  attackStage: number;
  /** Defender's Defense stage (higher opp Defense → less damage). */
  defenseStage: number;
  /** Attacker's Crit stage. */
  critStage: number;
  /** Answer locked in the first half of the timer (crit bonus + speedRatio ≥ .5). */
  firstHalf: boolean;
  /** Attacker is burned. */
  burned?: boolean;
  /**
   * signature-rework (ruling 7 — answer-damage scope). Conditional damage
   * multiplier applied to THIS correct answer only. `factor` (>1) scales the
   * final damage; `ignoreDefense` drops the defender's Defense-stage divisor.
   * Compute these with `evaluateHitModifiers(spec, ctx)` (below) at the call
   * site (buildSigContext supplies `oppType`/`oppSpecies`), then pass the
   * result here. Defaults (factor 1 / ignoreDefense false) are a no-op, so
   * flat / HP-fraction / phase damage paths — which never build a
   * `PvpDamageParams` — are untouched. Server re-clamps the final HP delta (R6).
   */
  hitFactor?: number;
  ignoreDefense?: boolean;
  /**
   * signature-rework M5 — the QUESTION-INDEXED outgoing scale (`engine.phase` /
   * `engine.fixedIndex`), from `evaluateIndexFactor`. Kept apart from `hitFactor`
   * because it is the one channel allowed to reach ZERO: a phase window with
   * `scaleToPct: 0` means "this question deals no damage at all", and the `max(1, …)`
   * floor below would otherwise quietly turn that into a 1-HP scratch. Every other
   * path keeps the floor.
   */
  outgoingFactor?: number;
  rng?: () => number;
}

export interface PvpDamageResult {
  dmg: number;
  didCrit: boolean;
}

/**
 * Damage a correct answer deals to the opponent's HP. Wraps the existing score
 * inputs (streak curve + speed) with the new symmetric Attack/Defense stage
 * multipliers, a crit roll, and the Burn output cut. Bounded: at the ±3 clamp a
 * fully-buffed attacker vs a fully-defended opponent swings ~0.70/1.30 … 1.30/0.70,
 * never a blowout.
 */
export function computePvpDamage(p: PvpDamageParams): PvpDamageResult {
  const rng = p.rng ?? Math.random;
  const speedFactor = 1 + 0.5 * Math.max(0, Math.min(1, p.speedRatio));
  const didCrit = rng() < critRate(p.critStage, p.firstHalf);
  const critMult = didCrit ? PVP_CRIT_MULT : 1;
  const burnMult = p.burned ? PVP_BURN_OUTPUT_MULT : 1;
  // signature-rework (ruling 7): fold the conditional multiplier + ignore-Defense
  // into THIS answer's damage only. ignoreDefense collapses the Defense divisor
  // to 1 (the +3-clamped opponent Defense no longer reduces the hit).
  const hitFactor = p.hitFactor ?? 1;
  const outgoingFactor = p.outgoingFactor ?? 1;
  const defenseDivisor = p.ignoreDefense ? 1 : 1 / statStageMultiplier(p.defenseStage);
  const dmg = Math.round(
    (p.baseDamage ?? PVP_BASE_DAMAGE) *
      streakMultiplier(p.streak) *
      speedFactor *
      statStageMultiplier(p.attackStage) *
      critMult *
      burnMult *
      hitFactor *
      defenseDivisor *
      outgoingFactor,
  );
  // A zero phase window is a real zero (Cosmog/Giratina/Xerneas charge questions),
  // not a 1-HP scratch — see `outgoingFactor`.
  return { dmg: outgoingFactor === 0 ? 0 : Math.max(1, dmg), didCrit };
}

// ── signature-rework: conditional answer-damage multiplier resolver ──────────

/** Minimal context `evaluateHitModifiers` reads. A subset of the fields
 *  `buildSigContext` populates on `SignatureContext` (oppType/oppSpecies), plus
 *  whether this answer was correct — the multiplier is answer-damage-scoped
 *  (ruling 7), so it is inert on a wrong answer. */
export interface HitModifierContext {
  /** Was this answer correct? Multiplier/ignore-Def only apply when true. */
  correct: boolean;
  /** Opponent partner's types (for "opponent_type"/"opponent_type_any"). */
  oppType: string[];
  /** Opponent partner's National Dex id (for "opponent_species"/"opponent_species_any"). */
  oppSpecies: number;
  /** signature-rework M4: the ATTACKER's own HP as a 0..1 fraction, for the
   *  `hpTiers` ladder (Regidrago #895 — x3 while healthy down to x1 when spent).
   *  Optional: rows without `hpTiers` never read it, and an absent value falls
   *  through to the flat `factor` rather than silently picking a tier. */
  selfHpPct?: number;
}

/** Aggregated answer-damage modifiers for one correct answer. `factor` feeds
 *  `PvpDamageParams.hitFactor`; `ignoreDefense` feeds `PvpDamageParams.ignoreDefense`. */
export interface SignatureHitModifiers {
  factor: number;
  ignoreDefense: boolean;
}

export const NO_SIGNATURE_HIT_MODIFIERS: SignatureHitModifiers = { factor: 1, ignoreDefense: false };

/** Does a multiplier's opponent-condition hold right now? Exported because the tick
 *  spec builder needs the same answer to decide whether a row's `onSuccess` or its
 *  `fallback` STAT specs go to the server (Ogerpon #1017 / Regice #378 / Zygarde
 *  #718) — one definition, so the damage and the stat bump can never disagree. */
export function multiplierConditionHolds(
  cond: MultiplierCondition,
  ctx: Pick<HitModifierContext, "oppType" | "oppSpecies">,
): boolean {
  switch (cond.on) {
    case "always":
      return true;
    case "opponent_type":
      return ctx.oppType.includes(cond.typeName);
    case "opponent_type_any":
      return cond.typeNames.some((t) => ctx.oppType.includes(t));
    case "opponent_species":
      return ctx.oppSpecies === cond.dexId;
    case "opponent_species_any":
      return cond.dexIds.includes(ctx.oppSpecies);
    default:
      return false;
  }
}

/**
 * Resolve a row's `engine.multiplier` (`DamageMultiplierSpec`) against the live
 * opponent into the concrete `{ factor, ignoreDefense }` to fold into
 * `computePvpDamage` for THIS correct answer (ruling 7 — answer-damage scope).
 *
 * - Wrong answer, or no spec → the neutral `{ factor: 1, ignoreDefense: false }`.
 * - Condition holds → the spec's `factor` and `ignoreDefense` apply. (The
 *   `onSuccess` / `fallback` STAT specs are NOT handled here — those are stat
 *   stages resolved by the backend `sigEngineTick`, not the damage number.)
 * - Condition fails → the factor falls back to `fallbackFactor` (default 1), and
 *   the conditional `ignoreDefense` drops.
 *
 * `ignoreDefenseAlways` is the unconditional axis: it applies whether or not the
 * condition holds, so a row can ignore Defense EVERY battle while ALSO carrying a
 * separate species/type-conditional damage factor. Solgaleo #791 is the row that
 * forces the two axes apart (always ignore Def, ×2 only into Lunala) — a single
 * `{ on: "always" }` condition cannot express both at once.
 *
 * NB: this is a DISTINCT function from the same-named `evaluateHitModifiers` in
 * `signature-abilities.ts` (which resolves the legacy `damage_calc` HitModifiers
 * from an ability). They live in different modules; a caller needing both should
 * alias one on import. See docs/handoffs/signature-rework/03-frontend-a.md.
 */
export function evaluateHitModifiers(
  spec: DamageMultiplierSpec | null | undefined,
  ctx: HitModifierContext,
): SignatureHitModifiers {
  if (!spec || !ctx.correct) return NO_SIGNATURE_HIT_MODIFIERS;
  const holds = multiplierConditionHolds(spec.condition, ctx);
  return {
    factor: holds ? hpTierFactor(spec, ctx) : (spec.fallbackFactor ?? 1),
    ignoreDefense: spec.ignoreDefenseAlways === true || (holds && spec.ignoreDefense === true),
  };
}

/** The factor to use when the condition holds. Normally the flat `spec.factor`,
 *  but an `hpTiers` row (Regidrago #895) reads it off a ladder keyed on the
 *  attacker's own live HP: the highest tier whose `atLeastPct` the attacker still
 *  meets. Re-evaluated every question (owner ruling 2026-07-12), so the factor
 *  slides down as Regidrago is worn out. */
function hpTierFactor(spec: DamageMultiplierSpec, ctx: HitModifierContext): number {
  const flat = spec.factor ?? 1;
  if (!spec.hpTiers?.length || ctx.selfHpPct === undefined) return flat;
  const hpPct = ctx.selfHpPct * 100;
  const tier = [...spec.hpTiers]
    .sort((a, b) => b.atLeastPct - a.atLeastPct)
    .find((t) => hpPct >= t.atLeastPct);
  return tier?.factor ?? flat;
}

// ── signature-rework M5: question-indexed outgoing damage ────────────────────

/** What `evaluateIndexFactor` reads. Unlike the multiplier channel this is keyed
 *  on the QUESTION NUMBER, not on the opponent. */
export interface IndexDamageContext {
  /** Was this answer correct? A phase/fixed-index scale only touches a real hit. */
  correct: boolean;
  /** 1-indexed question number (1..20), matching the engine's `phaseIdx`. */
  questionNo: number;
  /** Attacker's own HP as a 0..1 fraction (Regigigas #486's payoff gate). */
  selfHpPct?: number;
  /** Defender's HP as a 0..1 fraction (same gate). */
  oppHpPct?: number;
}

/** The question number a phase window pays off on: explicit, else the question
 *  straight after the window closes. */
export function phasePayoffIndex(p: PhaseWindowSpec): number {
  return p.payoffAtIndex ?? p.windowN + 1;
}

/**
 * signature-rework M5 — resolve a row's QUESTION-INDEXED outgoing damage scale
 * into a single factor to fold into `computePvpDamage` (`outgoingFactor`).
 *
 * Two spec shapes feed it, and both were catalogued from the owner's spreadsheet
 * back in M2/M3 but never delivered: nothing outside the describer read
 * `engine.phase` or `engine.fixedIndex`, so ten rows — Giratina, Regigigas,
 * Xerneas, Type: Null, Silvally, Cosmog, the three Ultra Beasts and Blacephalon —
 * charged up and then hit for exactly normal damage.
 *
 *  - `fixedIndex`: an outgoing multiplier pinned to specific questions (Giratina
 *    x2 on q2/q12; Blacephalon x5 on q1, 75% on q2-19).
 *  - `phase`: a charge window over questions 1..windowN scaled to `scaleToPct`
 *    (0 = the classic "deal no damage while charging"), then a `payoffMultiplier`
 *    on the payoff question. `payoffCondition: "opp_hp_gt_self"` gates the payoff
 *    on Regigigas actually being behind.
 *
 * Anchored on ABSOLUTE question numbers, deliberately: every phase row triggers at
 * `start_of_battle` or `on_questions`, so the window always opens on question 1 and
 * the trigger is NOT what holds it open. Gating this on a live trigger the way the
 * multiplier channel does would switch the window off for questions 2..N and leave
 * only the payoff — the exact opposite of a charge-up. The caller still drops it
 * when the row is disabled or suppressed.
 *
 * A wrong answer, an absent spec, or a question the spec says nothing about all
 * return the neutral 1.
 */
export function evaluateIndexFactor(
  engine: { phase?: PhaseWindowSpec; fixedIndex?: FixedIndexSpec[] } | null | undefined,
  ctx: IndexDamageContext,
): number {
  if (!engine || !ctx.correct) return 1;
  let factor = 1;

  const fixed = engine.fixedIndex?.find(
    (f) => f.index === ctx.questionNo && f.outgoingMultiplier != null,
  );
  if (fixed?.outgoingMultiplier != null) factor *= fixed.outgoingMultiplier;

  const p = engine.phase;
  if (p) {
    const payoffAt = phasePayoffIndex(p);
    if (ctx.questionNo === payoffAt && p.payoffMultiplier != null) {
      // Regigigas #486: the x2.5 only lands if the opponent is still ahead of us.
      const gated =
        p.payoffCondition === "opp_hp_gt_self" &&
        !(ctx.oppHpPct !== undefined && ctx.selfHpPct !== undefined && ctx.oppHpPct > ctx.selfHpPct);
      if (!gated) factor *= p.payoffMultiplier;
    } else if (ctx.questionNo <= p.windowN) {
      factor *= p.scaleToPct / 100;
    }
  }

  return factor;
}
