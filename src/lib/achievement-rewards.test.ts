import { describe, it, expect, beforeEach } from "vitest";
import { ACHIEVEMENTS } from "@/lib/achievements";
import {
  ACHIEVEMENT_TIERS,
  ACHIEVEMENT_TIER_REWARDS,
  achievementReward,
  achievementRewardLabel,
  claimAchievementReward,
} from "@/lib/achievement-rewards";
import { useGameStore } from "@/lib/store";

describe("achievement reward table", () => {
  it("covers every achievement, and nothing else", () => {
    const ids = ACHIEVEMENTS.map((a) => a.id).sort();
    expect(Object.keys(ACHIEVEMENT_TIERS).sort()).toEqual(ids);
  });

  it("pays something for every achievement", () => {
    for (const a of ACHIEVEMENTS) {
      const r = achievementReward(a.id);
      expect(r, a.id).not.toBeNull();
      expect(r!.coins + r!.xp, a.id).toBeGreaterThan(0);
    }
  });

  it("returns null for an unknown id", () => {
    expect(achievementReward("no_such_trophy")).toBeNull();
  });

  it("pays strictly more the higher the tier", () => {
    const order = ["bronze", "silver", "gold", "platinum"] as const;
    for (let i = 1; i < order.length; i++) {
      const lo = ACHIEVEMENT_TIER_REWARDS[order[i - 1]];
      const hi = ACHIEVEMENT_TIER_REWARDS[order[i]];
      expect(hi.coins).toBeGreaterThan(lo.coins);
      expect(hi.xp).toBeGreaterThan(lo.xp);
    }
  });

  it("labels every component of a payout", () => {
    expect(achievementRewardLabel({ coins: 250, xp: 100 })).toBe("+250 coins · +100 XP");
    const label = achievementRewardLabel(ACHIEVEMENT_TIER_REWARDS.platinum);
    expect(label).toContain("Rare Candy");
    expect(label).toContain("Poké Egg");
  });
});

describe("claimAchievementReward", () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  it("refuses a trophy that has not been earned", () => {
    const before = useGameStore.getState().coins;
    expect(claimAchievementReward("first_win", useGameStore.getState())).toBeNull();
    expect(useGameStore.getState().coins).toBe(before);
    expect(useGameStore.getState().claimedAchievements).toEqual([]);
  });

  it("grants coins, XP and the item, then marks the trophy claimed", () => {
    // first_win checks stats.wins >= 1.
    useGameStore.setState((s) => ({ stats: { ...s.stats, wins: 1 } }));
    const coinsBefore = useGameStore.getState().coins;
    const xpBefore = useGameStore.getState().xp;

    const res = claimAchievementReward("first_win", useGameStore.getState());

    expect(res?.text).toBe("+250 coins · +100 XP");
    expect(useGameStore.getState().coins).toBe(coinsBefore + 250);
    expect(useGameStore.getState().xp).toBeGreaterThanOrEqual(xpBefore + 100);
    expect(useGameStore.getState().claimedAchievements).toEqual(["first_win"]);
  });

  it("pays exactly once — a second claim is a no-op", () => {
    useGameStore.setState((s) => ({ stats: { ...s.stats, wins: 1 } }));
    claimAchievementReward("first_win", useGameStore.getState());
    const coins = useGameStore.getState().coins;

    expect(claimAchievementReward("first_win", useGameStore.getState())).toBeNull();

    expect(useGameStore.getState().coins).toBe(coins);
    expect(useGameStore.getState().claimedAchievements).toEqual(["first_win"]);
  });

  it("grants the item and the egg on a platinum trophy", () => {
    // pokedex_151 needs all 151 Gen 1 entries.
    const pokedex: Record<string, { shinyUnlocked?: boolean }> = {};
    for (let i = 1; i <= 151; i++) pokedex[String(i)] = {};
    useGameStore.setState({ pokedex: pokedex as never });
    const eggsBefore = useGameStore.getState().pokeEggs.length;

    const res = claimAchievementReward("pokedex_151", useGameStore.getState());

    expect(res).not.toBeNull();
    expect(useGameStore.getState().inventory.candy ?? 0).toBeGreaterThanOrEqual(1);
    expect(useGameStore.getState().pokeEggs.length).toBe(eggsBefore + 1);
  });

  it("survives a save that predates the field", () => {
    // Every save on disk today lacks claimedAchievements. merge() backfills it,
    // but a claim must not throw if it is ever reached before that happens.
    useGameStore.setState({ claimedAchievements: undefined as never });
    useGameStore.setState((s) => ({ stats: { ...s.stats, wins: 1 } }));

    const res = claimAchievementReward("first_win", useGameStore.getState());

    expect(res).not.toBeNull();
    expect(useGameStore.getState().claimedAchievements).toEqual(["first_win"]);
  });
});
