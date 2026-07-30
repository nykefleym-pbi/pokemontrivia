import { beforeEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/store";
import { ADAPTIVE_WINDOW } from "@/lib/game-data";
import { findPokemon } from "@/lib/pokemon-data";
import type { WhosThatRound as Round } from "@/lib/whos-that";
import type { ItemId } from "@/lib/game-data";
import {
  BAG_CAPACITY_BASE,
  BAG_UPGRADE_MAX,
  bagCapacity,
  bagUnitsUsed,
  bagUpgradePrice,
  defaultInventory,
} from "@/lib/store/slices/itemsSlice";

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
    expect(s.recentAnswers).toEqual([]);
    expect(s.darkMode).toBe(false);
  });

  it("recordAnswer keeps a rolling window in step with stats", () => {
    const s = () => useGameStore.getState();
    s().recordAnswer(true, 1000, 1);
    s().recordAnswer(false, 1000, 0);
    s().recordAnswer(true, 1000, 1);

    expect(s().recentAnswers).toEqual([1, 0, 1]);
    expect(s().stats.answered).toBe(3);
    expect(s().stats.correct).toBe(2);
  });

  it("recordAnswer caps the window and drops the oldest answers", () => {
    // Feed it more than a window's worth: only the tail may survive, otherwise
    // the array grows without bound in every save payload.
    for (let i = 0; i < ADAPTIVE_WINDOW + 10; i++) {
      useGameStore.getState().recordAnswer(i >= 10, 1000, 0);
    }
    const recent = useGameStore.getState().recentAnswers;
    expect(recent.length).toBe(ADAPTIVE_WINDOW);
    // The ten wrong answers at the front are the ones that fell off.
    expect(recent.every((v) => v === 1)).toBe(true);
    expect(useGameStore.getState().stats.answered).toBe(ADAPTIVE_WINDOW + 10);
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

  it("status: applyBattleStatus / tickBattleStatusCure round-trip and clear", () => {
    useGameStore
      .getState()
      .applyBattleStatus({ kind: "poisoned", curesRemaining: 3, appliedAt: 0 });
    expect(useGameStore.getState().battleStatuses.map((s) => s.kind)).toContain("poisoned");
    // Two ticks don't clear a 3-cure status; the third does.
    expect(useGameStore.getState().tickBattleStatusCure("poisoned")).toBe(false);
    expect(useGameStore.getState().tickBattleStatusCure("poisoned")).toBe(false);
    expect(useGameStore.getState().tickBattleStatusCure("poisoned")).toBe(true);
    expect(useGameStore.getState().battleStatuses.length).toBe(0);
  });

  it("status: one major at a time, but Confusion (volatile) coexists", () => {
    useGameStore
      .getState()
      .applyBattleStatus({ kind: "confused", curesRemaining: 2, appliedAt: 0 });
    useGameStore
      .getState()
      .applyBattleStatus({ kind: "poisoned", curesRemaining: 3, appliedAt: 0 });
    // A new major evicts the old major but keeps the volatile confusion.
    useGameStore.getState().applyBattleStatus({ kind: "burn", curesRemaining: 3, appliedAt: 0 });
    const kinds = useGameStore
      .getState()
      .battleStatuses.map((s) => s.kind)
      .sort();
    expect(kinds).toEqual(["burn", "confused"]);
  });

  it("status: opponent statuses are tracked separately from self", () => {
    useGameStore
      .getState()
      .applyBattleStatus({ kind: "burn", curesRemaining: 3, appliedAt: 0 }, "opponent");
    expect(useGameStore.getState().opponentStatuses.map((s) => s.kind)).toEqual(["burn"]);
    expect(useGameStore.getState().battleStatuses.length).toBe(0);
  });

  it("status + stages: reset by startBattle (5-place reset)", () => {
    useGameStore.getState().applyBattleStatus({ kind: "burn", curesRemaining: 3, appliedAt: 0 });
    useGameStore.getState().bumpPvpStage("self", "attack", 2);
    useGameStore.getState().startBattle();
    expect(useGameStore.getState().battleStatuses).toEqual([]);
    expect(useGameStore.getState().myStages.attack).toBe(0);
  });

  it("stages: bumpPvpStage clamps to -3..+3", () => {
    useGameStore.getState().bumpPvpStage("self", "attack", 5);
    expect(useGameStore.getState().myStages.attack).toBe(3);
    useGameStore.getState().bumpPvpStage("opponent", "speed", -9);
    expect(useGameStore.getState().oppStages.speed).toBe(-3);
  });

  it("pvp flags: markNearbyBattleEntered returns true only the first time", () => {
    expect(useGameStore.getState().hasEnteredNearbyBattle).toBe(false);
    expect(useGameStore.getState().markNearbyBattleEntered()).toBe(true);
    expect(useGameStore.getState().markNearbyBattleEntered()).toBe(false);
    expect(useGameStore.getState().hasEnteredNearbyBattle).toBe(true);
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

describe("bag capacity", () => {
  // One id, one big stack — capacity counts UNITS, so the shape does not matter.
  // Zeroed rather than spread over defaultInventory, which already carries 4
  // units besides potion and would put the total 4 over whatever was asked for.
  const fill = (units: number) => {
    const zero = Object.fromEntries(Object.keys(defaultInventory).map((k) => [k, 0])) as Record<
      ItemId,
      number
    >;
    useGameStore.setState({ inventory: { ...zero, potion: units } });
  };
  const held = (id: ItemId) =>
    useGameStore.getState().pendingBagOverflow.find((e) => e.id === id)?.qty ?? 0;

  it("starts above every real save's high-water mark, and default inventory is nowhere near it", () => {
    expect(bagCapacity(0)).toBe(60);
    expect(bagUnitsUsed(defaultInventory)).toBe(6);
  });

  it("berries are exempt: they neither consume capacity nor ever overflow", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.getState().grantItem("lumberry", 5);
    expect(useGameStore.getState().inventory.lumberry).toBe(5);
    expect(useGameStore.getState().pendingBagOverflow).toEqual([]);
    // ...and holding them does not push the bag over.
    expect(bagUnitsUsed(useGameStore.getState().inventory)).toBe(BAG_CAPACITY_BASE);
  });

  it("a grant that does not fit is partially filled and the rest is HELD, not dropped", () => {
    fill(BAG_CAPACITY_BASE - 2);
    useGameStore.getState().grantItem("revive", 5);
    expect(useGameStore.getState().inventory.revive).toBe(2);
    expect(held("revive")).toBe(3);
  });

  it("a NEGATIVE qty still spends items when the bag is full (Mega Raid's consume path)", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.getState().grantItem("potion", -1);
    expect(useGameStore.getState().inventory.potion).toBe(BAG_CAPACITY_BASE - 1);
    expect(useGameStore.getState().pendingBagOverflow).toEqual([]);
  });

  it("buyItem refuses a full bag WITHOUT taking the coins", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.setState({ coins: 1000 });
    expect(useGameStore.getState().buyItem("potion", 100)).toBe(false);
    expect(useGameStore.getState().coins).toBe(1000);
  });

  it("discardItem frees room and pays nothing", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.setState({ coins: 0 });
    expect(useGameStore.getState().discardItem("potion", 3)).toBe(true);
    expect(useGameStore.getState().coins).toBe(0);
    expect(bagUnitsUsed(useGameStore.getState().inventory)).toBe(BAG_CAPACITY_BASE - 3);
  });

  it("a held entry can be refunded for half the shop price, per unit", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.setState({ coins: 0 });
    useGameStore.getState().grantItem("maxpotion", 2); // costs 1000 -> 500 each
    expect(held("maxpotion")).toBe(2);
    expect(useGameStore.getState().refundOverflow("maxpotion")).toBe(1000);
    expect(useGameStore.getState().coins).toBe(1000);
    expect(held("maxpotion")).toBe(0);
  });

  it("forfeiting a held entry drops it and pays nothing", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.setState({ coins: 0 });
    useGameStore.getState().grantItem("potion", 1);
    expect(useGameStore.getState().forfeitOverflow("potion")).toBe(true);
    expect(useGameStore.getState().coins).toBe(0);
    expect(useGameStore.getState().pendingBagOverflow).toEqual([]);
  });

  it("claimOverflow only moves what fits, and keeps the remainder held", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.getState().grantItem("revive", 4);
    expect(held("revive")).toBe(4);
    useGameStore.getState().discardItem("potion", 1); // one unit of room
    expect(useGameStore.getState().claimOverflow("revive")).toBe(true);
    expect(useGameStore.getState().inventory.revive).toBe(1);
    expect(held("revive")).toBe(3);
  });

  it("the upgrade escalates in price, stops at the ceiling, and pulls held items in", () => {
    expect(bagUpgradePrice(0)).toBe(500);
    expect(bagUpgradePrice(1)).toBe(1000);
    expect(bagUpgradePrice(BAG_UPGRADE_MAX)).toBeNull();

    fill(BAG_CAPACITY_BASE);
    useGameStore.setState({ coins: 500 });
    useGameStore.getState().grantItem("revive", 4);
    expect(held("revive")).toBe(4);

    expect(useGameStore.getState().purchaseBagUpgrade()).toBe(true);
    expect(useGameStore.getState().coins).toBe(0);
    expect(bagCapacity(useGameStore.getState().bagUpgrades)).toBe(70);
    // 10 new units of room, 4 held -> all of it comes in.
    expect(useGameStore.getState().inventory.revive).toBe(4);
    expect(useGameStore.getState().pendingBagOverflow).toEqual([]);
  });

  it("the upgrade is refused without the coins, and the ceiling holds", () => {
    useGameStore.setState({ coins: 100 });
    expect(useGameStore.getState().purchaseBagUpgrade()).toBe(false);
    expect(useGameStore.getState().bagUpgrades).toBe(0);

    useGameStore.setState({ coins: 999_999, bagUpgrades: BAG_UPGRADE_MAX });
    expect(useGameStore.getState().purchaseBagUpgrade()).toBe(false);
    expect(bagCapacity(useGameStore.getState().bagUpgrades)).toBe(120);
  });

  it("repeated overflow of one item merges into a single held row", () => {
    fill(BAG_CAPACITY_BASE);
    useGameStore.getState().grantItem("potion", 2);
    useGameStore.getState().grantItem("potion", 3);
    expect(useGameStore.getState().pendingBagOverflow).toEqual([{ id: "potion", qty: 5 }]);
  });
});

describe("Facebook promo gate", () => {
  const today = () => new Date().toISOString().slice(0, 10);

  it("starts unshown so a fresh player is offered it", () => {
    expect(useGameStore.getState().facebookPromoDate).toBeNull();
  });

  it("markFacebookPromoSeen stamps today, which is what closes the gate", () => {
    useGameStore.getState().markFacebookPromoSeen();
    expect(useGameStore.getState().facebookPromoDate).toBe(today());
  });

  it("reset() clears it", () => {
    // reset() enumerates state explicitly rather than rebuilding from the slice
    // defaults, so a new field it forgets leaks across saves and across tests --
    // that exact omission caused 8 failures when the bag fields landed.
    useGameStore.getState().markFacebookPromoSeen();
    useGameStore.getState().reset();
    expect(useGameStore.getState().facebookPromoDate).toBeNull();
  });

  it("a stale date does not close the gate", () => {
    // The card is gated on `facebookPromoDate !== today`, so yesterday's stamp
    // has to read as "offer it again" rather than as "already shown".
    useGameStore.setState({ facebookPromoDate: "2020-01-01" });
    expect(useGameStore.getState().facebookPromoDate).not.toBe(today());
  });
});
