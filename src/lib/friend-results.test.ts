import { describe, expect, it } from "vitest";
import { unseenResultWith } from "@/lib/friend-results";
import type { PvpMatch } from "@/lib/pvp";

const NOW = Date.parse("2026-11-28T12:00:00Z");
const m = (id: string, status: PvpMatch["status"], created: string, expires = "2026-12-30T00:00:00Z"): PvpMatch =>
  ({ id, challengerId: "me", opponentId: "kai", status, createdAt: created, expiresAt: expires }) as PvpMatch;

describe("unseenResultWith", () => {
  it("shows the newest finished, declined or expired match until it is seen", () => {
    const list = [m("old", "completed", "2026-11-20T00:00:00Z"), m("new", "declined", "2026-11-27T00:00:00Z")];
    expect(unseenResultWith(list, "me", "kai", new Set(), NOW)).toBe("new");
    expect(unseenResultWith(list, "me", "kai", new Set(["new"]), NOW)).toBeNull();
  });

  it("a still-open challenge keeps Battle; one past its expiry counts as expired", () => {
    expect(unseenResultWith([m("p", "pending", "2026-11-27T00:00:00Z")], "me", "kai", new Set(), NOW)).toBeNull();
    expect(unseenResultWith([m("p", "pending", "2026-11-20T00:00:00Z", "2026-11-21T00:00:00Z")], "me", "kai", new Set(), NOW)).toBe("p");
  });

  it("ignores matches with someone else", () => {
    expect(unseenResultWith([m("x", "completed", "2026-11-27T00:00:00Z")], "me", "ben", new Set(), NOW)).toBeNull();
  });
});
