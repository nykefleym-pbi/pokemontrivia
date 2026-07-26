/**
 * Daily-gift cadence: which day of the 7-day cycle a claim lands on, whether a
 * missed day gets forgiven, and whether the player has been away long enough to
 * deserve a welcome back.
 *
 * Pulled out of the store because the interesting behaviour is calendar
 * arithmetic, and calendar arithmetic is where this kind of feature goes wrong.
 *
 * The rule this changes: a single missed day used to send a player who was on
 * day 6 — one day from the guaranteed shiny — all the way back to day 1. That
 * is the textbook moment someone stops opening an app. One miss a week is now
 * forgiven automatically.
 */

export const GIFT_CYCLE_DAYS = 7;
/** A forgiven miss recharges a week after it is spent. */
export const FREEZE_COOLDOWN_DAYS = 7;
/** Away at least this long and the next gift comes with a welcome-back purse. */
export const COMEBACK_GAP_DAYS = 3;
export const COMEBACK_COINS = 250;

export interface GiftClaimInput {
  /** YYYY-MM-DD of the previous claim, or null if they have never claimed. */
  lastClaim: string | null;
  /** Which day of the cycle (1-7) that previous claim was. */
  streak: number;
  /** YYYY-MM-DD the forgiven miss was last spent. */
  freezeUsedDate: string | null;
  /** YYYY-MM-DD today. */
  today: string;
}

export interface GiftClaimPlan {
  /** Day of the cycle this claim lands on, 1-7. Day 7 is the shiny. */
  day: number;
  /** The streak survived a missed day because the freeze absorbed it. */
  usedFreeze: boolean;
  /** Welcome-back coins to grant alongside the gift; 0 for a regular claim. */
  comebackCoins: number;
  /** Whole days since the last claim; null on a first-ever claim. */
  gapDays: number | null;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

/**
 * What today's claim would be worth, or null if it has already been claimed.
 * Pure — the caller does the granting.
 */
export function planDailyGift(i: GiftClaimInput): GiftClaimPlan | null {
  if (i.lastClaim === i.today) return null;

  const gapDays = i.lastClaim ? daysBetween(i.lastClaim, i.today) : null;

  // A clock that has gone backwards (timezone travel, a fiddled device date)
  // should not be able to mint gifts; treat it as a fresh cycle.
  if (gapDays !== null && gapDays < 0) {
    return { day: 1, usedFreeze: false, comebackCoins: 0, gapDays };
  }

  const freezeReady =
    i.freezeUsedDate === null || daysBetween(i.freezeUsedDate, i.today) >= FREEZE_COOLDOWN_DAYS;
  // Exactly one missed day is forgivable. Two or more is a genuine lapse — the
  // welcome-back purse covers that case instead.
  const usedFreeze = gapDays === 2 && freezeReady && i.streak > 0;
  const continuing = gapDays === 1 || usedFreeze;

  return {
    day: ((continuing ? i.streak : 0) % GIFT_CYCLE_DAYS) + 1,
    usedFreeze,
    comebackCoins: gapDays !== null && gapDays >= COMEBACK_GAP_DAYS ? COMEBACK_COINS : 0,
    gapDays,
  };
}

/**
 * The 7 pips a streak display draws: how many are lit right now.
 *
 * Distinct from `planDailyGift` because this runs on every render, including
 * before today's claim — an unclaimed day still shows the streak the player is
 * standing on, not the one they are about to earn.
 */
export function litGiftPips(i: {
  lastClaim: string | null;
  streak: number;
  freezeUsedDate: string | null;
  today: string;
}): number {
  if (!i.lastClaim) return 0;
  if (i.lastClaim === i.today) return i.streak;
  const gap = daysBetween(i.lastClaim, i.today);
  if (gap === 1) return i.streak;
  const freezeReady =
    i.freezeUsedDate === null || daysBetween(i.freezeUsedDate, i.today) >= FREEZE_COOLDOWN_DAYS;
  // Show the streak as still alive while the freeze can still save it.
  if (gap === 2 && freezeReady && i.streak > 0) return i.streak;
  return 0;
}
