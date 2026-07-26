import { describe, it, expect } from "vitest";
import {
  streakMultiplier,
  levelFromTotalXp,
  totalXpToReachLevel,
  TP_REWARDS,
  difficultyBandForLevel,
  normalizeDifficultyBand,
  type CuratedDifficulty,
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

// The bank only stores these four. Anything else a band produces would match
// zero rows, which is how level 26+ ended up on beginner questions.
const STORED: CuratedDifficulty[] = ["easy", "medium", "hard", "expert"];

describe("difficultyBandForLevel", () => {
  it("only ever names difficulties the bank stores", () => {
    for (let level = 1; level <= 60; level++) {
      const band = difficultyBandForLevel(level);
      expect(band.length, `level ${level} band is empty`).toBeGreaterThan(0);
      for (const d of band) expect(STORED, `level ${level} asked for "${d}"`).toContain(d);
    }
  });

  it("never gets easier as the trainer levels up", () => {
    // Rank a band by its hardest tier; that must be monotonic across levels.
    const hardest = (level: number) =>
      Math.max(...difficultyBandForLevel(level).map((d) => STORED.indexOf(d)));
    for (let level = 2; level <= 60; level++) {
      expect(hardest(level), `level ${level} is easier than ${level - 1}`).toBeGreaterThanOrEqual(
        hardest(level - 1),
      );
    }
  });

  it("puts a level-26 trainer on the hard end, not back on beginner questions", () => {
    expect(difficultyBandForLevel(26)).toEqual(["hard", "expert"]);
    expect(difficultyBandForLevel(40)).not.toContain("easy");
  });

  it("starts a brand-new trainer on easy alone", () => {
    expect(difficultyBandForLevel(1)).toEqual(["easy"]);
  });
});

describe("normalizeDifficultyBand", () => {
  it("accepts the array a current client sends", () => {
    expect(normalizeDifficultyBand(["medium", "hard"])).toEqual(["medium", "hard"]);
  });

  it("accepts the bare string an older cached shell sends", () => {
    expect(normalizeDifficultyBand("expert")).toEqual(["expert"]);
  });

  it('maps the retired "master" tier onto the top band instead of easy', () => {
    // The whole bug: "master" was unknown, so the API clamped it to "easy".
    expect(normalizeDifficultyBand("master")).toEqual(["hard", "expert"]);
    expect(normalizeDifficultyBand(["master"])).toEqual(["hard", "expert"]);
  });

  it("keeps the known tiers out of a partly-bogus list", () => {
    expect(normalizeDifficultyBand(["hard", "impossible"])).toEqual(["hard"]);
  });

  it("de-duplicates", () => {
    expect(normalizeDifficultyBand(["easy", "easy", "medium"])).toEqual(["easy", "medium"]);
  });

  it("returns null when there is nothing usable, so the caller picks a default", () => {
    expect(normalizeDifficultyBand(undefined)).toBeNull();
    expect(normalizeDifficultyBand([])).toBeNull();
    expect(normalizeDifficultyBand("nonsense")).toBeNull();
    expect(normalizeDifficultyBand(42)).toBeNull();
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
