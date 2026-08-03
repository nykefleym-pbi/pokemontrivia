// @vitest-environment jsdom
//
// Needed explicitly: vitest.config.ts only maps `.test.tsx` to jsdom, and this
// file has no JSX to justify that extension — but it is entirely about
// `window.localStorage` and `window.location`.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut } },
}));

import { hardReset } from "./hard-reset";

const replace = vi.fn();

beforeEach(() => {
  signOut.mockReset().mockResolvedValue({ error: null });
  replace.mockReset();
  window.localStorage.clear();
  window.sessionStorage.clear();
  // jsdom's location is not writable; swap the one method under test.
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("hardReset", () => {
  it("clears storage that the store never owned", async () => {
    // The store's own persist key, plus the four keys that used to SURVIVE a
    // reset because they belong to lib/audio.ts and boot-splash.tsx rather
    // than to the Zustand store.
    window.localStorage.setItem("poke-trivia-store", '{"state":{"level":42}}');
    window.localStorage.setItem("muted", "1");
    window.localStorage.setItem("musicVol", "30");
    window.localStorage.setItem("poke-trivia-last-loading-art", "/loading/x.webp");
    window.sessionStorage.setItem("anything", "1");

    await hardReset();

    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("clears a key it has never heard of", async () => {
    // The point of clearing storage wholesale rather than by a list: a feature
    // added tomorrow gets reset without anyone remembering to add it here.
    window.localStorage.setItem("some-future-feature-key", "value");
    await hardReset();
    expect(window.localStorage.getItem("some-future-feature-key")).toBeNull();
  });

  it("signs out BEFORE clearing, so the token cannot be written back", async () => {
    // signOut does not just drop a token — it WRITES its own cleared session
    // into localStorage. Clear first and that write lands afterwards, leaving a
    // key behind in what is supposed to be empty storage. This fails if the two
    // steps are swapped.
    signOut.mockImplementation(async () => {
      window.localStorage.setItem("sb-project-auth-token", "cleared");
      return { error: null };
    });
    window.localStorage.setItem("sb-project-auth-token", "live-token");

    await hardReset();

    expect(window.localStorage.getItem("sb-project-auth-token")).toBeNull();
    expect(window.localStorage.length).toBe(0);
  });

  it("signs out so the next boot mints a new anonymous user", async () => {
    // This is what makes the SERVER-side timers reset: Who's That's hourly
    // gate and the daily run are rows keyed by user id, so keeping the
    // session would carry both cooldowns into the "new" account.
    await hardReset();
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("still wipes and reloads when sign-out fails", async () => {
    // Offline is the one moment a reset must not throw half-done.
    signOut.mockRejectedValue(new Error("offline"));
    window.localStorage.setItem("poke-trivia-store", "{}");

    await expect(hardReset()).resolves.toBeUndefined();

    expect(window.localStorage.length).toBe(0);
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("reloads the document rather than navigating", async () => {
    // Module-level caches — ensureSession's memoised promise, the species
    // cache, the lazily-built Supabase client — are not storage and survive
    // any client-side navigation. `replace` also keeps the reset off the
    // back stack.
    await hardReset();
    expect(replace).toHaveBeenCalledWith("/");
  });
});
