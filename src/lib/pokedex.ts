import type { PokedexEntry } from "@/lib/store/types";

/**
 * Pokédex registration status.
 *
 * "seen" is an encounter with no capture; "caught" is a capture. `null` is not
 * registered at all, which the grid draws as a silhouette.
 */
export type DexStatus = "caught" | "seen" | null;

/**
 * Is this entry caught, as opposed to only seen?
 *
 * The `!== false` is load-bearing and every consumer must come through here
 * rather than reading `entry.caught` directly. The field was added after the
 * app shipped, and every entry written before it existed was created by
 * `recordPokedexCapture` — a capture. A persisted entry therefore has no
 * `caught` key at all, and testing it truthily would silently demote every
 * existing player's whole Pokédex to "seen" on the release that adds this.
 */
export function isCaught(entry: PokedexEntry | undefined): boolean {
  return !!entry && entry.caught !== false;
}

export function dexStatus(entry: PokedexEntry | undefined): DexStatus {
  if (!entry) return null;
  return entry.caught === false ? "seen" : "caught";
}
