import { describe, it, expect } from "vitest";
import {
  battleReward,
  dailyReward,
  dailyStreakMultiplier,
  levelMultiplier,
  DAILY_STREAK_MAX,
  countConsecutiveDays,
} from "@/lib/rewards";

describe("battleReward", () => {
  it("regular win at level 1, streak 0", () => {
    expect(battleReward({ mode: "regular", won: true, level: 1, maxStreak: 0 })).toEqual({
      xp: 50,
      coins: 13,
      tp: 5,
    });
  });
  it("regular loss at level 1, streak 0", () => {
    expect(battleReward({ mode: "regular", won: false, level: 1, maxStreak: 0 })).toEqual({
      xp: 10,
      coins: 0,
      tp: 0,
    });
  });
  it("weekly win at level 1, streak 0", () => {
    expect(battleReward({ mode: "weekly", won: true, level: 1, maxStreak: 0 })).toEqual({
      xp: 100,
      coins: 30,
      tp: 20,
    });
  });
  it("weekly loss → zero", () => {
    expect(battleReward({ mode: "weekly", won: false, level: 1, maxStreak: 0 })).toEqual({
      xp: 0,
      coins: 0,
      tp: 0,
    });
  });
  it("elite win", () => {
    expect(battleReward({ mode: "elite", won: true, level: 1, maxStreak: 0 })).toEqual({
      xp: 0,
      coins: 2000,
      tp: 200,
    });
  });
  it("elite loss → zero", () => {
    expect(battleReward({ mode: "elite", won: false, level: 1, maxStreak: 0 })).toEqual({
      xp: 0,
      coins: 0,
      tp: 0,
    });
  });
  it("regular win at streak 10 (3× mult)", () => {
    expect(battleReward({ mode: "regular", won: true, level: 1, maxStreak: 10 })).toEqual({
      xp: 150,
      coins: 38,
      tp: 15,
    });
  });
  it("regular win at level 11 (1.5× mult)", () => {
    expect(battleReward({ mode: "regular", won: true, level: 11, maxStreak: 0 })).toEqual({
      xp: 75,
      coins: 19,
      tp: 8,
    });
  });
});

describe("dailyReward", () => {
  it("below threshold", () => {
    expect(dailyReward({ correct: 5, total: 10, level: 1 })).toEqual({ xp: 0, tp: 0 });
  });
  it("partial pass", () => {
    expect(dailyReward({ correct: 6, total: 10, level: 1 })).toEqual({ xp: 50, tp: 10 });
  });
  it("perfect", () => {
    expect(dailyReward({ correct: 10, total: 10, level: 1 })).toEqual({ xp: 100, tp: 20 });
  });

  it("pays the day-1 rate when no streak is supplied", () => {
    // Every pre-existing caller omits streakDays; none of them may change.
    expect(dailyReward({ correct: 6, total: 10, level: 1 })).toEqual(
      dailyReward({ correct: 6, total: 10, level: 1, streakDays: 1 }),
    );
  });

  it("pays more for a longer run of days", () => {
    const day1 = dailyReward({ correct: 6, total: 10, level: 1, streakDays: 1 });
    const day5 = dailyReward({ correct: 6, total: 10, level: 1, streakDays: 5 });
    expect(day5.xp).toBeGreaterThan(day1.xp);
    expect(day5).toEqual({ xp: 60, tp: 12 }); // 50 * 1.20
  });

  it("keeps TP at 20% of the streak-boosted XP", () => {
    const r = dailyReward({ correct: 10, total: 10, level: 1, streakDays: 11 });
    expect(r.tp).toBe(Math.round(0.2 * r.xp));
  });

  it("stacks with the perfect-run bonus rather than replacing it", () => {
    const partial = dailyReward({ correct: 6, total: 10, level: 1, streakDays: 11 });
    const perfect = dailyReward({ correct: 10, total: 10, level: 1, streakDays: 11 });
    expect(perfect.xp).toBe(partial.xp * 2);
  });
});

describe("dailyStreakMultiplier", () => {
  it("day 1 is the unchanged baseline", () => {
    expect(dailyStreakMultiplier(1)).toBe(1);
  });

  it("adds 5% a day", () => {
    expect(dailyStreakMultiplier(2)).toBeCloseTo(1.05, 10);
    expect(dailyStreakMultiplier(6)).toBeCloseTo(1.25, 10);
  });

  it("stops climbing at the cap", () => {
    // Uncapped, a long streak becomes so valuable that breaking it is
    // punishing rather than disappointing — which is when a missed day stops
    // someone coming back at all.
    expect(dailyStreakMultiplier(11)).toBeCloseTo(1 + DAILY_STREAK_MAX, 10);
    expect(dailyStreakMultiplier(400)).toBeCloseTo(1 + DAILY_STREAK_MAX, 10);
  });

  it("treats nonsense input as day 1 rather than paying out for it", () => {
    expect(dailyStreakMultiplier(0)).toBe(1);
    expect(dailyStreakMultiplier(-5)).toBe(1);
    expect(dailyStreakMultiplier(NaN)).toBe(1);
  });
});

describe("levelMultiplier", () => {
  it("baseline at 1", () => {
    expect(levelMultiplier(1)).toBe(1);
  });
  it("level 11 → 1.5", () => {
    expect(levelMultiplier(11)).toBeCloseTo(1.5, 10);
  });
});

describe("countConsecutiveDays", () => {
  const walk = (dates: string[], today: string) => countConsecutiveDays(dates, today);

  it("counts an unbroken run ending today", () => {
    expect(walk(["2026-07-27", "2026-07-26", "2026-07-25"], "2026-07-27")).toBe(3);
  });

  it("stops at the first gap", () => {
    // The owner's real history at the time of writing: three in a row, then a
    // five-day hole. The hole must end the count, not be counted through.
    expect(
      walk(["2026-07-27", "2026-07-26", "2026-07-25", "2026-07-20", "2026-07-18"], "2026-07-27"),
    ).toBe(3);
  });

  it("walks across a month boundary", () => {
    expect(walk(["2026-08-01", "2026-07-31", "2026-07-30"], "2026-08-01")).toBe(3);
  });

  it("walks across a year boundary", () => {
    expect(walk(["2027-01-01", "2026-12-31", "2026-12-30"], "2027-01-01")).toBe(3);
  });

  it("handles a leap day", () => {
    expect(walk(["2028-03-01", "2028-02-29", "2028-02-28"], "2028-03-01")).toBe(3);
  });

  it("is day 1 when today is the only run", () => {
    expect(walk(["2026-07-27"], "2026-07-27")).toBe(1);
  });

  it("never returns 0, even with no history at all", () => {
    // A zero would mean a multiplier below the day-1 baseline.
    expect(walk([], "2026-07-27")).toBe(1);
  });

  it("ignores runs after today rather than counting them", () => {
    expect(walk(["2026-07-28", "2026-07-27"], "2026-07-27")).toBe(1);
  });

  it("survives a malformed date without throwing", () => {
    expect(() => walk(["2026-07-27"], "not-a-date")).not.toThrow();
    expect(walk(["2026-07-27"], "not-a-date")).toBe(1);
  });
});
