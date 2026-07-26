// Ordering guarantees for the shared HP high-water mark.
//
// The bug these exist for (owner report 2026-07-26, match aa61c8e5): HP bars
// visibly jumped backwards and forwards for BOTH sides, with no item involved,
// while the authoritative row moved strictly one way the whole match. The cause
// was not the row — it was the client applying HP from several unordered
// sources: each RPC's own response, the postgres_changes event that write
// emitted, and a `setTimeout` holding the bot's snapshot for as long as the
// bot's simulated answer time (up to the full question timer). Whichever
// callback ran last won.
//
// The fix routes every one of those through `shouldApplyRev`, so "newest
// revision wins" holds ACROSS channels, not just within the realtime one.
import { describe, expect, it, beforeEach } from "vitest";
import { shouldApplyRev, noteAppliedRev, forgetAppliedRev } from "@/lib/pvp-live";

const M = "match-ordering";

beforeEach(() => forgetAppliedRev(M));

describe("cross-channel HP ordering", () => {
  it("lets a response and its own realtime echo apply exactly once", () => {
    // The RPC response for rev 5 paints first; the row event for the same write
    // arrives later and must be a no-op rather than a second repaint.
    expect(shouldApplyRev(M, 5)).toBe(true);
    expect(shouldApplyRev(M, 5)).toBe(false);
  });

  it("drops a slow response that lost the race to a newer one", () => {
    // Two answers resolving close together: the later write (rev 9) returns
    // first, the earlier one (rev 8) lands after. Without the gate, rev 8's HP
    // would repaint over rev 9's and the bars would jump backwards.
    expect(shouldApplyRev(M, 9)).toBe(true);
    expect(shouldApplyRev(M, 8)).toBe(false);
  });

  it("drops the bot's held snapshot when the player has already answered past it", () => {
    // The exact shape of the reported bug: bot turn resolves at rev 12 but is
    // held for its reveal delay; the player answers meanwhile (rev 13); the
    // bot's timer then fires with the stale payload.
    const botRev = 12;
    expect(shouldApplyRev(M, botRev)).toBe(true); // bot's own immediate paint
    expect(shouldApplyRev(M, 13)).toBe(true); // player's answer
    expect(shouldApplyRev(M, botRev)).toBe(false); // held snapshot, discarded
  });

  it("still accepts the next genuine update after discarding stale ones", () => {
    shouldApplyRev(M, 20);
    expect(shouldApplyRev(M, 14)).toBe(false);
    expect(shouldApplyRev(M, 21)).toBe(true);
  });

  it("accepts revision 0 — a freshly created row is not 'already seen'", () => {
    expect(shouldApplyRev(M, 0)).toBe(true);
  });

  it("seeds from the initial fetch so pre-fetch events cannot replay", () => {
    noteAppliedRev(M, 30);
    expect(shouldApplyRev(M, 29)).toBe(false);
    expect(shouldApplyRev(M, 31)).toBe(true);
  });

  it("accepts a forward jump — payloads are whole rows, so gaps are safe", () => {
    expect(shouldApplyRev(M, 3)).toBe(true);
    expect(shouldApplyRev(M, 50)).toBe(true);
  });
});
