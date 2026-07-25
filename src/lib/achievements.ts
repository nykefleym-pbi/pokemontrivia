import type { GameState } from "./store";
import { findGymLeader, GYM_LEADERS } from "./gym-leaders";

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  /** Emoji, used where the trophy appears as TEXT (e.g. the unlock toast). */
  icon: string;
  /** Trophy art (webp) shown wherever the trophy is rendered visually. */
  art: string;
  check: (s: GameState) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_win",
    name: "First Win",
    desc: "Win your first battle.",
    icon: "🥇",
    art: "/trophies/Trophy - First Win.webp",
    check: (s) => s.stats.wins >= 1,
  },
  {
    id: "battles_25",
    name: "Veteran",
    desc: "Complete 25 battles.",
    icon: "⚔️",
    art: "/trophies/Trophy - Veteran.webp",
    check: (s) => s.stats.battles >= 25,
  },
  {
    id: "correct_100",
    name: "Centurion",
    desc: "Answer 100 questions correctly.",
    icon: "💯",
    art: "/trophies/Trophy - Centurion.webp",
    check: (s) => s.stats.correct >= 100,
  },
  {
    id: "streak_5",
    name: "Hot Hand",
    desc: "Reach a 5-answer streak.",
    icon: "🔥",
    art: "/trophies/Trophy - Hot Hand.webp",
    check: (s) => s.stats.bestStreak >= 5,
  },
  {
    id: "streak_10",
    name: "Unstoppable",
    desc: "Reach a 10-answer streak.",
    icon: "⚡",
    art: "/trophies/Trophy - Unstoppable.webp",
    check: (s) => s.stats.bestStreak >= 10,
  },
  {
    id: "lvl_6",
    name: "Great League",
    desc: "Reach Level 6.",
    icon: "🔵",
    art: "/trophies/Trophy - Great League.webp",
    check: (s) => s.peakLevel >= 6,
  },
  {
    id: "lvl_16",
    name: "Ultra League",
    desc: "Reach Level 16.",
    icon: "🟡",
    art: "/trophies/Trophy - Ultra League.webp",
    check: (s) => s.peakLevel >= 16,
  },
  {
    id: "lvl_26",
    name: "Master League",
    desc: "Reach Level 26.",
    icon: "🟣",
    art: "/trophies/Trophy - Master League.webp",
    check: (s) => s.peakLevel >= 26,
  },
  {
    id: "lvl_51",
    name: "Monarch",
    desc: "Reach Level 51 — World Champion.",
    icon: "👑",
    art: "/trophies/Trophy - Monarch.webp",
    check: (s) => s.peakLevel >= 51,
  },
  {
    id: "speedrunner",
    name: "Speedrunner",
    desc: "Average answer time under 5s (20+ answers).",
    icon: "⏱️",
    art: "/trophies/Trophy - Speedrunner.webp",
    check: (s) => s.stats.answered >= 20 && s.stats.totalAnswerTime / s.stats.answered < 5000,
  },
  {
    id: "scholar",
    name: "Scholar",
    desc: "90%+ accuracy over 50+ answers.",
    icon: "📚",
    art: "/trophies/Trophy - Scholar.webp",
    check: (s) => s.stats.answered >= 50 && s.stats.correct / s.stats.answered >= 0.9,
  },
  {
    id: "comeback",
    name: "Comeback Kid",
    desc: "Win a battle from 10 HP or less.",
    icon: "💪",
    art: "/trophies/Trophy - Comeback Kid.webp",
    check: (s) => s.flags?.includes("comeback") ?? false,
  },
  {
    id: "pokedex_50",
    name: "Pokémaniac",
    desc: "Capture 50 Pokémon.",
    icon: "📕",
    art: "/trophies/Trophy - Pokemaniac.webp",
    check: (s) => Object.keys(s.pokedex ?? {}).length >= 50,
  },
  {
    id: "pokedex_151",
    name: "Kanto Complete",
    desc: "Capture all 151 Gen 1 Pokémon.",
    icon: "🟥",
    art: "/trophies/Trophy - Kanto Complete.webp",
    check: (s) => Object.keys(s.pokedex ?? {}).filter((k) => Number(k) <= 151).length >= 151,
  },
  {
    id: "shiny_first",
    name: "Sparkle!",
    desc: "Capture your first shiny Pokémon.",
    icon: "✨",
    art: "/trophies/Trophy - Sparkle!.webp",
    check: (s) => Object.values(s.pokedex ?? {}).some((e) => e.shinyUnlocked),
  },
  {
    id: "elite_first",
    name: "Elite Slayer",
    desc: "Defeat your first Elite Four member.",
    icon: "🛡️",
    art: "/trophies/Trophy - Elite Slayer.webp",
    check: (s) => (s.defeatedElites?.length ?? 0) >= 1,
  },
  {
    id: "elite_kanto",
    name: "Indigo Champion",
    desc: "Defeat all Kanto Elite Four members + Lance.",
    icon: "🏆",
    art: "/trophies/Trophy - Indigo Champion.webp",
    check: (s) => (s.defeatedEliteRegions ?? []).includes("Kanto"),
  },
  {
    id: "elite_all",
    name: "Hall of Fame",
    desc: "Defeat every Elite Four member.",
    icon: "👑",
    art: "/trophies/Trophy - Hall of Fame.webp",
    check: (s) => (s.defeatedElites?.length ?? 0) >= 20,
  },
  {
    id: "rising_star",
    name: "Rising Star",
    desc: "Earn your first Gym Badge.",
    icon: "⭐",
    art: "/trophies/Trophy - Rising Star.webp",
    check: (s) => (s.gymBadges?.length ?? 0) >= 1,
  },
  {
    id: "type_master",
    name: "Type Master",
    desc: "Defeat one Gym Leader of every type.",
    icon: "🎖️",
    art: "/trophies/Trophy - Type Master.webp",
    check: (s) => {
      const beatenTypes = new Set(
        (s.gymBadges ?? []).map((id) => findGymLeader(id)?.type).filter(Boolean),
      );
      return beatenTypes.size >= 18;
    },
  },
  {
    id: "hall_of_champions",
    name: "Hall of Champions",
    desc: "Defeat all 41 Gym Leaders.",
    icon: "🏛️",
    art: "/trophies/Trophy - Hall of Champions.webp",
    check: (s) => (s.gymBadges?.length ?? 0) >= GYM_LEADERS.length,
  },
];

export function unlockedAchievements(s: GameState): string[] {
  return ACHIEVEMENTS.filter((a) => a.check(s)).map((a) => a.id);
}
