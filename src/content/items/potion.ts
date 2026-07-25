import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const potion: ItemDef = {
  id: "potion",
  category: "HEALING",
  name: "Potion",
  iconUrl: spriteIconUrl("potion"),
  desc: "Heals 30 HP. Once per battle.",
  cost: 100,
};
