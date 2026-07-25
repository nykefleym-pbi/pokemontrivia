import type { ItemDef } from "./item-def";
import { dreamWorldIconUrl } from "./icon";

export const xaccuracy: ItemDef = {
  id: "xaccuracy",
  category: "BATTLE",
  name: "X Accuracy",
  iconUrl: dreamWorldIconUrl("x-accuracy"),
  desc: "Reveals the correct answer. Once per battle.",
  cost: 500,
};
