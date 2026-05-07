import type { PokeEntry } from "./pokemon-data";
import { GEN1_POKEMON } from "./pokemon-data";

export interface ItemDef {
  id: ItemId;
  name: string;
  emoji: string;
  iconUrl: string;
  desc: string;
  cost: number;
  premium?: boolean;
}

export type ItemId =
  | "potion"
  | "revive"
  | "xattack"
  | "escape"
  | "candy"
  | "luckyegg"
  | "scope"
  | "xaccuracy";

const ICON = (slug: string) =>
  `https://play.pokemonshowdown.com/sprites/itemicons/${slug}.png`;

export const ITEMS: ItemDef[] = [
  { id: "potion", name: "Potion", emoji: "🧪", iconUrl: ICON("potion"), desc: "Restore 30 HP. (max 2 per battle)", cost: 30 },
  { id: "revive", name: "Revive", emoji: "💖", iconUrl: ICON("revive"), desc: "Heal to 50 HP when you're at 10 or less.", cost: 80 },
  { id: "xattack", name: "X Attack", emoji: "⚔️", iconUrl: ICON("x-attack"), desc: "Next correct answer deals +20 damage.", cost: 45 },
  { id: "escape", name: "Escape Rope", emoji: "🪢", iconUrl: ICON("escape-rope"), desc: "Flee a battle without losing XP.", cost: 60 },
  { id: "candy", name: "Rare Candy", emoji: "🍬", iconUrl: ICON("rare-candy"), desc: "Instantly gain 50 XP.", cost: 120, premium: true },
  { id: "luckyegg", name: "Lucky Egg", emoji: "🥚", iconUrl: ICON("lucky-egg"), desc: "Double XP from your next battle.", cost: 150, premium: true },
  { id: "scope", name: "Scope Lens", emoji: "🔭", iconUrl: ICON("scope-lens"), desc: "Reveal one wrong answer.", cost: 70 },
  { id: "xaccuracy", name: "X Accuracy", emoji: "🎯", iconUrl: ICON("x-accuracy"), desc: "Add +5 seconds to the timer this battle.", cost: 50 },
];

// Verified trainer slugs that exist on play.pokemonshowdown.com/sprites/trainers/.
// Florian / Juliana are intentionally excluded — they don't exist on Showdown.
export const TRAINER_SPRITES: string[] = [
  "red", "red-gen1", "red-gen1rb", "red-gen2", "red-gen3", "red-gen7",
  "blue", "blue-gen1", "blue-gen1champion", "blue-gen3", "blue-gen3champion",
  "ethan", "ethan-gen4", "lyra", "lyra-gen4", "kris",
  "brendan", "brendan-gen3", "brendan-gen3rs", "may", "may-gen3", "may-gen3rs",
  "lucas", "lucas-gen4pt", "dawn", "dawn-gen4pt",
  "hilbert", "hilda", "nate", "rosa", "calem", "serena",
  "elio", "selene", "victor", "gloria",
  "misty", "misty-gen1", "misty-gen3", "brock", "brock-gen1", "brock-gen3",
  "erika", "erika-gen1", "sabrina", "sabrina-gen1", "blaine", "blaine-gen1",
  "giovanni", "giovanni-gen1", "lt-surge", "lt-surge-gen1", "koga", "koga-gen1",
  "lance", "lance-gen1", "lance-gen2", "agatha", "lorelei", "bruno",
  "cynthia", "cynthia-gen4", "cynthia-gen7", "steven", "steven-gen3",
  "wallace", "juan", "tate", "liza", "winona", "flannery", "norman", "roxanne",
  "falkner", "bugsy", "whitney", "morty", "chuck", "jasmine", "pryce", "clair",
  "will", "karen", "iris", "drayden", "alder",
  "grimsley", "marshal", "caitlin", "shauntal",
  "diantha", "wikstrom", "siebold", "malva", "drasna",
  "kukui", "hala", "olivia", "nanu", "hapu", "acerola", "kahili", "molayne",
  "guzma", "lusamine", "gladion", "lillie", "hau",
  "leon", "raihan", "nessa", "milo", "kabu", "bea", "allister",
  "opal", "gordie", "melony", "piers", "marnie",
  "oak", "oak-gen1", "elm", "birch", "rowan", "juniper", "sycamore", "kukui",
  "n", "cheren", "bianca", "wally", "barry",
  "silver", "silver-gen2",
  "archie", "maxie", "cyrus", "ghetsis", "colress",
  "mars", "jupiter", "saturn", "archer", "ariana", "proton", "petrel",
  "dexio", "sina",
];

export const TRAINER_SPRITE_BASE = "https://play.pokemonshowdown.com/sprites/trainers";

export function trainerSpriteUrl(id: string) {
  return `${TRAINER_SPRITE_BASE}/${id}.png`;
}

// League ranks
export const RANKS = [
  "Little League Champ",
  "Great League Champ",
  "Ultra League Champ",
  "Master League Champ",
  "Monarch (World Champion)",
];

export function rankForLevel(level: number): string {
  if (level >= 51) return RANKS[4];
  if (level >= 26) return RANKS[3];
  if (level >= 16) return RANKS[2];
  if (level >= 6) return RANKS[1];
  return RANKS[0];
}

export function leagueIndex(level: number): number {
  if (level >= 51) return 4;
  if (level >= 26) return 3;
  if (level >= 16) return 2;
  if (level >= 6) return 1;
  return 0;
}

export function enemyHpForLevel(level: number): number {
  return 100 + 50 * leagueIndex(level);
}

export function xpForLevel(level: number): number {
  return 80 + (level - 1) * 40;
}

// Total XP needed to *reach* the start of the given level (level 1 = 0).
export function totalXpToReachLevel(level: number): number {
  let total = 0;
  for (let k = 1; k < level; k++) total += xpForLevel(k);
  return total;
}

// Compute level from a cumulative lifetime XP wallet.
export function levelFromTotalXp(totalXp: number): number {
  let level = 1;
  let remaining = totalXp;
  while (true) {
    const need = xpForLevel(level);
    if (remaining < need) return level;
    remaining -= need;
    level += 1;
    if (level > 999) return level;
  }
}

// XP progress within the current level: returns { current, need }.
export function xpProgressInLevel(totalXp: number): { current: number; need: number; level: number } {
  const level = levelFromTotalXp(totalXp);
  const base = totalXpToReachLevel(level);
  return { current: Math.max(0, totalXp - base), need: xpForLevel(level), level };
}

export function difficultyForLevel(level: number): "easy" | "medium" | "hard" | "expert" | "master" {
  if (level >= 26) return "master";
  if (level >= 16) return "expert";
  if (level >= 6) return "hard";
  if (level >= 2) return "medium";
  return "easy";
}

export interface EnemyTrainer {
  name: string;
  title: string;
  pokemon: PokeEntry;
}

// Gen I "fully evolved or no-evolution" Pokémon — Venusaur (3) through Mewtwo (150).
const EVOLVED_OR_SOLO_IDS = [
  3, 6, 9, 12, 15, 18, 20, 22, 24, 26, 28, 31, 34, 36, 38, 40, 42, 45, 47, 49,
  51, 53, 55, 57, 59, 62, 65, 68, 71, 73, 76, 78, 80, 82, 83, 85, 87, 89, 91,
  94, 95, 97, 99, 101, 103, 105, 106, 107, 108, 110, 112, 113, 114, 115, 117,
  119, 121, 122, 123, 124, 125, 126, 127, 128, 130, 131, 132, 134, 135, 136,
  137, 139, 141, 142, 143, 144, 145, 146, 149, 150,
];

function prettyTrainerName(slug: string): string {
  return slug
    .split("-")[0]
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function pickRandomEnemy(): EnemyTrainer {
  const trainerSlug = TRAINER_SPRITES[Math.floor(Math.random() * TRAINER_SPRITES.length)];
  const pokeId = EVOLVED_OR_SOLO_IDS[Math.floor(Math.random() * EVOLVED_OR_SOLO_IDS.length)];
  const pokemon = GEN1_POKEMON.find((p) => p.id === pokeId)!;
  return {
    name: prettyTrainerName(trainerSlug),
    title: "Pokémon Trainer",
    pokemon,
  };
}

// Tiny fallback bank when AI fails
export const FALLBACK_QUESTIONS = [
  {
    question: "What type is Pikachu?",
    options: ["Electric", "Fire", "Water", "Normal"],
    correct: 0,
    explanation: "Pikachu is the iconic Electric-type Mouse Pokémon.",
    category: "Pokédex",
  },
  {
    question: "Which Pokémon evolves into Charizard?",
    options: ["Charmander", "Charmeleon", "Squirtle", "Bulbasaur"],
    correct: 1,
    explanation: "Charmeleon evolves into Charizard at level 36.",
    category: "Pokédex",
  },
  {
    question: "Who is the protagonist of the Pokémon anime?",
    options: ["Brock", "Misty", "Ash Ketchum", "Gary"],
    correct: 2,
    explanation: "Ash Ketchum from Pallet Town is the main character.",
    category: "Anime",
  },
  {
    question: "How many original Pokémon are there in Gen 1?",
    options: ["100", "151", "251", "386"],
    correct: 1,
    explanation: "Gen 1 introduced 151 Pokémon, ending with Mew.",
    category: "General",
  },
  {
    question: "Which item heals a Pokémon by 20 HP?",
    options: ["Potion", "Revive", "Antidote", "Repel"],
    correct: 0,
    explanation: "A standard Potion heals 20 HP in the games.",
    category: "Items",
  },
  {
    question: "What region is Pokémon Red & Blue set in?",
    options: ["Johto", "Hoenn", "Kanto", "Sinnoh"],
    correct: 2,
    explanation: "Red & Blue take place in the Kanto region.",
    category: "Regions",
  },
  {
    question: "Which move was originally Normal-type before becoming Fairy?",
    options: ["Charm", "Sweet Kiss", "Moonlight", "All of the above"],
    correct: 3,
    explanation: "Many Fairy moves were Normal-type before Gen 6.",
    category: "Moves & Abilities",
  },
  {
    question: "Mewtwo was created from the DNA of which Pokémon?",
    options: ["Mew", "Ditto", "Eevee", "Lugia"],
    correct: 0,
    explanation: "Mewtwo is a clone of the mythical Pokémon Mew.",
    category: "Lore",
  },
];
