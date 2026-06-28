import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/store";
import type { Round } from "@/routes/whos-that-pokemon";

beforeEach(() => {
  useGameStore.getState().reset();
});

describe("store composition (slices)", () => {
  it("reset() yields baseline state across all slices", () => {
    const s = useGameStore.getState();
    expect(s.level).toBe(1);
    expect(s.xp).toBe(0);
    expect(s.coins).toBe(0);
    expect(s.hasOnboarded).toBe(false);
    expect(s.megaTrophies).toEqual([]);
    expect(s.claimedMegaRewards).toEqual([]);
    expect(s.whosThatActiveRound).toBeNull();
    expect(s.weeklyLeagueHistory).toEqual([]);
    expect(typeof s.inventory).toBe("object");
    expect(s.inventory).toBeDefined();
    expect(typeof s.pokedex).toBe("object");
    expect(s.defeatedElites).toEqual([]);
    expect(s.darkMode).toBe(false);
  });

  it("mega slice action: markMegaRewardClaimed is idempotent", () => {
    useGameStore.getState().markMegaRewardClaimed("evt1");
    useGameStore.getState().markMegaRewardClaimed("evt1");
    const claimed = useGameStore.getState().claimedMegaRewards;
    expect(claimed).toContain("evt1");
    expect(claimed.filter((x) => x === "evt1").length).toBe(1);
  });

  it("whosThat slice action: setWhosThatRound stores the hour key", () => {
    const round = { dummy: true } as unknown as Round;
    useGameStore.getState().setWhosThatRound(round, 5);
    expect(useGameStore.getState().whosThatRoundHourKey).toBe(5);
  });

  it("leagues slice action: training points round-trip", () => {
    useGameStore.getState().addTrainingPoints(25, 10);
    expect(useGameStore.getState().getPartnerTp(25)).toBe(10);
  });

  it("items slice action: grantItem increases inventory", () => {
    const before = useGameStore.getState().inventory.potion ?? 0;
    useGameStore.getState().grantItem("potion", 2);
    expect(useGameStore.getState().inventory.potion).toBe(before + 2);
  });

  it("profile slice action: setDarkMode toggles", () => {
    useGameStore.getState().setDarkMode(true);
    expect(useGameStore.getState().darkMode).toBe(true);
  });

  it("collections slice action: recordPokedexCapture creates entry", () => {
    useGameStore.getState().recordPokedexCapture(1, false);
    expect(useGameStore.getState().pokedex[1]).toBeDefined();
  });

  it("collections slice action: registerAbilityTriggered is idempotent", () => {
    useGameStore.getState().registerAbilityTriggered("overgrow");
    useGameStore.getState().registerAbilityTriggered("overgrow");
    const codex = useGameStore.getState().abilityCodex;
    expect(codex.filter((x) => x === "overgrow").length).toBe(1);
  });

  it("cross-slice actions remain wired (addCoins / addXp)", () => {
    expect(typeof useGameStore.getState().addCoins).toBe("function");
    expect(typeof useGameStore.getState().addXp).toBe("function");
  });
});
