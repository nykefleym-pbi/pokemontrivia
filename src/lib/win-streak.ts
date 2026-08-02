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
