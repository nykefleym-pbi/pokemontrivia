import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const kingsrock: ItemDef = {
  id: "kingsrock",
  category: "HEALING",
  name: "King's Rock",
  iconUrl: spriteIconUrl("kings-rock"),
  desc: "Auto: 50% chance to negate HP loss on a wrong answer, for the whole battle. Once per week.",
  cost: 2000,
  premium: true,
};
