import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const quickclaw: ItemDef = {
  id: "quickclaw",
  category: "BATTLE",
  name: "Quick Claw",
  iconUrl: spriteIconUrl("quick-claw"),
  desc: "Auto: when the timer drops below 5s, resets it to 20s. Once per battle.",
  cost: 1000,
};
