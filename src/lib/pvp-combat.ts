import { streakMultiplier } from "./game-data";

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
  const dmg = Math.round(
    (p.baseDamage ?? PVP_BASE_DAMAGE) *
      streakMultiplier(p.streak) *
      speedFactor *
      statStageMultiplier(p.attackStage) *
      critMult *
      burnMult *
      (1 / statStageMultiplier(p.defenseStage)),
  );
  return { dmg: Math.max(1, dmg), didCrit };
}
