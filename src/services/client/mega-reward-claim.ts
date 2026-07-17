// The client caller for the mega-reward-claim Edge Function (server-first-
// refactor Phase 2). This is the only place the app should talk to
// mega-reward-claim — no other module should call
// supabase.functions.invoke("mega-reward-claim", ...) directly. Not yet
// wired into MegaLeaderboard.tsx (see the plan's UI-wiring step) — this
// module exists so the Edge Function has a typed consumer ready before that
// wiring lands.
import { supabase } from "@/integrations/supabase/client";

export interface MegaRewardClaimResult {
  granted: boolean;
  alreadyGranted?: boolean;
  rank: number;
  /** Present only when `granted` is true and this call (not a prior one)
   *  computed the payout. */
  reward?: { xp: number; coins: number; tp: number };
  /** The patched save, or null if the grant was recorded but there was no
   *  server save yet to fold it into (see mega-reward-claim/index.ts's
   *  module doc — same precedent as rewards-grant/save-sync). */
  save: { version: number; state: unknown } | null;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; msg: string };
}

/** Claim the (idempotent, rank-scaled) core XP/coins/TP reward for a
 *  concluded Mega Raid event. Safe to call more than once — a second call
 *  after a successful claim returns `{ granted: false, alreadyGranted: true }`
 *  rather than paying out again. Rejects (via the thrown Error's message) if
 *  the event hasn't ended yet or the caller never completed a run in it. */
export async function claimMegaReward(eventId: string): Promise<MegaRewardClaimResult> {
  const { data, error } = await supabase.functions.invoke<Envelope<MegaRewardClaimResult>>(
    "mega-reward-claim",
    { body: { eventId } },
  );
  if (error) throw new Error(`mega-reward-claim failed: ${error.message}`);
  if (!data?.ok) {
    throw new Error(`mega-reward-claim error: ${data?.error?.code ?? "unknown"} — ${data?.error?.msg ?? ""}`);
  }
  return data.data as MegaRewardClaimResult;
}
