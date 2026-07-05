import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
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

  it("items slice action: tryAutoRevive consumes one per battle only", () => {
    useGameStore.getState().grantItem("revive", 2);
    expect(useGameStore.getState().tryAutoRevive()).toBe(true);
    expect(useGameStore.getState().inventory.revive).toBe(1);
    expect(useGameStore.getState().tryAutoRevive()).toBe(false);
    useGameStore.getState().startBattle();
    expect(useGameStore.getState().tryAutoRevive()).toBe(true);
  });

  it("items slice action: tryAutoKingsRock is gated to once per week", () => {
    useGameStore.getState().grantItem("kingsrock", 1);
    expect(useGameStore.getState().tryAutoKingsRock()).toBe(true);
    expect(useGameStore.getState().tryAutoKingsRock()).toBe(false);
  });

  it("items slice action: useItem sets amuletCoinActive/expCharmActive/luckyPunchActive", () => {
    useGameStore.getState().grantItem("amuletcoin", 1);
    useGameStore.getState().grantItem("expcharm", 1);
    useGameStore.getState().grantItem("luckypunch", 1);
    expect(useGameStore.getState().useItem("amuletcoin")).toBe(true);
    expect(useGameStore.getState().useItem("expcharm")).toBe(true);
    expect(useGameStore.getState().useItem("luckypunch")).toBe(true);
    expect(useGameStore.getState().amuletCoinActive).toBe(true);
    expect(useGameStore.getState().expCharmActive).toBe(true);
    expect(useGameStore.getState().luckyPunchActive).toBe(true);
    // Once-per-battle: a second use before the flags are consumed should fail.
    expect(useGameStore.getState().useItem("amuletcoin")).toBe(false);
  });

  it("items slice action: bignugget requires a fully evolved partner", () => {
    useGameStore.getState().grantItem("bignugget", 2);
    useGameStore.setState({ pokemon: findPokemon(1) ?? null }); // Bulbasaur — can still evolve
    expect(useGameStore.getState().useItem("bignugget")).toBe(false);
    useGameStore.setState({ pokemon: findPokemon(3) ?? null }); // Venusaur — fully evolved
    expect(useGameStore.getState().useItem("bignugget")).toBe(true);
    expect(useGameStore.getState().bigNuggetExpiresAt).toBeGreaterThan(Date.now());
  });

  it("items slice action: starpiece sets starPieceActive", () => {
    useGameStore.getState().grantItem("starpiece", 1);
    expect(useGameStore.getState().useItem("starpiece")).toBe(true);
    expect(useGameStore.getState().starPieceActive).toBe(true);
  });

  it("items slice action: choicespecs cannot be used after another item, and blocks all items after itself", () => {
    useGameStore.getState().grantItem("potion", 1);
    useGameStore.getState().grantItem("choicespecs", 1);
    useGameStore.getState().grantItem("xattack", 1);
    // Using another item first should permanently block Choice Specs this battle.
    expect(useGameStore.getState().useItem("potion")).toBe(true);
    expect(useGameStore.getState().useItem("choicespecs")).toBe(false);

    useGameStore.getState().startBattle();
    useGameStore.getState().grantItem("choicespecs", 1);
    useGameStore.getState().grantItem("xattack", 1);
    useGameStore.getState().grantItem("quickclaw", 1);
    // Choice Specs used first should succeed and then block every other item.
    expect(useGameStore.getState().useItem("choicespecs")).toBe(true);
    expect(useGameStore.getState().choiceSpecsActive).toBe(true);
    expect(useGameStore.getState().useItem("xattack")).toBe(false);
    expect(useGameStore.getState().tryAutoQuickClaw()).toBe(false);
  });

  it("items slice action: at most MAX_ITEMS_PER_BATTLE items (manual + auto combined) can be used per battle", () => {
    useGameStore.getState().startBattle();
    useGameStore.getState().grantItem("potion", 1);
    useGameStore.getState().grantItem("xattack", 1);
    useGameStore.getState().grantItem("quickclaw", 1);
    useGameStore.getState().grantItem("scope", 1);
    expect(useGameStore.getState().useItem("potion")).toBe(true);
    expect(useGameStore.getState().useItem("xattack")).toBe(true);
    // Auto-triggered items count toward the same cap as manual ones.
    expect(useGameStore.getState().tryAutoQuickClaw()).toBe(true);
    expect(useGameStore.getState().itemsUsedThisBattleCount).toBe(3);
    expect(useGameStore.getState().useItem("scope")).toBe(false);
  });

  it("items slice action: auto-only items can't be used manually", () => {
    useGameStore.getState().grantItem("oranberry", 1);
    expect(useGameStore.getState().useItem("oranberry")).toBe(false);
    expect(useGameStore.getState().inventory.oranberry).toBe(1);
  });

  it("poke egg: grantPokeEgg creates a fresh, unhatched egg", () => {
    useGameStore.getState().grantPokeEgg(1);
    const eggs = useGameStore.getState().pokeEggs;
    expect(eggs.length).toBe(1);
    expect(eggs[0].progress).toBe(0);
    expect(eggs[0].required).toBeGreaterThan(0);
  });

  it("poke egg: pushBattleLog grants progress to held eggs, capped at required", () => {
    useGameStore.getState().grantPokeEgg(1);
    useGameStore.getState().pushBattleLog({
      opponent: "Test",
      won: true,
      xpGained: 0,
      bestStreak: 0,
      timestamp: Date.now(),
      mode: "battle",
    });
    const egg = useGameStore.getState().pokeEggs[0];
    expect(egg.progress).toBeGreaterThan(0);
    expect(egg.progress).toBeLessThanOrEqual(egg.required);
  });

  it("poke egg: the same mode only grants progress once per calendar day", () => {
    useGameStore.getState().grantPokeEgg(1);
    const push = () =>
      useGameStore.getState().pushBattleLog({
        opponent: "Test",
        won: true,
        xpGained: 0,
        bestStreak: 0,
        timestamp: Date.now(),
        mode: "battle",
      });
    push();
    const afterFirst = useGameStore.getState().pokeEggs[0].progress;
    push();
    const afterSecond = useGameStore.getState().pokeEggs[0].progress;
    expect(afterSecond).toBe(afterFirst);
  });

  it("poke egg: different modes on the same day each grant progress", () => {
    useGameStore.getState().grantPokeEgg(1);
    useGameStore.getState().pushBattleLog({
      opponent: "Test",
      won: true,
      xpGained: 0,
      bestStreak: 0,
      timestamp: Date.now(),
      mode: "battle",
    });
    const afterBattle = useGameStore.getState().pokeEggs[0].progress;
    useGameStore.getState().pushBattleLog({
      opponent: "Test",
      won: true,
      xpGained: 0,
      bestStreak: 0,
      timestamp: Date.now(),
      mode: "weekly",
    });
    const afterWeekly = useGameStore.getState().pokeEggs[0].progress;
    expect(afterWeekly).toBeGreaterThan(afterBattle);
  });

  it("poke egg: hatchPokeEgg fails below the requirement and succeeds once ready", () => {
    useGameStore.getState().grantPokeEgg(1);
    const eggId = useGameStore.getState().pokeEggs[0].id;
    expect(useGameStore.getState().hatchPokeEgg(eggId)).toBe(false);
    useGameStore.setState((s) => ({
      pokeEggs: s.pokeEggs.map((e) => ({ ...e, progress: e.required })),
    }));
    expect(useGameStore.getState().hatchPokeEgg(eggId)).toBe(true);
    expect(useGameStore.getState().pokeEggs.length).toBe(0);
  });
});
