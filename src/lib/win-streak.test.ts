import { describe, it, expect } from "vitest";
import { currentWinStreak, dayStreak, weekWins } from "@/lib/win-streak";
import type { BattleLogEntry } from "@/lib/store/types";

/** Newest first, the order `pushBattleLog` actually stores. */
const log = (...entries: Array<[boolean, BattleLogEntry["mode"]?]>): BattleLogEntry[] =>
  entries.map(([won, mode], i) => ({
    opponent: "x",
    won,
    xpGained: 0,
    bestStreak: 0,
    timestamp: 1_000_000 - i,
    ...(mode === undefined ? {} : { mode }),
  }));

describe("currentWinStreak", () => {
  it("is zero with no history", () => {
    expect(currentWinStreak([])).toBe(0);
  });

  it("counts a run of wins from the most recent entry", () => {
    expect(currentWinStreak(log([true, "battle"], [true, "battle"], [true, "battle"]))).toBe(3);
  });

  it("stops at the first loss", () => {
    expect(currentWinStreak(log([true, "battle"], [true, "battle"], [false, "battle"]))).toBe(2);
  });

  it("is zero when the latest battle was a loss", () => {
    expect(currentWinStreak(log([false, "battle"], [true, "battle"]))).toBe(0);
  });

  it("counts every battle mode, not just live PvP", () => {
    // The actual reported bug: three regular battles won, Home showed 0,
    // because only `nearby`/`pvp` ever reached the stored counter.
    expect(currentWinStreak(log([true, "elite"], [true, "battle"], [true, "mega"]))).toBe(3);
    expect(currentWinStreak(log([true, "weekly"], [true, "pvp"], [true, "nearby"]))).toBe(3);
  });

  it("skips Daily and Who's That instead of counting them", () => {
    // Both always log won:true, so counting them would inflate the streak
    // without a battle being fought.
    expect(currentWinStreak(log([true, "daily"], [true, "whosthat"]))).toBe(0);
    expect(currentWinStreak(log([true, "daily"], [true, "battle"]))).toBe(1);
  });

  it("does not let a Daily between two wins break the run", () => {
    expect(currentWinStreak(log([true, "battle"], [true, "daily"], [true, "battle"]))).toBe(2);
  });

  it("counts legacy entries that carry no mode", () => {
    expect(currentWinStreak(log([true], [true], [false]))).toBe(2);
  });
});

describe("dayStreak", () => {
  const D = 86_400_000;
  const now = Date.UTC(2026, 10, 27, 12);
  const at = (daysAgo: number, won: boolean, mode: BattleLogEntry["mode"] = "battle"): BattleLogEntry => ({
    opponent: "x", won, xpGained: 0, bestStreak: 0, timestamp: now - daysAgo * D, mode,
  });

  it("counts yesterday's run as alive until today is won", () => {
    expect(dayStreak([at(1, true), at(2, true)], now)).toEqual({ days: 2, secured: false });
  });

  it("adds today once a battle is won today", () => {
    expect(dayStreak([at(0, true), at(1, true), at(2, true)], now)).toEqual({ days: 3, secured: true });
  });

  it("breaks on a missed day and ignores losses and the Daily Quest", () => {
    expect(dayStreak([at(1, true), at(3, true)], now).days).toBe(1);
    expect(dayStreak([at(0, false), at(0, true, "daily")], now)).toEqual({ days: 0, secured: false });
  });

  it("weekWins: Monday first, this week only (27 Nov 2026 is a Friday)", () => {
    // Friday win, Wednesday win, last Sunday (outside this week) win
    expect(weekWins([at(0, true), at(2, true), at(5, true)], now)).toEqual([false, false, true, false, true, false, false]);
  });
});
