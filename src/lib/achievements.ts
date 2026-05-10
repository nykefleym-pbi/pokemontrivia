import type { GameState } from "./store";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  icon: string;
  check: (s: GameState) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_win",
    name: "First Win",
    desc: "Win your first battle.",
    icon: "🥇",
    check: (s) => s.stats.wins >= 1,
  },
  {
    id: "battles_25",
    name: "Veteran",
    desc: "Complete 25 battles.",
    icon: "⚔️",
    check: (s) => s.stats.battles >= 25,
  },
  {
    id: "correct_100",
    name: "Centurion",
    desc: "Answer 100 questions correctly.",
    icon: "💯",
    check: (s) => s.stats.correct >= 100,
  },
  {
    id: "streak_5",
    name: "Hot Hand",
    desc: "Reach a 5-answer streak.",
    icon: "🔥",
    check: (s) => s.stats.bestStreak >= 5,
  },
  {
    id: "streak_10",
    name: "Unstoppable",
    desc: "Reach a 10-answer streak.",
    icon: "⚡",
    check: (s) => s.stats.bestStreak >= 10,
  },
  {
    id: "lvl_6",
    name: "Great League",
    desc: "Reach Level 6.",
    icon: "🔵",
    check: (s) => s.peakLevel >= 6,
  },
  {
    id: "lvl_16",
    name: "Ultra League",
    desc: "Reach Level 16.",
    icon: "🟡",
    check: (s) => s.peakLevel >= 16,
  },
  {
    id: "lvl_26",
    name: "Master League",
    desc: "Reach Level 26.",
    icon: "🟣",
    check: (s) => s.peakLevel >= 26,
  },
  {
    id: "lvl_51",
    name: "Monarch",
    desc: "Reach Level 51 — World Champion.",
    icon: "👑",
    check: (s) => s.peakLevel >= 51,
  },
  {
    id: "speedrunner",
    name: "Speedrunner",
    desc: "Average answer time under 5s (20+ answers).",
    icon: "⏱️",
    check: (s) =>
      s.stats.answered >= 20 && s.stats.totalAnswerTime / s.stats.answered < 5000,
  },
  {
    id: "scholar",
    name: "Scholar",
    desc: "90%+ accuracy over 50+ answers.",
    icon: "📚",
    check: (s) => s.stats.answered >= 50 && s.stats.correct / s.stats.answered >= 0.9,
  },
  {
    id: "comeback",
    name: "Comeback Kid",
    desc: "Win a battle from 10 HP or less.",
    icon: "💪",
    check: (s) => s.flags?.includes("comeback") ?? false,
  },
  {
    id: "pokedex_50",
    name: "Pokémaniac",
    desc: "Capture 50 Pokémon.",
    icon: "📕",
    check: (s) => Object.keys(s.pokedex ?? {}).length >= 50,
  },
  {
    id: "pokedex_151",
    name: "Kanto Complete",
    desc: "Capture all 151 Gen 1 Pokémon.",
    icon: "🟥",
    check: (s) =>
      Object.keys(s.pokedex ?? {}).filter((k) => Number(k) <= 151).length >= 151,
  },
  {
    id: "shiny_first",
    name: "Sparkle!",
    desc: "Capture your first shiny Pokémon.",
    icon: "✨",
    check: (s) => Object.values(s.pokedex ?? {}).some((e) => e.shinyUnlocked),
  },
];

export function unlockedAchievements(s: GameState): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(s)).map((a) => a.id);
}
