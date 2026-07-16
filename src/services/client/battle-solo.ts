// The client caller for the battle-solo Edge Function (02-architecture.md
// P3 scope). This is the only place the app talks to battle-solo — no other
// module should call supabase.functions.invoke("battle-solo", ...) directly.
//
// `submitBattleAction` is intentionally not exported: the Edge Function's
// `submit_action` op returns `unimplemented` until engine/turn.ts's reduce()
// exists (see that file's own comment on why solo battle's ~50 per-ability
// damage special cases need a regression harness before they're ported).
// There is nothing useful for a caller to do with that op yet.
import { supabase } from "@/integrations/supabase/client";

export interface SoloBattleRecord {
  id: string;
  seed: string;
  cfg: unknown;
  log: unknown[];
  status: "in_progress" | "won" | "lost" | "abandoned";
  result: unknown;
}

export interface StartSoloBattleResult {
  battleId: string;
  seed: string;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; msg: string };
}

async function invokeBattleSolo<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<Envelope<T>>("battle-solo", { body });
  if (error) throw new Error(`battle-solo failed: ${error.message}`);
  if (!data?.ok) {
    throw new Error(`battle-solo error: ${data?.error?.code ?? "unknown"} — ${data?.error?.msg ?? ""}`);
  }
  return data.data as T;
}

/** Start a new server-authoritative solo battle. `cfg` is opaque to the client caller. */
export function startSoloBattle(cfg: unknown): Promise<StartSoloBattleResult> {
  return invokeBattleSolo<StartSoloBattleResult>({ op: "start", cfg });
}

/** Fetch the current state of a solo battle the caller owns. */
export function getSoloBattle(battleId: string): Promise<SoloBattleRecord> {
  return invokeBattleSolo<SoloBattleRecord>({ op: "get", battleId });
}
