import { ITEMS, type ItemId } from "@/lib/game-data";

const NON_PREMIUM_ITEMS = ITEMS.filter((i) => !i.premium && !i.pvpOnly);

const REFERRAL_COINS = 500;
const REFERRAL_EGGS = 1;
const REFERRAL_ITEM_COUNT = 5;

export interface ReferralItemGrant {
  id: ItemId;
  name: string;
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
    items: picked.map((it) => ({ id: it.id, name: it.name, qty: 1 })),
  };
}

const APP_URL = "https://pokemontriviabattle.vercel.app";

/**
 * The invite link that actually pays both sides.
 *
 * The referral loop is closed and live — claimReferral grants the newcomer and
 * queues the referrer's own reward — but it only fires when someone arrives via
 * `/refer?code=`. Anywhere the app invites a person, it should be this URL, so
 * it lives here instead of being spelled out at each call site.
 */
export function inviteUrl(friendCode: string | null | undefined): string {
  return friendCode ? `${APP_URL}/refer?code=${friendCode}` : `${APP_URL}/`;
}
