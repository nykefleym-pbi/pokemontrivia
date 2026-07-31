import { ITEMS, type ItemId } from "@/lib/game-data";

/**
 * Multi-item shop bundles.
 *
 * A bundle is one purchase that grants several items at a discount off their
 * combined shelf price. It exists because the catalog sells one thing at a
 * time, which makes a new trainer's first shop visit a series of small
 * decisions with no obvious starting point — a bundle IS the obvious starting
 * point.
 *
 * Contents are ItemIds rather than embedded copies, so a bundle can never
 * drift from the catalog: change an item's price and `bundleFaceValue`
 * recomputes, change its art and the bundle's art follows.
 */
export interface ShopBundle {
  id: string;
  name: string;
  tagline: string;
  /** Corner ribbon, e.g. "BEST VALUE". */
  ribbon: string;
  /** What one purchase grants. */
  contents: readonly { id: ItemId; qty: number }[];
  /** Bonus coins granted alongside the items. Netted against `cost`. */
  coins: number;
  /** What the player pays. */
  cost: number;
}

/**
 * The opening bundle.
 *
 * Priced at 1,400 against a 2,100 face value — a third off. That ratio is the
 * point of the number: deep enough to read as a deal at a glance, shallow
 * enough that it does not undercut buying potions normally, which is the loop
 * the shop actually runs on. At roughly 150 coins a battle it is about nine
 * battles of saving, so it is a goal for a new trainer rather than an
 * impulse — and it is deliberately all consumables, so it accelerates the
 * early game without handing out anything permanent.
 *
 * Owner: this is a STARTING value, meant to be tuned once there is real
 * purchase data. The two levers are `cost` (the discount depth) and the
 * Revive (the single most expensive line at 1,000).
 */
export const STARTER_BUNDLE: ShopBundle = {
  id: "starter-supply",
  name: "Starter Supply Bundle",
  tagline: "Everything you need to begin your journey!",
  ribbon: "BEST VALUE",
  contents: [
    { id: "potion", qty: 5 },
    { id: "superpotion", qty: 2 },
    { id: "revive", qty: 1 },
  ],
  coins: 0,
  cost: 1400,
};

export const SHOP_BUNDLES: readonly ShopBundle[] = [STARTER_BUNDLE];

/** Combined shelf price of a bundle's contents — the "was" number. */
export function bundleFaceValue(bundle: ShopBundle): number {
  const price = new Map(ITEMS.map((i) => [i.id, i.cost]));
  const items = bundle.contents.reduce((sum, c) => sum + (price.get(c.id) ?? 0) * c.qty, 0);
  return items + bundle.coins;
}

/** Whole-percent saving off face value. 0 when a bundle is not a discount. */
export function bundleSavingPct(bundle: ShopBundle): number {
  const face = bundleFaceValue(bundle);
  if (face <= 0 || bundle.cost >= face) return 0;
  return Math.round(((face - bundle.cost) / face) * 100);
}

/** How many bag units one purchase consumes, for the space check. */
export function bundleUnitCount(bundle: ShopBundle): number {
  return bundle.contents.reduce((sum, c) => sum + c.qty, 0);
}

/**
 * Per-item tile tints for the catalog grid.
 *
 * Assigned by a stable hash of the item id rather than by category, which
 * would paint a whole tab one colour and lose the effect entirely — the tints
 * are there so a grid of four reads as four things, not as one block. Hashing
 * the id keeps an item's colour fixed forever without a hand-maintained table
 * that a new item would silently miss.
 *
 * Every entry is a pale wash: these sit behind pixel-art sprites with dark
 * outlines, so saturation here fights the artwork.
 */
const TILE_TINTS = [
  "oklch(0.95 0.05 145)", // mint
  "oklch(0.95 0.05 250)", // periwinkle
  "oklch(0.95 0.06 85)", // butter
  "oklch(0.95 0.05 25)", // blush
  "oklch(0.95 0.05 300)", // lilac
  "oklch(0.95 0.05 195)", // ice
] as const;

export function itemTileTint(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_TINTS[h % TILE_TINTS.length];
}
