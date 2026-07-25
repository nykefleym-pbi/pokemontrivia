import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const revive: ItemDef = {
  id: "revive",
  category: "HEALING",
  name: "Revive",
  iconUrl: spriteIconUrl("revive"),
  desc: "Auto: survive a knockout at 25% HP. Once per battle.",
  cost: 1000,
};
