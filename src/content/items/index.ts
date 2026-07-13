// Item registry. ITEM_LIST preserves shop display order; ITEM_BY_ID makes a
// missing ItemId a compile error. Adding an item = one file + two lines here.
import { potion } from "./potion";
import { xattack } from "./xattack";
import { scope } from "./scope";
import { xaccuracy } from "./xaccuracy";
import { escape } from "./escape";
import { candy } from "./candy";
import { luckyegg } from "./luckyegg";
import { superpotion } from "./superpotion";
import { maxpotion } from "./maxpotion";
import { focusband } from "./focusband";
import { quickclaw } from "./quickclaw";
import { assaultvest } from "./assaultvest";
import { revive } from "./revive";
import { zoomlens } from "./zoomlens";
import { oranberry } from "./oranberry";
import { amuletcoin } from "./amuletcoin";
import { repel } from "./repel";
import { expcharm } from "./expcharm";
import { silkscarf } from "./silkscarf";
import { kingsrock } from "./kingsrock";
import { leftovers } from "./leftovers";
import { metronome } from "./metronome";
import { luckypunch } from "./luckypunch";
import { bignugget } from "./bignugget";
import { starpiece } from "./starpiece";
import { choicespecs } from "./choicespecs";
import { cheriberry } from "./cheriberry";
import { chestoberry } from "./chestoberry";
import { pechaberry } from "./pechaberry";
import { rawstberry } from "./rawstberry";
import { persimberry } from "./persimberry";
import { lumberry } from "./lumberry";
import { liechiberry } from "./liechiberry";
import { ganlonberry } from "./ganlonberry";
import { salacberry } from "./salacberry";
import { starfberry } from "./starfberry";
import { tangaberry } from "./tangaberry";
import { kasibberry } from "./kasibberry";
import { chopleberry } from "./chopleberry";
import { colburberry } from "./colburberry";
import type { ItemDef, ItemId } from "./item-def";

export type { BerryEffect, ItemCategory, ItemDef, ItemId } from "./item-def";

export const ITEM_LIST: readonly ItemDef[] = [
  potion,
  xattack,
  scope,
  xaccuracy,
  escape,
  candy,
  luckyegg,
  superpotion,
  maxpotion,
  focusband,
  quickclaw,
  assaultvest,
  revive,
  zoomlens,
  oranberry,
  amuletcoin,
  repel,
  expcharm,
  silkscarf,
  kingsrock,
  leftovers,
  metronome,
  luckypunch,
  bignugget,
  starpiece,
  choicespecs,
  cheriberry,
  chestoberry,
  pechaberry,
  rawstberry,
  persimberry,
  lumberry,
  liechiberry,
  ganlonberry,
  salacberry,
  starfberry,
  tangaberry,
  kasibberry,
  chopleberry,
  colburberry,
];

export const ITEM_BY_ID: Record<ItemId, ItemDef> = {
  potion,
  xattack,
  scope,
  xaccuracy,
  escape,
  candy,
  luckyegg,
  superpotion,
  maxpotion,
  focusband,
  quickclaw,
  assaultvest,
  revive,
  zoomlens,
  oranberry,
  amuletcoin,
  repel,
  expcharm,
  silkscarf,
  kingsrock,
  leftovers,
  metronome,
  luckypunch,
  bignugget,
  starpiece,
  choicespecs,
  cheriberry,
  chestoberry,
  pechaberry,
  rawstberry,
  persimberry,
  lumberry,
  liechiberry,
  ganlonberry,
  salacberry,
  starfberry,
  tangaberry,
  kasibberry,
  chopleberry,
  colburberry,
};
