import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const colburberry: ItemDef = {
  id: "colburberry",
  category: "BERRY",
  name: "Colbur Berry",
  iconUrl: spriteIconUrl("colbur-berry"),
  // Reworked: was a −3s opponent timer (Paralysis-lite); now a stronger
  // opponent Speed-stage debuff (no timer-based berries).
  desc: "Drags hard at a rival's clock — −2 Speed stage on the opponent for 3 questions. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: {
    target: "opponent",
    effect: { type: "statStage", stat: "speed", delta: -2, questions: 3 },
  },
};
