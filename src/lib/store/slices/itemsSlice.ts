import type { GameState } from "@/lib/store/types";
import type { StoreSlice } from "@/lib/store/slice";
import type { ItemId } from "@/lib/game-data";
import { getWeekRangeUtc, EGG_HATCH_REQUIRED } from "@/lib/game-data";
import { ITEM_BY_ID } from "@/content/items";
import { SHOP_BUNDLES } from "@/lib/shop-bundles";
import { canEvolve } from "@/lib/pokemon-data";

export const BIG_NUGGET_DURATION_DAYS = 3;
/** Total items (manual + auto-triggered combined) allowed per battle. */
export const MAX_ITEMS_PER_BATTLE = 3;

/* ---------------------------------------------------------------------------
 * Bag capacity
 *
 * The bag counts UNITS, not slots, because `inventory` is a quantity map
 * (Record<ItemId, number>) rather than a list — so a cap on total units needs
 * no migration and no new shape. `BAG_CAPACITY_BASE` is deliberately above the
 * high-water mark of any real save at the time it shipped (45 units): a cap that
 * binds on day one reads as a bug rather than as a design.
 *
 * Berries are exempt. They are `pvpOnly` drop-only rewards handed out DURING a
 * Nearby Battle, where there is no shop and no sheet to resolve an overflow, and
 * their `cost` is 0 so a 50% refund would be worth nothing anyway. They neither
 * consume capacity nor ever land in the overflow queue.
 *
 * These names are kept clear of MAX_ITEMS_PER_BATTLE above, which is a different
 * cap (items per battle) that already has a duplicate declaration in
 * engine/turn.ts.
 * ------------------------------------------------------------------------- */
export const BAG_CAPACITY_BASE = 60;
export const BAG_UPGRADE_STEP = 10;
export const BAG_UPGRADE_MAX = 6;
export const BAG_UPGRADE_BASE_PRICE = 500;
/** Distinct item ids the overflow queue will hold. Bounded so a player cannot
 *  treat "pending" as a second, unlimited bag. */
export const PENDING_OVERFLOW_MAX_ENTRIES = 20;

/** Berries bypass the cap entirely — see the block comment above. */
export function isBagExempt(id: ItemId): boolean {
  const def = ITEM_BY_ID[id];
  return !!def && (!!def.isBerry || !!def.pvpOnly);
}

/** Units currently held against the cap (exempt items excluded). */
export function bagUnitsUsed(inventory: Record<ItemId, number>): number {
  let n = 0;
  for (const [id, qty] of Object.entries(inventory) as [ItemId, number][]) {
    if (!qty || qty <= 0) continue;
    if (isBagExempt(id)) continue;
    n += qty;
  }
  return n;
}

export function bagCapacity(bagUpgrades: number): number {
  const steps = Math.max(0, Math.min(bagUpgrades, BAG_UPGRADE_MAX));
  return BAG_CAPACITY_BASE + steps * BAG_UPGRADE_STEP;
}

/** Escalating price, so expanding stays a real decision rather than a reflex.
 *  Returns null once the ceiling is reached. */
export function bagUpgradePrice(bagUpgrades: number): number | null {
  if (bagUpgrades >= BAG_UPGRADE_MAX) return null;
  return BAG_UPGRADE_BASE_PRICE * (bagUpgrades + 1);
}

/** Coins handed back for abandoning an overflowing reward: half the shop price,
 *  rounded down, per unit. */
export function overflowRefundValue(id: ItemId, qty: number): number {
  const cost = ITEM_BY_ID[id]?.cost ?? 0;
  return Math.floor(cost / 2) * Math.max(0, qty);
}

function spaceLeft(s: Pick<GameState, "inventory" | "bagUpgrades">): number {
  return Math.max(0, bagCapacity(s.bagUpgrades) - bagUnitsUsed(s.inventory));
}

/** Merge into an existing entry for the same id rather than appending, so the
 *  queue stays short and the resolution sheet has one row per item. */
function queueOverflow(
  queue: GameState["pendingBagOverflow"],
  id: ItemId,
  qty: number,
): GameState["pendingBagOverflow"] {
  const at = queue.findIndex((e) => e.id === id);
  if (at >= 0) {
    const next = queue.slice();
    next[at] = { id, qty: next[at].qty + qty };
    return next;
  }
  if (queue.length >= PENDING_OVERFLOW_MAX_ENTRIES) return queue;
  return [...queue, { id, qty }];
}

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
  // Nearby-Battle PvP berries — never granted in Solo; drop-only in Nearby Battle.
  cheriberry: 0,
  chestoberry: 0,
  pechaberry: 0,
  rawstberry: 0,
  persimberry: 0,
  lumberry: 0,
  liechiberry: 0,
  ganlonberry: 0,
  salacberry: 0,
  starfberry: 0,
  tangaberry: 0,
  kasibberry: 0,
  chopleberry: 0,
  colburberry: 0,
};

export const createItemsSlice: StoreSlice<
  Pick<
    GameState,
    | "inventory"
    | "bagUpgrades"
    | "pendingBagOverflow"
    | "discardItem"
    | "claimOverflow"
    | "refundOverflow"
    | "forfeitOverflow"
    | "purchaseBagUpgrade"
    | "itemCooldowns"
    | "autoItems"
    | "luckyEggExpiresAt"
    | "bigNuggetExpiresAt"
    | "luckyEggUsedWeek"
    | "focusBandUsedWeek"
    | "assaultVestUsedWeek"
    | "kingsRockUsedWeek"
    | "leftoversUsedWeek"
    | "metronomeUsedWeek"
    | "pokeEggs"
    | "grantItem"
    | "buyItem"
    | "buyBundle"
    | "featuredDealLastPurchase"
    | "purchasedBundleIds"
    | "markFeaturedDealPurchased"
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
  bagUpgrades: 0,
  pendingBagOverflow: [],
  featuredDealLastPurchase: null,
  purchasedBundleIds: [],
  itemCooldowns: {},
  autoItems: {},
  luckyEggExpiresAt: 0,
  bigNuggetExpiresAt: 0,
  luckyEggUsedWeek: 0,
  focusBandUsedWeek: 0,
  assaultVestUsedWeek: 0,
  kingsRockUsedWeek: 0,
  leftoversUsedWeek: 0,
  metronomeUsedWeek: 0,
  pokeEggs: [],

  tryAutoFocusBand: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.focusband ?? 0) <= 0) return false;
    if (s.autoItems.focusband === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.focusBandUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, focusband: (s.inventory.focusband ?? 0) - 1 },
      focusBandUsedWeek: start,
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoQuickClaw: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.quickclaw ?? 0) <= 0) return false;
    if (s.autoItems.quickclaw === false) return false;
    if (s.usedThisBattle.quickclaw) return false;
    set({
      inventory: { ...s.inventory, quickclaw: (s.inventory.quickclaw ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, quickclaw: true },
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoAssaultVest: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.assaultvest ?? 0) <= 0) return false;
    if (s.autoItems.assaultvest === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.assaultVestUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, assaultvest: (s.inventory.assaultvest ?? 0) - 1 },
      assaultVestUsedWeek: start,
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoRevive: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.revive ?? 0) <= 0) return false;
    if (s.autoItems.revive === false) return false;
    if (s.usedThisBattle.revive) return false;
    set({
      inventory: { ...s.inventory, revive: (s.inventory.revive ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, revive: true },
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoOranBerry: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.oranberry ?? 0) <= 0) return false;
    if (s.autoItems.oranberry === false) return false;
    if (s.usedThisBattle.oranberry) return false;
    set({
      inventory: { ...s.inventory, oranberry: (s.inventory.oranberry ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, oranberry: true },
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoSilkScarf: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.silkscarf ?? 0) <= 0) return false;
    if (s.autoItems.silkscarf === false) return false;
    if (s.usedThisBattle.silkscarf) return false;
    set({
      inventory: { ...s.inventory, silkscarf: (s.inventory.silkscarf ?? 0) - 1 },
      usedThisBattle: { ...s.usedThisBattle, silkscarf: true },
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoKingsRock: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.kingsrock ?? 0) <= 0) return false;
    if (s.autoItems.kingsrock === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.kingsRockUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, kingsrock: (s.inventory.kingsrock ?? 0) - 1 },
      kingsRockUsedWeek: start,
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoLeftovers: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.leftovers ?? 0) <= 0) return false;
    if (s.autoItems.leftovers === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.leftoversUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, leftovers: (s.inventory.leftovers ?? 0) - 1 },
      leftoversUsedWeek: start,
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
    });
    return true;
  },

  tryAutoMetronome: () => {
    const s = get();
    if (s.choiceSpecsActive) return false;
    if (s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;
    if ((s.inventory.metronome ?? 0) <= 0) return false;
    if (s.autoItems.metronome === false) return false;
    const { start } = getWeekRangeUtc();
    if (s.metronomeUsedWeek === start) return false;
    set({
      inventory: { ...s.inventory, metronome: (s.inventory.metronome ?? 0) - 1 },
      metronomeUsedWeek: start,
      anyItemUsedThisBattle: true,
      itemsUsedThisBattleCount: s.itemsUsedThisBattleCount + 1,
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

    // A NEGATIVE qty is how items get SPENT through this same action — Mega Raid
    // calls grantItem(id, -1) to consume a potion/revive/escape. Gating on bag
    // space here would make a full bag unable to spend anything, so the cap only
    // ever applies to a positive delta. Zero is a no-op either way.
    if (qty <= 0) {
      if (qty === 0) return;
      set({ inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + qty } });
      return;
    }

    // Berries never count and never queue.
    if (isBagExempt(id)) {
      set({ inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + qty } });
      return;
    }

    const fits = Math.min(qty, spaceLeft(s));
    const overflow = qty - fits;
    set({
      inventory: fits > 0 ? { ...s.inventory, [id]: (s.inventory[id] ?? 0) + fits } : s.inventory,
      // What did not fit is HELD rather than dropped. The player resolves it
      // (move to bag / 50% refund / forfeit) and keeps being offered that choice
      // for as long as there is no room — a reward is never silently lost.
      pendingBagOverflow:
        overflow > 0 ? queueOverflow(s.pendingBagOverflow, id, overflow) : s.pendingBagOverflow,
    });
  },

  buyItem: (id, cost) => {
    const s = get();
    if (s.coins < cost) return false;
    // Space is checked BEFORE the coins move. The other order charges for an item
    // the bag cannot hold.
    if (!isBagExempt(id) && spaceLeft(s) < 1) return false;
    set({
      coins: s.coins - cost,
      inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + 1 },
    });
    return true;
  },

  buyBundle: (bundleId) => {
    const s = get();
    const bundle = SHOP_BUNDLES.find((b) => b.id === bundleId);
    if (!bundle) return false;
    if (s.coins < bundle.cost) return false;
    // Space for the WHOLE bundle, checked before the coins move — same order
    // as buyItem, for the same reason. A bundle that half-fits must not
    // charge; partial delivery would be worse than a clean refusal, since the
    // player cannot tell which lines they were shorted.
    const needed = bundle.contents
      .filter((c) => !isBagExempt(c.id))
      .reduce((sum, c) => sum + c.qty, 0);
    if (spaceLeft(s) < needed) return false;
    const inventory = { ...s.inventory };
    for (const c of bundle.contents) inventory[c.id] = (inventory[c.id] ?? 0) + c.qty;
    set({
      coins: s.coins - bundle.cost + bundle.coins,
      inventory,
      // Retire the offer in the SAME set() that charges for it. Two writes
      // would leave a window where a double tap buys it twice.
      purchasedBundleIds: [...s.purchasedBundleIds, bundle.id],
    });
    return true;
  },

  discardItem: (id, qty = 1) => {
    const s = get();
    const have = s.inventory[id] ?? 0;
    if (have <= 0 || qty <= 0) return false;
    // No coins back. Discarding is how you make room, not a way to sell — a
    // refund here would let a player buy at full price and cash out at half.
    set({ inventory: { ...s.inventory, [id]: Math.max(0, have - qty) } });
    return true;
  },

  claimOverflow: (id) => {
    const s = get();
    const entry = s.pendingBagOverflow.find((e) => e.id === id);
    if (!entry) return false;
    const fits = Math.min(entry.qty, spaceLeft(s));
    if (fits <= 0) return false;
    const left = entry.qty - fits;
    set({
      inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + fits },
      pendingBagOverflow:
        left > 0
          ? s.pendingBagOverflow.map((e) => (e.id === id ? { id, qty: left } : e))
          : s.pendingBagOverflow.filter((e) => e.id !== id),
    });
    return true;
  },

  refundOverflow: (id) => {
    const s = get();
    const entry = s.pendingBagOverflow.find((e) => e.id === id);
    if (!entry) return 0;
    const coins = overflowRefundValue(id, entry.qty);
    set({
      coins: s.coins + coins,
      pendingBagOverflow: s.pendingBagOverflow.filter((e) => e.id !== id),
    });
    return coins;
  },

  forfeitOverflow: (id) => {
    const s = get();
    if (!s.pendingBagOverflow.some((e) => e.id === id)) return false;
    set({ pendingBagOverflow: s.pendingBagOverflow.filter((e) => e.id !== id) });
    return true;
  },

  purchaseBagUpgrade: () => {
    const s = get();
    const price = bagUpgradePrice(s.bagUpgrades);
    if (price === null || s.coins < price) return false;
    const bagUpgrades = s.bagUpgrades + 1;

    // Draw whatever the new room can hold straight out of the queue: the player
    // just paid for space in order to keep these, so making them tap again per
    // row would be pure ceremony.
    let inventory = { ...s.inventory };
    let room = Math.max(0, bagCapacity(bagUpgrades) - bagUnitsUsed(inventory));
    const pending: GameState["pendingBagOverflow"] = [];
    for (const e of s.pendingBagOverflow) {
      const fits = Math.min(e.qty, room);
      if (fits > 0) {
        inventory = { ...inventory, [e.id]: (inventory[e.id] ?? 0) + fits };
        room -= fits;
      }
      if (e.qty - fits > 0) pending.push({ id: e.id, qty: e.qty - fits });
    }

    set({ coins: s.coins - price, bagUpgrades, inventory, pendingBagOverflow: pending });
    return true;
  },

  markFeaturedDealPurchased: () =>
    set({ featuredDealLastPurchase: new Date().toISOString().slice(0, 10) }),

  useItem: (id) => {
    const s = get();
    const have = s.inventory[id] ?? 0;
    if (have <= 0) return false;

    // Choice Specs demands exclusivity: once active, it must be the only
    // item used this battle, and it can't be activated if anything else
    // (auto or manual) already went off first.
    if (s.choiceSpecsActive && id !== "choicespecs") return false;
    if (id === "choicespecs" && s.anyItemUsedThisBattle) return false;

    // At most MAX_ITEMS_PER_BATTLE items (manual + auto combined) per battle.
    if (s.inBattle && s.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return false;

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

    // Big Nugget requires a fully evolved partner to be usable at all.
    if (id === "bignugget" && canEvolve(s.pokemon)) return false;

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
      itemsUsedThisBattleCount: s.inBattle
        ? s.itemsUsedThisBattleCount + 1
        : s.itemsUsedThisBattleCount,
      luckyEggExpiresAt: id === "luckyegg" ? Date.now() + 24 * 60 * 60 * 1000 : s.luckyEggExpiresAt,
      luckyEggUsedWeek: id === "luckyegg" ? getWeekRangeUtc().start : s.luckyEggUsedWeek,
      bigNuggetExpiresAt:
        id === "bignugget"
          ? Date.now() + BIG_NUGGET_DURATION_DAYS * 24 * 60 * 60 * 1000
          : s.bigNuggetExpiresAt,
    });

    if (id === "candy") {
      const p = get().pokemon;
      if (p) get().addTrainingPoints(p.id, 50);
    }
    return true;
  },

  grantPokeEgg: (n = 1) =>
    set((s) => ({
      pokeEggs: [
        ...s.pokeEggs,
        ...Array.from({ length: n }, (_, i) => ({
          id: `${Date.now()}-${s.pokeEggs.length + i}-${Math.random().toString(36).slice(2, 8)}`,
          grantedAt: Date.now(),
          progress: 0,
          required: EGG_HATCH_REQUIRED,
        })),
      ],
    })),
  hatchPokeEgg: (eggId) => {
    const s = get();
    const egg = s.pokeEggs.find((e) => e.id === eggId);
    if (!egg || egg.progress < egg.required) return false;
    set({ pokeEggs: s.pokeEggs.filter((e) => e.id !== eggId) });
    return true;
  },
});
