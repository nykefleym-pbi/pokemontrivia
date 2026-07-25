import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const luckyegg: ItemDef = {
  id: "luckyegg",
  category: "PREMIUM",
  name: "Lucky Egg",
  iconUrl: spriteIconUrl("lucky-egg"),
  desc: "2× XP for 24 hours. Once per week. Usable anytime.",
  cost: 2000,
  premium: true,
};
