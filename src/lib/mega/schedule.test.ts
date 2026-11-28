import { describe, expect, it } from "vitest";
import { megaRange } from "./schedule";

describe("megaRange", () => {
  it("shows the raid's first and last day in Manila time (end is exclusive)", () => {
    expect(megaRange({ startsAt: "2026-12-15T00:00:00+08:00", endsAt: "2027-02-01T00:00:00+08:00" })).toBe("Dec 15 – Jan 31");
  });
});
