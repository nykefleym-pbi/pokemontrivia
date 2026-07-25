import type { GameState } from "@/lib/store/types";
import type { ItemId } from "@/lib/game-data";
import {
  DAILY_COMMON_POOL,
  DAILY_PREMIUM_POOL,
} from "@/lib/store/slices/profileSlice";

/** GO-style set-of-5 win rewards for the Battle Arena: slot i unlocks at the
 * (i+1)th win within the current 5-battle set. Amounts are owner-approved
 * starting values — tune here, nowhere else. */
export const ARENA_TP_REWARD = 25;
export const ARENA_XP_REWARD = 60;
export const ARENA_COIN_REWARD = 150;

export type ArenaRewardKind = "tp" | "xp" | "item" | "coins" | "premium";

export interface ArenaRewardSlot {
  slot: number; // 0..4
  kind: ArenaRewardKind;
  label: string;
}

export const ARENA_REWARD_SLOTS: ArenaRewardSlot[] = [
  { slot: 0, kind: "tp", label: `+${ARENA_TP_REWARD} TP` },
  { slot: 1, kind: "xp", label: `+${ARENA_XP_REWARD} XP` },
  { slot: 2, kind: "item", label: "Mystery item" },
  { slot: 3, kind: "coins", label: `+${ARENA_COIN_REWARD} coins` },
  { slot: 4, kind: "premium", label: "Premium item" },
];

function randomFrom(arr: ItemId[]): ItemId {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Grant the given slot's reward via the store's own actions and return a
 * toast-ready description of what was granted. The caller (store action) is
 * responsible for gating (slot unlocked, not already claimed). */
export function grantArenaReward(slot: number, store: GameState): { text: string } {
  switch (slot) {
    case 0: {
      // No-partner state is unreachable post-onboarding, but degrade to XP
      // rather than silently swallowing the reward if it ever happens.
      if (store.pokemon) {
        store.addTrainingPoints(store.pokemon.id, ARENA_TP_REWARD);
        return { text: `+${ARENA_TP_REWARD} Training Points!` };
      }
      store.addXp(ARENA_XP_REWARD);
      return { text: `+${ARENA_XP_REWARD} XP!` };
    }
    case 1:
      store.addXp(ARENA_XP_REWARD);
      return { text: `+${ARENA_XP_REWARD} XP!` };
    case 2: {
      const id = randomFrom(DAILY_COMMON_POOL);
      store.grantItem(id, 1);
      return { text: `Item reward: ${id}!` };
    }
    case 3:
      store.addCoins(ARENA_COIN_REWARD);
      return { text: `+${ARENA_COIN_REWARD} coins!` };
    case 4: {
      const id = randomFrom(DAILY_PREMIUM_POOL);
      store.grantItem(id, 1);
      return { text: `Premium reward: ${id}!` };
    }
    default:
      return { text: "" };
  }
}

export type TrophyTier = "none" | "bronze" | "silver" | "gold" | "platinum";

const TROPHY_THRESHOLDS: Array<{ tier: TrophyTier; at: number }> = [
  { tier: "platinum", at: 1000 },
  { tier: "gold", at: 500 },
  { tier: "silver", at: 250 },
  { tier: "bronze", at: 50 },
];

/** Ascending thresholds, derived so the ladder is declared in one place only. */
const TROPHY_LADDER = [...TROPHY_THRESHOLDS].map((t) => t.at).sort((a, b) => a - b);

/** Battle-count trophy tier + the next threshold to chase (null at platinum). */
export function trophyTier(count: number): { tier: TrophyTier; next: number | null } {
  for (const { tier, at } of TROPHY_THRESHOLDS) {
    if (count >= at) {
      return { tier, next: tier === "platinum" ? null : nextThreshold(at) };
    }
  }
  return { tier: "none", next: TROPHY_LADDER[0] };
}

function nextThreshold(current: number): number {
  const idx = TROPHY_LADDER.indexOf(current);
  return TROPHY_LADDER[idx + 1] ?? TROPHY_LADDER[TROPHY_LADDER.length - 1];
}
