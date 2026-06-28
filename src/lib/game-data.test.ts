import { describe, it, expect } from "vitest";
import {
  streakMultiplier,
  levelFromTotalXp,
  totalXpToReachLevel,
  TP_REWARDS,
} from "@/lib/game-data";

describe("streakMultiplier", () => {
  it("matches documented breakpoints", () => {
    expect(streakMultiplier(0)).toBe(1.0);
    expect(streakMultiplier(1)).toBe(1.0);
    expect(streakMultiplier(2)).toBe(1.0);
    expect(streakMultiplier(3)).toBe(1.5);
    expect(streakMultiplier(4)).toBe(1.5);
    expect(streakMultiplier(5)).toBe(2.0);
    expect(streakMultiplier(6)).toBe(2.0);
    expect(streakMultiplier(7)).toBe(2.5);
    expect(streakMultiplier(9)).toBe(2.5);
    expect(streakMultiplier(10)).toBe(3.0);
    expect(streakMultiplier(25)).toBe(3.0);
  });
});

describe("levelFromTotalXp / totalXpToReachLevel", () => {
  it("round-trips at key levels", () => {
    for (const L of [1, 2, 5, 10, 25, 50]) {
      expect(levelFromTotalXp(totalXpToReachLevel(L))).toBe(L);
    }
  });

  it("totalXpToReachLevel is strictly increasing", () => {
    let prev = -1;
    for (let L = 1; L <= 60; L++) {
      const v = totalXpToReachLevel(L);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});

describe("TP_REWARDS", () => {
  it("has the current values", () => {
    expect(TP_REWARDS).toEqual({
      battleWinPerCorrect: 1,
      battleLoss: 5,
      dailyPerfect: 30,
      dailyPartial: 15,
      eliteWin: 50,
      weeklyWin: 100,
    });
  });
});
