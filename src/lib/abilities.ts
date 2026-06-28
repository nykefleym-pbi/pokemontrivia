import type { PokeType } from "./pokemon-data";

export type AbilityId =
  | "adaptable"
  | "flame-body"
  | "hydration"
  | "static"
  | "leech-seed"
  | "snow-cloak"
  | "guts"
  | "toxic"
  | "sand-veil"
  | "tailwind"
  | "foresight"
  | "compound-eyes"
  | "sturdy"
  | "cursed-body"
  | "multiscale"
  | "intimidate"
  | "filter"
  | "cute-charm";

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
  type: PokeType;
}

export const ABILITIES: Record<PokeType, Ability> = {
  normal: {
    id: "adaptable",
    name: "Adaptable",
    type: "normal",
    description: "Starts with 105 HP instead of 100.",
  },
  fire: {
    id: "flame-body",
    name: "Flame Body",
    type: "fire",
    description: "10% chance to ignore wrong-answer damage entirely.",
  },
  water: {
    id: "hydration",
    name: "Hydration",
    type: "water",
    description: "Auto-cures the first Confused status of every battle.",
  },
  electric: {
    id: "static",
    name: "Static",
    type: "electric",
    description: "Wrong-answer damage is halved 15% of the time.",
  },
  grass: {
    id: "leech-seed",
    name: "Leech Seed",
    type: "grass",
    description: "Heals 2 HP for every correct answer.",
  },
  ice: {
    id: "snow-cloak",
    name: "Snow Cloak",
    type: "ice",
    description: "The first wrong answer of every battle deals 0 damage.",
  },
  fighting: {
    id: "guts",
    name: "Guts",
    type: "fighting",
    description: "Correct answers deal +10% damage when below 50% HP.",
  },
  poison: {
    id: "toxic",
    name: "Toxic",
    type: "poison",
    description: "Immune to the Poisoned status.",
  },
  ground: {
    id: "sand-veil",
    name: "Sand Veil",
    type: "ground",
    description: "+2 seconds added to every question timer.",
  },
  flying: {
    id: "tailwind",
    name: "Tailwind",
    type: "flying",
    description: "+20% damage on the first 3 questions of every battle.",
  },
  psychic: {
    id: "foresight",
    name: "Foresight",
    type: "psychic",
    description: "Reveals one wrong option for free on every 5th question.",
  },
  bug: {
    id: "compound-eyes",
    name: "Compound Eyes",
    type: "bug",
    description: "Auto-reveals a wrong option on the first and last question of every set.",
  },
  rock: {
    id: "sturdy",
    name: "Sturdy",
    type: "rock",
    description: "Survives the first otherwise-fatal hit at 1 HP. Once per battle.",
  },
  ghost: {
    id: "cursed-body",
    name: "Cursed Body",
    type: "ghost",
    description:
      "Wrong answers heal back fully if the next question is answered correctly within 5 seconds.",
  },
  dragon: {
    id: "multiscale",
    name: "Multiscale",
    type: "dragon",
    description: "Wrong-answer damage is halved while at full HP.",
  },
  dark: {
    id: "intimidate",
    name: "Intimidate",
    type: "dark",
    description: "The enemy starts at 90% HP instead of 100%.",
  },
  steel: {
    id: "filter",
    name: "Filter",
    type: "steel",
    description: "Reduces super-effective wrong-answer damage by 25%.",
  },
  fairy: {
    id: "cute-charm",
    name: "Cute Charm",
    type: "fairy",
    description: "5% chance the enemy skips its attack on a wrong answer.",
  },
};

/** Resolve a Pokémon's ability by its PRIMARY type. Dual-type Pokémon use type[0]. */
export function getAbility(pokemonTypes: PokeType[]): Ability {
  const primary = pokemonTypes[0];
  return ABILITIES[primary];
}
