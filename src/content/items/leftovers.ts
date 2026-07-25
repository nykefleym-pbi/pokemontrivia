import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const leftovers: ItemDef = {
  id: "leftovers",
  category: "HEALING",
  name: "Leftovers",
  iconUrl: spriteIconUrl("leftovers"),
  desc: "Auto: heals 5 HP after every correct answer, for the whole battle. Once per week.",
  cost: 2000,
  premium: true,
};
