import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const zoomlens: ItemDef = {
  id: "zoomlens",
  category: "BATTLE",
  name: "Zoom Lens",
  iconUrl: spriteIconUrl("zoom-lens"),
  desc: "Narrows one question down to two choices (1 right, 1 wrong). Once per battle.",
  cost: 200,
};
