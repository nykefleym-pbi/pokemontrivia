import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const focusband: ItemDef = {
  id: "focusband",
  category: "HEALING",
  name: "Focus Band",
  iconUrl: spriteIconUrl("focus-band"),
  desc: "Auto: at 10 HP or less, restores HP to 50%. Once per week.",
  cost: 2000,
  premium: true,
};
