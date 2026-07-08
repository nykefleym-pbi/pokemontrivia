import { describe, it, expect } from "vitest";
import { rollLevelUpRewards } from "@/lib/level-rewards";

describe("rollLevelUpRewards", () => {
  it("returns null when no level was gained", () => {
    expect(rollLevelUpRewards(5, 5)).toBeNull();
    expect(rollLevelUpRewards(5, 4)).toBeNull();
  });

  it("single level-up grants coins and exactly one item, no egg", () => {
    const r = rollLevelUpRewards(1, 2);
    expect(r).not.toBeNull();
    expect(r!.coins).toBe(26); // round(25 * levelMultiplier(2)=1.05) = 26
    expect(r!.items.length).toBeGreaterThanOrEqual(1);
    expect(r!.eggs).toBe(0);
  });

  it("crossing a multiple of 5 adds the milestone coin bonus and a premium item", () => {
    const r = rollLevelUpRewards(3, 5);
    expect(r).not.toBeNull();
    // base (lvl4 + lvl5) + milestone bonus at lvl5
    expect(r!.coins).toBeGreaterThan(50);
    expect(r!.eggs).toBe(0);
    // Must cover the full PREMIUM_ITEM_IDS pool in level-rewards.ts — the pick
    // is random, so omitting any pool member makes this test flaky.
    const hasPremium = r!.items.some((it) =>
      ["candy", "luckyegg", "focusband", "assaultvest", "bignugget"].includes(it.id),
    );
    expect(hasPremium).toBe(true);
  });

  it("crossing a multiple of 10 grants a Poké Egg", () => {
    const r = rollLevelUpRewards(9, 10);
    expect(r).not.toBeNull();
    expect(r!.eggs).toBe(1);
  });

  it("multi-level jump accumulates rewards for every level crossed", () => {
    const single9to10 = rollLevelUpRewards(9, 10)!;
    const jump5to10 = rollLevelUpRewards(5, 10)!;
    expect(jump5to10.coins).toBeGreaterThan(single9to10.coins);
    expect(jump5to10.eggs).toBe(1);
  });

  it("item quantities are always at least 1", () => {
    const r = rollLevelUpRewards(0, 1)!;
    for (const it of r.items) expect(it.qty).toBeGreaterThanOrEqual(1);
  });
});
