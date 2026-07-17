// Imported directly from engine/damage (not @/lib/game-data, which re-exports
// it): esbuild can't prove game-data.ts's OTHER top-level computations are
// side-effect-free, so importing anything from it pulls in its whole
// dependency graph — costly for callers bundled into an Edge Function (see
// scripts/bundle-edge-function.mjs / save-sync's use of battleReward).
import { streakMultiplier } from "@/engine/damage";

/** Per-level reward scaling: +5% per level above 1. */
export function levelMultiplier(level: number): number {
  return 1 + 0.05 * (level - 1);
}

export type BattleRewardMode = "regular" | "weekly" | "elite";

export interface BattleReward {
  xp: number;
  coins: number;
  tp: number;
}

/**
 * Reward for a Regular / Weekly (gym) / Elite Four battle.
 * Mirrors the prior inline logic in battle-screen.tsx finish() exactly.
 */
export function battleReward(opts: {
  mode: BattleRewardMode;
  won: boolean;
  level: number;
  maxStreak: number;
}): BattleReward {
  const lvl = levelMultiplier(opts.level);
  const streak = streakMultiplier(opts.maxStreak);

  if (opts.mode === "elite") {
    if (!opts.won) return { xp: 0, coins: 0, tp: 0 };
    return { xp: 0, coins: 2000, tp: Math.round(200 * lvl * streak) };
  }

  if (opts.mode === "weekly") {
    if (!opts.won) return { xp: 0, coins: 0, tp: 0 };
    const xp = Math.round(100 * lvl * streak);
    return { xp, coins: Math.round(0.3 * xp), tp: Math.round(0.2 * xp) };
  }

  // regular
  if (opts.won) {
    const xp = Math.round(50 * lvl * streak);
    return { xp, coins: Math.round(0.25 * xp), tp: Math.round(0.1 * xp) };
  }
  return { xp: Math.round(10 * lvl * streak), coins: 0, tp: 0 };
}

export interface DailyReward {
  xp: number;
  tp: number;
}

/**
 * Daily Quest reward. Needs >= 6/10 to score. Perfect (10/10) doubles XP.
 * TP is 20% of XP. Mirrors dailyXpFor() + the 0.2*xp TP grant exactly.
 */
export function dailyReward(opts: { correct: number; total: number; level: number }): DailyReward {
  if (opts.correct < 6) return { xp: 0, tp: 0 };
  const lvl = levelMultiplier(opts.level);
  const perfectMult = opts.correct === opts.total ? 2 : 1;
  const xp = Math.round(50 * lvl * perfectMult);
  return { xp, tp: Math.round(0.2 * xp) };
}

/** Who's That Pokémon: flat XP per correct identification. Matches the
 * "+100 XP" shown on the correct-answer screen — was previously 10, out of
 * sync with that label. */
export const WHOS_THAT_XP = 100;

// NOTE: Mega Raid rewards live in src/lib/mega/schedule.ts (MEGA_REWARD + megaRankScale),
// kept in the mega domain. See docs/ARCHITECTURE.md.
