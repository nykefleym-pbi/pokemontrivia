import { describe, expect, it } from "vitest";
import { createRng, hashSeed } from "./rng";

describe("createRng", () => {
  it("same seed -> byte-identical sequence (replay guarantee)", () => {
    const a = createRng("battle-123");
    const b = createRng("battle-123");
    for (let i = 0; i < 1000; i++) expect(a.next()).toBe(b.next());
  });

  it("different seeds -> different sequences", () => {
    const a = createRng("battle-123");
    const b = createRng("battle-124");
    const same = Array.from({ length: 50 }, () => a.next() === b.next()).filter(Boolean).length;
    expect(same).toBeLessThan(5);
  });

  it("forked streams are independent of sibling roll counts", () => {
    // Draw a different number of rolls from one fork; the other fork's
    // sequence must not shift. This is what lets us add a roll to "drops"
    // without changing every "crit" outcome in replays.
    const critFirst = createRng("seed-x").fork("crit");
    const other = createRng("seed-x");
    other.fork("drops").next();
    other.fork("drops").next();
    const critSecond = other.fork("crit");
    for (let i = 0; i < 100; i++) expect(critSecond.next()).toBe(critFirst.next());
  });

  it("int(min, max) stays inclusive and hits both ends", () => {
    const rng = createRng("bounds");
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = rng.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it("chance(p) approximates p", () => {
    const rng = createRng("chance");
    let hits = 0;
    for (let i = 0; i < 10_000; i++) if (rng.chance(0.25)) hits++;
    expect(hits / 10_000).toBeGreaterThan(0.22);
    expect(hits / 10_000).toBeLessThan(0.28);
  });

  it("pick draws every element and throws on empty", () => {
    const rng = createRng("pick");
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(rng.pick(["a", "b", "c"]));
    expect(seen).toEqual(new Set(["a", "b", "c"]));
    expect(() => rng.pick([])).toThrow();
  });

  it("hashSeed is stable across runs (frozen: replays depend on it)", () => {
    expect(hashSeed("battle-123")).toBe(hashSeed("battle-123"));
    expect(hashSeed("")).toBe(0x811c9dc5 >>> 0);
  });
});
