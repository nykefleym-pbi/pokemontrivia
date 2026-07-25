import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const scope: ItemDef = {
  id: "scope",
  category: "BATTLE",
  name: "Scope Lens",
  iconUrl: spriteIconUrl("scope-lens"),
  desc: "Removes one wrong answer. Once per battle.",
  cost: 100,
};
