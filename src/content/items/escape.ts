import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const escape: ItemDef = {
  id: "escape",
  category: "UTILITY",
  name: "Escape Rope",
  iconUrl: spriteIconUrl("escape-rope"),
  desc: "End the battle with no XP lost. Once per battle.",
  cost: 500,
};
