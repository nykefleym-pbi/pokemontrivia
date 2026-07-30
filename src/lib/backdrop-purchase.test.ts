// Buying a backdrop costs coins AND banked Arena battles, and the battle half
// RESETS on every purchase. That reset is the whole shape of the economy: get
// it wrong by subtracting instead, and a player who grinds 90 battles unlocks
// the entire catalogue the moment they can afford it.
import { describe, it, expect, beforeEach } from "vitest";
import { useGameStore } from "@/lib/store";
import {
  BACKDROP_BATTLE_COST,
  BACKDROP_COIN_COST,
  DEFAULT_VERSUS_BACKDROP_ID,
} from "@/lib/versus-backdrops";

const bank = (battles: number, coins = 999_999) =>
  useGameStore.setState({ coins, versusBackdropBattles: battles });

beforeEach(() => {
  useGameStore.setState({
    coins: 0,
    versusBackdropBattles: 0,
    ownedBackdropIds: [],
    versusBackdropId: null,
  });
});

const s = () => useGameStore.getState();

describe("buying a backdrop", () => {
  it("refuses without the coins, and takes nothing", () => {
    bank(BACKDROP_BATTLE_COST, BACKDROP_COIN_COST - 1);
    expect(s().buyVersusBackdrop("under-the-sea")).toEqual({ ok: false, reason: "coins" });
    expect(s().ownedBackdropIds).toEqual([]);
    expect(s().coins).toBe(BACKDROP_COIN_COST - 1);
    expect(s().versusBackdropBattles).toBe(BACKDROP_BATTLE_COST);
  });

  it("refuses without the battles, and takes nothing", () => {
    bank(BACKDROP_BATTLE_COST - 1);
    expect(s().buyVersusBackdrop("under-the-sea")).toEqual({ ok: false, reason: "battles" });
    expect(s().ownedBackdropIds).toEqual([]);
    expect(s().coins).toBe(999_999);
  });

  it("charges both halves and equips it", () => {
    bank(BACKDROP_BATTLE_COST, BACKDROP_COIN_COST);
    expect(s().buyVersusBackdrop("under-the-sea")).toEqual({ ok: true });
    expect(s().coins).toBe(0);
    expect(s().ownedBackdropIds).toEqual(["under-the-sea"]);
    expect(s().versusBackdropId).toBe("under-the-sea");
  });

  it("RESETS the battle bank rather than subtracting from it", () => {
    // Ninety battles banked, enough coins for the world: still exactly one
    // backdrop, and the next one starts from zero battles.
    bank(90);
    expect(s().buyVersusBackdrop("under-the-sea").ok).toBe(true);
    expect(s().versusBackdropBattles).toBe(0);
    expect(s().buyVersusBackdrop("ultra-moon")).toEqual({ ok: false, reason: "battles" });
    expect(s().ownedBackdropIds).toEqual(["under-the-sea"]);
  });

  it("will not sell the same backdrop twice", () => {
    bank(BACKDROP_BATTLE_COST);
    s().buyVersusBackdrop("under-the-sea");
    bank(BACKDROP_BATTLE_COST);
    expect(s().buyVersusBackdrop("under-the-sea")).toEqual({ ok: false, reason: "owned" });
  });

  it("will not sell the free one", () => {
    bank(BACKDROP_BATTLE_COST);
    expect(s().buyVersusBackdrop(DEFAULT_VERSUS_BACKDROP_ID)).toEqual({
      ok: false,
      reason: "owned",
    });
    expect(s().coins).toBe(999_999);
  });

  it("will not sell art that does not exist", () => {
    bank(BACKDROP_BATTLE_COST);
    expect(s().buyVersusBackdrop("no-such-backdrop")).toEqual({ ok: false, reason: "unknown" });
  });
});

describe("equipping", () => {
  it("takes the free one with nothing bought", () => {
    s().setVersusBackdropId(DEFAULT_VERSUS_BACKDROP_ID);
    expect(s().versusBackdropId).toBe(DEFAULT_VERSUS_BACKDROP_ID);
  });

  it("ignores one that has not been bought — the picker is not the gate", () => {
    s().setVersusBackdropId("under-the-sea");
    expect(s().versusBackdropId).toBeNull();
  });
});

describe("banking battles", () => {
  it("counts every Arena battle, Training included", () => {
    useGameStore.setState({ versusBackdropBattles: 0 });
    s().recordArenaBattle({ won: true, isBot: true, berries: [] });
    s().recordArenaBattle({ won: false, isBot: false, berries: [] });
    expect(s().versusBackdropBattles).toBe(2);
  });
});
