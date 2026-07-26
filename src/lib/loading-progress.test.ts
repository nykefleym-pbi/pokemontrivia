import { describe, it, expect } from "vitest";
import { buildProgressSteps } from "@/lib/loading-progress";
import { pickLoadingArt } from "@/lib/app-icons";
import { LOADING_TIPS, randomTip } from "@/lib/loading-tips";

/** Deterministic stand-in for Math.random that cycles a fixed sequence. */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

const BAR_MS = 4400;

describe("buildProgressSteps", () => {
  it("always ends at exactly 100% on the final tick", () => {
    // The whole point of precomputing the schedule: whatever the RNG does, the
    // bar cannot be left stranded at 99% or overshoot past the phase.
    for (let i = 0; i < 200; i++) {
      const steps = buildProgressSteps(BAR_MS);
      const last = steps[steps.length - 1];
      expect(last.to).toBe(100);
      expect(last.at).toBe(BAR_MS);
    }
  });

  it("never exceeds 100% or the bar duration at any step", () => {
    for (let i = 0; i < 200; i++) {
      for (const step of buildProgressSteps(BAR_MS)) {
        // 0 is legal: a chunk small enough to round to nothing reads as a stall.
        expect(step.to).toBeGreaterThanOrEqual(0);
        expect(step.to).toBeLessThanOrEqual(100);
        expect(step.at).toBeGreaterThan(0);
        expect(step.at).toBeLessThanOrEqual(BAR_MS);
      }
    }
  });

  it("advances monotonically in both time and percentage", () => {
    for (let i = 0; i < 200; i++) {
      const steps = buildProgressSteps(BAR_MS);
      for (let j = 1; j < steps.length; j++) {
        // A bar that jumps backwards would read as a bug, not as loading.
        expect(steps[j].at).toBeGreaterThanOrEqual(steps[j - 1].at);
        expect(steps[j].to).toBeGreaterThanOrEqual(steps[j - 1].to);
      }
    }
  });

  it("produces 9 to 13 chunks", () => {
    const counts = new Set<number>();
    for (let i = 0; i < 300; i++) counts.add(buildProgressSteps(BAR_MS).length);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(9);
    expect(Math.max(...counts)).toBeLessThanOrEqual(13);
  });

  // The bar exists to look like resources arriving, so "uneven" is a real
  // requirement, not a nice-to-have. An earlier uniform-weight version passed a
  // mere `new Set(deltas).size > 1` while actually producing ten 12% steps
  // evenly spaced — indistinguishable from a linear animation. These two tests
  // assert the spread instead of merely asserting non-identity.
  it("produces visibly uneven chunk sizes", () => {
    let unevenRuns = 0;
    for (let i = 0; i < 100; i++) {
      const steps = buildProgressSteps(BAR_MS);
      const deltas = steps.map((s, j) => s.to - (j === 0 ? 0 : steps[j - 1].to));
      // Largest chunk at least triple the smallest: a real mix of trickle and jump.
      if (Math.max(...deltas) >= 3 * Math.max(1, Math.min(...deltas))) unevenRuns++;
    }
    expect(unevenRuns).toBeGreaterThan(90);
  });

  it("includes stalls — some pauses far longer than the average", () => {
    let stallRuns = 0;
    for (let i = 0; i < 100; i++) {
      const steps = buildProgressSteps(BAR_MS);
      const gaps = steps.map((s, j) => s.at - (j === 0 ? 0 : steps[j - 1].at));
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      if (Math.max(...gaps) >= 2 * mean) stallRuns++;
    }
    expect(stallRuns).toBeGreaterThan(90);
  });

  it("is deterministic for a fixed rand", () => {
    const values = [0.42, 0.13, 0.87, 0.31, 0.65, 0.09, 0.5];
    expect(buildProgressSteps(BAR_MS, seq(values))).toEqual(
      buildProgressSteps(BAR_MS, seq(values)),
    );
  });
});

// Owner request 2026-07-26: the loading screen used to resolve one file per
// calendar month from the device clock, so it changed twelve times a year. It
// now draws from whatever art is in the folder, every open.
describe("pickLoadingArt", () => {
  const ART = ["/loading/01.webp", "/loading/02.webp", "/loading/03.webp"];

  it("returns null for an empty folder so the screen can fall back", () => {
    expect(pickLoadingArt([])).toBeNull();
  });

  it("always returns one of the given files", () => {
    for (let i = 0; i < 200; i++) expect(ART).toContain(pickLoadingArt(ART));
  });

  it("reaches every file over enough draws", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickLoadingArt(ART)!);
    expect(seen.size).toBe(ART.length);
  });

  it("never repeats the previous open's art", () => {
    for (const last of ART) {
      for (let i = 0; i < 200; i++) expect(pickLoadingArt(ART, { last })).not.toBe(last);
    }
  });

  it("shows the only file it has, even when that was last open's", () => {
    const one = ["/loading/07.webp"];
    expect(pickLoadingArt(one, { last: one[0] })).toBe(one[0]);
  });

  it("ignores a `last` that is no longer in the folder", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(pickLoadingArt(ART, { last: "/loading/99.webp" })!);
    expect(seen.size).toBe(ART.length);
  });

  it("indexes off the end for neither rand() === 0 nor a rand that returns 1", () => {
    expect(pickLoadingArt(ART, { rand: () => 0 })).toBe(ART[0]);
    expect(pickLoadingArt(ART, { rand: () => 1 })).toBe(ART[ART.length - 1]);
  });

  it("spreads the draws roughly evenly rather than favouring one file", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const pick = pickLoadingArt(ART)!;
      counts.set(pick, (counts.get(pick) ?? 0) + 1);
    }
    for (const n of counts.values()) expect(n).toBeGreaterThan(3000 / ART.length / 2);
  });
});

describe("randomTip", () => {
  it("returns a tip from the list", () => {
    for (let i = 0; i < 100; i++) expect(LOADING_TIPS).toContain(randomTip());
  });

  it("indexes from the start and end of the list without going out of bounds", () => {
    // Math.random() is [0, 1), so 0 and 0.999… are the real boundary cases.
    expect(randomTip(() => 0)).toBe(LOADING_TIPS[0]);
    expect(randomTip(() => 0.999999)).toBe(LOADING_TIPS[LOADING_TIPS.length - 1]);
  });

  it("can reach every tip", () => {
    const seen = new Set(
      LOADING_TIPS.map((_, i) => randomTip(() => i / LOADING_TIPS.length)),
    );
    expect(seen.size).toBe(LOADING_TIPS.length);
  });
});
