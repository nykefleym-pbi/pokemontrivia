import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const chopleberry: ItemDef = {
  id: "chopleberry",
  category: "BERRY",
  name: "Chople Berry",
  iconUrl: spriteIconUrl("chople-berry"),
  desc: "Scrambles a rival's senses — inflicts Confusion on the opponent for 2 questions. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: {
    target: "opponent",
    effect: { type: "inflictStatus", status: "confused", questions: 2 },
  },
};
