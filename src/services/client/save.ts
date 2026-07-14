// The client caller for the save-sync Edge Function (02-architecture.md
// §6.3/§10). This is the only place the app talks to save-sync — no other
// module should call supabase.functions.invoke("save-sync", ...) directly.
//
// `queueOffline`/`reconcile` (the offline-queue half of the frozen contract,
// §9) aren't implemented here yet: they need save-sync's `replay` op, which
// itself needs engine/turn.ts's `replay()` reducer — neither exists yet. Add
// them once that lands rather than stubbing a queue with nothing to replay.
import { supabase } from "@/integrations/supabase/client";

export interface SaveSyncPullResult {
  save: unknown;
  version: number;
}

export type SaveSyncPushResult = { version: number } | { conflict: true };

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
