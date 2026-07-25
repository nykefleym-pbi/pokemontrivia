import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const choicespecs: ItemDef = {
  id: "choicespecs",
  category: "UTILITY",
  name: "Choice Specs",
  iconUrl: spriteIconUrl("choice-specs"),
  desc: "Double this battle's coins, XP, and TP — but it must be the only item you use this battle. Can't be used if another item was used first, and locks out every other item afterward. Once per battle.",
  cost: 800,
};
