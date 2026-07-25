import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const chestoberry: ItemDef = {
  id: "chestoberry",
  category: "BERRY",
  name: "Chesto Berry",
  iconUrl: spriteIconUrl("chesto-berry"),
  desc: "Shakes off Sleep on yourself. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "cureStatus", status: "sleep" } },
};
