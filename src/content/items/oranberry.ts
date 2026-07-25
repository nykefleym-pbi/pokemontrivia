import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const oranberry: ItemDef = {
  id: "oranberry",
  category: "HEALING",
  name: "Oran Berry",
  iconUrl: spriteIconUrl("oran-berry"),
  desc: "Auto: heals 15 HP the instant HP first drops below 30%. Once per battle.",
  cost: 600,
};
