import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ItemId } from "./game-data";
import { ITEMS, xpForLevel } from "./game-data";
import type { PokeEntry } from "./pokemon-data";
import { GEN1_POKEMON } from "./pokemon-data";

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

export interface GameState {
  // profile
  hasOnboarded: boolean;
  trainerName: string;
  trainerSprite: string;
  pokemon: PokeEntry | null;

  // progression
  level: number;
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

  // actions
  setOnboarded: (name: string, pokemon: PokeEntry, trainerSprite: string) => void;
  reset: () => void;
  setName: (name: string) => void;
  setPokemon: (p: PokeEntry) => void;
  setTrainerSprite: (id: string) => void;

  buyItem: (id: ItemId, cost: number) => boolean;
  useItem: (id: ItemId) => boolean;

  startBattle: () => void;
  endBattle: (won: boolean, xpGained: number) => void;
  recordAnswer: (correct: boolean, timeMs: number, streak: number) => void;
  completeSet: () => void;
  consumeXAttack: () => void;
  consumeScope: () => void;
  addXp: (amount: number) => void;
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
      trainerName: "",
      trainerSprite: "red",
      pokemon: null,
      level: 1,
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

      setOnboarded: (name, pokemon, trainerSprite) =>
        set({ hasOnboarded: true, trainerName: name, pokemon, trainerSprite }),

      reset: () =>
        set({
          hasOnboarded: false,
          trainerName: "",
          trainerSprite: "red",
          pokemon: null,
          level: 1,
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
        }),

      setName: (name) => set({ trainerName: name }),
      setPokemon: (p) => set({ pokemon: p }),
      setTrainerSprite: (id) => set({ trainerSprite: id }),

      buyItem: (id, cost) => {
        const { xp, inventory } = get();
        if (xp < cost) return false;
        set({
          xp: xp - cost,
          inventory: { ...inventory, [id]: (inventory[id] ?? 0) + 1 },
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
        if (id === "potion") nextCooldowns.potion = 0;

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
        let { level, xp } = get();
        xp += amount;
        let need = xpForLevel(level);
        while (xp >= need) {
          xp -= need;
          level += 1;
          need = xpForLevel(level);
        }
        set({ level, xp });
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
          xAttackActive: false,
        });
      },

      consumeXAttack: () => set({ xAttackActive: false }),
      consumeScope: () => set({ scopeRevealedThisBattle: false }),
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
        xp: s.xp,
        stats: s.stats,
        inventory: s.inventory,
        itemCooldowns: s.itemCooldowns,
      }),
    },
  ),
);

export function getItemDef(id: ItemId) {
  return ITEMS.find((i) => i.id === id)!;
}

export const ALL_POKEMON = GEN1_POKEMON;
