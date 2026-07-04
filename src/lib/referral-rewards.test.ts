import { describe, it, expect } from "vitest";
import { rollReferralReward } from "@/lib/referral-rewards";
import { ITEMS } from "@/lib/game-data";

describe("rollReferralReward", () => {
  it("grants 500 coins and 1 egg", () => {
    const r = rollReferralReward();
    expect(r.coins).toBe(500);
    expect(r.eggs).toBe(1);
  });

  it("grants 5 distinct non-premium items", () => {
    const r = rollReferralReward();
    expect(r.items.length).toBe(5);
    const ids = r.items.map((it) => it.id);
    expect(new Set(ids).size).toBe(5);
    for (const it of r.items) {
      const def = ITEMS.find((x) => x.id === it.id)!;
      expect(def.premium).not.toBe(true);
      expect(it.qty).toBe(1);
    }
  });

  it("rolls are randomized across calls", () => {
    const a = rollReferralReward();
    const b = rollReferralReward();
    const same = a.items.every((it, i) => it.id === b.items[i].id);
    expect(same).toBe(false);
  });
});
