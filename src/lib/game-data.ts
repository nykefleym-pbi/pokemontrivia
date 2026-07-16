import type { PokeEntry } from "./pokemon-data";
import { ALL_POKEMON } from "./pokemon-data";
import { TRAINER_SPRITES as RAW_TRAINERS, type TrainerSprite } from "./trainer-data.generated";
import { isLegendaryOrMythical } from "./legendary-data";

// Moved: statuses/items now live in src/content, battle math in src/engine.
// These re-exports keep the historic import surface of this module intact.
import { ITEM_LIST } from "../content/items";
import type { ItemDef, ItemId } from "../content/items/item-def";
import type { StatusKind } from "../content/statuses/status-def";

export type { StatusKind } from "../content/statuses/status-def";
export type { PvpStat } from "../engine/state";
export type { BerryEffect, ItemDef, ItemId } from "../content/items/item-def";
export { STATUS_META } from "../content/statuses";
export { streakMultiplier } from "../engine/damage";
export {
  leagueIndex,
  enemyHpForLevel,
  baseDamageForLevel,
  getTpMultiplier,
  TP_DAMAGE_TIERS,
  type TpDamageBoost,
} from "./level-curve";

export const ITEMS: ItemDef[] = [...ITEM_LIST];

export type { TrainerSprite };

/**
 * Status conditions shared by Solo and Nearby-Battle PvP. `confused` and
 * `poisoned` are the two originally implemented (as local state) in solo
 * battle-screen; the rest were added for the PvP HP-endurance rework and are
 * available to both modes through the shared store `battleStatuses` field.
 */

/** The four Nearby-Battle-only combat stats that fluctuate via stat stages. */


/** Hard-lockout majors that are mutually exclusive with each other. */
export const HARD_LOCKOUT_STATUSES: StatusKind[] = ["sleep", "freeze", "paralysis"];






/** Every berry id, in catalog order. */
export const BERRY_IDS: ItemId[] = ITEMS.filter((i) => i.isBerry).map((i) => i.id);

/**
 * The berry drop pool for a completed Nearby Battle. Excludes the two premium
 * berries (Lum, Starf) so those stay rarity-gated. Two berries are rolled
 * (with replacement) from this pool per battle WON — see `rollBerryDrops`.
 */
export const NEARBY_BERRY_DROP_POOL: ItemId[] = ITEMS.filter(
  (i) => i.isBerry && !i.premium,
).map((i) => i.id);

/** Number of berries granted per Nearby Battle won (winners only). */
export const BERRIES_PER_NEARBY_BATTLE = 2;

/** One-time starter berry granted the first time a player enters Nearby Battle. */
export const STARTER_PVP_BERRY: ItemId = "lumberry";

/** Roll `BERRIES_PER_NEARBY_BATTLE` random berries from the common drop pool. */
export function rollBerryDrops(rng: () => number = Math.random): ItemId[] {
  const out: ItemId[] = [];
  for (let i = 0; i < BERRIES_PER_NEARBY_BATTLE; i++) {
    out.push(NEARBY_BERRY_DROP_POOL[Math.floor(rng() * NEARBY_BERRY_DROP_POOL.length)]);
  }
  return out;
}

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

// Pokémon GO's trainer-level XP curve divided by 10 (feedback adc10973 —
// "for level 2, instead of 2500, make it 250"). Index k is the XP needed to
// advance FROM level k+1, i.e. xpForLevel(level) = XP_TO_NEXT[level - 1]; the
// last entry is the cost of reaching level 50, matching the table's end.
const XP_TO_NEXT: readonly number[] = [
  250, 300, 350, 400, 500, 600, 700, 800, 900, 1000,
  1200, 1400, 1600, 1800, 2100, 2450, 2800, 3150, 3500, 4200,
  4900, 5600, 6300, 7000, 8300, 9600, 10900, 12200, 13500, 15800,
  18100, 20400, 22700, 25000, 29000, 33000, 37000, 41000, 45000, 52000,
  59000, 66000, 73000, 80000, 90000, 100000, 110000, 120000, 130000,
];

export function xpForLevel(level: number): number {
  if (level <= XP_TO_NEXT.length) return XP_TO_NEXT[level - 1];
  // Past Pokémon GO's level-50 table the endless endgame keeps climbing at
  // the table's final gradient (+10,000 per level).
  return XP_TO_NEXT[XP_TO_NEXT.length - 1] + (level - XP_TO_NEXT.length) * 10000;
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

export function xpProgressInLevel(totalXp: number): {
  current: number;
  need: number;
  level: number;
} {
  const level = levelFromTotalXp(totalXp);
  const base = totalXpToReachLevel(level);
  return { current: Math.max(0, totalXp - base), need: xpForLevel(level), level };
}


export function streakLabel(streak: number): string | null {
  if (streak >= 10) return "UNSTOPPABLE!";
  if (streak >= 7) return "ON FIRE!";
  if (streak >= 5) return "GREAT STREAK!";
  if (streak >= 3) return "NICE COMBO!";
  return null;
}

export function difficultyForLevel(
  level: number,
): "easy" | "medium" | "hard" | "expert" | "master" {
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

// ----- Training Points (TP) economy -----
export const TP_REWARDS = {
  battleWinPerCorrect: 1, // capped at 20 per battle
  battleLoss: 5,
  dailyPerfect: 30,
  dailyPartial: 15,
  eliteWin: 50,
  weeklyWin: 100,
};

// Evolution follows the mainline games' level requirements converted to TP at
// 1 level = 1,000 TP (feedback 582e8210 — e.g. Bulbasaur→Ivysaur at level 16
// = 16,000 TP). Per-species evolve levels aren't in the generated dataset, so
// each stage uses the typical mainline level for that stage: first evolutions
// cluster around level 16, second evolutions around level 36. Tune here.
export const EVOLUTION_TP_COST: Record<1 | 2, number> = {
  1: 16000,
  2: 36000,
};

/** Returns UTC timestamp of the most recent Monday 00:00:00. */
export function getCurrentWeekStartUtc(): number {
  const now = new Date();
  const day = now.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const monday = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - daysSinceMonday,
      0,
      0,
      0,
      0,
    ),
  );
  return monday.getTime();
}

// --- Poké Egg hatching (Legendary/Mythical exclusive) ---

/** Distinct game modes that count toward Poké Egg hatch progress. Capped at
 * one contribution per mode per day so a single mode can't be farmed. */
export type EggProgressMode =
  | "battle"
  | "weekly"
  | "daily"
  | "elite"
  | "mega"
  | "pvp"
  | "nearby"
  | "whosthat";

export interface PokeEgg {
  id: string;
  grantedAt: number;
  progress: number;
  required: number;
}

/** Progress points needed to hatch a Poké Egg. */
export const EGG_HATCH_REQUIRED = 20;

/** Days played in a row, counting today, derived the same way as the Profile
 * heatmap's week-streak but with unbounded lookback. Accepts any timestamped
 * log (battleLog) rather than importing GameState to avoid a circular import. */
export function currentPlayStreakDays(log: Array<{ timestamp: number }>): number {
  const days = new Set(log.map((e) => new Date(e.timestamp).toISOString().slice(0, 10)));
  let n = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

/** Egg-progress points granted per qualifying mode completion, boosted by streak. */
export function streakProgressBonus(streakDays: number): number {
  if (streakDays >= 30) return 5;
  if (streakDays >= 14) return 4;
  if (streakDays >= 7) return 3;
  if (streakDays >= 3) return 2;
  return 1;
}

export function getWeekRangeUtc(): { start: number; end: number; nextStart: number } {
  const start = getCurrentWeekStartUtc();
  const end = start + 7 * 24 * 60 * 60 * 1000 - 1;
  const nextStart = start + 7 * 24 * 60 * 60 * 1000;
  return { start, end, nextStart };
}

// Legendary/Mythical Pokémon are Poké-Egg exclusive — never a battle opponent.
const ENEMY_POOL: PokeEntry[] = ALL_POKEMON.filter((p) => !isLegendaryOrMythical(p.id));

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
    question: "What is Bulbasaur's secondary type?",
    options: ["Grass", "Poison", "Bug", "Ground"],
    correct: 1,
    explanation: "Bulbasaur is a Grass/Poison-type.",
    category: "Pokédex",
  },
  {
    question: "Which Pokémon is #150 in the National Pokédex?",
    options: ["Mew", "Mewtwo", "Dragonite", "Gyarados"],
    correct: 1,
    explanation: "Mewtwo is #150; Mew is #151.",
    category: "Pokédex",
  },
  // Anime
  {
    question: "Who is the protagonist of the original Pokémon anime?",
    options: ["Brock", "Misty", "Ash Ketchum", "Gary"],
    correct: 2,
    explanation: "Ash Ketchum from Pallet Town is the main character.",
    category: "Anime",
  },
  {
    question: "What is the name of Ash's first Pokémon?",
    options: ["Charmander", "Pikachu", "Squirtle", "Pidgey"],
    correct: 1,
    explanation: "Professor Oak gave Ash a Pikachu.",
    category: "Anime",
  },
  {
    question: "Which gym leader gave Ash the Boulder Badge?",
    options: ["Misty", "Brock", "Lt. Surge", "Erika"],
    correct: 1,
    explanation: "Brock is the Pewter City Rock-type gym leader.",
    category: "Anime",
  },
  // Lore
  {
    question: "Mewtwo was created from the DNA of which Pokémon?",
    options: ["Mew", "Ditto", "Eevee", "Lugia"],
    correct: 0,
    explanation: "Mewtwo is a clone of the mythical Pokémon Mew.",
    category: "Lore",
  },
  {
    question: "Who created the legendary trio Articuno, Zapdos, and Moltres?",
    options: ["Arceus", "Mew", "They occur naturally", "Dialga"],
    correct: 2,
    explanation: "The legendary birds are not created by another Pokémon.",
    category: "Lore",
  },
  {
    question: "Arceus is said to have created the universe with how many plates?",
    options: ["16", "17", "18", "20"],
    correct: 1,
    explanation: "Arceus is associated with 17 plates (one per type at debut).",
    category: "Lore",
  },
  // Items
  {
    question: "Which item heals a Pokémon by 20 HP?",
    options: ["Potion", "Revive", "Antidote", "Repel"],
    correct: 0,
    explanation: "A standard Potion heals 20 HP in the games.",
    category: "Items",
  },
  {
    question: "What does a Rare Candy do?",
    options: ["Heals status", "Raises a level", "Doubles XP", "Catches Pokémon"],
    correct: 1,
    explanation: "Rare Candy raises a Pokémon's level by one.",
    category: "Items",
  },
  {
    question: "Which Poké Ball has the highest catch rate at night?",
    options: ["Dusk Ball", "Net Ball", "Quick Ball", "Timer Ball"],
    correct: 0,
    explanation: "Dusk Balls are 3× more effective at night or in caves.",
    category: "Items",
  },
  // Regions
  {
    question: "What region is Pokémon Red & Blue set in?",
    options: ["Johto", "Hoenn", "Kanto", "Sinnoh"],
    correct: 2,
    explanation: "Red & Blue take place in the Kanto region.",
    category: "Regions",
  },
  {
    question: "Which region is home to Professor Birch?",
    options: ["Kanto", "Johto", "Hoenn", "Sinnoh"],
    correct: 2,
    explanation: "Professor Birch studies Pokémon in Hoenn.",
    category: "Regions",
  },
  {
    question: "What region was introduced in Pokémon Sword & Shield?",
    options: ["Alola", "Galar", "Paldea", "Unova"],
    correct: 1,
    explanation: "Galar debuted in Sword & Shield (Gen 8).",
    category: "Regions",
  },
  // Moves & Abilities
  {
    question: "Which move was originally Normal-type before becoming Fairy?",
    options: ["Charm", "Sweet Kiss", "Moonlight", "All of the above"],
    correct: 3,
    explanation: "Many Fairy moves were Normal-type before Gen 6.",
    category: "Moves & Abilities",
  },
  {
    question: "Which ability prevents the user from being put to sleep?",
    options: ["Insomnia", "Levitate", "Sturdy", "Pressure"],
    correct: 0,
    explanation: "Insomnia and Vital Spirit both prevent Sleep.",
    category: "Moves & Abilities",
  },
  {
    question: "What type is the move Earthquake?",
    options: ["Rock", "Ground", "Fighting", "Steel"],
    correct: 1,
    explanation: "Earthquake is a powerful Ground-type move.",
    category: "Moves & Abilities",
  },
  // Generations
  {
    question: "How many original Pokémon are there in Gen 1?",
    options: ["100", "151", "251", "386"],
    correct: 1,
    explanation: "Gen 1 introduced 151 Pokémon, ending with Mew.",
    category: "Generations",
  },
  {
    question: "Which generation introduced the Fairy type?",
    options: ["Gen 4", "Gen 5", "Gen 6", "Gen 7"],
    correct: 2,
    explanation: "Fairy type was added in Generation 6 (X & Y).",
    category: "Generations",
  },
  {
    question: "Which generation introduced Mega Evolution?",
    options: ["Gen 5", "Gen 6", "Gen 7", "Gen 8"],
    correct: 1,
    explanation: "Mega Evolution debuted in Gen 6 (X & Y).",
    category: "Generations",
  },
  {
    question: "How many Pokémon were added in Generation 2?",
    options: ["80", "100", "135", "251"],
    correct: 1,
    explanation: "Gen 2 (Gold/Silver) added 100 new Pokémon (152–251).",
    category: "Generations",
  },
  // Competitive
  {
    question: "In Smogon's tier list, what does 'OU' stand for?",
    options: ["Over Used", "Optimal Use", "Outright Unbanned", "Over Unbanned"],
    correct: 0,
    explanation: "OU = Over Used, the standard competitive singles tier.",
    category: "Competitive",
  },
  {
    question: "Which item boosts a held Pokémon's Speed by 50%?",
    options: ["Choice Scarf", "Quick Claw", "Focus Sash", "Life Orb"],
    correct: 0,
    explanation: "Choice Scarf gives a 1.5× Speed boost but locks the move.",
    category: "Competitive",
  },
  {
    question: "What does the move Stealth Rock do?",
    options: ["Lowers Speed", "Damage on switch-in", "Heals user", "Raises Defense"],
    correct: 1,
    explanation: "Stealth Rock damages opposing Pokémon when they switch in.",
    category: "Competitive",
  },
  // Extra mix
  {
    question: "Which Pokémon is known as the Electric Mouse?",
    options: ["Pichu", "Pikachu", "Raichu", "Plusle"],
    correct: 1,
    explanation: "Pikachu's classification is the Mouse Pokémon.",
    category: "Pokédex",
  },
  {
    question: "What does Eevee evolve into when exposed to a Water Stone?",
    options: ["Jolteon", "Vaporeon", "Flareon", "Glaceon"],
    correct: 1,
    explanation: "A Water Stone evolves Eevee into Vaporeon.",
    category: "Pokédex",
  },
  {
    question: "Who is the champion of the Indigo League in the games?",
    options: ["Lance", "Blue", "Red", "Steven"],
    correct: 0,
    explanation: "Lance leads the Indigo League's Elite Four as Champion.",
    category: "Lore",
  },
  {
    question: "Which item evolves Onix into Steelix when traded?",
    options: ["Metal Coat", "King's Rock", "Up-Grade", "Dragon Scale"],
    correct: 0,
    explanation: "Onix holding a Metal Coat evolves into Steelix when traded.",
    category: "Items",
  },
];
