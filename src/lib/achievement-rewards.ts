import { ITEMS, type ItemId } from "@/lib/game-data";
import { unlockedAchievements } from "@/lib/achievements";
import type { GameState } from "@/lib/store/types";

/**
 * What each trophy pays out when its Claim button is pressed.
 *
 * Until now all 21 achievements notified and displayed but granted nothing —
 * unlocking one changed no number anywhere. The payloads below are deliberately
 * modest against the economy they sit in (a regular win is ~60 XP / ~15 coins,
 * a level-up rolls hundreds of coins): a trophy should feel like a bonus for
 * something you were going to do anyway, not a reason to grind for it.
 *
 * Four tiers by how hard the trophy is to earn, so the ladder is declared once
 * and every achievement just picks a rung.
 */
export type AchievementTier = "bronze" | "silver" | "gold" | "platinum";

export interface AchievementReward {
  coins: number;
  xp: number;
  /** Exactly one of this item, if the tier grants one. */
  item?: ItemId;
  /** Poké Eggs — platinum only; eggs are the sole route to a Legendary. */
  eggs?: number;
}

export const ACHIEVEMENT_TIER_REWARDS: Record<AchievementTier, AchievementReward> = {
  bronze: { coins: 250, xp: 100 },
  silver: { coins: 600, xp: 300 },
  gold: { coins: 1500, xp: 800, item: "luckyegg" },
  platinum: { coins: 4000, xp: 2000, item: "candy", eggs: 1 },
};

/**
 * Tier per achievement id. Every id in src/lib/achievements.ts must appear here
 * — `achievement-rewards.test.ts` asserts the two lists agree, so adding a
 * trophy without a payout fails the suite rather than shipping a dead Claim
 * button.
 */
export const ACHIEVEMENT_TIERS: Record<string, AchievementTier> = {
  // Things a new player trips over in their first session or two.
  first_win: "bronze",
  streak_5: "bronze",
  lvl_6: "bronze",
  rising_star: "bronze",

  // A few weeks of ordinary play.
  battles_25: "silver",
  correct_100: "silver",
  streak_10: "silver",
  lvl_16: "silver",
  speedrunner: "silver",
  comeback: "silver",
  pokedex_50: "silver",
  shiny_first: "silver",
  elite_first: "silver",

  // Deliberate, sustained effort.
  lvl_26: "gold",
  scholar: "gold",
  elite_kanto: "gold",
  type_master: "gold",

  // The long game — months, and in two cases the whole of the content.
  lvl_51: "platinum",
  pokedex_151: "platinum",
  elite_all: "platinum",
  hall_of_champions: "platinum",
};

export function achievementReward(id: string): AchievementReward | null {
  const tier = ACHIEVEMENT_TIERS[id];
  return tier ? ACHIEVEMENT_TIER_REWARDS[tier] : null;
}

function itemName(id: ItemId): string {
  return ITEMS.find((i) => i.id === id)?.name ?? id;
}

/** Human-readable payout, used both on the unclaimed row and in the toast. */
export function achievementRewardLabel(r: AchievementReward): string {
  const parts = [`+${r.coins.toLocaleString()} coins`, `+${r.xp.toLocaleString()} XP`];
  if (r.item) parts.push(itemName(r.item));
  if (r.eggs) parts.push(r.eggs === 1 ? "Poké Egg" : `${r.eggs} Poké Eggs`);
  return parts.join(" · ");
}

/**
 * Grant a trophy's reward and mark it collected. Returns the payout description
 * for the toast, or null when there is nothing to give — unknown id, trophy not
 * actually earned, or already claimed.
 *
 * Gating lives here rather than in the caller so the "already claimed" and "not
 * earned" checks cannot drift apart from the grant. Note it is checked against
 * the live store rather than a snapshot the UI is holding.
 *
 * Client-side, like level-up and Arena set-of-5 rewards: the whole achievement
 * system is computed from local state, so there is no server fact to check
 * against. Mega Raid's claim goes through an Edge Function because it pays out
 * against a server-side leaderboard; this does not.
 */
export function claimAchievementReward(id: string, store: GameState): { text: string } | null {
  const reward = achievementReward(id);
  if (!reward) return null;
  // `?? []` for saves written before this field existed: merge() backfills it,
  // but a claim can be attempted from a state object that predates the backfill.
  if ((store.claimedAchievements ?? []).includes(id)) return null;
  if (!unlockedAchievements(store).includes(id)) return null;

  store.addCoins(reward.coins);
  store.addXp(reward.xp);
  if (reward.item) store.grantItem(reward.item, 1);
  if (reward.eggs) store.grantPokeEgg(reward.eggs);
  store.markAchievementClaimed(id);
  return { text: achievementRewardLabel(reward) };
}
