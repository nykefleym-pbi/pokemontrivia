// The client caller for the battle-solo Edge Function (02-architecture.md
// P3 scope). This is the only place the app talks to battle-solo — no other
// module should call supabase.functions.invoke("battle-solo", ...) directly.
import { supabase } from "@/integrations/supabase/client";
import type { BattleAction, BattleEvent, BattleState, SoloBattleCfg } from "@/engine";

export interface SoloBattleRecord {
  id: string;
  seed: string;
  cfg: SoloBattleCfg;
  log: BattleAction[];
  status: "in_progress" | "won" | "lost" | "abandoned";
  result: { won: boolean; maxStreak: number; correctCount: number } | null;
}

export interface StartSoloBattleResult {
  battleId: string;
  seed: string;
}

export interface SubmitBattleActionResult {
  state: BattleState;
  events: BattleEvent[];
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

/** Start a new server-authoritative solo battle. `cfg` embeds the question
 *  set (with correct answers) and the raw matchup facts — see
 *  engine/solo-battle-config.ts's SoloBattleCfg for why. */
export function startSoloBattle(cfg: SoloBattleCfg): Promise<StartSoloBattleResult> {
  return invokeBattleSolo<StartSoloBattleResult>({ op: "start", cfg });
}

/** Fetch the current state of a solo battle the caller owns. Returns the raw
 *  cfg/log — replay it through engine/solo-battle-replay.ts's replayBattle()
 *  for the current BattleState, same as the server does. */
export function getSoloBattle(battleId: string): Promise<SoloBattleRecord> {
  return invokeBattleSolo<SoloBattleRecord>({ op: "get", battleId });
}

/** Submit one action (answer/forfeit) against a battle. Rejects (via the
 *  thrown Error's message) if the action is out of order or the battle
 *  already ended — see battle-solo/index.ts's SoloBattleActionError codes. */
export function submitBattleAction(
  battleId: string,
  action: BattleAction,
): Promise<SubmitBattleActionResult> {
  return invokeBattleSolo<SubmitBattleActionResult>({ op: "submit_action", battleId, action });
}
