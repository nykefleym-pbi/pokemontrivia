// Seeded, forkable randomness. Every roll in a battle flows through one Rng
// created from a server-issued seed, so a battle can be replayed exactly and
// two runs with the same seed and action log are byte-identical.
// Same mulberry32 core as scripts/balance-sim/engine.ts.

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Uniform pick from a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /**
   * Independent stream for a named subsystem ("crit", "drops", ...). Adding a
   * roll to one subsystem never shifts the rolls another one sees.
   */
  fork(label: string): Rng;
}

export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(state: number): () => number {
  let t = state >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed: string): Rng {
  const next = mulberry32(hashSeed(seed));
  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("Rng.pick on empty array");
      return items[Math.floor(next() * items.length)];
    },
    fork: (label) => createRng(`${seed}/${label}`),
  };
}
