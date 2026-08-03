import { supabase } from "@/integrations/supabase/client";

/**
 * Wipe this device back to a first-ever-visit state.
 *
 * "Reset progress" used to call the store's `reset()`, which sets a
 * hand-maintained list of fields back to their defaults. That list is the
 * problem: it can only cover what someone remembered to add to it, and it only
 * ever covered the Zustand store. Three classes of state survived it.
 *
 * ## 1. Storage the store does not own
 *
 * Sound, music and volume live under their own localStorage keys
 * (`muted`/`music`/`sfx`/`musicVol`/`sfxVol`, see lib/audio.ts) and the boot
 * splash remembers its last artwork under another. None of them are in the
 * store, so none of them were reset — settings survived a "reset all progress".
 *
 * So this clears ALL of web storage rather than a list of keys. A list is what
 * failed; enumerating it again would fail the same way the next time a feature
 * adds a key.
 *
 * ## 2. The account, and therefore the server's timers
 *
 * The Supabase session token is also in localStorage, and the per-player gates
 * are enforced SERVER-side against the user id in it: Who's That Pokémon's
 * hourly lock is a `whos_that_rounds` row, the daily quest is a `daily_runs`
 * row. Clearing local state while keeping the token leaves you signed in as the
 * same player, so the cooldowns carry straight over — and the next sync pulls
 * the old save back down on top of the fresh one.
 *
 * Signing out is what makes the reset real: the next boot finds no session and
 * `ensureSession()` mints a brand-new anonymous user, which has no rows and
 * therefore no timers. Scope is `local` — the point is to drop the token, and a
 * global revoke would fail offline, which is the one moment this must not throw.
 *
 * ## 3. Module-level caches, which are not storage at all
 *
 * `ensureSession`'s memoised promise, the species-detail cache and the
 * lazily-built Supabase client all live in module scope and would happily hand
 * the old identity and the old data to the "new" player. Nothing short of a
 * document reload clears those, which is why this ends in one rather than a
 * client-side navigation.
 *
 * The service worker's cache is deliberately left alone: it holds built assets,
 * not player data, and dropping it would make the next load re-download the app
 * for no benefit.
 */
export async function hardReset(): Promise<void> {
  // Delete the account FIRST, while the session that authorises it still
  // exists. Signing out or clearing storage beforehand would drop the token
  // this needs, and the row would be stranded with no way to reach it.
  //
  // Orphaning it is not a harmless leftover: `claim_trainer_name` refuses any
  // name held by a row that is not yours, so an abandoned profile keeps your
  // trainer name forever and resetting costs you the name you reset to keep.
  // Every other table cascades off `profiles`, so this clears the server-side
  // cooldowns too rather than merely leaving them unreachable.
  try {
    await supabase.rpc("delete_my_account");
  } catch {
    // Offline, or already signed out. The local wipe below still happens: a
    // reset that stops because the network is down is worse than one that
    // leaves a row behind, and the row is recoverable by hand while a
    // half-reset device is not.
  }

  // Then sign out, and BEFORE clearing storage: signOut reads and rewrites the
  // auth token in localStorage, so clearing first would leave the token it
  // writes back sitting in supposedly-empty storage.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // As above — best-effort tidy. Clearing storage removes the token anyway.
  }

  try {
    window.localStorage.clear();
  } catch {
    /* storage disabled (private mode, blocked cookies) — nothing to clear */
  }
  try {
    window.sessionStorage.clear();
  } catch {
    /* as above */
  }

  // `replace`, not `assign`: the reset must not be sitting one Back press away
  // from the profile screen it was triggered from.
  window.location.replace("/");
}
