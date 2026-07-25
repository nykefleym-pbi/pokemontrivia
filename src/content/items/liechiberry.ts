import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const liechiberry: ItemDef = {
  id: "liechiberry",
  category: "BERRY",
  name: "Liechi Berry",
  iconUrl: spriteIconUrl("liechi-berry"),
  desc: "+1 Attack stage for 3 questions. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "statStage", stat: "attack", delta: 1, questions: 3 } },
};
