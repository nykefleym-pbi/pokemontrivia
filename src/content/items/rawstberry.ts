import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const rawstberry: ItemDef = {
  id: "rawstberry",
  category: "BERRY",
  name: "Rawst Berry",
  iconUrl: spriteIconUrl("rawst-berry"),
  desc: "Soothes Burn on yourself (removes its −15% and −1 Attack). (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "cureStatus", status: "burn" } },
};
