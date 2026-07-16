// Pushes the local save up to save-sync as a best-effort server-side backup
// (02-architecture.md §6.3/§9's "localStorage import migration", push half).
//
// Deliberately one-way (push only). Pulling a server save back down and
// applying it over local state would need real reconciliation — merging two
// independently-progressed saves — which depends on engine/turn.ts's
// replay() (see save-sync/index.ts's own `op: "replay"` stub). Until that
// exists, silently overwriting a device's local progress from the server
// would be worse than not syncing at all, so this module never does it.
import { pushSave } from "@/services/client/save";
import { buildSavePayload, useGameStore } from "@/lib/store";

let pushInFlight = false;

/**
 * Fire-and-forget: push the current local save to save-sync under optimistic
 * concurrency. A `{conflict: true}` result (another device/tab already wrote
 * a newer version) is logged and skipped — never retried blindly, since doing
 * so would require the same reconciliation this module intentionally defers.
 */
export async function pushLocalSaveToServer(): Promise<void> {
  if (pushInFlight) return;
  pushInFlight = true;
  try {
    const s = useGameStore.getState();
    const result = await pushSave(s.serverSaveVersion, buildSavePayload(s));
    if ("conflict" in result) {
      console.warn("[store-sync] push conflict — server has a newer save; skipping this push");
      return;
    }
    useGameStore.getState().setServerSaveVersion(result.version);
  } catch (err) {
    console.warn("[store-sync] push failed:", err instanceof Error ? err.message : err);
  } finally {
    pushInFlight = false;
  }
}
