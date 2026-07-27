// The client caller for the daily-run Edge Function (server-first-refactor
// Phase 3). This is the only place the app should talk to daily-run — no
// other module should call supabase.functions.invoke("daily-run", ...)
// directly.
import { supabase } from "@/integrations/supabase/client";

export interface DailyRunResult {
  correct: number;
  total: number;
  alreadyGranted?: boolean;
  /** Present only when a genuinely new submit computed a nonzero reward
   *  (correct >= 6 — see lib/rewards' dailyReward). `null` below the floor,
   *  or when `alreadyGranted` is true. */
  reward: { xp: number; tp: number } | null;
  /** Consecutive days completed, today included — the multiplier behind the
   *  reward. Absent on the already-granted and below-the-floor paths, where
   *  nothing was paid out. */
  streakDays?: number;
  /** The patched save, or null if the run/reward was recorded but there was
   *  no server save yet to fold it into (see daily-run/index.ts's module
   *  doc — same precedent as rewards-grant/save-sync/mega-reward-claim). */
  save: { version: number; state: unknown } | null;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; msg: string };
}

/** Submit today's completed Daily Quest run: one pick per question, in
 *  order, `null` for a timeout. Server holds the day's question set and its
 *  answer key (never trusted from the client) and computes `correct`
 *  itself. Safe to call more than once — a second submit the same day
 *  returns `{ alreadyGranted: true, reward: null }` rather than paying out
 *  again. Rejects (via the thrown Error's message) if there's no daily
 *  question set for today, or `picks.length` doesn't match it. */
export async function submitDailyRun(
  picks: Array<number | null>,
  timeMs: number,
): Promise<DailyRunResult> {
  const { data, error } = await supabase.functions.invoke<Envelope<DailyRunResult>>("daily-run", {
    body: { picks, timeMs },
  });
  if (error) throw new Error(`daily-run failed: ${error.message}`);
  if (!data?.ok) {
    throw new Error(`daily-run error: ${data?.error?.code ?? "unknown"} — ${data?.error?.msg ?? ""}`);
  }
  return data.data as DailyRunResult;
}
