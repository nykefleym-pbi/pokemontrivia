import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const silkscarf: ItemDef = {
  id: "silkscarf",
  category: "BATTLE",
  name: "Silk Scarf",
  iconUrl: spriteIconUrl("silk-scarf"),
  desc: "Auto: your first correct answer deals +50% damage (+75% for a Normal-type partner). Once per battle.",
  cost: 250,
};
