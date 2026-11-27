import type { EggProgressMode } from "@/lib/game-data";
import type { BattleLogEntry } from "@/lib/store/types";

/**
 * Which logged modes are a fight you can lose.
 *
 * `daily` and `whosthat` are excluded because they always log `won: true` —
 * a Daily Quest and a Who's That guess are completions, not victories. Counting
 * them would let the streak climb without a single battle being fought, and
 * would make it impossible to break by losing.
 */
const BATTLE_MODES: ReadonlySet<EggProgressMode> = new Set<EggProgressMode>([
  "battle",
  "elite",
  "weekly",
  "mega",
  "pvp",
  "nearby",
]);

/**
 * The player's current run of consecutive battle wins.
 *
 * Derived from the battle log rather than stored, which is the whole point.
 * The stored counter — `arenaStats.currentWinStreak` — is only ever written by
 * `recordArenaBattle`, and that has exactly ONE caller: the live PvP screen.
 * Regular, Elite, Weekly and Mega battles never touched it, so Home showed 0 to
 * a player who had just won three in a row. Every mode already writes to the
 * log, so reading from there makes the number true for all of them at once —
 * and true RETROACTIVELY, since the wins are already recorded.
 *
 * `log` is newest-first (`pushBattleLog` prepends), so this walks forward from
 * the head and stops at the first loss.
 *
 * Non-battle entries are skipped rather than treated as a break: opening the
 * Daily Quest between two wins is not a loss, and must not cost the streak.
 */
export function currentWinStreak(log: readonly BattleLogEntry[]): number {
  let streak = 0;
  for (const entry of log) {
    // Legacy entries carry no mode; all of them came from regular/weekly/daily
    // battle (see BattleLogEntry), so they count as battles.
    if (entry.mode !== undefined && !BATTLE_MODES.has(entry.mode)) continue;
    if (!entry.won) break;
    streak++;
  }
  return streak;
}

/** UTC days with a battle won — or, with `daily`, a Daily Quest finished. */
function winDays(log: readonly BattleLogEntry[], daily = false): Set<string> {
  const won = new Set<string>();
  for (const e of log) {
    const counts = daily ? e.mode === "daily" : e.mode === undefined || BATTLE_MODES.has(e.mode);
    if (e.won && counts) won.add(new Date(e.timestamp).toISOString().slice(0, 10));
  }
  return won;
}

/** This week, Monday first (4.2 / 5.3 day dots): whether each day counts. */
export function weekWins(log: readonly BattleLogEntry[], now = Date.now(), daily = false): boolean[] {
  const won = winDays(log, daily);
  const dow = (new Date(now).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => won.has(new Date(now + (i - dow) * 86_400_000).toISOString().slice(0, 10)));
}

/**
 * The day streak on Home (Figma 2.3 / 2.6): days in a row with at least one
 * battle won, like a Duolingo lesson a day. It stays alive through today until
 * today is won: `secured` says today already counts. `daily` counts Daily Quests instead.
 * shortcut: reads the last 300 log entries; a longer streak undercounts.
 */
export function dayStreak(log: readonly BattleLogEntry[], now = Date.now(), daily = false): { days: number; secured: boolean } {
  const won = winDays(log, daily);
  const day = (offset: number) => new Date(now - offset * 86_400_000).toISOString().slice(0, 10);
  const secured = won.has(day(0));
  let days = 0;
  for (let i = secured ? 0 : 1; won.has(day(i)); i++) days++;
  return { days, secured };
}
