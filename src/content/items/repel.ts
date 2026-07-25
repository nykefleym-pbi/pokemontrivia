import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const repel: ItemDef = {
  id: "repel",
  category: "UTILITY",
  name: "Repel",
  iconUrl: spriteIconUrl("repel"),
  desc: "Skip one question with no HP or streak penalty. Once per battle.",
  cost: 400,
};
