// The guest side of a Nearby Battle.
//
// Being scanned reached the scanned player as exactly one realtime
// postgres_changes INSERT, and postgres_changes has no replay — a socket
// asleep behind a backgrounded tab, a reconnect, or a client still
// mid-subscribe when the row landed missed it permanently. Production bears
// that out: 52 live matches, every one of them against the bot, and the single
// human-vs-human row ever created was forfeited with zero answers on both
// sides. `findPendingLiveMatch` is the server-truth question the watcher now
// asks instead of trusting one event.
//
// What is pinned here is the FILTER, because each clause is load-bearing and
// every one of them fails silently if it drifts: a missing is_bot_match would
// drag the player into their own Training battle, a missing status would drag
// them into a battle that already ended, a missing recency window would drag
// them into one abandoned ten minutes ago.
import { describe, it, expect, vi, beforeEach } from "vitest";

type Call = { method: string; args: unknown[] };
let calls: Call[] = [];
let result: { data: unknown; error: { message: string } | null } = { data: null, error: null };

/** Records every builder call and resolves as the PostgREST thenable would. */
function chain(): unknown {
  const record = (method: string) =>
    function (...args: unknown[]) {
      calls.push({ method, args });
      return proxy;
    };
  const proxy: Record<string, unknown> = {
    select: record("select"),
    eq: record("eq"),
    is: record("is"),
    gte: record("gte"),
    order: record("order"),
    limit: record("limit"),
    maybeSingle: () => {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(result);
    },
  };
  return proxy;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      calls.push({ method: "from", args: [table] });
      return chain();
    },
  },
}));

const { findPendingLiveMatch } = await import("@/lib/pvp-live");

const argsOf = (method: string) => calls.filter((c) => c.method === method).map((c) => c.args);

beforeEach(() => {
  calls = [];
  result = { data: null, error: null };
});

describe("findPendingLiveMatch", () => {
  it("returns the id of a match waiting with me as its guest", async () => {
    result = { data: { id: "m-1" }, error: null };
    await expect(findPendingLiveMatch("me")).resolves.toBe("m-1");
    expect(argsOf("from")).toEqual([["pvp_live_matches"]]);
  });

  it("returns null when nothing is waiting", async () => {
    result = { data: null, error: null };
    await expect(findPendingLiveMatch("me")).resolves.toBeNull();
  });

  it("asks only for matches where I am the guest", async () => {
    await findPendingLiveMatch("me");
    expect(argsOf("eq")).toContainEqual(["guest_id", "me"]);
  });

  it("ignores finished matches and my own Training battles", async () => {
    await findPendingLiveMatch("me");
    const eqs = argsOf("eq");
    expect(eqs).toContainEqual(["status", "active"]);
    expect(eqs).toContainEqual(["is_bot_match", false]);
    expect(argsOf("is")).toContainEqual(["guest_completed_at", null]);
  });

  it("only looks at the last 90 seconds — a live battle nobody joined is over", async () => {
    const before = Date.now();
    await findPendingLiveMatch("me");
    const [[column, since]] = argsOf("gte") as [[string, string]];
    expect(column).toBe("created_at");
    const age = before - Date.parse(since);
    expect(age).toBeGreaterThanOrEqual(89_000);
    expect(age).toBeLessThanOrEqual(91_000);
  });

  it("takes the newest match, not an arbitrary one", async () => {
    await findPendingLiveMatch("me");
    expect(argsOf("order")).toEqual([["created_at", { ascending: false }]]);
    expect(argsOf("limit")).toEqual([[1]]);
  });

  it("stays quiet on a transport failure — the poll simply tries again", async () => {
    result = { data: null, error: { message: "boom" } };
    await expect(findPendingLiveMatch("me")).resolves.toBeNull();
  });
});
