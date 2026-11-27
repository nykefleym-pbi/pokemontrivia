import type { ReferralReward } from "@/lib/referral-rewards";

/** Opens the 16.8 gift screen (InviteRewardScreen in __root). Kept tiny so lib/social stays light. */
export const INVITE_REWARD_EVENT = "poketrivia:invite-reward";
export interface InviteRewardDetail {
  /** Who invited you (the newcomer's side); absent on the inviter's side. */
  from?: { name: string; sprite: string };
  /** Friends who joined with your code (the inviter's side). */
  joined?: number;
  rewards: ReferralReward[];
}
export const showInviteReward = (d: InviteRewardDetail) => window.dispatchEvent(new CustomEvent(INVITE_REWARD_EVENT, { detail: d }));
