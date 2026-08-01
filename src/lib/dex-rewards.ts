import { ITEMS, type ItemId } from "@/lib/game-data";
import { ALL_POKEMON } from "@/lib/pokemon-data";
import { isCaught } from "@/lib/pokedex";
import type { GameState, PokedexEntry } from "@/lib/store/types";

/**
 * The nine generations, their national-dex spans and their region names.
 *
 * Lives here rather than in the Pokedex route because the completion card, the
 * milestone rewards and the grid filter all have to agree on the same spans —
 * and a reward that pays out against a different range than the bar shows would
 * be invisible until someone claimed the wrong thing.
 */
export interface Generation {
  gen: number;
  from: number;
  to: number;
  /** Region name, shown as "<region> Completion". */
  region: string;
}

export const GENERATIONS: Generation[] = [
  { gen: 1, from: 1, to: 151, region: "Kanto" },
  { gen: 2, from: 152, to: 251, region: "Johto" },
  { gen: 3, from: 252, to: 386, region: "Hoenn" },
  { gen: 4, from: 387, to: 493, region: "Sinnoh" },
  { gen: 5, from: 494, to: 649, region: "Unova" },
  { gen: 6, from: 650, to: 721, region: "Kalos" },
  { gen: 7, from: 722, to: 809, region: "Alola" },
  { gen: 8, from: 810, to: 905, region: "Galar" },
  { gen: 9, from: 906, to: 1025, region: "Paldea" },
];

export function generation(gen: number): Generation {
  return GENERATIONS.find((g) => g.gen === gen) ?? GENERATIONS[0];
}

/** Caught / seen / shiny / total for one generation. */
export interface DexStats {
  caught: number;
  /** Registered but NOT caught — the two counts never overlap. */
  seen: number;
  shiny: number;
  total: number;
  /** Caught as a fraction of total, 0-1. */
  pct: number;
}

export function dexStats(pokedex: Record<number, PokedexEntry>, gen: number): DexStats {
  const { from, to } = generation(gen);
  const inRange = ALL_POKEMON.filter((p) => p.id >= from && p.id <= to);
  let caught = 0;
  let seen = 0;
  let shiny = 0;
  for (const p of inRange) {
    const e = pokedex[p.id];
    if (!e) continue;
    if (isCaught(e)) caught++;
    else seen++;
    if (e.shinyUnlocked) shiny++;
  }
  const total = inRange.length;
  return { caught, seen, shiny, total, pct: total > 0 ? caught / total : 0 };
}

/**
 * The four completion milestones, as percentages of a generation caught.
 *
 * Percentages rather than counts so one ladder covers every generation —
 * Kanto's 151 and Kalos's 72 reach 25% at different numbers of Pokemon but at
 * the same sense of progress.
 */
export const DEX_MILESTONES = [25, 50, 75, 100] as const;
export type DexMilestone = (typeof DEX_MILESTONES)[number];

/** Which glyph a milestone shows. Drawn, not imported — see the card. */
export type DexRewardIcon = "poke" | "coins" | "premium" | "master";

export interface DexReward {
  coins: number;
  xp: number;
  item?: ItemId;
  /** Poke Eggs — the 100% rung only; eggs are the sole route to a Legendary. */
  eggs?: number;
  icon: DexRewardIcon;
}

/**
 * What each rung pays.
 *
 * Deliberately above the achievement ladder (bronze 250 coins, platinum 4,000):
 * filling a generation is the longest grind in the game and the only one
 * measured in months, so 100% pays more than any single trophy. The lower rungs
 * stay modest so the first one lands early and reads as encouragement rather
 * than as the point of playing.
 */
export const DEX_MILESTONE_REWARDS: Record<DexMilestone, DexReward> = {
  25: { coins: 500, xp: 200, icon: "poke" },
  50: { coins: 1500, xp: 600, item: "luckyegg", icon: "coins" },
  75: { coins: 3000, xp: 1200, item: "candy", icon: "premium" },
  100: { coins: 8000, xp: 4000, item: "candy", eggs: 1, icon: "master" },
};

/**
 * Claim key, and the shape persisted in `claimedDexRewards`.
 *
 * Generation-scoped, so filling Kanto and later filling Johto each pay their
 * own ladder rather than the second one arriving pre-claimed.
 */
export function dexRewardKey(gen: number, milestone: DexMilestone): string {
  return `${gen}:${milestone}`;
}

function itemName(id: ItemId): string {
  return ITEMS.find((i) => i.id === id)?.name ?? id;
}

export function dexRewardLabel(r: DexReward): string {
  const parts = [`+${r.coins.toLocaleString()} coins`, `+${r.xp.toLocaleString()} XP`];
  if (r.item) parts.push(itemName(r.item));
  if (r.eggs) parts.push(r.eggs === 1 ? "Poké Egg" : `${r.eggs} Poké Eggs`);
  return parts.join(" · ");
}

export type DexMilestoneState = "locked" | "claimable" | "claimed";

export function dexMilestoneState(
  milestone: DexMilestone,
  stats: DexStats,
  gen: number,
  claimed: readonly string[],
): DexMilestoneState {
  if (claimed.includes(dexRewardKey(gen, milestone))) return "claimed";
  // Compared as a count, not as a rounded percentage: at 151 Pokemon, 37 caught
  // is 24.5% and displays as "25%", and a bar that reads 25% next to a rung
  // that will not open is worse than a bar that reads 24%.
  return stats.caught * 100 >= milestone * stats.total ? "claimable" : "locked";
}

/** The lowest rung that can be claimed right now, or null. */
export function nextClaimableMilestone(
  stats: DexStats,
  gen: number,
  claimed: readonly string[],
): DexMilestone | null {
  return (
    DEX_MILESTONES.find((m) => dexMilestoneState(m, stats, gen, claimed) === "claimable") ?? null
  );
}

/**
 * Grant a milestone's reward and mark it collected. Returns the payout
 * description for the toast, or null when there is nothing to give.
 *
 * The eligibility check recomputes the stats from the LIVE store rather than
 * trusting a snapshot the card is holding, so a stale render cannot pay out a
 * rung the player has not reached. Client-side, like achievements and level-up:
 * the whole Pokedex is local state, so there is no server fact to check against.
 */
export function claimDexReward(
  gen: number,
  milestone: DexMilestone,
  store: GameState,
): { text: string } | null {
  const reward = DEX_MILESTONE_REWARDS[milestone];
  if (!reward) return null;
  // `?? []` for saves written before this field existed: merge() backfills it,
  // but a claim can be attempted from a state object that predates the backfill.
  const claimed = store.claimedDexRewards ?? [];
  const stats = dexStats(store.pokedex, gen);
  if (dexMilestoneState(milestone, stats, gen, claimed) !== "claimable") return null;

  store.addCoins(reward.coins);
  store.addXp(reward.xp);
  if (reward.item) store.grantItem(reward.item, 1);
  if (reward.eggs) store.grantPokeEgg(reward.eggs);
  store.markDexRewardClaimed(dexRewardKey(gen, milestone));
  return { text: dexRewardLabel(reward) };
}
