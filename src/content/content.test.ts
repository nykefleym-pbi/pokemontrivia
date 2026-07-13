import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, ITEM_LIST } from "./items";
import { STATUS_BY_ID, STATUS_LIST, STATUS_META } from "./statuses";
import { ItemDefSchema, StatusDefSchema } from "./schemas";
import { ITEMS, STATUS_META as LEGACY_STATUS_META } from "@/lib/game-data";
import { CATEGORY_OF } from "@/lib/item-categories";

describe("item registry", () => {
  it("every definition file passes its schema", () => {
    for (const item of ITEM_LIST) {
      const parsed = ItemDefSchema.safeParse(item);
      expect(parsed.success, `${item.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("ids are unique and each file's export matches its id", () => {
    const ids = ITEM_LIST.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, def] of Object.entries(ITEM_BY_ID)) expect(def.id).toBe(id);
  });

  it("registry is the single source for the legacy ITEMS export", () => {
    expect(ITEMS.length).toBe(ITEM_LIST.length);
    ITEMS.forEach((item, i) => expect(item).toBe(ITEM_LIST[i]));
  });

  it("CATEGORY_OF derives from each item's own category field", () => {
    for (const item of ITEM_LIST) expect(CATEGORY_OF[item.id]).toBe(item.category);
  });

  it("berries are Nearby-Battle-only and free (drop-only)", () => {
    for (const item of ITEM_LIST.filter((i) => i.category === "BERRY")) {
      expect(item.pvpOnly, item.id).toBe(true);
      expect(item.cost, item.id).toBe(0);
    }
  });
});

describe("status registry", () => {
  it("every definition file passes its schema", () => {
    for (const s of STATUS_LIST) {
      const parsed = StatusDefSchema.safeParse(s);
      expect(parsed.success, `${s.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("each file's export matches its id and describe() says something", () => {
    for (const [id, def] of Object.entries(STATUS_BY_ID)) {
      expect(def.id).toBe(id);
      expect(def.describe().length).toBeGreaterThan(0);
    }
  });

  it("registry is the single source for the legacy STATUS_META export", () => {
    expect(LEGACY_STATUS_META).toBe(STATUS_META);
  });
});
