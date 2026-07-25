import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const superpotion: ItemDef = {
  id: "superpotion",
  category: "HEALING",
  name: "Super Potion",
  iconUrl: spriteIconUrl("super-potion"),
  desc: "Heals 60 HP. Once per battle.",
  cost: 300,
};
