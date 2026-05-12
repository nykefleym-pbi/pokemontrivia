import type { PokeEntry } from "./pokemon-data";
import { ALL_POKEMON } from "./pokemon-data";
import { TRAINER_SPRITES as RAW_TRAINERS, type TrainerSprite } from "./trainer-data.generated";

export type { TrainerSprite };

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
  { id: "potion", name: "Potion", emoji: "🧪", iconUrl: ICON("potion"), desc: "Heals 30 HP. Up to 2 per battle.", cost: 30 },
  { id: "revive", name: "Revive", emoji: "💖", iconUrl: ICON("revive"), desc: "Brings you back to 50 HP when nearly fainted.", cost: 80 },
  { id: "xattack", name: "X Attack", emoji: "⚔️", iconUrl: ICON("x-attack"), desc: "Your next correct answer hits for +20.", cost: 45 },
  { id: "escape", name: "Escape Rope", emoji: "🪢", iconUrl: ICON("escape-rope"), desc: "Bail out of a battle, no XP lost.", cost: 60 },
  { id: "candy", name: "Rare Candy", emoji: "🍬", iconUrl: ICON("rare-candy"), desc: "+50 XP, instantly.", cost: 120, premium: true },
  { id: "luckyegg", name: "Lucky Egg", emoji: "🥚", iconUrl: ICON("lucky-egg"), desc: "Doubles XP from your next battle.", cost: 150, premium: true },
  { id: "scope", name: "Scope Lens", emoji: "🔭", iconUrl: ICON("scope-lens"), desc: "Eliminates one wrong choice.", cost: 70 },
  { id: "xaccuracy", name: "X Accuracy", emoji: "🎯", iconUrl: ICON("x-accuracy"), desc: "+5 seconds to your timer this battle.", cost: 50 },
];

// Trainer roster scraped from Bulbagarden (Gen III/IV/V + Pokémon Masters).
export const TRAINER_SPRITES: TrainerSprite[] = RAW_TRAINERS;

const TRAINER_BY_ID = new Map(RAW_TRAINERS.map((t) => [t.id, t] as const));

export function getTrainerSprite(id: string): TrainerSprite | undefined {
  return TRAINER_BY_ID.get(id);
}

export function trainerSpriteUrl(id: string): string {
  return TRAINER_BY_ID.get(id)?.url ?? "";
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

export function totalXpToReachLevel(level: number): number {
  let total = 0;
  for (let k = 1; k < level; k++) total += xpForLevel(k);
  return total;
}

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

export function xpProgressInLevel(totalXp: number): { current: number; need: number; level: number } {
  const level = levelFromTotalXp(totalXp);
  const base = totalXpToReachLevel(level);
  return { current: Math.max(0, totalXp - base), need: xpForLevel(level), level };
}

export function streakMultiplier(streak: number): number {
  if (streak >= 10) return 3.0;
  if (streak >= 7) return 2.5;
  if (streak >= 5) return 2.0;
  if (streak >= 3) return 1.5;
  return 1.0;
}

export function streakLabel(streak: number): string | null {
  if (streak >= 10) return "UNSTOPPABLE!";
  if (streak >= 7) return "ON FIRE!";
  if (streak >= 5) return "GREAT STREAK!";
  if (streak >= 3) return "NICE COMBO!";
  return null;
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
  isShiny: boolean;
}

export const SHINY_CHANCE = 1 / 256;

// Use a wide pool: skip pre-evolutions by simple heuristic — favor higher-id Pokémon
// of each evolution family. For simplicity, pick from all Pokémon with id divisible-friendly
// and exclude obvious first-stage names. Good enough as a runtime pick.
const ENEMY_POOL: PokeEntry[] = ALL_POKEMON;

export function pickRandomEnemy(): EnemyTrainer {
  const trainer = RAW_TRAINERS[Math.floor(Math.random() * RAW_TRAINERS.length)];
  const pokemon = ENEMY_POOL[Math.floor(Math.random() * ENEMY_POOL.length)];
  return {
    name: trainer.name,
    title: "Pokémon Trainer",
    pokemon,
    isShiny: Math.random() < SHINY_CHANCE,
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
