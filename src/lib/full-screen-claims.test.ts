// The bottom nav is hidden by a CLAIM COUNT, not a boolean.
//
// Owner report 2026-08-01: the nav never came back on the Elite Four intro
// after a battle. Several full-screen surfaces nest — the result screen renders
// inside the battle screen — and each is written as `set(true)` on mount and
// `set(false)` on unmount. With a plain boolean, whether the nav returns
// depends on which cleanup React happens to run last.
import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "@/lib/store";

const set = (v: boolean) => useGameStore.getState().setBattleScreenActive(v);
const active = () => useGameStore.getState().battleScreenActive;

describe("full-screen claims", () => {
  beforeEach(() => {
    useGameStore.setState({ battleScreenActive: false, fullScreenClaims: 0 });
  });

  it("hides on the first claim and shows again on the last release", () => {
    expect(active()).toBe(false);
    set(true);
    expect(active()).toBe(true);
    set(false);
    expect(active()).toBe(false);
  });

  it("stays hidden while an inner surface releases inside an outer one", () => {
    set(true); // battle screen
    set(true); // result screen nested in it
    set(false); // result screen unmounts first
    expect(active(), "the battle screen still wants it hidden").toBe(true);
    set(false); // battle screen unmounts
    expect(active()).toBe(false);
  });

  it("comes back whichever order the two cleanups run in", () => {
    // The reported bug: outer released before inner, and the inner release then
    // restored `true`, leaving the nav hidden on every screen that followed.
    set(true);
    set(true);
    set(false); // outer
    set(false); // inner
    expect(active()).toBe(false);
  });

  it("cannot be wedged off by an unbalanced release", () => {
    set(false);
    set(false);
    expect(useGameStore.getState().fullScreenClaims).toBe(0);
    set(true);
    expect(active()).toBe(true);
    set(false);
    expect(active()).toBe(false);
  });
});
