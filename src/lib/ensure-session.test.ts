import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * `ensureSession` must be able to recover from a session whose account no
 * longer exists on the server.
 *
 * This is the failure it was written for, observed in production: a profile was
 * deleted by hand, migration 20260802060000 removed its auth user with it, and
 * the device carried on presenting the old JWT because `getSession()` only ever
 * reads local storage. Auth answered 403 `user_not_found`, `syncProfile()`'s
 * upsert failed `profiles_id_fkey`, and no retry could ever help — every one
 * re-read the same dead token.
 *
 * The tests that matter here are the two that pull in opposite directions:
 * a 4xx MUST re-anonymise, and a network failure MUST NOT. Getting the second
 * one wrong would sign players out for having no signal, which is worse than
 * the bug being fixed.
 */
const auth = {
  getSession: vi.fn(),
  getUser: vi.fn(),
  signInAnonymously: vi.fn(),
  signOut: vi.fn(),
};

vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/store", () => ({ useGameStore: { getState: () => ({}) } }));
vi.mock("@/lib/store-sync", () => ({ pushLocalSaveToServer: vi.fn() }));
vi.mock("@/lib/referral-rewards", () => ({ rollReferralReward: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const withSession = (id: string) => ({ data: { session: { user: { id } } } });
const noSession = { data: { session: null } };

async function freshEnsureSession() {
  vi.resetModules();
  return (await import("@/lib/social")).ensureSession;
}

beforeEach(() => {
  for (const fn of Object.values(auth)) fn.mockReset();
  auth.signOut.mockResolvedValue({ error: null });
});

describe("ensureSession", () => {
  it("returns the cached id when the server confirms the account", async () => {
    auth.getSession.mockResolvedValue(withSession("live-user"));
    auth.getUser.mockResolvedValue({ data: { user: { id: "live-user" } }, error: null });

    expect(await (await freshEnsureSession())()).toBe("live-user");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("re-anonymises when the server says the account is gone", async () => {
    auth.getSession.mockResolvedValue(withSession("deleted-user"));
    // Exactly what production returned: 403 user_not_found.
    auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { status: 403, message: "User from sub claim in JWT does not exist" },
    });
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: "brand-new" } }, error: null });

    expect(await (await freshEnsureSession())()).toBe("brand-new");
    // Local scope only — the server session is already gone, so revoking it
    // would just fail and leave the dead token in storage.
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("keeps the cached id when the check could not reach the server", async () => {
    auth.getSession.mockResolvedValue(withSession("offline-user"));
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "Failed to fetch" } });

    expect(await (await freshEnsureSession())()).toBe("offline-user");
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("does not re-anonymise on a server-side 5xx", async () => {
    auth.getSession.mockResolvedValue(withSession("blip-user"));
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { status: 503, message: "down" } });

    expect(await (await freshEnsureSession())()).toBe("blip-user");
    expect(auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("signs in anonymously when there is no session at all", async () => {
    auth.getSession.mockResolvedValue(noSession);
    auth.signInAnonymously.mockResolvedValue({ data: { user: { id: "first-run" } }, error: null });

    expect(await (await freshEnsureSession())()).toBe("first-run");
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("verifies once per load, not once per caller", async () => {
    auth.getSession.mockResolvedValue(withSession("live-user"));
    auth.getUser.mockResolvedValue({ data: { user: { id: "live-user" } }, error: null });

    const ensureSession = await freshEnsureSession();
    await Promise.all([ensureSession(), ensureSession(), ensureSession()]);
    expect(auth.getUser).toHaveBeenCalledTimes(1);
  });

  it("lets a failure retry instead of caching null for the rest of the load", async () => {
    auth.getSession.mockResolvedValue(noSession);
    auth.signInAnonymously.mockResolvedValueOnce({ data: { user: null }, error: { message: "offline" } });

    const ensureSession = await freshEnsureSession();
    expect(await ensureSession()).toBeNull();

    auth.signInAnonymously.mockResolvedValueOnce({ data: { user: { id: "recovered" } }, error: null });
    expect(await ensureSession()).toBe("recovered");
  });
});
