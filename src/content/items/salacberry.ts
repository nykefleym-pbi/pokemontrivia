import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const salacberry: ItemDef = {
  id: "salacberry",
  category: "BERRY",
  name: "Salac Berry",
  iconUrl: spriteIconUrl("salac-berry"),
  // Reworked: was a self timer/Speed boost; now an opponent-facing Speed debuff
  // (no timer-based berries now that Speed is a real stat).
  desc: "Drags at your rival's reflexes — −1 Speed stage on the opponent for 3 questions. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: {
    target: "opponent",
    effect: { type: "statStage", stat: "speed", delta: -1, questions: 3 },
  },
};
