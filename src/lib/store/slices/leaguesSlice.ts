import type { GameState, WeeklyLeagueAttempt } from "@/lib/store/types";
import type { StoreSlice } from "@/lib/store/slice";
import { getWeekRangeUtc } from "@/lib/game-data";
import { ROUTE_START, nextRoute, regionRoute, routeGym, stopsLeft } from "@/lib/route";
import { MAX_STREAK_FREEZES, freezesToUse } from "@/lib/win-streak";

/** A badge earned while already holding the most freezes pays this instead. */
export const FULL_FREEZE_COINS = 250;

export const createLeaguesSlice: StoreSlice<
  Pick<
    GameState,
    | "weeklyLeague"
    | "weeklyLeagueHistory"
    | "gymBadges"
    | "streakFreezes"
    | "frozenDays"
    | "freezeNotice"
    | "lastBadgeGift"
    | "applyStreakFreezes"
    | "clearFreezeNotice"
    | "route"
    | "routeSaved"
    | "recordRouteStopWin"
    | "chooseRegion"
    | "trainingPoints"
    | "trainingPointsSpent"
    | "initWeeklyLeague"
    | "startWeeklyLeagueAttempt"
    | "recordWeeklyLeagueResult"
    | "addTrainingPoints"
    | "spendTrainingPoints"
    | "getPartnerTp"
  >
> = (set, get) => ({
  weeklyLeague: null,
  weeklyLeagueHistory: [],
  gymBadges: [],
  streakFreezes: 0,
  frozenDays: [],
  freezeNotice: null,
  lastBadgeGift: null,
  trainingPoints: {},
  trainingPointsSpent: {},

  route: ROUTE_START,

  initWeeklyLeague: () => {
    const s = get();
    const { start: weekStartTs } = getWeekRangeUtc();
    // This week's gym is the one at the end of the player's route. A week drawn
    // before the route existed (a random leader) is swapped while still untried;
    // a week already played keeps its result.
    const leader = routeGym(s.route);
    if (s.weeklyLeague && s.weeklyLeague.weekStartTs === weekStartTs) {
      if (s.weeklyLeague.status !== "not_started" || s.weeklyLeague.gymLeaderId === leader.id) return;
    }
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
    // Every NEW badge also gives a Streak Freeze, or coins when the most are already held.
    let gift: Partial<GameState> = {};
    if (won && !s.gymBadges.includes(s.weeklyLeague.gymLeaderId)) {
      newBadges = [...s.gymBadges, s.weeklyLeague.gymLeaderId];
      gift =
        s.streakFreezes < MAX_STREAK_FREEZES
          ? { streakFreezes: s.streakFreezes + 1, lastBadgeGift: "freeze" }
          : { coins: s.coins + FULL_FREEZE_COINS, lastBadgeGift: "coins" };
    }
    // Winning the route's gym opens the next route straight away; its gym can
    // be challenged from next week's Weekly League.
    const routeWon = won && s.weeklyLeague.gymLeaderId === routeGym(s.route).id;
    set({
      weeklyLeague: { ...s.weeklyLeague, status: won ? "won" : "lost" },
      gymBadges: newBadges,
      ...gift,
      weeklyLeagueHistory: newHistory,
      ...(routeWon ? { route: nextRoute(s.route) } : {}),
    });
  },

  applyStreakFreezes: () => {
    const s = get();
    if (s.streakFreezes <= 0) return;
    const days = freezesToUse(s.battleLog, s.frozenDays, s.streakFreezes);
    if (days.length === 0) return;
    set({
      streakFreezes: s.streakFreezes - days.length,
      frozenDays: [...s.frozenDays, ...days].slice(-60),
      freezeNotice: days,
    });
  },
  clearFreezeNotice: () => set({ freezeNotice: null }),

  recordRouteStopWin: () => {
    const r = get().route;
    if (stopsLeft(r) > 0) set({ route: { ...r, beaten: r.beaten + 1 } });
  },

  routeSaved: {},
  chooseRegion: (region) => {
    const s = get();
    if (region === s.route.region) return;
    set({
      routeSaved: { ...s.routeSaved, [s.route.region]: { gym: s.route.gym, beaten: s.route.beaten } },
      route: regionRoute(region, s.route, s.routeSaved),
    });
    // An untried week follows the route to the new region's gym.
    get().initWeeklyLeague();
  },

  addTrainingPoints: (pokemonId, amount) => {
    const s = get();
    const current = s.trainingPoints[pokemonId] ?? 0;
    set({
      trainingPoints: { ...s.trainingPoints, [pokemonId]: current + amount },
    });
  },

  // Anything that spends TP must also record it here: the damage multiplier
  // reads balance + spent, so a spend that goes unrecorded is a silent
  // multiplier cut. (`evolvePartner` does its own bookkeeping in store.ts
  // because it also moves the remainder onto the evolved species.)
  spendTrainingPoints: (pokemonId, amount) => {
    const s = get();
    const current = s.trainingPoints[pokemonId] ?? 0;
    if (current < amount) return false;
    set({
      trainingPoints: { ...s.trainingPoints, [pokemonId]: current - amount },
      trainingPointsSpent: {
        ...s.trainingPointsSpent,
        [pokemonId]: (s.trainingPointsSpent[pokemonId] ?? 0) + amount,
      },
    });
    return true;
  },

  getPartnerTp: (pokemonId) => get().trainingPoints[pokemonId] ?? 0,
});
