import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const kasibberry: ItemDef = {
  id: "kasibberry",
  category: "BERRY",
  name: "Kasib Berry",
  iconUrl: spriteIconUrl("kasib-berry"),
  desc: "Clouds a rival's guard — −1 Defense stage on the opponent for 3 questions. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: {
    target: "opponent",
    effect: { type: "statStage", stat: "defense", delta: -1, questions: 3 },
  },
};
