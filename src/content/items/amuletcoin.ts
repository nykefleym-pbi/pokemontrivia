import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const amuletcoin: ItemDef = {
  id: "amuletcoin",
  category: "UTILITY",
  name: "Amulet Coin",
  iconUrl: spriteIconUrl("amulet-coin"),
  desc: "2× coins earned this battle. Once per battle.",
  cost: 300,
};
