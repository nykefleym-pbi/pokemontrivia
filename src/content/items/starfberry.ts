import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const starfberry: ItemDef = {
  id: "starfberry",
  category: "BERRY",
  name: "Starf Berry",
  iconUrl: spriteIconUrl("starf-berry"),
  desc: "Randomly unleashes power — +2 to a random stat (Atk/Def/Spd/Crit) for 3 questions. (PvP only.)",
  cost: 0,
  premium: true,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "randomStatStage", delta: 2, questions: 3 } },
};
