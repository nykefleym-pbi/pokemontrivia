import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const starpiece: ItemDef = {
  id: "starpiece",
  category: "UTILITY",
  name: "Star Piece",
  emoji: "",
  iconUrl: spriteIconUrl("star-piece"),
  desc: "+50% coins and XP earned this battle, if you win. Once per battle.",
  cost: 350,
};
