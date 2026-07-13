import { describe, expect, it } from "vitest";
import { ITEM_BY_ID, ITEM_LIST } from "./items";
import { STATUS_BY_ID, STATUS_LIST, STATUS_META } from "./statuses";
import { SIGNATURE_BY_ID, SIGNATURE_BY_POKEMON_ID, SIGNATURE_LIST } from "./abilities/signature";
import { ROLLED_BY_ID, ROLLED_LIST, ROLLED_SETS } from "./abilities/rolled";
import { TYPE_ABILITY_BY_ID, TYPE_ABILITY_LIST } from "./abilities/type";
import {
  ItemDefSchema,
  StatusDefSchema,
  SignatureDefSchema,
  RolledAbilityDefSchema,
  TypeAbilityDefSchema,
} from "./schemas";
import { ITEMS, STATUS_META as LEGACY_STATUS_META } from "@/lib/game-data";
import { CATEGORY_OF } from "@/lib/item-categories";
import { ALL_LEGENDARY_MYTHICAL_IDS } from "@/lib/legendary-data";
import { SIGNATURE_ABILITIES } from "@/lib/signature-abilities";
import { ABILITY_SETS } from "@/lib/abilities";
import { TABLE as TYPE_ABILITY_TABLE } from "@/lib/pvp-type-abilities";

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

describe("signature ability registry", () => {
  it("has exactly one generated file per roster id", () => {
    expect(SIGNATURE_LIST.length).toBe(ALL_LEGENDARY_MYTHICAL_IDS.length);
    expect(SIGNATURE_LIST.length).toBe(104);
  });

  it("every definition file passes its schema", () => {
    for (const s of SIGNATURE_LIST) {
      const parsed = SignatureDefSchema.safeParse(s);
      expect(parsed.success, `${s.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("ids are unique and each file wraps the catalog row it claims to", () => {
    const ids = SIGNATURE_LIST.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pokemonId of ALL_LEGENDARY_MYTHICAL_IDS) {
      const def = SIGNATURE_BY_POKEMON_ID[pokemonId];
      const row = SIGNATURE_ABILITIES[pokemonId];
      expect(def, `missing generated file for roster id ${pokemonId}`).toBeDefined();
      expect(def.id).toBe(row.internalKey);
      expect(def.engine).toBe(row.engine);
    }
  });

  it("each file's export matches its id and describe() says something", () => {
    for (const [id, def] of Object.entries(SIGNATURE_BY_ID)) {
      expect(def.id).toBe(id);
      expect(def.describe().length).toBeGreaterThan(0);
    }
  });
});

describe("rolled ability registry", () => {
  it("every definition file passes its schema", () => {
    for (const a of ROLLED_LIST) {
      const parsed = RolledAbilityDefSchema.safeParse(a);
      expect(parsed.success, `${a.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("ids are unique and each file's export matches its id", () => {
    const ids = ROLLED_LIST.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [id, def] of Object.entries(ROLLED_BY_ID)) expect(def.id).toBe(id);
  });

  it("every type rolls exactly 3 abilities, in matching slot order", () => {
    for (const [type, set] of Object.entries(ROLLED_SETS)) {
      expect(set.length, type).toBe(3);
      set.forEach((a, slot) => {
        expect(a.type, a.id).toBe(type);
        expect(a.slot, a.id).toBe(slot);
      });
    }
  });

  it("registry is the single source for the legacy ABILITY_SETS export", () => {
    expect(ABILITY_SETS).toBe(ROLLED_SETS);
  });
});

describe("type ability (PvP) registry", () => {
  it("has exactly one generated file per rollable ability, matching the rolled registry", () => {
    expect(TYPE_ABILITY_LIST.length).toBe(ROLLED_LIST.length);
    expect(new Set(TYPE_ABILITY_LIST.map((a) => a.id))).toEqual(new Set(ROLLED_LIST.map((a) => a.id)));
  });

  it("every definition file passes its schema", () => {
    for (const a of TYPE_ABILITY_LIST) {
      const parsed = TypeAbilityDefSchema.safeParse(a);
      expect(parsed.success, `${a.id}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("each file wraps the TABLE entry it claims to, by reference", () => {
    for (const [id, def] of Object.entries(TYPE_ABILITY_BY_ID)) {
      expect(def.id).toBe(id);
      expect(def.pvp).toBe(TYPE_ABILITY_TABLE[id as keyof typeof TYPE_ABILITY_TABLE]);
    }
  });
});
