import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const expcharm: ItemDef = {
  id: "expcharm",
  category: "UTILITY",
  name: "Exp. Share",
  iconUrl: spriteIconUrl("exp-share"),
  desc: "+25% XP earned this battle. Once per battle.",
  cost: 400,
};
