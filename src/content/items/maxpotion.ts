import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const maxpotion: ItemDef = {
  id: "maxpotion",
  category: "HEALING",
  name: "Max Potion",
  iconUrl: spriteIconUrl("max-potion"),
  desc: "Fully restores HP. Once per battle.",
  cost: 1000,
};
