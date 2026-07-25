import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const candy: ItemDef = {
  id: "candy",
  category: "PREMIUM",
  name: "Rare Candy",
  iconUrl: spriteIconUrl("rare-candy"),
  desc: "+50 TP to your partner, instantly. Usable anytime.",
  cost: 2000,
  premium: true,
};
