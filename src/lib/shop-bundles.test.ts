// A bundle is the one purchase that moves several inventory lines and the coin
// balance in a single set(). The rules worth pinning are the ones that are
// silent when broken: partial delivery, and a face value that drifts from the
// catalog it is supposed to be quoting.
import { describe, expect, it } from "vitest";
import { ITEMS } from "@/lib/game-data";
import {
  SHOP_BUNDLES,
  STARTER_BUNDLE,
  bundleFaceValue,
  bundleSavingPct,
  bundleUnitCount,
  itemTileTint,
} from "@/lib/shop-bundles";

describe("shop bundles", () => {
  it("only lists items that exist in the catalog", () => {
    // The whole point of storing ItemIds rather than copies. A typo here is
    // invisible at runtime: the item silently never lands in the bag.
    const ids = new Set(ITEMS.map((i) => i.id));
    for (const b of SHOP_BUNDLES) {
      for (const c of b.contents) expect(ids.has(c.id)).toBe(true);
    }
  });

  it("quotes a face value computed from live catalog prices", () => {
    const price = new Map(ITEMS.map((i) => [i.id, i.cost]));
    const expected = STARTER_BUNDLE.contents.reduce(
      (sum, c) => sum + (price.get(c.id) ?? 0) * c.qty,
      0,
    );
    expect(bundleFaceValue(STARTER_BUNDLE)).toBe(expected);
    // If this stops being true the card is advertising a saving that is not
    // real, which is worse than showing no saving at all.
    expect(bundleFaceValue(STARTER_BUNDLE)).toBeGreaterThan(STARTER_BUNDLE.cost);
  });

  it("prices every bundle as an actual discount", () => {
    for (const b of SHOP_BUNDLES) {
      const pct = bundleSavingPct(b);
      expect(pct).toBeGreaterThan(0);
      // A bundle cheaper than half its parts is a coin printer, not a deal.
      expect(pct).toBeLessThan(50);
    }
  });

  it("reports a saving of 0 rather than a negative when a bundle is not a deal", () => {
    expect(bundleSavingPct({ ...STARTER_BUNDLE, cost: 999_999 })).toBe(0);
  });

  it("counts every unit for the bag-space check", () => {
    // buyBundle refuses unless the WHOLE bundle fits; that check is only as
    // good as this count.
    expect(bundleUnitCount(STARTER_BUNDLE)).toBe(
      STARTER_BUNDLE.contents.reduce((n, c) => n + c.qty, 0),
    );
    expect(bundleUnitCount(STARTER_BUNDLE)).toBe(8);
  });

  it("gives an item the same tile tint every time", () => {
    // The tint is derived from the id precisely so no table has to be kept in
    // sync. That only holds if it is deterministic.
    for (const item of ITEMS.slice(0, 20)) {
      expect(itemTileTint(item.id)).toBe(itemTileTint(item.id));
    }
  });

  it("spreads tints across the palette rather than collapsing to one", () => {
    const seen = new Set(ITEMS.map((i) => itemTileTint(i.id)));
    // A hash that returned one colour would defeat the point of the grid
    // reading as several distinct things.
    expect(seen.size).toBeGreaterThan(3);
  });
});
