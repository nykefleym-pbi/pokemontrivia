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
 * Consecutive days ending at `today`, given the set of dates on which the
 * player completed a run (YYYY-MM-DD).
 *
 * Lives here, next to the curve it feeds, so the daily-run Edge Function can
 * import it the same way it already imports `dailyReward` — the calendar walk
 * is the part most likely to be wrong (month ends, year ends, gaps), and
 * putting it in the Edge Function alone would leave it untested.
 */
export function countConsecutiveDays(completedDates: Iterable<string>, today: string): number {
  const dates = completedDates instanceof Set ? completedDates : new Set(completedDates);
  const cursor = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(cursor.getTime())) return 1;
  let streak = 0;
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  // Today's row is inserted before this runs, so 0 means "no history at all";
  // either way the player is on day 1.
  return Math.max(1, streak);
}

/** Extra XP per consecutive day, and the ceiling it stops at. */
export const DAILY_STREAK_STEP = 0.05;
export const DAILY_STREAK_MAX = 0.5;

/**
 * How much a run of consecutive days is worth, as a multiplier on the day's XP.
 *
 * Day 1 is 1.0 and each further day adds 5%, capping at +50% (day 11 onward).
 * Capped on purpose: an uncapped curve makes a long streak so valuable that
 * breaking it is punishing rather than disappointing, which is the point at
 * which a missed day stops a player coming back at all.
 *
 * Deliberately separate from the daily GIFT streak, which keeps its own 7-day
 * shiny cycle. They measure different things — showing up versus playing — and
 * the owner's ruling is that both stay.
 */
export function dailyStreakMultiplier(streakDays: number): number {
  const days = Math.max(1, Math.floor(streakDays || 1));
  return 1 + Math.min(DAILY_STREAK_MAX, (days - 1) * DAILY_STREAK_STEP);
}

/**
 * Daily Quest reward. Needs >= 6/10 to score. Perfect (10/10) doubles XP.
 * TP is 20% of XP. Mirrors dailyXpFor() + the 0.2*xp TP grant exactly.
 *
 * `streakDays` is how many consecutive days the player has completed, today
 * included, and defaults to 1 so every existing caller keeps its old numbers.
 * It is counted server-side from `daily_runs` rather than trusted from the
 * client — the table already holds one row per player per day, so the streak
 * is a fact on disk rather than a counter that can drift or be edited.
 */
export function dailyReward(opts: {
  correct: number;
  total: number;
  level: number;
  streakDays?: number;
}): DailyReward {
  if (opts.correct < 6) return { xp: 0, tp: 0 };
  const lvl = levelMultiplier(opts.level);
  const perfectMult = opts.correct === opts.total ? 2 : 1;
  const streakMult = dailyStreakMultiplier(opts.streakDays ?? 1);
  const xp = Math.round(50 * lvl * perfectMult * streakMult);
  return { xp, tp: Math.round(0.2 * xp) };
}

/** Who's That Pokémon: flat XP per correct identification. Matches the
 * "+100 XP" shown on the correct-answer screen — was previously 10, out of
 * sync with that label. */
export const WHOS_THAT_XP = 100;

// NOTE: Mega Raid rewards live in src/lib/mega/schedule.ts (MEGA_REWARD + megaRankScale),
// kept in the mega domain. See docs/ARCHITECTURE.md.
