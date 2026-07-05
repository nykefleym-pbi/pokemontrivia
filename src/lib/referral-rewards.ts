import { ITEMS, type ItemId } from "@/lib/game-data";

const NON_PREMIUM_ITEMS = ITEMS.filter((i) => !i.premium && !i.pvpOnly);

const REFERRAL_COINS = 500;
const REFERRAL_EGGS = 1;
const REFERRAL_ITEM_COUNT = 5;

export interface ReferralItemGrant {
  id: ItemId;
  name: string;
  emoji: string;
  qty: number;
}

export interface ReferralReward {
  coins: number;
  eggs: number;
  items: ReferralItemGrant[];
}

function sampleDistinct<T>(pool: readonly T[], n: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

/** Reward for a successful referral — granted to both the referrer and the new user. */
export function rollReferralReward(): ReferralReward {
  const picked = sampleDistinct(NON_PREMIUM_ITEMS, REFERRAL_ITEM_COUNT);
  return {
    coins: REFERRAL_COINS,
    eggs: REFERRAL_EGGS,
    items: picked.map((it) => ({ id: it.id, name: it.name, emoji: it.emoji, qty: 1 })),
  };
}
