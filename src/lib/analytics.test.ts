import { describe, it, expect } from "vitest";
import { readReturnGap } from "@/lib/analytics";

function memoryStorage(seed?: string) {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set("poke-trivia-last-seen-day", seed);
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    read: () => map.get("poke-trivia-last-seen-day") ?? null,
  };
}

const at = (iso: string) => new Date(`${iso}T09:00:00`);

describe("readReturnGap", () => {
  it("reports nothing on a first-ever open, but remembers the day", () => {
    const s = memoryStorage();
    expect(readReturnGap(at("2026-07-26"), s)).toBeNull();
    expect(s.read()).toBe("2026-07-26");
  });

  it("reports nothing on a second open the same day", () => {
    const s = memoryStorage("2026-07-26");
    expect(readReturnGap(at("2026-07-26"), s)).toBeNull();
  });

  it("counts a next-day return as one", () => {
    expect(readReturnGap(at("2026-07-27"), memoryStorage("2026-07-26"))).toBe(1);
  });

  it("counts a lapsed player's gap in whole days", () => {
    expect(readReturnGap(at("2026-08-05"), memoryStorage("2026-07-26"))).toBe(10);
  });

  it("counts across a month and a year boundary", () => {
    expect(readReturnGap(at("2027-01-01"), memoryStorage("2026-12-30"))).toBe(2);
  });

  it("ignores a clock that has gone backwards rather than reporting a negative gap", () => {
    expect(readReturnGap(at("2026-07-20"), memoryStorage("2026-07-26"))).toBeNull();
  });

  it("survives storage that throws (private mode)", () => {
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(() => readReturnGap(at("2026-07-26"), throwing)).not.toThrow();
    expect(readReturnGap(at("2026-07-26"), throwing)).toBeNull();
  });

  it("still reports the gap when the write fails but the read worked", () => {
    const readOnly = {
      getItem: () => "2026-07-24",
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readReturnGap(at("2026-07-26"), readOnly)).toBe(2);
  });
});
