import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const assaultvest: ItemDef = {
  id: "assaultvest",
  category: "BATTLE",
  name: "Assault Vest",
  iconUrl: spriteIconUrl("assault-vest"),
  desc: "Auto: halves damage in battles where the foe is super-effective against you. Once per week.",
  cost: 2000,
  premium: true,
};
