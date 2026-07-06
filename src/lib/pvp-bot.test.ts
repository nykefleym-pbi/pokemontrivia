import { describe, expect, it } from "vitest";
import {
  rollBotPartner,
  rollBotProfile,
  botAnswersCorrectly,
  botAnswerTimeMs,
  botShouldFireAbility,
  botShouldUseItem,
  type BotProfile,
} from "./pvp-bot";
import { ALL_LEGENDARY_MYTHICAL_IDS } from "./legendary-data";
import { PVP_BASE_TIMER_MS } from "./pvp-combat";

/** Deterministic PRNG (mulberry32) so statistical assertions are reproducible. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rng that replays a fixed sequence, then holds its last value. */
function sequence(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

const profile = (over: Partial<BotProfile> = {}): BotProfile => ({
  accuracy: 0.75,
  speed: { meanMs: 8000, jitter: 2000 },
  aggression: 0.5,
  ...over,
});

describe("rollBotPartner", () => {
  it("always returns an id from the egg-hatch roster", () => {
    const rng = seeded(7);
    for (let i = 0; i < 500; i++) {
      expect(ALL_LEGENDARY_MYTHICAL_IDS).toContain(rollBotPartner(rng));
    }
  });

  it("maps rng 0 to the first id and rng→1 to the last", () => {
    expect(rollBotPartner(() => 0)).toBe(ALL_LEGENDARY_MYTHICAL_IDS[0]);
    expect(rollBotPartner(() => 0.999999)).toBe(
      ALL_LEGENDARY_MYTHICAL_IDS[ALL_LEGENDARY_MYTHICAL_IDS.length - 1],
    );
  });
});

describe("rollBotProfile", () => {
  it("stays within the documented bounds across many rolls", () => {
    const rng = seeded(42);
    for (let i = 0; i < 300; i++) {
      const p = rollBotProfile(rng);
      expect(p.accuracy).toBeGreaterThanOrEqual(0.55);
      expect(p.accuracy).toBeLessThanOrEqual(0.9);
      expect(p.speed.meanMs).toBeGreaterThanOrEqual(4000);
      expect(p.speed.meanMs).toBeLessThanOrEqual(12_000);
      expect(p.speed.jitter).toBeGreaterThanOrEqual(1000);
      expect(p.speed.jitter).toBeLessThanOrEqual(4000);
      expect(p.aggression).toBeGreaterThanOrEqual(0.2);
      expect(p.aggression).toBeLessThanOrEqual(0.8);
    }
  });
});

describe("botAnswersCorrectly", () => {
  it("is a straight threshold on accuracy", () => {
    expect(botAnswersCorrectly(profile({ accuracy: 0.75 }), () => 0.5)).toBe(true);
    expect(botAnswersCorrectly(profile({ accuracy: 0.75 }), () => 0.9)).toBe(false);
  });

  it("converges on the profile accuracy over many trials", () => {
    const rng = seeded(123);
    const p = profile({ accuracy: 0.8 });
    let hits = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) if (botAnswersCorrectly(p, rng)) hits++;
    expect(hits / n).toBeGreaterThan(0.78);
    expect(hits / n).toBeLessThan(0.82);
  });
});

describe("botAnswerTimeMs", () => {
  it("clamps inside the shared question slot", () => {
    const rng = seeded(5);
    const p = profile({ speed: { meanMs: 11_000, jitter: 4000 } });
    for (let i = 0; i < 2000; i++) {
      const t = botAnswerTimeMs(p, rng);
      expect(t).toBeGreaterThanOrEqual(800);
      expect(t).toBeLessThanOrEqual(PVP_BASE_TIMER_MS - 1000);
    }
  });

  it("centres on the mean with no jitter", () => {
    expect(botAnswerTimeMs(profile({ speed: { meanMs: 7000, jitter: 0 } }), () => 0.5)).toBe(7000);
  });
});

describe("botShouldFireAbility", () => {
  it("never fires without an ability or a correct answer", () => {
    const p = profile({ aggression: 1 });
    expect(botShouldFireAbility(p, { answeredCorrectly: false, hasAbility: true }, () => 0)).toBe(
      false,
    );
    expect(botShouldFireAbility(p, { answeredCorrectly: true, hasAbility: false }, () => 0)).toBe(
      false,
    );
  });

  it("fires against aggression once eligible", () => {
    const ctx = { answeredCorrectly: true, hasAbility: true };
    expect(botShouldFireAbility(profile({ aggression: 0.7 }), ctx, () => 0.5)).toBe(true);
    expect(botShouldFireAbility(profile({ aggression: 0.7 }), ctx, () => 0.9)).toBe(false);
  });
});

describe("botShouldUseItem", () => {
  it("holds items while healthy or when none remain", () => {
    expect(botShouldUseItem(profile(), { hpPct: 0.8, itemsRemaining: 3 }, () => 0)).toBe(false);
    expect(botShouldUseItem(profile(), { hpPct: 0.1, itemsRemaining: 0 }, () => 0)).toBe(false);
  });

  it("gets likelier the lower its HP", () => {
    const aggro = profile({ aggression: 0.8 });
    // Just under the 45% threshold urgency is ~0 → a mid roll won't fire; near
    // 0% HP urgency ≈ 1 → the same roll now fires.
    expect(botShouldUseItem(aggro, { hpPct: 0.44, itemsRemaining: 2 }, () => 0.3)).toBe(false);
    expect(botShouldUseItem(aggro, { hpPct: 0.02, itemsRemaining: 2 }, sequence([0.3]))).toBe(true);
  });
});
