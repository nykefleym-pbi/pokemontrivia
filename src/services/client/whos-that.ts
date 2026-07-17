// The client caller for the whos-that Edge Function (server-first-refactor
// Phase 4). This is the only place the app should talk to whos-that — no
// other module should call supabase.functions.invoke("whos-that", ...)
// directly.
import { supabase } from "@/integrations/supabase/client";
import type { WhosThatRound } from "@/lib/whos-that";

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; msg: string };
}

async function invokeWhosThat<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<Envelope<T>>("whos-that", { body });
  if (error) throw new Error(`whos-that failed: ${error.message}`);
  if (!data?.ok) {
    throw new Error(`whos-that error: ${data?.error?.code ?? "unknown"} — ${data?.error?.msg ?? ""}`);
  }
  return data.data as T;
}

export type StartWhosThatResult =
  | { locked: true; msToNextHour: number }
  | { locked: false; roundId: string; round: WhosThatRound };

/** Start (or resume) this hour's server-generated round. `locked: true` means
 *  the player already completed a round this hour — same one-per-hour gate
 *  as before, now enforced server-side via whos_that_rounds' own unique
 *  constraint instead of client-only store state. */
export function startWhosThat(): Promise<StartWhosThatResult> {
  return invokeWhosThat<StartWhosThatResult>({ op: "start" });
}

export interface WhosThatGuessInput {
  guessText?: string;
  guessTypes?: string[];
  guessChoice?: string;
}

export interface SubmitWhosThatResult {
  correct: boolean;
  alreadyGranted?: boolean;
  reward: { xp: number; itemId: string; itemQty: number } | null;
  monId: number;
  name: string;
  isShiny: boolean;
  save?: { version: number; state: unknown } | null;
}

/** Submit a guess against the round `roundId` refers to. The server checks
 *  it against its OWN held round (never a client-supplied one) and grants
 *  XP/the round's reward item exactly once on a correct guess. */
export function submitWhosThat(roundId: string, guess: WhosThatGuessInput): Promise<SubmitWhosThatResult> {
  return invokeWhosThat<SubmitWhosThatResult>({ op: "submit_action", roundId, guess });
}
