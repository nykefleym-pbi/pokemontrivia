import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const bignugget: ItemDef = {
  id: "bignugget",
  category: "PREMIUM",
  name: "Big Nugget",
  iconUrl: spriteIconUrl("big-nugget"),
  desc: "Requires a fully evolved partner. Converts all TP earned into coins (1:1) for 3 days. Usable anytime.",
  cost: 1500,
  premium: true,
};
