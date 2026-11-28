import { describe, expect, it } from "vitest";
import { countBattleForSaveAsk, markSaveAsked } from "@/lib/save-ask";

const mem = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("save-ask: first win, then every second battle", () => {
  it("never asks before the first win, then asks on it", () => {
    const s = mem();
    expect(countBattleForSaveAsk(false, s)).toBe(false);
    expect(countBattleForSaveAsk(true, s)).toBe(true);
  });

  it("after an ask, skips one battle and asks on the next, win or lose", () => {
    const s = mem();
    expect(countBattleForSaveAsk(true, s)).toBe(true);
    markSaveAsked(s);
    expect(countBattleForSaveAsk(true, s)).toBe(false);
    expect(countBattleForSaveAsk(false, s)).toBe(true);
    markSaveAsked(s);
    expect(countBattleForSaveAsk(false, s)).toBe(false);
    expect(countBattleForSaveAsk(true, s)).toBe(true);
  });
});
