import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const xattack: ItemDef = {
  id: "xattack",
  category: "BATTLE",
  name: "X Attack",
  iconUrl: spriteIconUrl("x-attack"),
  desc: "+20 damage on your next correct answer. Once per battle.",
  cost: 100,
};
