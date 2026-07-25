// Item vocabulary. One definition file per item lives beside this;
// the index assembles them into the ordered shop list and the by-id registry.
import type { StatusKind } from "../statuses/status-def";
import type { PvpStat } from "../../engine/state";

export type ItemCategory = "HEALING" | "BATTLE" | "UTILITY" | "PREMIUM" | "BERRY";

export type BerryEffect =
  | { type: "cureStatus"; status: StatusKind | "any" }
  | { type: "immunity"; questions: number }
  | { type: "statStage"; stat: PvpStat; delta: number; questions: number }
  | { type: "randomStatStage"; delta: number; questions: number }
  | { type: "inflictStatus"; status: StatusKind; questions: number };

export interface ItemDef {
  id: ItemId;
  name: string;
  iconUrl: string;
  desc: string;
  cost: number;
  category: ItemCategory;
  premium?: boolean;
  /** True for the berry catalog. Berries are Nearby-Battle-PvP-only. */
  isBerry?: boolean;
  /** Hides the item from Solo shop/bag and reward pools; only granted/usable in Nearby Battle. */
  pvpOnly?: boolean;
  /** Structured effect metadata for berries so the Nearby-Battle loop can apply them. */
  berry?: { target: "self" | "opponent"; effect: BerryEffect };
}

export type ItemId =
  | "potion"
  | "superpotion"
  | "maxpotion"
  | "xattack"
  | "escape"
  | "candy"
  | "luckyegg"
  | "scope"
  | "xaccuracy"
  | "focusband"
  | "quickclaw"
  | "assaultvest"
  | "revive"
  | "zoomlens"
  | "oranberry"
  | "amuletcoin"
  | "repel"
  | "expcharm"
  | "silkscarf"
  | "kingsrock"
  | "leftovers"
  | "metronome"
  | "luckypunch"
  | "bignugget"
  | "starpiece"
  | "choicespecs"
  // Nearby-Battle PvP berries (drop-only, pvpOnly)
  | "cheriberry"
  | "chestoberry"
  | "pechaberry"
  | "rawstberry"
  | "persimberry"
  | "lumberry"
  | "liechiberry"
  | "ganlonberry"
  | "salacberry"
  | "starfberry"
  | "tangaberry"
  | "kasibberry"
  | "chopleberry"
  | "colburberry";

