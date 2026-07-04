import type { GameState } from "@/lib/store";
import type { StoreSlice } from "@/lib/store/slice";
import type { ItemId } from "@/lib/game-data";
import { getWeekRangeUtc } from "@/lib/game-data";

export const defaultInventory: Record<ItemId, number> = {
  potion: 2,
  superpotion: 0,
  maxpotion: 0,
  xattack: 1,
  escape: 1,
  candy: 0,
  luckyegg: 0,
  scope: 1,
  xaccuracy: 1,
  focusband: 0,
  quickclaw: 0,
  assaultvest: 0,
  revive: 0,
  zoomlens: 0,
  oranberry: 0,
  amuletcoin: 0,
  repel: 0,
  expcharm: 0,
  silkscarf: 0,
  kingsrock: 0,
  leftovers: 0,
  metronome: 0,
  luckypunch: 0,
  bignugget: 0,
  starpiece: 0,
  choicespecs: 0,
};

export const createItemsSlice: StoreSlice<
  Pick<
    GameState,
    | "inventory"
    | "itemCooldowns"
    | "autoItems"
    | "luckyEggExpiresAt"
    | "luckyEggUsedWeek"
    | "focusBandUsedWeek"
    | "assaultVestUsedWeek"
    | "kingsRockUsedWeek"
    | "leftoversUsedWeek"
    | "metronomeUsedWeek"
    | "pokeEggs"
    | "grantItem"
    | "buyItem"
    | "useItem"
    | "toggleAutoItem"
    | "tryAutoFocusBand"
    | "tryAutoQuickClaw"
    | "tryAutoAssaultVest"
    | "tryAutoRevive"
    | "tryAutoOranBerry"
    | "tryAutoSilkScarf"
    | "tryAutoKingsRock"
    | "tryAutoLeftovers"
    | "tryAutoMetronome"
    | "grantPokeEgg"
    | "hatchPokeEgg"
  >
> = (set, get) => ({
  inventory: { ...defaultInventory },
  itemCooldowns: {},
  autoItems: {},
  luckyEggExpiresAt: 0,
  luckyEggUsedWeek: 0,
  focusBandUsedWeek: 0,
  assaultVestUsedWeek: 0,
  kingsRockUsedWeek: 0,
  leftoversUsedWeek: 0,
  metronomeUsedWeek: 0,
  pokeEggs: 0,

  tryAutoFocusBand: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.focusband ?? 0) <= 0) return false;
    if (s.autoItems.focusband === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.focusBandUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, focusband: (s.inventory.focusband ?? 0) - 1 },
      focusBandUsedWeek: start,
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoQuickClaw: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.quickclaw ?? 0) <= 0) return false;
    if (s.autoItems.quickclaw === false) return false;
    if (s.usedThisBattle.quickclaw) return false;
    set({
      inventory: { ...s.inventory, quickclaw: (s.inventory.quickclaw ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, quickclaw: true },
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoAssaultVest: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.assaultvest ?? 0) <= 0) return false;
    if (s.autoItems.assaultvest === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.assaultVestUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, assaultvest: (s.inventory.assaultvest ?? 0) - 1 },
      assaultVestUsedWeek: start,
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoRevive: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.revive ?? 0) <= 0) return false;
    if (s.autoItems.revive === false) return false;
    if (s.usedThisBattle.revive) return false;
    set({
      inventory: { ...s.inventory, revive: (s.inventory.revive ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, revive: true },
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoOranBerry: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.oranberry ?? 0) <= 0) return false;
    if (s.autoItems.oranberry === false) return false;
    if (s.usedThisBattle.oranberry) return false;
    set({
      inventory: { ...s.inventory, oranberry: (s.inventory.oranberry ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, oranberry: true },
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoSilkScarf: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.silkscarf ?? 0) <= 0) return false;
    if (s.autoItems.silkscarf === false) return false;
    if (s.usedThisBattle.silkscarf) return false;
    set({
      inventory: { ...s.inventory, silkscarf: (s.inventory.silkscarf ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, silkscarf: true },
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoKingsRock: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.kingsrock ?? 0) <= 0) return false;
    if (s.autoItems.kingsrock === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.kingsRockUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, kingsrock: (s.inventory.kingsrock ?? 0) - 1 },
      kingsRockUsedWeek: start,
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoLeftovers: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.leftovers ?? 0) <= 0) return false;
    if (s.autoItems.leftovers === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.leftoversUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, leftovers: (s.inventory.leftovers ?? 0) - 1 },
      leftoversUsedWeek: start,
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  tryAutoMetronome: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if ((s.inventory.metronome ?? 0) <= 0) return false;
    if (s.autoItems.metronome === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.metronomeUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, metronome: (s.inventory.metronome ?? 0) - 1 },
      metronomeUsedWeek: start,
      anyItemUsedThisBattle: true,
    });
    return true;
  },

  toggleAutoItem: (id) => {
    const s = get();
    const enabled = s.autoItems[id] !== false;
    set({ autoItems: { ...s.autoItems, [id]: !enabled } });
  },

  grantItem: (id, qty = 1) => {
    const s = get();
    set({ inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + qty } });
  },

  buyItem: (id, cost) => {
    const s = get();
    if (s.coins < cost) return false;
    set({
      coins: s.coins - cost,
      inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + 1 },
    });
    return true;
  },

  useItem: (id) => {
    const s = get();
    const have = s.inventory[id] ?? 0;
    if (have <= 0) return false;

    // Choice Specs demands exclusivity: once active, it must be the only
    // item used this battle, and it can't be activated if anything else
    // (auto or manual) already went off first.
    if (s.choiceSpecsActive && id !== "choicespecs") return false;
    if (id === "choicespecs" && s.anyItemUsedThisBattle) return false;

    // Auto-trigger items can't be used manually
    const AUTO_ONLY: ItemId[] = [
      "focusband",
      "quickclaw",
      "assaultvest",
      "revive",
      "oranberry",
      "silkscarf",
      "kingsrock",
      "leftovers",
      "metronome",
    ];
    if (AUTO_ONLY.includes(id)) return false;

    // Once-per-battle items
    const ONCE_PER_BATTLE: ItemId[] = [
      "potion",
      "superpotion",
      "maxpotion",
      "xattack",
      "scope",
      "xaccuracy",
      "escape",
      "zoomlens",
      "repel",
      "amuletcoin",
      "expcharm",
      "luckypunch",
      "starpiece",
      "choicespecs",
    ];
    if (ONCE_PER_BATTLE.includes(id) && s.usedThisBattle[id]) return false;

    // Lucky Egg: one activation per week (Monday 00:00 UTC reset)
    if (id === "luckyegg") {
      const { start } = getWeekRangeUtc();
      if (s.luckyEggUsedWeek === start) return false;
    }

    const nextInventory = { ...s.inventory, [id]: have - 1 };
    const nextUsed = ONCE_PER_BATTLE.includes(id)
      ? { ...s.usedThisBattle, [id]: true }
      : s.usedThisBattle;

    set({
      inventory: nextInventory,
      usedThisBattle: nextUsed,
      xAttackActive: id === "xattack" ? true : s.xAttackActive,
      amuletCoinActive: id === "amuletcoin" ? true : s.amuletCoinActive,
      expCharmActive: id === "expcharm" ? true : s.expCharmActive,
      luckyPunchActive: id === "luckypunch" ? true : s.luckyPunchActive,
      starPieceActive: id === "starpiece" ? true : s.starPieceActive,
      choiceSpecsActive: id === "choicespecs" ? true : s.choiceSpecsActive,
      anyItemUsedThisBattle: true,
      luckyEggExpiresAt: id === "luckyegg" ? Date.now() + 24 * 60 * 60 * 1000 : s.luckyEggExpiresAt,
      luckyEggUsedWeek: id === "luckyegg" ? getWeekRangeUtc().start : s.luckyEggUsedWeek,
    });

    if (id === "candy") {
      const p = get().pokemon;
      if (p) get().addTrainingPoints(p.id, 50);
    }
    if (id === "bignugget") {
      get().addCoins(1200);
    }
    return true;
  },

  grantPokeEgg: (n = 1) => set((s) => ({ pokeEggs: (s.pokeEggs ?? 0) + n })),
  hatchPokeEgg: () => {
    const s = get();
    if ((s.pokeEggs ?? 0) <= 0) return false;
    set({ pokeEggs: s.pokeEggs - 1 });
    return true;
  },
});
