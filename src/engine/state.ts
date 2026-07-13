/**
 * Pure combat math for the Nearby-Battle HP-endurance PvP loop.
 *
 * All Pokémon share flat/uniform baseline stats (PokeEntry carries no per-species
 * stat fields), so a battle is decided entirely by answer skill plus the stat
 * STAGES that items/statuses push during the match. Stages are the mainline-style
 * countable model the store already favours (mirrors `curesRemaining`): integers
 * clamped to PVP_STAGE_MIN..PVP_STAGE_MAX, each worth ±10% for Attack/Defense.
 */

export type PvpStat = "attack" | "defense" | "speed" | "crit";

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

export const PVP_MAX_HP = 120;
export const PVP_QUESTIONS = 20;
