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
    | "pokeEggs"
    | "grantItem"
    | "buyItem"
    | "useItem"
    | "toggleAutoItem"
    | "tryAutoFocusBand"
    | "tryAutoQuickClaw"
    | "tryAutoAssaultVest"
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
  pokeEggs: 0,

  tryAutoFocusBand: () => {
    const s = get();
    if ((s.inventory.focusband ?? 0) <= 0) return false;
    if (s.autoItems.focusband === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.focusBandUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, focusband: (s.inventory.focusband ?? 0) - 1 },
      focusBandUsedWeek: start,
    });
    return true;
  },

  tryAutoQuickClaw: () => {
    const s = get();
    if ((s.inventory.quickclaw ?? 0) <= 0) return false;
    if (s.autoItems.quickclaw === false) return false;
    if (s.usedThisBattle.quickclaw) return false;
    set({
      inventory: { ...s.inventory, quickclaw: (s.inventory.quickclaw ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, quickclaw: true },
    });
    return true;
  },

  tryAutoAssaultVest: () => {
    const s = get();
    if ((s.inventory.assaultvest ?? 0) <= 0) return false;
    if (s.autoItems.assaultvest === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.assaultVestUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, assaultvest: (s.inventory.assaultvest ?? 0) - 1 },
      assaultVestUsedWeek: start,
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

    // Auto-trigger items can't be used manually
    if (id === "focusband" || id === "quickclaw" || id === "assaultvest") return false;

    // Once-per-battle items
    const ONCE_PER_BATTLE: ItemId[] = [
      "potion",
      "superpotion",
      "maxpotion",
      "xattack",
      "scope",
      "xaccuracy",
      "escape",
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
      luckyEggExpiresAt: id === "luckyegg" ? Date.now() + 24 * 60 * 60 * 1000 : s.luckyEggExpiresAt,
      luckyEggUsedWeek: id === "luckyegg" ? getWeekRangeUtc().start : s.luckyEggUsedWeek,
    });

    if (id === "candy") {
      const p = get().pokemon;
      if (p) get().addTrainingPoints(p.id, 50);
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
