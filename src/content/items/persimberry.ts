import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const persimberry: ItemDef = {
  id: "persimberry",
  category: "BERRY",
  name: "Persim Berry",
  iconUrl: spriteIconUrl("persim-berry"),
  desc: "Restores focus — cures Confusion on yourself. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "cureStatus", status: "confused" } },
};
