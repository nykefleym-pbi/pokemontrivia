import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import { ARENA_TP_REWARD, ARENA_XP_REWARD, ARENA_COIN_REWARD } from "@/lib/arena-rewards";
import type { ItemId } from "@/lib/game-data";

const PARTNER_ID = 1; // Bulbasaur — any partner works, just needs to be non-null.

beforeEach(() => {
  useGameStore.getState().reset();
  // grantArenaReward's slot 0 (TP) needs a partner to take the TP path
  // deterministically rather than falling back to XP.
  useGameStore.setState({ pokemon: findPokemon(PARTNER_ID) ?? null });
});

function inventoryTotal(): number {
  const inv = useGameStore.getState().inventory as Record<ItemId, number>;
  return Object.values(inv).reduce((a, b) => a + (b ?? 0), 0);
}

describe("arenaStats: recordArenaBattle", () => {
  it("a win increments wins/battles and the training-mode counter (isBot true)", () => {
    useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
    const s = useGameStore.getState().arenaStats;
    expect(s.wins).toBe(1);
    expect(s.battles).toBe(1);
    expect(s.trainingBattles).toBe(1);
    expect(s.nearbyBattles).toBe(0);
  });

  it("a win increments the nearby-mode counter (isBot false)", () => {
    useGameStore.getState().recordArenaBattle({ won: true, isBot: false, berries: [] });
    const s = useGameStore.getState().arenaStats;
    expect(s.nearbyBattles).toBe(1);
    expect(s.trainingBattles).toBe(0);
  });

  it("a loss increments battles + mode counter only, and resets currentWinStreak to 0", () => {
    useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
    useGameStore.getState().recordArenaBattle({ won: false, isBot: true, berries: [] });
    const s = useGameStore.getState().arenaStats;
    expect(s.battles).toBe(2);
    expect(s.wins).toBe(1);
    expect(s.trainingBattles).toBe(2);
    expect(s.currentWinStreak).toBe(0);
  });

  it("tracks current/longest win streaks", () => {
    useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
    useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
    useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
    let s = useGameStore.getState().arenaStats;
    expect(s.currentWinStreak).toBe(3);
    expect(s.longestWinStreak).toBe(3);

    useGameStore.getState().recordArenaBattle({ won: false, isBot: true, berries: [] });
    s = useGameStore.getState().arenaStats;
    expect(s.currentWinStreak).toBe(0);
    expect(s.longestWinStreak).toBe(3);
  });

  it("lastBerries caps at 3, newest first", () => {
    useGameStore.getState().recordArenaBattle({
      won: true,
      isBot: false,
      berries: ["lumberry", "colburberry"] as ItemId[],
    });
    let s = useGameStore.getState().arenaStats;
    expect(s.lastBerries).toEqual(["lumberry", "colburberry"]);

    useGameStore.getState().recordArenaBattle({
      won: true,
      isBot: false,
      berries: ["cheriberry"] as ItemId[],
    });
    s = useGameStore.getState().arenaStats;
    expect(s.lastBerries.length).toBe(3);
    expect(s.lastBerries).toEqual(["cheriberry", "lumberry", "colburberry"]);
  });

  describe("set-of-5 reward gating", () => {
    it("claimArenaReward(0) succeeds after 1 win; slot 1 stays locked", () => {
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
      const tpBefore = useGameStore.getState().getPartnerTp(PARTNER_ID);

      const res0 = useGameStore.getState().claimArenaReward(0);
      expect(res0).not.toBeNull();
      expect(useGameStore.getState().getPartnerTp(PARTNER_ID)).toBe(tpBefore + ARENA_TP_REWARD);
      expect(useGameStore.getState().arenaStats.set.claimed[0]).toBe(true);

      const xpBefore = useGameStore.getState().xp;
      const res1 = useGameStore.getState().claimArenaReward(1);
      expect(res1).toBeNull();
      expect(useGameStore.getState().arenaStats.set.claimed[1]).toBe(false);
      expect(useGameStore.getState().xp).toBe(xpBefore);
    });

    it("double-claiming an already-claimed slot is a no-op (no double grant)", () => {
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
      useGameStore.getState().claimArenaReward(0);
      const tpAfterFirstClaim = useGameStore.getState().getPartnerTp(PARTNER_ID);

      const res = useGameStore.getState().claimArenaReward(0);
      expect(res).toBeNull();
      expect(useGameStore.getState().getPartnerTp(PARTNER_ID)).toBe(tpAfterFirstClaim);
      expect(useGameStore.getState().arenaStats.set.claimed[0]).toBe(true);
    });

    it("claimArenaReward rejects out-of-range slots", () => {
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
      expect(useGameStore.getState().claimArenaReward(-1)).toBeNull();
      expect(useGameStore.getState().claimArenaReward(5)).toBeNull();
    });
  });

  describe("5-battle set rollover", () => {
    it("auto-grants unclaimed-unlocked slots on the 6th battle, then starts a fresh set at battles:1", () => {
      // 4 wins, 1 loss across the first 5 battles -> set = {battles:5, wins:4, claimed:[false*5]}.
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });
      useGameStore.getState().recordArenaBattle({ won: false, isBot: true, berries: [] });
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });

      const preSet = useGameStore.getState().arenaStats.set;
      expect(preSet).toEqual({ battles: 5, wins: 4, claimed: [false, false, false, false, false] });

      const tpBefore = useGameStore.getState().getPartnerTp(PARTNER_ID);
      const xpBefore = useGameStore.getState().xp;
      const coinsBefore = useGameStore.getState().coins;
      const invBefore = inventoryTotal();

      // 6th battle: rollover kicks in BEFORE this battle is applied to the
      // fresh set. Slots 0-3 are unlocked (wins=4) and unclaimed -> all four
      // auto-grant (tp, xp, item, coins); slot 4 (needs 5 wins) does not.
      useGameStore.getState().recordArenaBattle({ won: true, isBot: true, berries: [] });

      expect(useGameStore.getState().getPartnerTp(PARTNER_ID)).toBe(tpBefore + ARENA_TP_REWARD);
      expect(useGameStore.getState().xp).toBe(xpBefore + ARENA_XP_REWARD);
      expect(useGameStore.getState().coins).toBe(coinsBefore + ARENA_COIN_REWARD);
      expect(inventoryTotal()).toBe(invBefore + 1);

      const s = useGameStore.getState().arenaStats;
      // The 6th battle (a win) applies to the fresh set: battles:1, wins:1.
      expect(s.set).toEqual({ battles: 1, wins: 1, claimed: [false, false, false, false, false] });
      expect(s.battles).toBe(6);
      expect(s.wins).toBe(5);
    });
  });
});
