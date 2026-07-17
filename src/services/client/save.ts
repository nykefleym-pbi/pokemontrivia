// The client caller for the save-sync Edge Function (02-architecture.md
// §6.3/§10). This is the only place the app talks to save-sync — no other
// module should call supabase.functions.invoke("save-sync", ...) directly.
//
// `replayBattles` is a caller only, not yet wired into any offline-queue UI:
// there is still no client-side mechanism that detects a battle was fought
// fully offline, persists it locally, and calls this once back online — that
// integration is a separate, larger follow-up (detecting connectivity,
// choosing a queue size/eviction policy, retry/backoff). This function makes
// that follow-up possible without also deciding it here.
import { supabase } from "@/integrations/supabase/client";
import type { BattleAction, SoloBattleCfg } from "@/engine";

export interface SaveSyncPullResult {
  save: unknown;
  version: number;
}

export type SaveSyncPushResult = { version: number } | { conflict: true };

/** One completed-offline-battle entry for `replayBattles`. `id` is a
 *  client-generated UUID identifying this battle — it's the idempotency key
 *  save-sync uses to guarantee the same offline battle is never rewarded
 *  twice (e.g. a retried network call), so generate it once when the battle
 *  starts and reuse it if the replay call needs to be retried. */
export interface OfflineBattle {
  id: string;
  cfg: SoloBattleCfg;
  seed: string;
  log: BattleAction[];
}

export type OfflineBattleStatus = "recorded" | "already_recorded" | "invalid" | "incomplete";

export interface ReplayBattlesResult {
  results: Array<{ id: string; status: OfflineBattleStatus; error?: string }>;
  /** Sum of every newly-`recorded` battle's reward this call, or `null` if
   *  none were newly recorded (all invalid/incomplete/already-recorded). */
  reward: { xp: number; coins: number; trainingPoints: Record<string, number> } | null;
  /** The reconciled server save (xp/coins/trainingPoints folded in), or
   *  `null` if there's nothing to fold into yet — this account has never
   *  pushed a save from any device. `null` here does NOT mean the reward
   *  wasn't computed; see `reward` above and apply it to local state. */
  save: { version: number; state: unknown } | null;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; msg: string };
}

async function invokeSaveSync<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<Envelope<T>>("save-sync", { body });
  if (error) throw new Error(`save-sync failed: ${error.message}`);
  if (!data?.ok) {
    throw new Error(`save-sync error: ${data?.error?.code ?? "unknown"} — ${data?.error?.msg ?? ""}`);
  }
  return data.data as T;
}

/** Pull the caller's current server save. `save` is `null` if they've never pushed one. */
export function loadSave(): Promise<SaveSyncPullResult> {
  return invokeSaveSync<SaveSyncPullResult>({ op: "pull" });
}

/**
 * Push a save under optimistic concurrency: `baseVersion` must be the version
 * last seen from loadSave() or a prior pushSave(). A `{ conflict: true }`
 * result means another write landed first (another device, a race) — the
 * caller must loadSave() again and retry, never blind-overwrite the server.
 */
export function pushSave(baseVersion: number, save: unknown): Promise<SaveSyncPushResult> {
  return invokeSaveSync<SaveSyncPushResult>({ op: "push", baseVersion, save });
}

/**
 * Submit completed offline battles for authoritative reward computation.
 * Each battle's whole action log is replayed server-side (the same
 * validation a live submit_action call would apply) and, if it reaches a
 * natural end, its reward is computed from the REPLAYED result — never
 * trusted from whatever the client already applied locally — and folded
 * additively into the server save. Safe to call more than once with the same
 * battles: already-recorded ones are reported, not double-rewarded.
 */
export function replayBattles(battles: OfflineBattle[]): Promise<ReplayBattlesResult> {
  return invokeSaveSync<ReplayBattlesResult>({ op: "replay", battles });
}
