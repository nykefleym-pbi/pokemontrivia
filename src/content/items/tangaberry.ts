import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const tangaberry: ItemDef = {
  id: "tangaberry",
  category: "BERRY",
  name: "Tanga Berry",
  iconUrl: spriteIconUrl("tanga-berry"),
  desc: "Snares a rival — −1 Attack stage on the opponent for 3 questions. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: {
    target: "opponent",
    effect: { type: "statStage", stat: "attack", delta: -1, questions: 3 },
  },
};
