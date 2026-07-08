import type { PokeEntry } from "./pokemon-data";
import { ALL_POKEMON } from "./pokemon-data";
import { TRAINER_SPRITES as RAW_TRAINERS, type TrainerSprite } from "./trainer-data.generated";
import { isLegendaryOrMythical } from "./legendary-data";

export type { TrainerSprite };

/**
 * Status conditions shared by Solo and Nearby-Battle PvP. `confused` and
 * `poisoned` are the two originally implemented (as local state) in solo
 * battle-screen; the rest were added for the PvP HP-endurance rework and are
 * available to both modes through the shared store `battleStatuses` field.
 */
export type StatusKind =
  | "confused"
  | "poisoned"
  | "badly-poisoned"
  | "burn"
  | "paralysis"
  | "sleep"
  | "freeze";

/** The four Nearby-Battle-only combat stats that fluctuate via stat stages. */
export type PvpStat = "attack" | "defense" | "speed" | "crit";

export const STATUS_META: Record<
  StatusKind,
  { emoji: string; label: string; major: boolean; defaultCures: number }
> = {
  // Volatile — stacks with everything, low magnitude. 2 cures (1 with `toxic`).
  confused: { emoji: "🌀", label: "Confused", major: false, defaultCures: 2 },
  // Major DoT. 3 cures in solo.
  poisoned: { emoji: "☠️", label: "Poisoned", major: true, defaultCures: 3 },
  // Ramping Toxic tier. Longer (5) and only fully removed by a cure item.
  "badly-poisoned": { emoji: "☠️☠️", label: "Badly Poisoned", major: true, defaultCures: 5 },
  // −15% correct-answer output + (PvP) −1 Attack stage. Waits out over 3.
  burn: { emoji: "🔥", label: "Burn", major: true, defaultCures: 3 },
  // Shorter timer + chance to short an input. 3 questions.
  paralysis: { emoji: "⚡", label: "Paralysis", major: true, defaultCures: 3 },
  // Buttons locked for first ~40% of timer. 1–2 questions, self-clears.
  sleep: { emoji: "😴", label: "Asleep", major: true, defaultCures: 2 },
  // Skip the current question; ~30% thaw/question, guaranteed after 2.
  freeze: { emoji: "❄️", label: "Frozen", major: true, defaultCures: 2 },
};

/** Hard-lockout majors that are mutually exclusive with each other. */
export const HARD_LOCKOUT_STATUSES: StatusKind[] = ["sleep", "freeze", "paralysis"];

export type BerryEffect =
  | { type: "cureStatus"; status: StatusKind | "any" }
  | { type: "immunity"; questions: number }
  | { type: "statStage"; stat: PvpStat; delta: number; questions: number }
  | { type: "randomStatStage"; delta: number; questions: number }
  | { type: "inflictStatus"; status: StatusKind; questions: number };

export interface ItemDef {
  id: ItemId;
  name: string;
  emoji: string;
  iconUrl: string;
  desc: string;
  cost: number;
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

const ICON = (slug: string) =>
  `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/${slug}.png`;

const DREAM_ICON = (slug: string) =>
  `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/dream-world/${slug}.png`;

export const ITEMS: ItemDef[] = [
  {
    id: "potion",
    name: "Potion",
    emoji: "🧪",
    iconUrl: ICON("potion"),
    desc: "Heals 30 HP. Once per battle.",
    cost: 100,
  },
  {
    id: "xattack",
    name: "X Attack",
    emoji: "⚔️",
    iconUrl: ICON("x-attack"),
    desc: "+20 damage on your next correct answer. Once per battle.",
    cost: 100,
  },
  {
    id: "scope",
    name: "Scope Lens",
    emoji: "🔭",
    iconUrl: ICON("scope-lens"),
    desc: "Removes one wrong answer. Once per battle.",
    cost: 100,
  },
  {
    id: "xaccuracy",
    name: "X Accuracy",
    emoji: "🎯",
    iconUrl: DREAM_ICON("x-accuracy"),
    desc: "Reveals the correct answer. Once per battle.",
    cost: 500,
  },
  {
    id: "escape",
    name: "Escape Rope",
    emoji: "🪢",
    iconUrl: ICON("escape-rope"),
    desc: "End the battle with no XP lost. Once per battle.",
    cost: 500,
  },
  {
    id: "candy",
    name: "Rare Candy",
    emoji: "🍬",
    iconUrl: ICON("rare-candy"),
    desc: "+50 TP to your partner, instantly. Usable anytime.",
    cost: 2000,
    premium: true,
  },
  {
    id: "luckyegg",
    name: "Lucky Egg",
    emoji: "🥚",
    iconUrl: ICON("lucky-egg"),
    desc: "2× XP for 24 hours. Once per week. Usable anytime.",
    cost: 2000,
    premium: true,
  },
  {
    id: "superpotion",
    name: "Super Potion",
    emoji: "🧪",
    iconUrl: ICON("super-potion"),
    desc: "Heals 60 HP. Once per battle.",
    cost: 300,
  },
  {
    id: "maxpotion",
    name: "Max Potion",
    emoji: "🍶",
    iconUrl: ICON("max-potion"),
    desc: "Fully restores HP. Once per battle.",
    cost: 1000,
  },
  {
    id: "focusband",
    name: "Focus Band",
    emoji: "🎽",
    iconUrl: ICON("focus-band"),
    desc: "Auto: at 10 HP or less, restores HP to 50%. Once per week.",
    cost: 2000,
    premium: true,
  },
  {
    id: "quickclaw",
    name: "Quick Claw",
    emoji: "⏱️",
    iconUrl: ICON("quick-claw"),
    desc: "Auto: when the timer drops below 5s, resets it to 20s. Once per battle.",
    cost: 1000,
  },
  {
    id: "assaultvest",
    name: "Assault Vest",
    emoji: "🦺",
    iconUrl: ICON("assault-vest"),
    desc: "Auto: halves damage in battles where the foe is super-effective against you. Once per week.",
    cost: 2000,
    premium: true,
  },
  {
    id: "revive",
    name: "Revive",
    emoji: "✨",
    iconUrl: ICON("revive"),
    desc: "Auto: survive a knockout at 25% HP. Once per battle.",
    cost: 1000,
  },
  {
    id: "zoomlens",
    name: "Zoom Lens",
    emoji: "🔍",
    iconUrl: ICON("zoom-lens"),
    desc: "Narrows one question down to two choices (1 right, 1 wrong). Once per battle.",
    cost: 200,
  },
  {
    id: "oranberry",
    name: "Oran Berry",
    emoji: "🫐",
    iconUrl: ICON("oran-berry"),
    desc: "Auto: heals 15 HP the instant HP first drops below 30%. Once per battle.",
    cost: 600,
  },
  {
    id: "amuletcoin",
    name: "Amulet Coin",
    emoji: "🪙",
    iconUrl: ICON("amulet-coin"),
    desc: "2× coins earned this battle. Once per battle.",
    cost: 300,
  },
  {
    id: "repel",
    name: "Repel",
    emoji: "🧴",
    iconUrl: ICON("repel"),
    desc: "Skip one question with no HP or streak penalty. Once per battle.",
    cost: 400,
  },
  {
    id: "expcharm",
    name: "Exp. Share",
    emoji: "📿",
    iconUrl: ICON("exp-share"),
    desc: "+25% XP earned this battle. Once per battle.",
    cost: 400,
  },
  {
    id: "silkscarf",
    name: "Silk Scarf",
    emoji: "🧣",
    iconUrl: ICON("silk-scarf"),
    desc: "Auto: your first correct answer deals +50% damage (+75% for a Normal-type partner). Once per battle.",
    cost: 250,
  },
  {
    id: "kingsrock",
    name: "King's Rock",
    emoji: "👑",
    iconUrl: ICON("kings-rock"),
    desc: "Auto: 50% chance to negate HP loss on a wrong answer, for the whole battle. Once per week.",
    cost: 2000,
    premium: true,
  },
  {
    id: "leftovers",
    name: "Leftovers",
    emoji: "🍞",
    iconUrl: ICON("leftovers"),
    desc: "Auto: heals 5 HP after every correct answer, for the whole battle. Once per week.",
    cost: 2000,
    premium: true,
  },
  {
    id: "metronome",
    name: "Metronome",
    emoji: "🔁",
    iconUrl: ICON("metronome"),
    desc: "Auto: streak multiplier locked at max (3.0×) for the whole battle. Once per week.",
    cost: 2500,
    premium: true,
  },
  {
    id: "luckypunch",
    name: "Lucky Punch",
    emoji: "🥊",
    iconUrl: ICON("lucky-punch"),
    desc: "Double or nothing: 50% chance to double this battle's XP and coins, 50% chance to lose them. Once per battle.",
    cost: 200,
  },
  {
    id: "bignugget",
    name: "Big Nugget",
    emoji: "🪙",
    iconUrl: ICON("big-nugget"),
    desc: "Requires a fully evolved partner. Converts all TP earned into coins (1:1) for 3 days. Usable anytime.",
    cost: 1500,
    premium: true,
  },
  {
    id: "starpiece",
    name: "Star Piece",
    emoji: "⭐",
    iconUrl: ICON("star-piece"),
    desc: "+50% coins and XP earned this battle, if you win. Once per battle.",
    cost: 350,
  },
  {
    id: "choicespecs",
    name: "Choice Specs",
    emoji: "🥽",
    iconUrl: ICON("choice-specs"),
    desc: "Double this battle's coins, XP, and TP — but it must be the only item you use this battle. Can't be used if another item was used first, and locks out every other item afterward. Once per battle.",
    cost: 800,
  },

  // ── Nearby-Battle PvP berries (drop-only, pvpOnly) ──────────────────────
  {
    id: "cheriberry",
    name: "Cheri Berry",
    emoji: "🍒",
    iconUrl: ICON("cheri-berry"),
    desc: "Cures Paralysis on yourself. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "cureStatus", status: "paralysis" } },
  },
  {
    id: "chestoberry",
    name: "Chesto Berry",
    emoji: "🫐",
    iconUrl: ICON("chesto-berry"),
    desc: "Shakes off Sleep on yourself. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "cureStatus", status: "sleep" } },
  },
  {
    id: "pechaberry",
    name: "Pecha Berry",
    emoji: "🍑",
    iconUrl: ICON("pecha-berry"),
    desc: "Neutralises Poison / Badly Poisoned on yourself. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "cureStatus", status: "poisoned" } },
  },
  {
    id: "rawstberry",
    name: "Rawst Berry",
    emoji: "🍃",
    iconUrl: ICON("rawst-berry"),
    desc: "Soothes Burn on yourself (removes its −15% and −1 Attack). (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "cureStatus", status: "burn" } },
  },
  {
    id: "persimberry",
    name: "Persim Berry",
    emoji: "🫐",
    iconUrl: ICON("persim-berry"),
    desc: "Restores focus — cures Confusion on yourself. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "cureStatus", status: "confused" } },
  },
  {
    id: "lumberry",
    name: "Lum Berry",
    emoji: "🟢",
    iconUrl: ICON("lum-berry"),
    desc: "Cures any one status on yourself and grants 1 question of status immunity. (Nearby Battle only.)",
    cost: 0,
    premium: true,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "cureStatus", status: "any" } },
  },
  {
    id: "liechiberry",
    name: "Liechi Berry",
    emoji: "🔴",
    iconUrl: ICON("liechi-berry"),
    desc: "+1 Attack stage for 3 questions. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "statStage", stat: "attack", delta: 1, questions: 3 } },
  },
  {
    id: "ganlonberry",
    name: "Ganlon Berry",
    emoji: "🔵",
    iconUrl: ICON("ganlon-berry"),
    desc: "+1 Defense stage for 3 questions. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: {
      target: "self",
      effect: { type: "statStage", stat: "defense", delta: 1, questions: 3 },
    },
  },
  {
    id: "salacberry",
    name: "Salac Berry",
    emoji: "🟡",
    iconUrl: ICON("salac-berry"),
    // Reworked: was a self timer/Speed boost; now an opponent-facing Speed debuff
    // (no timer-based berries now that Speed is a real stat).
    desc: "Drags at your rival's reflexes — −1 Speed stage on the opponent for 3 questions. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: {
      target: "opponent",
      effect: { type: "statStage", stat: "speed", delta: -1, questions: 3 },
    },
  },
  {
    id: "starfberry",
    name: "Starf Berry",
    emoji: "⭐",
    iconUrl: ICON("starf-berry"),
    desc: "Randomly unleashes power — +2 to a random stat (Atk/Def/Spd/Crit) for 3 questions. (Nearby Battle only.)",
    cost: 0,
    premium: true,
    isBerry: true,
    pvpOnly: true,
    berry: { target: "self", effect: { type: "randomStatStage", delta: 2, questions: 3 } },
  },
  {
    id: "tangaberry",
    name: "Tanga Berry",
    emoji: "🟠",
    iconUrl: ICON("tanga-berry"),
    desc: "Snares a rival — −1 Attack stage on the opponent for 3 questions. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: {
      target: "opponent",
      effect: { type: "statStage", stat: "attack", delta: -1, questions: 3 },
    },
  },
  {
    id: "kasibberry",
    name: "Kasib Berry",
    emoji: "🟣",
    iconUrl: ICON("kasib-berry"),
    desc: "Clouds a rival's guard — −1 Defense stage on the opponent for 3 questions. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: {
      target: "opponent",
      effect: { type: "statStage", stat: "defense", delta: -1, questions: 3 },
    },
  },
  {
    id: "chopleberry",
    name: "Chople Berry",
    emoji: "🌶️",
    iconUrl: ICON("chople-berry"),
    desc: "Scrambles a rival's senses — inflicts Confusion on the opponent for 2 questions. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: {
      target: "opponent",
      effect: { type: "inflictStatus", status: "confused", questions: 2 },
    },
  },
  {
    id: "colburberry",
    name: "Colbur Berry",
    emoji: "⚫",
    iconUrl: ICON("colbur-berry"),
    // Reworked: was a −3s opponent timer (Paralysis-lite); now a stronger
    // opponent Speed-stage debuff (no timer-based berries).
    desc: "Drags hard at a rival's clock — −2 Speed stage on the opponent for 3 questions. (Nearby Battle only.)",
    cost: 0,
    isBerry: true,
    pvpOnly: true,
    berry: {
      target: "opponent",
      effect: { type: "statStage", stat: "speed", delta: -2, questions: 3 },
    },
  },
];

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

// The partner grows stronger with rank: base damage per correct answer scales
// 10/12/14/16/18 alongside the enemy HP curve (100..300), so high-level
// regular battles stay winnable within the 20-question budget.
export function baseDamageForLevel(level: number): number {
  return 10 + 2 * leagueIndex(level);
}

// Linear up through level 51 (Monarch, the final rank) so the climb through
// every rank feels exactly as it does today. Past that the endless endgame
// grind gets progressively harder via a quadratic tail, since reward scaling
// (levelMultiplier, +5%/level) can't keep pace with a linear requirement
// forever — this keeps leveling meaningfully harder at high levels instead
// of the difficulty flattening out into a fixed grind forever.
export function xpForLevel(level: number): number {
  const overCap = Math.max(0, level - 51);
  return Math.round(80 + (level - 1) * 40 + 0.5 * overCap * overCap);
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

export const EVOLUTION_TP_COST: Record<1 | 2, number> = {
  1: 150,
  2: 350,
};

export interface TpDamageBoost {
  threshold: number;
  multiplier: number;
}

export const TP_DAMAGE_TIERS: TpDamageBoost[] = [
  { threshold: 0, multiplier: 1.0 },
  { threshold: 100, multiplier: 1.05 },
  { threshold: 300, multiplier: 1.1 },
  { threshold: 700, multiplier: 1.15 },
  { threshold: 1500, multiplier: 1.2 },
];

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

export function getTpMultiplier(tp: number): number {
  let mult = 1.0;
  for (const tier of TP_DAMAGE_TIERS) {
    if (tp >= tier.threshold) mult = tier.multiplier;
  }
  return mult;
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
