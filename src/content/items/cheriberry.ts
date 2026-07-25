// ── Nearby-Battle PvP berries (drop-only, pvpOnly) ──────────────────────
import type { ItemDef } from "./item-def";
import { spriteIconUrl } from "./icon";

export const cheriberry: ItemDef = {
  id: "cheriberry",
  category: "BERRY",
  name: "Cheri Berry",
  iconUrl: spriteIconUrl("cheri-berry"),
  desc: "Cures Paralysis on yourself. (PvP only.)",
  cost: 0,
  isBerry: true,
  pvpOnly: true,
  berry: { target: "self", effect: { type: "cureStatus", status: "paralysis" } },
};
