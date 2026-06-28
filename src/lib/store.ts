import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { ItemId } from "./game-data";
import { ITEMS, levelFromTotalXp, totalXpToReachLevel, TRAINER_SPRITES, EVOLUTION_TP_COST, getWeekRangeUtc } from "./game-data";
import type { PokeEntry } from "./pokemon-data";
import { ALL_POKEMON, rehydratePokemon } from "./pokemon-data";
import { pickRandomGymLeader } from "./gym-leaders";
import type { Round } from "@/routes/whos-that-pokemon";

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

export type DailyMark = "correct" | "wrong" | "timeout";

export interface DailyResult {
  date: string;
  correct: number;
  total: number;
  timeMs: number;
  pattern: DailyMark[];
}

export interface PokedexEntry {
  pokemonId: number;
  firstSeenAt: number;
  shinyUnlocked: boolean;
  defeatCount: number;
}

export interface WeeklyLeagueState {
  weekStartTs: number;
  gymLeaderId: string;
  status: "not_started" | "in_progress" | "won" | "lost";
  attemptStartedAt: number | null;
  questionsAnswered: number;
}

export interface WeeklyLeagueAttempt {
  weekStartTs: number;
  gymLeaderId: string;
  won: boolean;
}

export interface GameState {
  // profile
  hasOnboarded: boolean;
  isGuest: boolean;
  trainerName: string;
  trainerSprite: string;
  friendCode: string | null;
  lastEngagePromptDate: string | null;
  engageDismissCount: number;
  engageDismissDate: string | null;
  engageShownThisSession: boolean;
  nameReconciled: boolean;
  needsNameReclaim: boolean;

  
  dailyGiftLastClaim: string | null;
  dailyGiftStreak: number;
  guaranteedShinyPending: boolean;
  pokeEggs: number;
  megaTrophies: { eventId: string; name: string; pokeId: number; claimedAt: string }[];
  pokemon: PokeEntry | null;


  // progression
  level: number;
  peakLevel: number;
  xp: number;
  coins: number;
  stats: PlayerStats;
  inventory: Record<ItemId, number>;
  itemCooldowns: Partial<Record<ItemId, number>>; // sets-remaining cooldown

  // battle ephemeral state
  inBattle: boolean;
  battleScreenActive: boolean;
  setsThisBattle: number;
  usedThisBattle: Partial<Record<ItemId, boolean>>;
  xAttackActive: boolean;
  scopeRevealedThisBattle: boolean;
  bonusTimeThisBattle: number;
  luckyEggExpiresAt: number;
  luckyEggUsedWeek: number;
  focusBandUsedWeek: number;
  assaultVestUsedWeek: number;
  autoItems: Partial<Record<ItemId, boolean>>;
  whosThatHourKey: number;
  whosThatActiveRound: Round | null;
  whosThatRoundHourKey: number | null;

  // question history (per-device)
  seenQuestionHashes: string[];
  seenQuestions: string[];
  seenCuratedIds: string[];


  // achievements / progression flags
  flags: string[];

  // daily challenge
  dailyResult: DailyResult | null;

  // battle log (cap 20)
  battleLog: BattleLogEntry[];

  // pokédex
  pokedex: Record<number, PokedexEntry>;
  defeatedEliteRegions: string[];
  defeatedElites: string[];

  // ability codex (Phase 2)
  abilityCodex: string[];

  // Phase 3: per-partner Training Points
  trainingPoints: Record<number, number>;

  // Phase 4: Weekly League
  weeklyLeague: WeeklyLeagueState | null;
  gymBadges: string[];
  weeklyLeagueHistory: WeeklyLeagueAttempt[];

  // preferences
  darkMode: boolean;


  // actions
  setOnboarded: (name: string, pokemon: PokeEntry, trainerSprite: string) => void;
  setFriendCode: (code: string) => void;
  setLastEngagePromptDate: (date: string) => void;
  recordEngageDismiss: () => void;
  setNameReconciled: (v: boolean) => void;
  setNeedsNameReclaim: (v: boolean) => void;
  setEngageShownThisSession: (v: boolean) => void;
  setWhosThatRound: (round: Round, hourKey: number) => void;
  clearWhosThatRound: () => void;

  
  claimDailyGift: () => { itemId: ItemId; qty: number; day: number; shiny: boolean } | null;
  consumeGuaranteedShiny: () => void;
  grantPokeEgg: (n?: number) => void;
  claimMegaChampion: (eventId: string, name: string, pokeId: number) => boolean;
  hatchPokeEgg: () => boolean;
  startGuestSession: () => void;

  reset: () => void;
  setName: (name: string) => void;
  setPokemon: (p: PokeEntry) => void;
  setTrainerSprite: (id: string) => void;
  markQuestionsSeen: (texts: string[]) => void;
  markCuratedSeen: (ids: string[]) => void;

  buyItem: (id: ItemId, cost: number) => boolean;
  useItem: (id: ItemId) => boolean;
  tryAutoFocusBand: () => boolean;
  tryAutoQuickClaw: () => boolean;
  tryAutoAssaultVest: () => boolean;
  toggleAutoItem: (id: ItemId) => void;
  grantItem: (id: ItemId, qty?: number) => void;
  consumeWhosThat: () => void;

  startBattle: () => void;
  endBattle: (won: boolean, xpGained: number) => void;
  abortBattle: () => void;
  setBattleScreenActive: (v: boolean) => void;
  recordAnswer: (correct: boolean, timeMs: number, streak: number) => void;
  completeSet: () => void;
  consumeXAttack: () => void;
  consumeScope: () => void;
  addXp: (amount: number) => void;
  addCoins: (n: number) => void;
  raiseFlag: (name: string) => void;
  recordDaily: (r: DailyResult) => void;
  pushBattleLog: (e: BattleLogEntry) => void;
  recordPokedexCapture: (pokemonId: number, isShiny: boolean) => void;
  markEliteDefeated: (memberId: string, region: string, regionDone: boolean) => void;
  registerAbilityTriggered: (abilityId: string) => void;

  // Phase 3 actions
  addTrainingPoints: (pokemonId: number, amount: number) => void;
  spendTrainingPoints: (pokemonId: number, amount: number) => boolean;
  getPartnerTp: (pokemonId: number) => number;
  evolvePartner: (toPokemon: PokeEntry) => boolean;

  // Phase 4: Weekly League actions
  initWeeklyLeague: () => void;
  startWeeklyLeagueAttempt: () => void;
  recordWeeklyLeagueResult: (won: boolean) => void;

  // preferences actions
  setDarkMode: (v: boolean) => void;
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
  superpotion: 0,
  maxpotion: 0,
  xattack: 1,
  escape: 1,
  candy: 0,
  luckyegg: 0,
  scope: 1,
  xaccuracy: 1,
  focusband: 0,
  quickclaw: 0,
  assaultvest: 0,
};

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      hasOnboarded: false,
      isGuest: false,
      trainerName: "",
      trainerSprite: TRAINER_SPRITES[0]?.id ?? "",
      friendCode: null,
      lastEngagePromptDate: null,
      engageDismissCount: 0,
      engageDismissDate: null,
      engageShownThisSession: false,
      nameReconciled: false,
      needsNameReclaim: false,

      dailyGiftLastClaim: null,
      dailyGiftStreak: 0,
      guaranteedShinyPending: false,
      pokeEggs: 0,
      megaTrophies: [],
      pokemon: null,

      level: 1,
      peakLevel: 1,
      xp: 0,
      coins: 0,
      stats: defaultStats,
      inventory: { ...defaultInventory },
      itemCooldowns: {},

      inBattle: false,
      battleScreenActive: false,
      setBattleScreenActive: (v) => set({ battleScreenActive: v }),
      setsThisBattle: 0,
      usedThisBattle: {},
      xAttackActive: false,
      scopeRevealedThisBattle: false,
      bonusTimeThisBattle: 0,
      luckyEggExpiresAt: 0,
      luckyEggUsedWeek: 0,
      focusBandUsedWeek: 0,
      assaultVestUsedWeek: 0,
      autoItems: {},
      whosThatHourKey: 0,
      whosThatActiveRound: null,
      whosThatRoundHourKey: null,

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
      darkMode: false,
      setDarkMode: (v) => set({ darkMode: v }),


      initWeeklyLeague: () => {
        const s = get();
        const { start: weekStartTs } = getWeekRangeUtc();
        if (s.weeklyLeague && s.weeklyLeague.weekStartTs === weekStartTs) return;
        const leader = pickRandomGymLeader(s.gymBadges);
        set({
          weeklyLeague: {
            weekStartTs,
            gymLeaderId: leader.id,
            status: "not_started",
            attemptStartedAt: null,
            questionsAnswered: 0,
          },
        });
      },

      startWeeklyLeagueAttempt: () => {
        const s = get();
        if (!s.weeklyLeague) return;
        if (s.weeklyLeague.status !== "not_started" && s.weeklyLeague.status !== "in_progress") return;
        set({
          weeklyLeague: {
            ...s.weeklyLeague,
            status: "in_progress",
            attemptStartedAt: s.weeklyLeague.attemptStartedAt ?? Date.now(),
          },
        });
      },

      recordWeeklyLeagueResult: (won) => {
        const s = get();
        if (!s.weeklyLeague) return;
        const newHistory: WeeklyLeagueAttempt[] = [
          ...s.weeklyLeagueHistory,
          {
            weekStartTs: s.weeklyLeague.weekStartTs,
            gymLeaderId: s.weeklyLeague.gymLeaderId,
            won,
          },
        ].slice(-8);
        let newBadges = s.gymBadges;
        if (won && !s.gymBadges.includes(s.weeklyLeague.gymLeaderId)) {
          newBadges = [...s.gymBadges, s.weeklyLeague.gymLeaderId];
        }
        set({
          weeklyLeague: { ...s.weeklyLeague, status: won ? "won" : "lost" },
          gymBadges: newBadges,
          weeklyLeagueHistory: newHistory,
        });
      },

      addTrainingPoints: (pokemonId, amount) => {
        const s = get();
        const current = s.trainingPoints[pokemonId] ?? 0;
        set({
          trainingPoints: { ...s.trainingPoints, [pokemonId]: current + amount },
        });
      },

      spendTrainingPoints: (pokemonId, amount) => {
        const s = get();
        const current = s.trainingPoints[pokemonId] ?? 0;
        if (current < amount) return false;
        set({
          trainingPoints: { ...s.trainingPoints, [pokemonId]: current - amount },
        });
        return true;
      },

      getPartnerTp: (pokemonId) => get().trainingPoints[pokemonId] ?? 0,

      tryAutoFocusBand: () => {
        const s = get();
        if ((s.inventory.focusband ?? 0) <= 0) return false;
        if (s.autoItems.focusband === false) return false;
        const { start } = getWeekRangeUtc();
        if (s.focusBandUsedWeek === start) return false;
        set({
          inventory: { ...s.inventory, focusband: (s.inventory.focusband ?? 0) - 1 },
          focusBandUsedWeek: start,
        });
        return true;
      },

      tryAutoQuickClaw: () => {
        const s = get();
        if ((s.inventory.quickclaw ?? 0) <= 0) return false;
        if (s.autoItems.quickclaw === false) return false;
        if (s.usedThisBattle.quickclaw) return false;
        set({
          inventory: { ...s.inventory, quickclaw: (s.inventory.quickclaw ?? 0) - 1 },
          usedThisBattle: { ...s.usedThisBattle, quickclaw: true },
        });
        return true;
      },

      tryAutoAssaultVest: () => {
        const s = get();
        if ((s.inventory.assaultvest ?? 0) <= 0) return false;
        if (s.autoItems.assaultvest === false) return false;
        const { start } = getWeekRangeUtc();
        if (s.assaultVestUsedWeek === start) return false;
        set({
          inventory: { ...s.inventory, assaultvest: (s.inventory.assaultvest ?? 0) - 1 },
          assaultVestUsedWeek: start,
        });
        return true;
      },

      toggleAutoItem: (id) => {
        const s = get();
        const enabled = s.autoItems[id] !== false;
        set({ autoItems: { ...s.autoItems, [id]: !enabled } });
      },

      grantItem: (id, qty = 1) => {
        const s = get();
        set({ inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + qty } });
      },

      consumeWhosThat: () => {
        set({ whosThatHourKey: Math.floor(Date.now() / 3_600_000) });
      },
      setWhosThatRound: (round, hourKey) => set({ whosThatActiveRound: round, whosThatRoundHourKey: hourKey }),
      clearWhosThatRound: () => set({ whosThatActiveRound: null, whosThatRoundHourKey: null }),


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

      setOnboarded: (name, pokemon, trainerSprite) =>
        set({ hasOnboarded: true, isGuest: false, trainerName: name, pokemon, trainerSprite }),

      setFriendCode: (code) => set({ friendCode: code }),
      setLastEngagePromptDate: (date) => set({ lastEngagePromptDate: date }),
      setNameReconciled: (v) => set({ nameReconciled: v }),
      setNeedsNameReclaim: (v) => set({ needsNameReclaim: v }),
      setEngageShownThisSession: (v) => set({ engageShownThisSession: v }),

      recordEngageDismiss: () => {
        const today = new Date().toISOString().slice(0, 10);
        const s = get();
        if (s.engageDismissDate !== today) {
          set({ engageDismissDate: today, engageDismissCount: 1 });
        } else {
          set({ engageDismissCount: s.engageDismissCount + 1 });
        }
      },

      claimDailyGift: () => {
        const s = get();
        const today = new Date().toISOString().slice(0, 10);
        if (s.dailyGiftLastClaim === today) return null;
        const yd = new Date();
        yd.setUTCDate(yd.getUTCDate() - 1);
        const yesterday = yd.toISOString().slice(0, 10);
        const continuing = s.dailyGiftLastClaim === yesterday;
        const day = ((continuing ? s.dailyGiftStreak : 0) % 7) + 1;
        const commonPool: ItemId[] = ["potion", "xattack", "scope", "superpotion", "xaccuracy", "escape", "quickclaw", "maxpotion"];
        const premiumPool: ItemId[] = ["candy", "luckyegg", "focusband", "assaultvest"];
        const shiny = day === 7;
        let itemId: ItemId;
        let qty = 1;
        if (shiny) {
          itemId = premiumPool[Math.floor(Math.random() * premiumPool.length)];
        } else {
          itemId = commonPool[Math.floor(Math.random() * commonPool.length)];
          qty = Math.random() < 0.3 ? 2 : 1;
        }
        set({
          inventory: { ...s.inventory, [itemId]: (s.inventory[itemId] ?? 0) + qty },
          dailyGiftStreak: day,
          dailyGiftLastClaim: today,
          guaranteedShinyPending: shiny ? true : s.guaranteedShinyPending,
        });
        return { itemId, qty, day, shiny };
      },
      consumeGuaranteedShiny: () => set({ guaranteedShinyPending: false }),
      grantPokeEgg: (n = 1) => set((s) => ({ pokeEggs: (s.pokeEggs ?? 0) + n })),
      claimMegaChampion: (eventId, name, pokeId) => {
        const s = get();
        if ((s.megaTrophies ?? []).some((t) => t.eventId === eventId)) return false;
        set({ megaTrophies: [...(s.megaTrophies ?? []), { eventId, name, pokeId, claimedAt: new Date().toISOString() }] });
        return true;
      },
      hatchPokeEgg: () => {
        const s = get();
        if ((s.pokeEggs ?? 0) <= 0) return false;
        set({ pokeEggs: s.pokeEggs - 1 });
        return true;
      },


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
          coins: 0,
          stats: defaultStats,
          inventory: { ...defaultInventory },
          itemCooldowns: {},
          inBattle: false,
          setsThisBattle: 0,
          usedThisBattle: {},
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          bonusTimeThisBattle: 0,
          luckyEggExpiresAt: 0,
          luckyEggUsedWeek: 0,
          focusBandUsedWeek: 0,
          assaultVestUsedWeek: 0,
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
        }),

      setName: (name) => set({ trainerName: name }),
      setPokemon: (p) => set({ pokemon: p }),
      setTrainerSprite: (id) => set({ trainerSprite: id }),

      buyItem: (id, cost) => {
        const s = get();
        if (s.coins < cost) return false;
        set({
          coins: s.coins - cost,
          inventory: { ...s.inventory, [id]: (s.inventory[id] ?? 0) + 1 },
        });
        return true;
      },

      useItem: (id) => {
        const s = get();
        const have = s.inventory[id] ?? 0;
        if (have <= 0) return false;

        // Auto-trigger items can't be used manually
        if (id === "focusband" || id === "quickclaw" || id === "assaultvest") return false;

        // Once-per-battle items
        const ONCE_PER_BATTLE: ItemId[] = ["potion", "superpotion", "maxpotion", "xattack", "scope", "xaccuracy", "escape"];
        if (ONCE_PER_BATTLE.includes(id) && s.usedThisBattle[id]) return false;

        // Lucky Egg: one activation per week (Monday 00:00 UTC reset)
        if (id === "luckyegg") {
          const { start } = getWeekRangeUtc();
          if (s.luckyEggUsedWeek === start) return false;
        }

        const nextInventory = { ...s.inventory, [id]: have - 1 };
        const nextUsed = ONCE_PER_BATTLE.includes(id)
          ? { ...s.usedThisBattle, [id]: true }
          : s.usedThisBattle;

        set({
          inventory: nextInventory,
          usedThisBattle: nextUsed,
          xAttackActive: id === "xattack" ? true : s.xAttackActive,
          luckyEggExpiresAt:
            id === "luckyegg" ? Date.now() + 24 * 60 * 60 * 1000 : s.luckyEggExpiresAt,
          luckyEggUsedWeek:
            id === "luckyegg" ? getWeekRangeUtc().start : s.luckyEggUsedWeek,
        });

        if (id === "candy") {
          const p = get().pokemon;
          if (p) get().addTrainingPoints(p.id, 50);
        }
        return true;
      },

      startBattle: () =>
        set({
          inBattle: true,
          setsThisBattle: 0,
          usedThisBattle: {},
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          bonusTimeThisBattle: 0,
        }),

      abortBattle: () =>
        set({
          inBattle: false,
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          bonusTimeThisBattle: 0,
        }),

      endBattle: (won, xpGained) => {
        const s = get();
        const finalXp = xpGained;
        set({
          inBattle: false,
          xAttackActive: false,
          scopeRevealedThisBattle: false,
          bonusTimeThisBattle: 0,
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
        set({ xp: newXp, coins: s.coins + gain, level: newLevel, peakLevel: newPeak });
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
        set({ battleLog: [e, ...s.battleLog].slice(0, 100) });
      },

      recordPokedexCapture: (pokemonId, isShiny) => {
        const s = get();
        const existing = s.pokedex[pokemonId];
        set({
          pokedex: {
            ...s.pokedex,
            [pokemonId]: {
              pokemonId,
              firstSeenAt: existing?.firstSeenAt ?? Date.now(),
              shinyUnlocked: (existing?.shinyUnlocked ?? false) || isShiny,
              defeatCount: (existing?.defeatCount ?? 0) + 1,
            },
          },
        });
      },

      markEliteDefeated: (memberId, region, regionDone) => {
        const s = get();
        const elites = s.defeatedElites.includes(memberId)
          ? s.defeatedElites
          : [...s.defeatedElites, memberId];
        const regions =
          regionDone && !s.defeatedEliteRegions.includes(region)
            ? [...s.defeatedEliteRegions, region]
            : s.defeatedEliteRegions;
        set({ defeatedElites: elites, defeatedEliteRegions: regions });
      },

      registerAbilityTriggered: (abilityId) => {
        const s = get();
        if (s.abilityCodex.includes(abilityId)) return;
        set({ abilityCodex: [...s.abilityCodex, abilityId] });
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
        coins: s.coins,
        stats: s.stats,
        inventory: s.inventory,
        itemCooldowns: s.itemCooldowns,
        luckyEggExpiresAt: s.luckyEggExpiresAt,
        luckyEggUsedWeek: s.luckyEggUsedWeek,
        focusBandUsedWeek: s.focusBandUsedWeek,
        assaultVestUsedWeek: s.assaultVestUsedWeek,
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
        guaranteedShinyPending: s.guaranteedShinyPending,
        pokeEggs: s.pokeEggs,
        megaTrophies: s.megaTrophies,

      }),

      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<GameState>;
        // Migrate legacy dailyResult.pattern (string) -> DailyMark[]
        let dailyResult = p.dailyResult ?? null;
        if (dailyResult && typeof (dailyResult as unknown as { pattern: unknown }).pattern === "string") {
          const str = (dailyResult as unknown as { pattern: string }).pattern;
          const marks: DailyMark[] = Array.from(str).map((c) =>
            c === "🟩" ? "correct" : c === "🟥" ? "wrong" : "timeout",
          );
          dailyResult = { ...dailyResult, pattern: marks };
        }
        const peak = p.peakLevel ?? 1;
        const migratedXp = Math.max(p.xp ?? 0, totalXpToReachLevel(peak));
        const migratedCoins = p.coins ?? p.xp ?? 0;
        return {
          ...current,
          ...p,
          xp: migratedXp,
          coins: migratedCoins,
          pokemon: rehydratePokemon(p.pokemon ?? null),
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
