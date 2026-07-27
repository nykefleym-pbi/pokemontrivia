import { describe, it, expect } from "vitest";
import {
  streakMultiplier,
  levelFromTotalXp,
  totalXpToReachLevel,
  TP_REWARDS,
  adaptiveDifficultyBand,
  adaptiveBandShift,
  ADAPTIVE_MIN_SAMPLE,
  ADAPTIVE_WINDOW,
  normalizeDifficultyBand,
  type CuratedDifficulty,
} from "@/lib/game-data";

/** The band a level maps to before any adaptive shift — an empty answer
 *  history is exactly the "level alone decides" case. */
const bandForLevel = (level: number) => adaptiveDifficultyBand(level, []);

/** n answers of which `correct` are right. */
const history = (n: number, correct: number) =>
  Array.from({ length: n }, (_, i) => (i < correct ? 1 : 0));

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

describe("the band a level maps to", () => {
  it("only ever names difficulties the bank stores", () => {
    for (let level = 1; level <= 60; level++) {
      const band = bandForLevel(level);
      expect(band.length, `level ${level} band is empty`).toBeGreaterThan(0);
      for (const d of band) expect(STORED, `level ${level} asked for "${d}"`).toContain(d);
    }
  });

  it("never gets easier as the trainer levels up", () => {
    // Rank a band by its hardest tier; that must be monotonic across levels.
    const hardest = (level: number) =>
      Math.max(...bandForLevel(level).map((d) => STORED.indexOf(d)));
    for (let level = 2; level <= 60; level++) {
      expect(hardest(level), `level ${level} is easier than ${level - 1}`).toBeGreaterThanOrEqual(
        hardest(level - 1),
      );
    }
  });

  it("puts a level-26 trainer on the hard end, not back on beginner questions", () => {
    expect(bandForLevel(26)).toEqual(["hard", "expert"]);
    expect(bandForLevel(40)).not.toContain("easy");
  });

  it("starts a brand-new trainer on easy alone", () => {
    expect(bandForLevel(1)).toEqual(["easy"]);
  });

  it("hands out its own copy, so a caller cannot edit the ladder", () => {
    const band = bandForLevel(26);
    band.push("easy");
    expect(bandForLevel(26)).toEqual(["hard", "expert"]);
  });
});

describe("adaptiveBandShift", () => {
  it("does nothing until there are enough answers to judge", () => {
    // A perfect run one answer short of the minimum must still not move.
    expect(adaptiveBandShift(history(ADAPTIVE_MIN_SAMPLE - 1, ADAPTIVE_MIN_SAMPLE - 1))).toBe(0);
    expect(adaptiveBandShift(history(ADAPTIVE_MIN_SAMPLE - 1, 0))).toBe(0);
    expect(adaptiveBandShift([])).toBe(0);
  });

  it("moves up on a strong run and down on a weak one", () => {
    expect(adaptiveBandShift(history(20, 18))).toBe(1); // 90%
    expect(adaptiveBandShift(history(20, 8))).toBe(-1); // 40%
  });

  it("leaves the middle alone", () => {
    expect(adaptiveBandShift(history(20, 14))).toBe(0); // 70%
  });

  it("treats the thresholds as inclusive", () => {
    expect(adaptiveBandShift(history(20, 17))).toBe(1); // exactly 85%
    expect(adaptiveBandShift(history(20, 10))).toBe(-1); // exactly 50%
  });
});

describe("adaptiveDifficultyBand", () => {
  it("promotes a trainer who is finding their level easy", () => {
    expect(bandForLevel(4)).toEqual(["easy", "medium"]);
    expect(adaptiveDifficultyBand(4, history(20, 19))).toEqual(["medium", "hard"]);
  });

  it("demotes a trainer who is drowning", () => {
    expect(bandForLevel(10)).toEqual(["medium", "hard"]);
    expect(adaptiveDifficultyBand(10, history(20, 6))).toEqual(["easy", "medium"]);
  });

  it("cannot climb past the top rung or fall below the bottom", () => {
    expect(adaptiveDifficultyBand(40, history(20, 20))).toEqual(["hard", "expert"]);
    expect(adaptiveDifficultyBand(1, history(20, 0))).toEqual(["easy"]);
  });

  it("never lands anyone on a thin pool, however they are doing", () => {
    // Bands exist because a single tier can be as few as 392 questions — about
    // twenty battles before pick_battle_curated starts recycling. The one
    // single-tier rung is easy-only, which is 792, and it is where a struggling
    // beginner is supposed to end up.
    for (let level = 1; level <= 60; level++) {
      for (const recent of [history(20, 20), history(20, 0), history(20, 14), []]) {
        const band = adaptiveDifficultyBand(level, recent);
        const thin = band.length < 2 && !(band.length === 1 && band[0] === "easy");
        expect(thin, `level ${level} got ${JSON.stringify(band)}`).toBe(false);
      }
    }
  });

  it("treats a missing history as no shift, for saves written before the field", () => {
    expect(adaptiveDifficultyBand(10, undefined)).toEqual(bandForLevel(10));
  });

  it("only ever names difficulties the bank stores, however the player is doing", () => {
    for (let level = 1; level <= 60; level++) {
      for (let correct = 0; correct <= ADAPTIVE_WINDOW; correct++) {
        for (const d of adaptiveDifficultyBand(level, history(ADAPTIVE_WINDOW, correct))) {
          expect(STORED).toContain(d);
        }
      }
    }
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
