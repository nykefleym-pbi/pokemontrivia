// Round model for the "Who's That Pokémon?" mode. Lives in lib so state
// and services can reference it without depending on a route file.
import type { PokeType } from "./pokemon-data";
import type { ItemId } from "./game-data";

export type WhosThatMode = "1A" | "1B" | "2" | "3" | "4" | "5";
export interface WhosThatRound {
  monId: number;
  name: string;
  types: PokeType[];
  mode: WhosThatMode;
  isShiny: boolean;
  rewardId: ItemId;
  rewardName: string;
  rewardIcon: string;
  cropBack: boolean;
  cropDX: number;
  cropDY: number;
  choices: string[];
}
