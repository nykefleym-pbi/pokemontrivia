import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const ganlonberry: ItemDef = {
  id: "ganlonberry",
  category: "BERRY",
  name: "Ganlon Berry",
  iconUrl: spriteIconUrl("ganlon-berry"),
  desc: "+1 Defense stage for 3 questions. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: {
    target: "self",
    effect: { type: "statStage", stat: "defense", delta: 1, questions: 3 },
  },
};
