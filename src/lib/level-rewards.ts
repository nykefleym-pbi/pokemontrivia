import { ITEMS, type ItemId } from "@/lib/game-data";
import { levelMultiplier } from "@/lib/rewards";

// Items eligible for the "1 random premium item" milestone bonus.
const PREMIUM_ITEM_IDS: ItemId[] = ["candy", "luckyegg", "focusband", "assaultvest", "bignugget"];
const NON_PREMIUM_ITEMS = ITEMS.filter((i) => !i.premium && !i.pvpOnly);

export interface LevelUpItemGrant {
  id: ItemId;
  name: string;
  emoji: string;
  qty: number;
}

export interface LevelUpRewards {
  fromLevel: number;
  toLevel: number;
  coins: number;
  eggs: number;
  items: LevelUpItemGrant[];
}

function itemDef(id: ItemId) {
  return ITEMS.find((i) => i.id === id)!;
}

function randomOf<T>(pool: readonly T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Rewards for leveling up, one level at a time from `fromLevel` (exclusive)
 * to `toLevel` (inclusive) — a single battle can cross multiple levels, and
 * every level crossed pays out:
 *  - coins: 25 x levelMultiplier(level)
 *  - a single random (non-premium) item (qty 1 — kept scarce so items don't
 *    pile up from light play)
 * Every 5th level ALSO adds a flat 100 x levelMultiplier(level) coins plus
 * one random premium item. Every 10th level ALSO adds a Poké Egg.
 * Returns null if no level was gained.
 */
export function rollLevelUpRewards(fromLevel: number, toLevel: number): LevelUpRewards | null {
  if (toLevel <= fromLevel) return null;

  let coins = 0;
  let eggs = 0;
  const itemTally = new Map<ItemId, number>();
  const grant = (id: ItemId, qty: number) => itemTally.set(id, (itemTally.get(id) ?? 0) + qty);

  for (let lvl = fromLevel + 1; lvl <= toLevel; lvl++) {
    const mult = levelMultiplier(lvl);

    coins += Math.round(25 * mult);
    grant(randomOf(NON_PREMIUM_ITEMS).id, 1);

    if (lvl % 5 === 0) {
      coins += Math.round(100 * mult);
      grant(randomOf(PREMIUM_ITEM_IDS), 1);
    }
    if (lvl % 10 === 0) {
      eggs += 1;
    }
  }

  const items: LevelUpItemGrant[] = [...itemTally.entries()].map(([id, qty]) => {
    const def = itemDef(id);
    return { id, name: def.name, emoji: def.emoji, qty };
  });

  return { fromLevel, toLevel, coins, eggs, items };
}
