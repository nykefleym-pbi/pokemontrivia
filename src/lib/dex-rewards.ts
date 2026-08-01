import { ALL_POKEMON } from "@/lib/pokemon-data";
import { isCaught } from "@/lib/pokedex";
import { DAILY_COMMON_POOL } from "@/lib/store/slices/profileSlice";
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

/** Which currency art a milestone shows — one glyph per rung. */
export type DexRewardIcon = "coins" | "xp" | "tp" | "chest";

export interface DexReward {
  icon: DexRewardIcon;
  coins?: number;
  xp?: number;
  /** Training Points, granted to the current partner. */
  tp?: number;
  /** How many items to roll from the common pool. */
  items?: number;
  /** Poké Eggs — the 100% rung only; eggs are the sole route to a Legendary. */
  eggs?: number;
}

/**
 * What each rung pays (owner-set, 2026-08-01).
 *
 * One currency per rung rather than a bundle at every step, so the ladder reads
 * as four different rewards rather than four sizes of the same one, and the
 * 100% chest is the only rung that pays several things at once.
 *
 * 1,000 TP at 75% is a large single grant against a curve that tops out at
 * 1,500 (see TP_DAMAGE_TIERS) — it jumps a partner straight to the 1.15x band.
 * That is intended: three quarters of a generation is months of play.
 */
export const DEX_MILESTONE_REWARDS: Record<DexMilestone, DexReward> = {
  25: { icon: "coins", coins: 1000 },
  50: { icon: "xp", xp: 1000 },
  75: { icon: "tp", tp: 1000 },
  100: { icon: "chest", coins: 1000, items: 5, eggs: 1 },
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

export function dexRewardLabel(r: DexReward): string {
  const parts: string[] = [];
  if (r.coins) parts.push(`+${r.coins.toLocaleString()} coins`);
  if (r.xp) parts.push(`+${r.xp.toLocaleString()} XP`);
  if (r.tp) parts.push(`+${r.tp.toLocaleString()} TP`);
  if (r.items) parts.push(r.items === 1 ? "1 random item" : `${r.items} random items`);
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

  if (reward.coins) store.addCoins(reward.coins);
  if (reward.xp) store.addXp(reward.xp);
  if (reward.tp) {
    // No-partner is unreachable after onboarding, but degrade to XP rather
    // than silently swallowing the rung — the same call the Arena set-of-5
    // reward makes for its TP slot.
    if (store.pokemon) store.addTrainingPoints(store.pokemon.id, reward.tp);
    else store.addXp(reward.tp);
  }
  for (let i = 0; i < (reward.items ?? 0); i++) {
    store.grantItem(DAILY_COMMON_POOL[Math.floor(Math.random() * DAILY_COMMON_POOL.length)], 1);
  }
  if (reward.eggs) store.grantPokeEgg(reward.eggs);
  store.markDexRewardClaimed(dexRewardKey(gen, milestone));
  return { text: dexRewardLabel(reward) };
}
