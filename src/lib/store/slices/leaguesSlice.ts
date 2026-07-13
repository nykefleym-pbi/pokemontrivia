import type { GameState, WeeklyLeagueAttempt } from "@/lib/store/types";
import type { StoreSlice } from "@/lib/store/slice";
import { getWeekRangeUtc } from "@/lib/game-data";
import { pickRandomGymLeader } from "@/lib/gym-leaders";

export const createLeaguesSlice: StoreSlice<
  Pick<
    GameState,
    | "weeklyLeague"
    | "weeklyLeagueHistory"
    | "gymBadges"
    | "trainingPoints"
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
  trainingPoints: {},

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
});
