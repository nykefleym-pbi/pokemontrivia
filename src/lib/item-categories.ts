import type { ItemId } from "@/lib/game-data";

// Shared item categorisation used by the Shop bag and the in-battle bag so
// both render the same grouped layout.
// "BERRY" is deliberately omitted from CATEGORIES below so berries never render
// as a tab in the Solo shop / in-battle bag; the Nearby-Battle screen renders
// them through its own dedicated berry bag.
export type ItemCategory = "HEALING" | "BATTLE" | "UTILITY" | "PREMIUM" | "BERRY";

export const CATEGORY_OF: Record<ItemId, ItemCategory> = {
  cheriberry: "BERRY",
  chestoberry: "BERRY",
  pechaberry: "BERRY",
  rawstberry: "BERRY",
  persimberry: "BERRY",
  lumberry: "BERRY",
  liechiberry: "BERRY",
  ganlonberry: "BERRY",
  salacberry: "BERRY",
  starfberry: "BERRY",
  tangaberry: "BERRY",
  kasibberry: "BERRY",
  chopleberry: "BERRY",
  colburberry: "BERRY",
  potion: "HEALING",
  superpotion: "HEALING",
  maxpotion: "HEALING",
  focusband: "HEALING",
  revive: "HEALING",
  oranberry: "HEALING",
  kingsrock: "HEALING",
  leftovers: "HEALING",
  xattack: "BATTLE",
  scope: "BATTLE",
  xaccuracy: "BATTLE",
  quickclaw: "BATTLE",
  assaultvest: "BATTLE",
  zoomlens: "BATTLE",
  silkscarf: "BATTLE",
  metronome: "BATTLE",
  escape: "UTILITY",
  amuletcoin: "UTILITY",
  repel: "UTILITY",
  expcharm: "UTILITY",
  luckypunch: "UTILITY",
  starpiece: "UTILITY",
  choicespecs: "UTILITY",
  candy: "PREMIUM",
  luckyegg: "PREMIUM",
  bignugget: "PREMIUM",
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
  revive: "Auto: survive a KO at 25% HP",
  zoomlens: "Narrow to 2 choices",
  oranberry: "Auto: heal 15 HP under 30%",
  amuletcoin: "2× coins this battle",
  repel: "Skip 1 question, no penalty",
  expcharm: "+25% XP this battle",
  silkscarf: "Auto: +50% dmg on first hit",
  kingsrock: "Auto: 50% negate wrong-answer dmg",
  leftovers: "Auto: heal 5 HP per correct answer",
  metronome: "Auto: streak locked at max",
  luckypunch: "Double or nothing: 2× or 0 XP/coins",
  bignugget: "3 days: fully-evolved TP → coins",
  starpiece: "+50% coins & XP if you win",
  choicespecs: "2× rewards, only item usable",
};
