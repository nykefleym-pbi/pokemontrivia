// The partner-level and Training-Point damage curves. Split out of
// game-data.ts (which re-exports everything here for existing callers) so
// engine/turn.ts and engine/solo-battle-config.ts can use them without
// pulling in game-data.ts's much heavier dependency graph (the full
// generated Pokédex, trainer sprites, ...) — this file has zero imports and
// is pure by construction. Keep it that way; anything that needs the
// roster/content data belongs in game-data.ts, not here.
export function leagueIndex(level: number): number {
  if (level >= 51) return 4;
  if (level >= 26) return 3;
  if (level >= 16) return 2;
  if (level >= 6) return 1;
  return 0;
}

export function enemyHpForLevel(level: number): number {
  return 100 + 50 * leagueIndex(level);
}

// The partner grows stronger with rank: base damage per correct answer scales
// 10/12/14/16/18 alongside the enemy HP curve (100..300), so high-level
// regular battles stay winnable within the 20-question budget.
export function baseDamageForLevel(level: number): number {
  return 10 + 2 * leagueIndex(level);
}

export interface TpDamageBoost {
  threshold: number;
  multiplier: number;
}

export const TP_DAMAGE_TIERS: TpDamageBoost[] = [
  { threshold: 0, multiplier: 1.0 },
  { threshold: 100, multiplier: 1.05 },
  { threshold: 300, multiplier: 1.1 },
  { threshold: 700, multiplier: 1.15 },
  { threshold: 1500, multiplier: 1.2 },
];

/**
 * The TP figure the damage multiplier reads: everything this partner has ever
 * earned, not what is left after evolving.
 *
 * Reconstructed as balance + spent rather than tracked as its own running
 * total, because the balance is also written server-side (save-sync,
 * daily-run, mega-reward-claim) and an "earned" counter maintained only in the
 * client would miss those grants.
 */
export function lifetimeTp(
  trainingPoints: Record<number, number>,
  trainingPointsSpent: Record<number, number>,
  pokemonId: number,
): number {
  return (trainingPoints[pokemonId] ?? 0) + (trainingPointsSpent[pokemonId] ?? 0);
}

export function getTpMultiplier(tp: number): number {
  let mult = 1.0;
  for (const tier of TP_DAMAGE_TIERS) {
    if (tp >= tier.threshold) mult = tier.multiplier;
  }
  return mult;
}
