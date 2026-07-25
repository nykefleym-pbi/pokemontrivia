import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const metronome: ItemDef = {
  id: "metronome",
  category: "BATTLE",
  name: "Metronome",
  iconUrl: spriteIconUrl("metronome"),
  desc: "Auto: streak multiplier locked at max (3.0×) for the whole battle. Once per week.",
  cost: 2500,
  premium: true,
};
