import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const luckypunch: ItemDef = {
  id: "luckypunch",
  category: "UTILITY",
  name: "Lucky Punch",
  iconUrl: spriteIconUrl("lucky-punch"),
  desc: "Double or nothing: 50% chance to double this battle's XP and coins, 50% chance to lose them. Once per battle.",
  cost: 200,
};
