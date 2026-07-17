// The client caller for the mega-run Edge Function (server-first-refactor
// Phase 2). This is the only place the app should talk to mega-run — no
// other module should call supabase.functions.invoke("mega-run", ...)
// directly. Not yet wired into MegaRaidScreen.tsx (see the plan's Phase 2
// UI-wiring step) — this module exists so the Edge Function has a typed
// consumer ready before that wiring lands.
import { supabase } from "@/integrations/supabase/client";
import type { MegaRaidAction } from "@/engine/mega-battle-replay";
import type { MegaRaidState } from "@/engine/mega-replay";
import type { MegaRunRow } from "@/lib/mega/runs";

export interface StartMegaAttemptResult {
  attemptId: string;
  total: number;
  log: MegaRaidAction[];
}

export interface MegaAttemptRecord {
  id: string;
  event_id: string;
  total: number;
  log: MegaRaidAction[];
  status: "in_progress" | "won" | "lost";
}

export type MegaSubmitOutcome =
  | { ok: true; row: MegaRunRow }
  | { ok: false; error: string };

export interface SubmitMegaActionResult {
  state: MegaRaidState;
  ended: boolean;
  /** Present only once `ended` is true — the folded-in result of the
   *  existing `submit_mega_run` RPC (attempt-cap/keep-best logic unchanged). */
  submit?: MegaSubmitOutcome;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; msg: string };
}

async function invokeMegaRun<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<Envelope<T>>("mega-run", { body });
  if (error) throw new Error(`mega-run failed: ${error.message}`);
  if (!data?.ok) {
    throw new Error(`mega-run error: ${data?.error?.code ?? "unknown"} — ${data?.error?.msg ?? ""}`);
  }
  return data.data as T;
}

/** Start (or resume an in-progress) server-authoritative Mega Raid attempt
 *  for the given event. `total` is the server's own read of the event's
 *  frozen question-set size — never client-supplied. */
export function startMegaAttempt(eventId: string): Promise<StartMegaAttemptResult> {
  return invokeMegaRun<StartMegaAttemptResult>({ op: "start", eventId });
}

/** Fetch the current state of an attempt the caller owns. Returns the raw
 *  log — replay it through engine/mega-battle-replay.ts's replayMegaLog()
 *  for the current MegaRaidState, same as the server does. */
export function getMegaAttempt(attemptId: string): Promise<MegaAttemptRecord> {
  return invokeMegaRun<MegaAttemptRecord>({ op: "get", attemptId });
}

/** Submit one action (answer/use_potion/use_xattack/forfeit) against an
 *  attempt. Rejects (via the thrown Error's message) if the action is out of
 *  order or the attempt already ended — see mega-run/index.ts's
 *  MegaRaidActionError codes. */
export function submitMegaAction(
  attemptId: string,
  action: MegaRaidAction,
): Promise<SubmitMegaActionResult> {
  return invokeMegaRun<SubmitMegaActionResult>({ op: "submit_action", attemptId, action });
}

/** Delete an in-progress attempt directly (no Edge Function op needed —
 *  `mega_attempts` RLS already lets the owner delete their own row). For
 *  Escape Rope's free exit: escaping never calls submit_action (no server
 *  call should count against the 2-attempt cap), but leaving the row behind
 *  would make the NEXT `start` call resume the abandoned log instead of
 *  beginning a genuinely fresh one — silently desyncing that future run's
 *  server-replayed accuracy/correct from what the player actually saw.
 *  Best-effort: swallow errors, since a stray leftover row is a cosmetic
 *  problem (resolved by that later mismatch getting overwritten on the NEXT
 *  escape or natural conclusion), not a correctness one for the CURRENT run. */
export async function abandonMegaAttempt(attemptId: string): Promise<void> {
  // Loosely-typed: the Database type doesn't yet include mega_attempts
  // (generated types not regenerated since its migration) — same convention
  // as lib/mega/schedule.ts/runs.ts's own `db` casts.
  const db = supabase as unknown as { from: (t: string) => { delete: () => { eq: (c: string, v: string) => Promise<unknown> } } };
  await db.from("mega_attempts").delete().eq("id", attemptId);
}
