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
    title: "",
    pokemon,
    isShiny: Math.random() < SHINY_CHANCE,
  };
}

// Hand-written fallbacks used when the AI gateway is unavailable.
// Keep this bank wide so repeat battles stay playable offline.
export const FALLBACK_QUESTIONS = [
  // Pokédex
  { question: "What type is Pikachu?", options: ["Electric", "Fire", "Water", "Normal"], correct: 0, explanation: "Pikachu is the iconic Electric-type Mouse Pokémon.", category: "Pokédex" },
  { question: "Which Pokémon evolves into Charizard?", options: ["Charmander", "Charmeleon", "Squirtle", "Bulbasaur"], correct: 1, explanation: "Charmeleon evolves into Charizard at level 36.", category: "Pokédex" },
  { question: "What is Bulbasaur's secondary type?", options: ["Grass", "Poison", "Bug", "Ground"], correct: 1, explanation: "Bulbasaur is a Grass/Poison-type.", category: "Pokédex" },
  { question: "Which Pokémon is #150 in the National Pokédex?", options: ["Mew", "Mewtwo", "Dragonite", "Gyarados"], correct: 1, explanation: "Mewtwo is #150; Mew is #151.", category: "Pokédex" },
  // Anime
  { question: "Who is the protagonist of the original Pokémon anime?", options: ["Brock", "Misty", "Ash Ketchum", "Gary"], correct: 2, explanation: "Ash Ketchum from Pallet Town is the main character.", category: "Anime" },
  { question: "What is the name of Ash's first Pokémon?", options: ["Charmander", "Pikachu", "Squirtle", "Pidgey"], correct: 1, explanation: "Professor Oak gave Ash a Pikachu.", category: "Anime" },
  { question: "Which gym leader gave Ash the Boulder Badge?", options: ["Misty", "Brock", "Lt. Surge", "Erika"], correct: 1, explanation: "Brock is the Pewter City Rock-type gym leader.", category: "Anime" },
  // Lore
  { question: "Mewtwo was created from the DNA of which Pokémon?", options: ["Mew", "Ditto", "Eevee", "Lugia"], correct: 0, explanation: "Mewtwo is a clone of the mythical Pokémon Mew.", category: "Lore" },
  { question: "Who created the legendary trio Articuno, Zapdos, and Moltres?", options: ["Arceus", "Mew", "They occur naturally", "Dialga"], correct: 2, explanation: "The legendary birds are not created by another Pokémon.", category: "Lore" },
  { question: "Arceus is said to have created the universe with how many plates?", options: ["16", "17", "18", "20"], correct: 1, explanation: "Arceus is associated with 17 plates (one per type at debut).", category: "Lore" },
  // Items
  { question: "Which item heals a Pokémon by 20 HP?", options: ["Potion", "Revive", "Antidote", "Repel"], correct: 0, explanation: "A standard Potion heals 20 HP in the games.", category: "Items" },
  { question: "What does a Rare Candy do?", options: ["Heals status", "Raises a level", "Doubles XP", "Catches Pokémon"], correct: 1, explanation: "Rare Candy raises a Pokémon's level by one.", category: "Items" },
  { question: "Which Poké Ball has the highest catch rate at night?", options: ["Dusk Ball", "Net Ball", "Quick Ball", "Timer Ball"], correct: 0, explanation: "Dusk Balls are 3× more effective at night or in caves.", category: "Items" },
  // Regions
  { question: "What region is Pokémon Red & Blue set in?", options: ["Johto", "Hoenn", "Kanto", "Sinnoh"], correct: 2, explanation: "Red & Blue take place in the Kanto region.", category: "Regions" },
  { question: "Which region is home to Professor Birch?", options: ["Kanto", "Johto", "Hoenn", "Sinnoh"], correct: 2, explanation: "Professor Birch studies Pokémon in Hoenn.", category: "Regions" },
  { question: "What region was introduced in Pokémon Sword & Shield?", options: ["Alola", "Galar", "Paldea", "Unova"], correct: 1, explanation: "Galar debuted in Sword & Shield (Gen 8).", category: "Regions" },
  // Moves & Abilities
  { question: "Which move was originally Normal-type before becoming Fairy?", options: ["Charm", "Sweet Kiss", "Moonlight", "All of the above"], correct: 3, explanation: "Many Fairy moves were Normal-type before Gen 6.", category: "Moves & Abilities" },
  { question: "Which ability prevents the user from being put to sleep?", options: ["Insomnia", "Levitate", "Sturdy", "Pressure"], correct: 0, explanation: "Insomnia and Vital Spirit both prevent Sleep.", category: "Moves & Abilities" },
  { question: "What type is the move Earthquake?", options: ["Rock", "Ground", "Fighting", "Steel"], correct: 1, explanation: "Earthquake is a powerful Ground-type move.", category: "Moves & Abilities" },
  // Generations
  { question: "How many original Pokémon are there in Gen 1?", options: ["100", "151", "251", "386"], correct: 1, explanation: "Gen 1 introduced 151 Pokémon, ending with Mew.", category: "Generations" },
  { question: "Which generation introduced the Fairy type?", options: ["Gen 4", "Gen 5", "Gen 6", "Gen 7"], correct: 2, explanation: "Fairy type was added in Generation 6 (X & Y).", category: "Generations" },
  { question: "Which generation introduced Mega Evolution?", options: ["Gen 5", "Gen 6", "Gen 7", "Gen 8"], correct: 1, explanation: "Mega Evolution debuted in Gen 6 (X & Y).", category: "Generations" },
  { question: "How many Pokémon were added in Generation 2?", options: ["100", "135", "151", "100"], correct: 1, explanation: "Gen 2 (Gold/Silver) added 100 new Pokémon (152–251).", category: "Generations" },
  // Competitive
  { question: "In Smogon's tier list, what does 'OU' stand for?", options: ["Over Used", "Optimal Use", "Outright Unbanned", "Over Unbanned"], correct: 0, explanation: "OU = Over Used, the standard competitive singles tier.", category: "Competitive" },
  { question: "Which item boosts a held Pokémon's Speed by 50%?", options: ["Choice Scarf", "Quick Claw", "Focus Sash", "Life Orb"], correct: 0, explanation: "Choice Scarf gives a 1.5× Speed boost but locks the move.", category: "Competitive" },
  { question: "What does the move Stealth Rock do?", options: ["Lowers Speed", "Damage on switch-in", "Heals user", "Raises Defense"], correct: 1, explanation: "Stealth Rock damages opposing Pokémon when they switch in.", category: "Competitive" },
  // Extra mix
  { question: "Which Pokémon is known as the Electric Mouse?", options: ["Pichu", "Pikachu", "Raichu", "Plusle"], correct: 1, explanation: "Pikachu's classification is the Mouse Pokémon.", category: "Pokédex" },
  { question: "What does Eevee evolve into when exposed to a Water Stone?", options: ["Jolteon", "Vaporeon", "Flareon", "Glaceon"], correct: 1, explanation: "A Water Stone evolves Eevee into Vaporeon.", category: "Pokédex" },
  { question: "Who is the champion of the Indigo League in the games?", options: ["Lance", "Blue", "Red", "Steven"], correct: 0, explanation: "Lance leads the Indigo League's Elite Four as Champion.", category: "Lore" },
  { question: "Which item evolves Onix into Steelix when traded?", options: ["Metal Coat", "King's Rock", "Up-Grade", "Dragon Scale"], correct: 0, explanation: "Onix holding a Metal Coat evolves into Steelix when traded.", category: "Items" },
];
