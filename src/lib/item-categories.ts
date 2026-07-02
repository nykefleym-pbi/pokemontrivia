import type { ItemId } from "@/lib/game-data";

// Shared item categorisation used by the Shop bag and the in-battle bag so
// both render the same grouped layout.
export type ItemCategory = "HEALING" | "BATTLE" | "UTILITY" | "PREMIUM";

export const CATEGORY_OF: Record<ItemId, ItemCategory> = {
  potion: "HEALING",
  superpotion: "HEALING",
  maxpotion: "HEALING",
  focusband: "HEALING",
  xattack: "BATTLE",
  scope: "BATTLE",
  xaccuracy: "BATTLE",
  quickclaw: "BATTLE",
  assaultvest: "BATTLE",
  escape: "UTILITY",
  candy: "PREMIUM",
  luckyegg: "PREMIUM",
};

export const CATEGORIES: Array<{ id: ItemCategory; label: string }> = [
  { id: "HEALING", label: "Healing" },
  { id: "BATTLE", label: "Battle" },
  { id: "UTILITY", label: "Utility" },
  { id: "PREMIUM", label: "Premium" },
];

export const BAG_SHORT_DESC: Record<string, string> = {
  potion: "Restore 30 HP",
  superpotion: "Restore 60 HP",
  maxpotion: "Fully restore HP",
  xattack: "+20 damage next answer",
  scope: "Remove one wrong answer",
  xaccuracy: "Reveal the correct answer",
  escape: "Bail out, no XP lost",
  candy: "+50 TP for your partner",
  luckyegg: "2× XP for 24 hours",
  focusband: "Auto: clutch heal at low HP",
  quickclaw: "Auto: timer reset under 5s",
  assaultvest: "Auto: ½ damage vs bad matchups",
};
