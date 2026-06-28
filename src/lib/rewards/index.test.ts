import { describe, it, expect } from "vitest";
import { battleReward, dailyReward, levelMultiplier } from "@/lib/rewards";

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
});

describe("levelMultiplier", () => {
  it("baseline at 1", () => {
    expect(levelMultiplier(1)).toBe(1);
  });
  it("level 11 → 1.5", () => {
    expect(levelMultiplier(11)).toBeCloseTo(1.5, 10);
  });
});
