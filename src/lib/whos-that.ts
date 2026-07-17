// Round model + pure round-generation/answer-checking logic for "Who's That
// Pokémon?". Lives in lib (no React/Supabase/store imports) so both the route
// component and the whos-that Edge Function can import the SAME functions —
// mirrors src/lib/rewards' role for dailyReward/battleReward.
// Deliberately NOT importing from ./pokemon-data or ./game-data: those pull
// in the full generated roster's evolution chains/slugs/trainer data this
// module never uses, and this is the one lib module the whos-that Edge
// Function bundles too — bundling the full ~195kb roster just to read
// id/name/types would make it by far the largest function in the codebase.
import { ALL_POKEMON_SLIM } from "./pokemon-data.slim.generated";
import type { PokeType } from "./pokemon-data.generated";
import { isLegendaryOrMythical } from "./legendary-data";
import { ITEM_LIST } from "../content/items";
import type { ItemId } from "../content/items/item-def";

const ALL_POKEMON = ALL_POKEMON_SLIM;

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

export const HOUR = 3_600_000;
export const SHINY_RATE = 1 / 20;

// Exclude premium and Nearby-Battle-only berries from the mini-game reward pool.
const REWARD_POOL = ITEM_LIST.filter((i) => !i.premium && !i.pvpOnly);

// Legendary/Mythical Pokémon are Poké-Egg exclusive — never a round's answer,
// since a correct guess here grants a Pokédex capture.
const ROUND_POOL = ALL_POKEMON.filter((p) => !isLegendaryOrMythical(p.id));

export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findByNorm(input: string) {
  const n = normalizeName(input);
  if (!n) return undefined;
  return ALL_POKEMON.find((p) => normalizeName(p.name) === n);
}

export function sameTypes(a: PokeType[], b: PokeType[]): boolean {
  if (a.length !== b.length) return false;
  return [...a].sort().join(",") === [...b].sort().join(",");
}

function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export function makeRound(): WhosThatRound {
  const mon = ROUND_POOL[Math.floor(Math.random() * ROUND_POOL.length)];
  const reward = REWARD_POOL[Math.floor(Math.random() * REWARD_POOL.length)];
  const mode = (["1A", "1B", "2", "3", "4", "5"] as WhosThatMode[])[Math.floor(Math.random() * 6)];
  const others = sample(
    ALL_POKEMON.filter((p) => p.id !== mon.id),
    3,
  ).map((p) => p.name);
  return {
    monId: mon.id,
    name: mon.name,
    types: mon.types,
    mode,
    isShiny: Math.random() < SHINY_RATE,
    rewardId: reward.id,
    rewardName: reward.name,
    rewardIcon: reward.iconUrl,
    cropBack: mon.id <= 649 ? Math.random() < 0.5 : false,
    cropDX: Math.round((Math.random() - 0.5) * 56),
    cropDY: Math.round((Math.random() - 0.5) * 56),
    choices: sample([mon.name, ...others], 4),
  };
}

export interface WhosThatGuess {
  guessText?: string;
  guessTypes?: PokeType[];
  guessChoice?: string;
}

// Consolidates whos-that-pokemon.tsx's submit()'s mode-branching validation
// into one pure function so the Edge Function can check a guess the exact
// same way the route always has, against its OWN held round (not a
// client-supplied one).
export function checkGuess(round: WhosThatRound, guess: WhosThatGuess): boolean {
  if (round.mode === "1B") {
    return sameTypes(guess.guessTypes ?? [], round.types);
  }
  if (round.mode === "3") {
    return guess.guessChoice === round.name;
  }
  if (round.mode === "4") {
    const m = findByNorm(guess.guessText ?? "");
    return !!m && sameTypes(m.types, round.types);
  }
  return normalizeName(guess.guessText ?? "") === normalizeName(round.name);
}
