import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ItemId } from "./game-data";
import { ITEMS, levelFromTotalXp, TRAINER_SPRITES } from "./game-data";
import type { PokeEntry } from "./pokemon-data";
import { ALL_POKEMON } from "./pokemon-data";

const MAX_SEEN_HASHES = 500;
const MAX_SEEN_TEXTS = 200;

export function normalizeQuestion(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hashQuestion(s: string): string {
  // FNV-1a 32-bit
  const norm = normalizeQuestion(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

export interface PlayerStats {
  battles: number;
  wins: number;
  losses: number;
  correct: number;
  answered: number;
  bestStreak: number;
  totalAnswerTime: number;
}

export interface BattleLogItem {
  setsCompleted: number;
}

export interface BattleLogEntry {
  opponent: string;
  won: boolean;
  xpGained: number;
  bestStreak: number;
  timestamp: number;
}

export interface DailyResult {
  date: string;
  correct: number;
  total: number;
  timeMs: number;
  pattern: string;
}

export interface GameState {
  // profile
  hasOnboarded: boolean;
  isGuest: boolean;
  trainerName: string;
  trainerSprite: string;
  pokemon: PokeEntry | null;

  // progression
  level: number;
  peakLevel: number;
  xp: number;
  stats: PlayerStats;
  inventory: Record<ItemId, number>;
  itemCooldowns: Partial<Record<ItemId, number>>; // sets-remaining cooldown

  // battle ephemeral state
  inBattle: boolean;
  setsThisBattle: number;
  potionsUsedThisBattle: number;
  xAttackActive: boolean;
  scopeRevealedThisBattle: boolean;
  bonusTimeThisBattle: number;
  luckyEggActive: boolean;

  // question history (per-device)
  seenQuestionHashes: string[];
  seenQuestions: string[];

  // achievements / progression flags
  flags: string[];

  // daily challenge
  dailyResult: DailyResult | null;

  // battle log (cap 20)
  battleLog: BattleLogEntry[];

  // actions
  setOnboarded: (name: string, pokemon: PokeEntry, trainerSprite: string) => void;
  startGuestSession: () => void;
  reset: () => void;
  setName: (name: string) => void;
  setPokemon: (p: PokeEntry) => void;
  setTrainerSprite: (id: string) => void;
  markQuestionsSeen: (texts: string[]) => void;

  buyItem: (id: ItemId, cost: number) => boolean;
  useItem: (id: ItemId) => boolean;

  startBattle: () => void;
  endBattle: (won: boolean, xpGained: number) => void;
  recordAnswer: (correct: boolean, timeMs: number, streak: number) => void;
  completeSet: () => void;
  consumeXAttack: () => void;
  consumeScope: () => void;
  addXp: (amount: number) => void;
  raiseFlag: (name: string) => void;
  recordDaily: (r: DailyResult) => void;
  pushBattleLog: (e: BattleLogEntry) => void;
}

const defaultStats: PlayerStats = {
  battles: 0,
  wins: 0,
  losses: 0,
  correct: 0,
  answered: 0,
  bestStreak: 0,
  totalAnswerTime: 0,
};

const defaultInventory: Record<ItemId, number> = {
  potion: 2,
  revive: 1,
  xattack: 1,
  escape: 1,
  candy: 0,
  luckyegg: 0,
  scope: 1,
  xaccuracy: 1,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      hasOnboarded: false,
      isGuest: false,
      trainerName: "",
      trainerSprite: TRAINER_SPRITES[0]?.id ?? "",
      pokemon: null,
      level: 1,
      peakLevel: 1,
      xp: 0,
      stats: defaultStats,
      inventory: { ...defaultInventory },
      itemCooldowns: {},

      inBattle: false,
      setsThisBattle: 0,
      potionsUsedThisBattle: 0,
      xAttackActive: false,
      scopeRevealedThisBattle: false,
      bonusTimeThisBattle: 0,
      luckyEggActive: false,

      seenQuestionHashes: [],
      seenQuestions: [],

      flags: [],
      dailyResult: null,
      battleLog: [],

      markQuestionsSeen: (texts) => {
        const s = get();
        const newHashes = [...s.seenQuestionHashes];
        const newTexts = [...s.seenQuestions];
        const have = new Set(newHashes);
        for (const t of texts) {
          const h = hashQuestion(t);
          if (have.has(h)) continue;
          have.add(h);
          newHashes.push(h);
          newTexts.push(t);
        }
        set({
          seenQuestionHashes: newHashes.slice(-MAX_SEEN_HASHES),
          seenQuestions: newTexts.slice(-MAX_SEEN_TEXTS),
        });
      },

      setOnboarded: (name, pokemon, trainerSprite) =>
        set({ hasOnboarded: true, isGuest: false, trainerName: name, pokemon, trainerSprite }),

      startGuestSession: () => {
        const poke = ALL_POKEMON[Math.floor(Math.random() * ALL_POKEMON.length)];
        const trainer = TRAINER_SPRITES[Math.floor(Math.random() * TRAINER_SPRITES.length)];
        const suffix = Math.floor(Math.random() * 999);
        set({
          hasOnboarded: true,
          isGuest: true,
          trainerName: `${poke.name}-${suffix}`,
          pokemon: poke,
          trainerSprite: trainer.id,
        });
      },

      reset: () =>
        set({
          hasOnboarded: false,
          trainerName: "",
          trainerSprite: "red",
          pokemon: null,
          level: 1,
          peakLevel: 1,
          xp: 0,
          stats: defaultStats,
          inventory: { ...defaultInventory },
          itemCooldowns: {},
          inBattle: false,
          setsThisBattle: 0,
          potionsUsedThisBattle: 0,
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          bonusTimeThisBattle: 0,
          luckyEggActive: false,
          seenQuestionHashes: [],
          seenQuestions: [],
          flags: [],
          dailyResult: null,
          battleLog: [],
        }),

      setName: (name) => set({ trainerName: name }),
      setPokemon: (p) => set({ pokemon: p }),
      setTrainerSprite: (id) => set({ trainerSprite: id }),

      buyItem: (id, cost) => {
        const s = get();
        if (s.xp < cost) return false;
        const newXp = s.xp - cost;
        // Spending XP can lower the displayed level bar progress, but never demote.
        const recalcLevel = Math.max(s.peakLevel, levelFromTotalXp(newXp));
        set({
          xp: newXp,
          level: recalcLevel,
          inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + 1 },
        });
        return true;
      },

      useItem: (id) => {
        const s = get();
        const have = s.inventory[id] ?? 0;
        if (have <= 0) return false;
        const cd = s.itemCooldowns[id] ?? 0;
        if (cd > 0) return false;

        // Per-battle constraints
        if (id === "potion" && s.potionsUsedThisBattle >= 2) return false;

        const nextInventory = { ...s.inventory, [id]: have - 1 };
        const nextCooldowns: Partial<Record<ItemId, number>> = { ...s.itemCooldowns };

        // Set cooldowns (in completed sets)
        if (id === "xattack") nextCooldowns.xattack = 1;
        if (id === "scope") nextCooldowns.scope = 1;

        set({
          inventory: nextInventory,
          itemCooldowns: nextCooldowns,
          potionsUsedThisBattle:
            id === "potion" ? s.potionsUsedThisBattle + 1 : s.potionsUsedThisBattle,
          xAttackActive: id === "xattack" ? true : s.xAttackActive,
          scopeRevealedThisBattle: id === "scope" ? true : s.scopeRevealedThisBattle,
          bonusTimeThisBattle:
            id === "xaccuracy" ? s.bonusTimeThisBattle + 5 : s.bonusTimeThisBattle,
          luckyEggActive: id === "luckyegg" ? true : s.luckyEggActive,
        });

        if (id === "candy") {
          get().addXp(50);
        }
        return true;
      },

      startBattle: () =>
        set({
          inBattle: true,
          setsThisBattle: 0,
          potionsUsedThisBattle: 0,
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          bonusTimeThisBattle: 0,
        }),

      endBattle: (won, xpGained) => {
        const s = get();
        const finalXp = s.luckyEggActive ? xpGained * 2 : xpGained;
        set({
          inBattle: false,
          stats: {
            ...s.stats,
            battles: s.stats.battles + 1,
            wins: s.stats.wins + (won ? 1 : 0),
            losses: s.stats.losses + (won ? 0 : 1),
          },
          luckyEggActive: false,
        });
        get().addXp(finalXp);
      },

      addXp: (amount) => {
        const s = get();
        const newXp = s.xp + amount;
        const newLevel = levelFromTotalXp(newXp);
        const newPeak = Math.max(s.peakLevel, newLevel);
        set({ xp: newXp, level: newLevel, peakLevel: newPeak });
      },

      recordAnswer: (correct, timeMs, streak) =>
        set((s) => ({
          stats: {
            ...s.stats,
            answered: s.stats.answered + 1,
            correct: s.stats.correct + (correct ? 1 : 0),
            totalAnswerTime: s.stats.totalAnswerTime + timeMs,
            bestStreak: Math.max(s.stats.bestStreak, streak),
          },
        })),

      completeSet: () => {
        const s = get();
        const nextCd: Partial<Record<ItemId, number>> = {};
        for (const k of Object.keys(s.itemCooldowns) as ItemId[]) {
          const v = (s.itemCooldowns[k] ?? 0) - 1;
          if (v > 0) nextCd[k] = v;
        }
        set({
          setsThisBattle: s.setsThisBattle + 1,
          itemCooldowns: nextCd,
        });
      },

      consumeXAttack: () => set({ xAttackActive: false }),
      consumeScope: () => set({ scopeRevealedThisBattle: false }),

      raiseFlag: (name) => {
        const s = get();
        if (s.flags.includes(name)) return;
        set({ flags: [...s.flags, name] });
      },

      recordDaily: (r) => set({ dailyResult: r }),

      pushBattleLog: (e) => {
        const s = get();
        set({ battleLog: [e, ...s.battleLog].slice(0, 20) });
      },
    }),
    {
      name: "poke-trivia-store",
      storage: createJSONStorage(() =>
        typeof window !== "undefined"
          ? window.localStorage
          : {
              getItem: () => null,
              setItem: () => undefined,
              removeItem: () => undefined,
            },
      ),
      partialize: (s) => ({
        hasOnboarded: s.hasOnboarded,
        trainerName: s.trainerName,
        trainerSprite: s.trainerSprite,
        pokemon: s.pokemon,
        level: s.level,
        peakLevel: s.peakLevel,
        xp: s.xp,
        stats: s.stats,
        inventory: s.inventory,
        itemCooldowns: s.itemCooldowns,
        seenQuestionHashes: s.seenQuestionHashes,
        seenQuestions: s.seenQuestions,
      }),
    },
  ),
);

export function getItemDef(id: ItemId) {
  return ITEMS.find((i) => i.id === id)!;
}

// ALL_POKEMON re-exported from pokemon-data; kept here for back-compat consumers.
export { ALL_POKEMON };
