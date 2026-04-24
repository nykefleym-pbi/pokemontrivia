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

export const TRAINER_SPRITES = [
  "red", "blue", "ethan", "lyra", "brendan", "may", "lucas", "dawn",
  "hilbert", "hilda", "nate", "rosa", "calem", "serena", "elio", "selene",
  "victor", "gloria", "florian", "juliana", "misty", "brock", "erika",
  "sabrina", "blaine", "giovanni", "lance", "cynthia", "steven", "oak",
  "n", "cheren", "bianca", "wally", "barry",
];

export const TRAINER_SPRITE_BASE = "https://play.pokemonshowdown.com/sprites/trainers";

export function trainerSpriteUrl(id: string) {
  return `${TRAINER_SPRITE_BASE}/${id}.png`;
}

export const RANKS = [
  "Youngster",
  "Bug Catcher",
  "Pokéfan",
  "Ace Trainer",
  "Gym Leader",
  "Elite Four",
  "Champion",
  "Pokémon Master",
];

export function rankForLevel(level: number): string {
  if (level >= 30) return RANKS[7];
  if (level >= 22) return RANKS[6];
  if (level >= 16) return RANKS[5];
  if (level >= 11) return RANKS[4];
  if (level >= 7) return RANKS[3];
  if (level >= 4) return RANKS[2];
  if (level >= 2) return RANKS[1];
  return RANKS[0];
}

export function xpForLevel(level: number): number {
  return 80 + (level - 1) * 40;
}

export function difficultyForLevel(level: number): "easy" | "medium" | "hard" | "expert" | "master" {
  if (level >= 20) return "master";
  if (level >= 14) return "expert";
  if (level >= 8) return "hard";
  if (level >= 4) return "medium";
  return "easy";
}

export interface EnemyTrainer {
  name: string;
  title: string;
  pokemon: PokeEntry;
}

const enemyDefs: { name: string; title: string; pokeId: number }[] = [
  { name: "Prof. Oak", title: "Pokémon Professor", pokeId: 25 },
  { name: "Misty", title: "Cerulean Gym Leader", pokeId: 121 },
  { name: "Brock", title: "Pewter Gym Leader", pokeId: 95 },
  { name: "Lt. Surge", title: "Vermilion Gym Leader", pokeId: 26 },
  { name: "Erika", title: "Celadon Gym Leader", pokeId: 71 },
  { name: "Sabrina", title: "Saffron Gym Leader", pokeId: 65 },
  { name: "Blaine", title: "Cinnabar Gym Leader", pokeId: 78 },
  { name: "Giovanni", title: "Team Rocket Boss", pokeId: 34 },
  { name: "Lance", title: "Elite Four", pokeId: 149 },
  { name: "Cynthia", title: "Sinnoh Champion", pokeId: 130 },
  { name: "Red", title: "Pallet Champion", pokeId: 6 },
  { name: "Blue", title: "Cerulean Rival", pokeId: 9 },
];

export function getEnemyTrainers(): EnemyTrainer[] {
  return enemyDefs
    .map((e) => {
      const p = GEN1_POKEMON.find((x) => x.id === e.pokeId);
      return p ? { name: e.name, title: e.title, pokemon: p } : null;
    })
    .filter((x): x is EnemyTrainer => x !== null);
}

export function pickRandomEnemy(): EnemyTrainer {
  const list = getEnemyTrainers();
  return list[Math.floor(Math.random() * list.length)];
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
