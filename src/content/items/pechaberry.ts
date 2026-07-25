import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const pechaberry: ItemDef = {
  id: "pechaberry",
  category: "BERRY",
  name: "Pecha Berry",
  iconUrl: spriteIconUrl("pecha-berry"),
  desc: "Neutralises Poison / Badly Poisoned on yourself. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "cureStatus", status: "poisoned" } },
};
