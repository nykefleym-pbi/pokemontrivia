import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const lumberry: ItemDef = {
  id: "lumberry",
  category: "BERRY",
  name: "Lum Berry",
  iconUrl: spriteIconUrl("lum-berry"),
  desc: "Cures any one status on yourself and grants 1 question of status immunity. (PvP only.)",
  cost: 0,
  premium: true,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "cureStatus", status: "any" } },
};
