import { describe, it, expect, beforeEach } from "vitest";
import { shouldApplyRev, noteAppliedRev, forgetAppliedRev } from "@/lib/pvp-live";

/**
 * The realtime staleness guard.
 *
 * The bug it exists for: a turn writes pvp_live_matches several times, and the
 * client learns of those writes through two unordered channels — each write's
 * HTTP response, and the postgres_changes event it emits. An event for an
 * earlier write can land after a later response has already been applied, and
 * the older HP wins. Because the damage flash only fires when HP *drops*, the
 * player sees their Pokémon silently gain HP.
 */
const M = "match-a";
const OTHER = "match-b";

beforeEach(() => {
  forgetAppliedRev(M);
  forgetAppliedRev(OTHER);
});

describe("shouldApplyRev", () => {
  it("accepts the first revision it ever sees, including 0", () => {
    // A freshly created row is rev 0, so the mark cannot start at 0 or the
    // opening state would be discarded.
    expect(shouldApplyRev(M, 0)).toBe(true);
  });

  it("accepts strictly increasing revisions", () => {
    expect(shouldApplyRev(M, 1)).toBe(true);
    expect(shouldApplyRev(M, 2)).toBe(true);
    expect(shouldApplyRev(M, 3)).toBe(true);
  });

  it("rejects a replay of the revision just applied", () => {
    expect(shouldApplyRev(M, 5)).toBe(true);
    expect(shouldApplyRev(M, 5)).toBe(false);
  });

  it("rejects an older revision arriving late — the actual bug", () => {
    expect(shouldApplyRev(M, 9)).toBe(true);
    expect(shouldApplyRev(M, 8)).toBe(false);
    expect(shouldApplyRev(M, 3)).toBe(false);
  });

  it("still accepts the next genuinely newer revision after rejecting stale ones", () => {
    shouldApplyRev(M, 9);
    shouldApplyRev(M, 4);
    expect(shouldApplyRev(M, 10)).toBe(true);
  });

  it("accepts a revision that skips ahead", () => {
    // Payloads are whole rows, so a gap is not a problem: the newer row is
    // complete on its own and nothing has to be replayed to reach it.
    expect(shouldApplyRev(M, 2)).toBe(true);
    expect(shouldApplyRev(M, 40)).toBe(true);
  });

  it("tracks matches independently", () => {
    expect(shouldApplyRev(M, 7)).toBe(true);
    expect(shouldApplyRev(OTHER, 1)).toBe(true);
    expect(shouldApplyRev(OTHER, 2)).toBe(true);
    expect(shouldApplyRev(M, 6)).toBe(false);
  });
});

describe("noteAppliedRev", () => {
  it("makes a realtime event at or below the noted revision stale", () => {
    // The HTTP-response path: the caller applied state at rev 12, so every
    // event describing a write up to and including 12 is already accounted for.
    noteAppliedRev(M, 12);
    expect(shouldApplyRev(M, 11)).toBe(false);
    expect(shouldApplyRev(M, 12)).toBe(false);
    expect(shouldApplyRev(M, 13)).toBe(true);
  });

  it("never lowers the mark", () => {
    noteAppliedRev(M, 20);
    noteAppliedRev(M, 3);
    expect(shouldApplyRev(M, 15)).toBe(false);
    expect(shouldApplyRev(M, 21)).toBe(true);
  });
});

describe("forgetAppliedRev", () => {
  it("lets a reused match id start over", () => {
    shouldApplyRev(M, 30);
    forgetAppliedRev(M);
    // Without this, a stale high mark would swallow every event of the new match.
    expect(shouldApplyRev(M, 1)).toBe(true);
  });

  it("leaves other matches alone", () => {
    shouldApplyRev(M, 5);
    shouldApplyRev(OTHER, 5);
    forgetAppliedRev(M);
    expect(shouldApplyRev(OTHER, 4)).toBe(false);
  });
});
