import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ItemId, PokeEgg } from "./game-data";
import {
  ITEMS,
  levelFromTotalXp,
  totalXpToReachLevel,
  TRAINER_SPRITES,
  EVOLUTION_TP_COST,
  EGG_HATCH_REQUIRED,
  currentPlayStreakDays,
  streakProgressBonus,
  STATUS_META,
} from "./game-data";
import { clampStage } from "./pvp-combat";
import { rollAbilityId } from "./abilities";
import { ALL_POKEMON, rehydratePokemon, isStartingPartner, canEvolve } from "./pokemon-data";
import { isLegendaryOrMythical } from "./legendary-data";
import { randomGuestName } from "./trainer-name";
import { createMegaSlice } from "@/lib/store/slices/megaSlice";
import { createWhosThatSlice } from "@/lib/store/slices/whosThatSlice";
import { createLeaguesSlice } from "@/lib/store/slices/leaguesSlice";
import { createProfileSlice } from "@/lib/store/slices/profileSlice";
import { createItemsSlice, defaultInventory } from "@/lib/store/slices/itemsSlice";
import { createCollectionsSlice } from "@/lib/store/slices/collectionsSlice";
import { WHATS_NEW } from "./whats-new";
import type { GameState, PlayerStats, PvpStatStages, DailyMark } from "./store/types";

const zeroStages = (): PvpStatStages => ({ attack: 0, defense: 0, speed: 0, crit: 0 });

export * from "./store/types";

const MAX_SEEN_HASHES = 500;
const MAX_SEEN_TEXTS = 200;
const MAX_SEEN_CURATED = 500;

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


const defaultStats: PlayerStats = {
  battles: 0,
  wins: 0,
  losses: 0,
  correct: 0,
  answered: 0,
  bestStreak: 0,
  totalAnswerTime: 0,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get, store) => ({
      ...createMegaSlice(set, get, store),
      ...createWhosThatSlice(set, get, store),
      ...createLeaguesSlice(set, get, store),
      ...createProfileSlice(set, get, store),
      ...createItemsSlice(set, get, store),
      ...createCollectionsSlice(set, get, store),
      pokemon: null,
      abilityId: null,
      lastSeenWhatsNew: 0,
      markWhatsNewSeen: (version) => set({ lastSeenWhatsNew: version }),

      level: 1,
      peakLevel: 1,
      xp: 0,
      coins: 0,
      stats: defaultStats,

      inBattle: false,
      battleScreenActive: false,
      setBattleScreenActive: (v) => set({ battleScreenActive: v }),
      pendingLevelUp: null,
      mergePendingLevelUp: (rewards) =>
        set((s) => {
          const existing = s.pendingLevelUp;
          if (!existing) return { pendingLevelUp: rewards };
          const items = new Map(existing.items.map((it) => [it.id, { ...it }]));
          for (const it of rewards.items) {
            const cur = items.get(it.id);
            if (cur) cur.qty += it.qty;
            else items.set(it.id, { ...it });
          }
          return {
            pendingLevelUp: {
              fromLevel: Math.min(existing.fromLevel, rewards.fromLevel),
              toLevel: Math.max(existing.toLevel, rewards.toLevel),
              coins: existing.coins + rewards.coins,
              eggs: existing.eggs + rewards.eggs,
              items: [...items.values()],
            },
          };
        }),
      clearPendingLevelUp: () => set({ pendingLevelUp: null }),
      setsThisBattle: 0,
      usedThisBattle: {},
      xAttackActive: false,
      scopeRevealedThisBattle: false,
      amuletCoinActive: false,
      expCharmActive: false,
      luckyPunchActive: false,
      starPieceActive: false,
      choiceSpecsActive: false,
      anyItemUsedThisBattle: false,
      itemsUsedThisBattleCount: 0,
      bonusTimeThisBattle: 0,
      battleStatuses: [],
      opponentStatuses: [],
      myStages: zeroStages(),
      oppStages: zeroStages(),
      starterPvpBerryGranted: false,
      hasEnteredNearbyBattle: false,

      seenQuestionHashes: [],
      seenQuestions: [],
      seenCuratedIds: [],

      flags: [],
      dailyResult: null,
      battleLog: [],

      evolvePartner: (toPokemon) => {
        const s = get();
        if (!s.pokemon) return false;
        const fromId = s.pokemon.id;
        const stage = s.pokemon.evolutionStage;
        if (stage !== 1 && stage !== 2) return false;
        const cost = EVOLUTION_TP_COST[stage];
        const currentTp = s.trainingPoints[fromId] ?? 0;
        if (currentTp < cost) return false;
        if (!s.pokemon.evolvesToIds.includes(toPokemon.id)) return false;
        const remainingTp = currentTp - cost;
        const newTpMap = { ...s.trainingPoints };
        delete newTpMap[fromId];
        newTpMap[toPokemon.id] = (newTpMap[toPokemon.id] ?? 0) + remainingTp;
        set({
          pokemon: toPokemon,
          // Keep the rolled ability across evolution unless the primary type
          // changed (then re-roll from the new type's trio).
          abilityId:
            toPokemon.types[0] === s.pokemon.types[0]
              ? s.abilityId
              : rollAbilityId(toPokemon.types),
          trainingPoints: newTpMap,
          pokedex: {
            ...s.pokedex,
            [toPokemon.id]: {
              pokemonId: toPokemon.id,
              firstSeenAt: s.pokedex[toPokemon.id]?.firstSeenAt ?? Date.now(),
              shinyUnlocked: s.pokedex[toPokemon.id]?.shinyUnlocked ?? false,
              defeatCount: s.pokedex[toPokemon.id]?.defeatCount ?? 0,
            },
          },
        });
        return true;
      },

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

      markCuratedSeen: (ids) => {
        if (ids.length === 0) return;
        const s = get();
        const merged = [...s.seenCuratedIds];
        const have = new Set(merged);
        for (const id of ids) {
          if (have.has(id)) continue;
          have.add(id);
          merged.push(id);
        }
        set({ seenCuratedIds: merged.slice(-MAX_SEEN_CURATED) });
      },

      startGuestSession: () => {
        // Guests get a non-legendary, base-stage starter that can still evolve
        // (feedback 96098111 + d4e7dcc3): legendaries/mythicals are Poké-Egg
        // exclusive, and a base-stage Pokémon with an evolution ahead of it lets
        // the guest experience levelling up and evolving. Falls back to any
        // non-legendary if the strict pool were ever empty. Plus a random
        // trainer name, not a Pokémon name.
        const nonLegendary = ALL_POKEMON.filter((p) => !isLegendaryOrMythical(p.id));
        const guestPool = nonLegendary.filter((p) => isStartingPartner(p) && canEvolve(p));
        const pool = guestPool.length > 0 ? guestPool : nonLegendary;
        const poke = pool[Math.floor(Math.random() * pool.length)];
        const trainer = TRAINER_SPRITES[Math.floor(Math.random() * TRAINER_SPRITES.length)];
        set({
          hasOnboarded: true,
          isGuest: true,
          lastSeenWhatsNew: WHATS_NEW.version,
          engageShownThisSession: true,
          trainerName: randomGuestName(),
          pokemon: poke,
          abilityId: rollAbilityId(poke.types),
          pokedex: {
            ...get().pokedex,
            [poke.id]: {
              pokemonId: poke.id,
              firstSeenAt: Date.now(),
              shinyUnlocked: false,
              defeatCount: 0,
            },
          },
          trainerSprite: trainer.id,
        });
      },

      reset: () =>
        set({
          hasOnboarded: false,
          trainerName: "",
          trainerSprite: "red",
          pokemon: null,
          abilityId: null,
          level: 1,
          peakLevel: 1,
          xp: 0,
          coins: 0,
          stats: defaultStats,
          inventory: { ...defaultInventory },
          itemCooldowns: {},
          inBattle: false,
          setsThisBattle: 0,
          usedThisBattle: {},
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          amuletCoinActive: false,
          expCharmActive: false,
          luckyPunchActive: false,
          starPieceActive: false,
          choiceSpecsActive: false,
          anyItemUsedThisBattle: false,
          itemsUsedThisBattleCount: 0,
          bonusTimeThisBattle: 0,
          battleStatuses: [],
          opponentStatuses: [],
          myStages: zeroStages(),
          oppStages: zeroStages(),
          starterPvpBerryGranted: false,
          hasEnteredNearbyBattle: false,
          luckyEggExpiresAt: 0,
          bigNuggetExpiresAt: 0,
          luckyEggUsedWeek: 0,
          focusBandUsedWeek: 0,
          assaultVestUsedWeek: 0,
          kingsRockUsedWeek: 0,
          leftoversUsedWeek: 0,
          metronomeUsedWeek: 0,
          autoItems: {},
          whosThatHourKey: 0,
          whosThatActiveRound: null,
          whosThatRoundHourKey: null,
          engageShownThisSession: false,
          engageDismissCount: 0,
          engageDismissDate: null,
          lastEngagePromptDate: null,
          seenQuestionHashes: [],
          seenQuestions: [],
          seenCuratedIds: [],
          flags: [],
          dailyResult: null,
          battleLog: [],
          pokedex: {},
          defeatedEliteRegions: [],
          defeatedElites: [],
          abilityCodex: [],
          trainingPoints: {},
          weeklyLeague: null,
          gymBadges: [],
          weeklyLeagueHistory: [],
          claimedMegaRewards: [],
          pokeEggs: [],
        }),

      setPokemon: (p) =>
        set((s) => ({
          pokemon: p,
          abilityId: rollAbilityId(p.types),
          // A chosen partner counts as captured.
          pokedex: {
            ...s.pokedex,
            [p.id]: {
              pokemonId: p.id,
              firstSeenAt: s.pokedex[p.id]?.firstSeenAt ?? Date.now(),
              shinyUnlocked: s.pokedex[p.id]?.shinyUnlocked ?? false,
              defeatCount: s.pokedex[p.id]?.defeatCount ?? 0,
            },
          },
        })),

      startBattle: () =>
        set({
          inBattle: true,
          setsThisBattle: 0,
          usedThisBattle: {},
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          amuletCoinActive: false,
          expCharmActive: false,
          luckyPunchActive: false,
          starPieceActive: false,
          choiceSpecsActive: false,
          anyItemUsedThisBattle: false,
          itemsUsedThisBattleCount: 0,
          bonusTimeThisBattle: 0,
          battleStatuses: [],
          opponentStatuses: [],
          myStages: zeroStages(),
          oppStages: zeroStages(),
        }),

      abortBattle: () =>
        set({
          inBattle: false,
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          amuletCoinActive: false,
          expCharmActive: false,
          luckyPunchActive: false,
          starPieceActive: false,
          choiceSpecsActive: false,
          anyItemUsedThisBattle: false,
          itemsUsedThisBattleCount: 0,
          bonusTimeThisBattle: 0,
          battleStatuses: [],
          opponentStatuses: [],
          myStages: zeroStages(),
          oppStages: zeroStages(),
        }),

      endBattle: (won, xpGained) => {
        const s = get();
        const finalXp = xpGained;
        set({
          inBattle: false,
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          amuletCoinActive: false,
          expCharmActive: false,
          luckyPunchActive: false,
          starPieceActive: false,
          choiceSpecsActive: false,
          anyItemUsedThisBattle: false,
          itemsUsedThisBattleCount: 0,
          bonusTimeThisBattle: 0,
          battleStatuses: [],
          opponentStatuses: [],
          myStages: zeroStages(),
          oppStages: zeroStages(),
          usedThisBattle: {},
          stats: {
            ...s.stats,
            battles: s.stats.battles + 1,
            wins: s.stats.wins + (won ? 1 : 0),
            losses: s.stats.losses + (won ? 0 : 1),
          },
        });
        get().addXp(finalXp);
      },

      addXp: (amount) => {
        const s = get();
        const mult = Date.now() < s.luckyEggExpiresAt ? 2 : 1;
        const gain = amount * mult;
        const newXp = s.xp + gain;
        const newLevel = levelFromTotalXp(newXp);
        const newPeak = Math.max(s.peakLevel, newLevel);
        set({ xp: newXp, level: newLevel, peakLevel: newPeak });
      },

      addCoins: (n) => {
        const v = Math.max(0, Math.round(n));
        if (v <= 0) return;
        set((s) => ({ coins: s.coins + v }));
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

      applyBattleStatus: (status, target = "self") => {
        const key = target === "self" ? "battleStatuses" : "opponentStatuses";
        set((s) => {
          const prev = s[key];
          // Replace an existing instance of the same kind (refresh, not stack).
          let list = prev.filter((x) => x.kind !== status.kind);
          // One major status at a time: a new major evicts other majors.
          // Confusion (the sole volatile) coexists with everything.
          if (STATUS_META[status.kind].major) {
            list = list.filter((x) => !STATUS_META[x.kind].major);
          }
          return { [key]: [...list, status] } as Partial<GameState>;
        });
      },

      tickBattleStatusCure: (kind, target = "self") => {
        const key = target === "self" ? "battleStatuses" : "opponentStatuses";
        const prev = get()[key];
        const willClear = prev.some((s) => s.kind === kind && s.curesRemaining === 1);
        const updated = prev
          .map((s) => (s.kind === kind ? { ...s, curesRemaining: s.curesRemaining - 1 } : s))
          .filter((s) => s.curesRemaining > 0);
        set({ [key]: updated } as Partial<GameState>);
        return willClear;
      },

      clearBattleStatus: (kind, target = "self") => {
        const key = target === "self" ? "battleStatuses" : "opponentStatuses";
        set((s) => ({ [key]: s[key].filter((x) => x.kind !== kind) }) as Partial<GameState>);
      },

      clearAllBattleStatuses: (target = "self") => {
        const key = target === "self" ? "battleStatuses" : "opponentStatuses";
        set({ [key]: [] } as Partial<GameState>);
      },

      bumpPvpStage: (who, stat, delta) => {
        const key = who === "self" ? "myStages" : "oppStages";
        set((s) => {
          const cur = s[key];
          const next = clampStage(cur[stat] + delta);
          return { [key]: { ...cur, [stat]: next } } as Partial<GameState>;
        });
      },

      resetPvpStages: () => set({ myStages: zeroStages(), oppStages: zeroStages() }),

      markNearbyBattleEntered: () => {
        const s = get();
        const first = !s.hasEnteredNearbyBattle;
        if (first) set({ hasEnteredNearbyBattle: true });
        return first;
      },

      raiseFlag: (name) => {
        const s = get();
        if (s.flags.includes(name)) return;
        set({ flags: [...s.flags, name] });
      },

      recordDaily: (r) => set({ dailyResult: r }),

      pushBattleLog: (e) => {
        const s = get();
        const nextLog = [e, ...s.battleLog].slice(0, 300);
        const mode = e.mode ?? "battle";
        const today = new Date(e.timestamp).toISOString().slice(0, 10);
        // At most one mode-completion per calendar day counts toward egg progress,
        // so the same mode can't be farmed for repeated bonuses.
        const alreadyCountedToday = s.battleLog.some(
          (x) =>
            (x.mode ?? "battle") === mode &&
            new Date(x.timestamp).toISOString().slice(0, 10) === today,
        );
        let nextEggs = s.pokeEggs;
        if (!alreadyCountedToday && s.pokeEggs.some((egg) => egg.progress < egg.required)) {
          const bonus = streakProgressBonus(currentPlayStreakDays(nextLog));
          nextEggs = s.pokeEggs.map((egg) => ({
            ...egg,
            progress: Math.min(egg.required, egg.progress + bonus),
          }));
        }
        set({ battleLog: nextLog, pokeEggs: nextEggs });
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
        abilityId: s.abilityId,
        lastSeenWhatsNew: s.lastSeenWhatsNew,
        level: s.level,
        peakLevel: s.peakLevel,
        xp: s.xp,
        coins: s.coins,
        stats: s.stats,
        inventory: s.inventory,
        itemCooldowns: s.itemCooldowns,
        luckyEggExpiresAt: s.luckyEggExpiresAt,
        bigNuggetExpiresAt: s.bigNuggetExpiresAt,
        luckyEggUsedWeek: s.luckyEggUsedWeek,
        focusBandUsedWeek: s.focusBandUsedWeek,
        assaultVestUsedWeek: s.assaultVestUsedWeek,
        kingsRockUsedWeek: s.kingsRockUsedWeek,
        leftoversUsedWeek: s.leftoversUsedWeek,
        metronomeUsedWeek: s.metronomeUsedWeek,
        autoItems: s.autoItems,
        whosThatHourKey: s.whosThatHourKey,
        whosThatActiveRound: s.whosThatActiveRound,
        whosThatRoundHourKey: s.whosThatRoundHourKey,
        seenQuestionHashes: s.seenQuestionHashes,
        seenQuestions: s.seenQuestions,
        seenCuratedIds: s.seenCuratedIds,
        flags: s.flags,
        dailyResult: s.dailyResult,
        battleLog: s.battleLog,
        pokedex: s.pokedex,
        defeatedEliteRegions: s.defeatedEliteRegions,
        defeatedElites: s.defeatedElites,
        abilityCodex: s.abilityCodex,
        trainingPoints: s.trainingPoints,
        weeklyLeague: s.weeklyLeague,
        gymBadges: s.gymBadges,
        weeklyLeagueHistory: s.weeklyLeagueHistory,
        darkMode: s.darkMode,
        friendCode: s.friendCode,
        lastEngagePromptDate: s.lastEngagePromptDate,
        engageDismissCount: s.engageDismissCount,
        engageDismissDate: s.engageDismissDate,
        nameReconciled: s.nameReconciled,
        needsNameReclaim: s.needsNameReclaim,

        dailyGiftLastClaim: s.dailyGiftLastClaim,
        dailyGiftStreak: s.dailyGiftStreak,
        featuredDealLastPurchase: s.featuredDealLastPurchase,
        guaranteedShinyPending: s.guaranteedShinyPending,
        pokeEggs: s.pokeEggs,
        megaTrophies: s.megaTrophies,
        claimedMegaRewards: s.claimedMegaRewards,
        // PvP flags (ephemeral status/stat-stage fields are intentionally excluded).
        starterPvpBerryGranted: s.starterPvpBerryGranted,
        hasEnteredNearbyBattle: s.hasEnteredNearbyBattle,
      }),

      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        // Migrate legacy dailyResult.pattern (string) -> DailyMark[]
        let dailyResult = p.dailyResult ?? null;
        if (
          dailyResult &&
          typeof (dailyResult as unknown as { pattern: unknown }).pattern === "string"
        ) {
          const str = (dailyResult as unknown as { pattern: string }).pattern;
          const marks: DailyMark[] = Array.from(str).map((c) =>
            c === "🟩" ? "correct" : c === "🟥" ? "wrong" : "timeout",
          );
          dailyResult = { ...dailyResult, pattern: marks };
        }
        const peak = p.peakLevel ?? 1;
        const migratedXp = Math.max(p.xp ?? 0, totalXpToReachLevel(peak));
        const migratedCoins = p.coins ?? p.xp ?? 0;
        // Migrate legacy pokeEggs (a plain count) -> PokeEgg[] with fresh progress.
        const rawEggs = p.pokeEggs as unknown;
        const pokeEggs: PokeEgg[] =
          typeof rawEggs === "number"
            ? Array.from({ length: rawEggs }, (_, i) => ({
                id: `legacy-${i}-${Date.now()}`,
                grantedAt: Date.now(),
                progress: 0,
                required: EGG_HATCH_REQUIRED,
              }))
            : ((rawEggs as PokeEgg[] | undefined) ?? []);
        return {
          ...current,
          ...p,
          xp: migratedXp,
          coins: migratedCoins,
          pokeEggs,
          pokemon: rehydratePokemon(p.pokemon ?? null),
          abilityId: p.abilityId ?? null,
          lastSeenWhatsNew: p.lastSeenWhatsNew ?? 0,
          flags: p.flags ?? [],
          battleLog: p.battleLog ?? [],
          dailyResult,
          pokedex: p.pokedex ?? {},
          defeatedEliteRegions: p.defeatedEliteRegions ?? [],
          defeatedElites: p.defeatedElites ?? [],
          abilityCodex: p.abilityCodex ?? [],
          trainingPoints: p.trainingPoints ?? {},
          weeklyLeague: p.weeklyLeague ?? null,
          gymBadges: p.gymBadges ?? [],
          weeklyLeagueHistory: p.weeklyLeagueHistory ?? [],
          starterPvpBerryGranted: p.starterPvpBerryGranted ?? false,
          hasEnteredNearbyBattle: p.hasEnteredNearbyBattle ?? false,
        };
      },
    },
  ),
);

export function getItemDef(id: ItemId) {
  return ITEMS.find((i) => i.id === id)!;
}

// ALL_POKEMON re-exported from pokemon-data; kept here for back-compat consumers.
export { ALL_POKEMON };
