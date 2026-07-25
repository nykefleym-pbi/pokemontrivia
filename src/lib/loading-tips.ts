/**
 * "Tip of the day" lines for the boot loading screen — one picked at random per
 * app open.
 *
 * Every tip must describe something the game actually does; a loading screen is
 * the one place players read carefully, so a stale tip here teaches a mechanic
 * that doesn't exist. When you change a mechanic, grep this file.
 *
 * Deliberately dependency-free: the boot splash renders before anything else,
 * and importing the store or content catalogues just to interpolate a number
 * would pull that whole graph into the first paint.
 */
export const LOADING_TIPS: readonly string[] = [
  // Battle mechanics
  "Type matchups still apply to trivia — a correct answer hits far harder when your partner has the type advantage.",
  "You can use at most 3 items in a single battle, and auto-triggering held items count toward that limit.",
  "A wrong answer can leave your partner burned, paralysed, asleep or confused. Status damage ticks even on turns you answer correctly.",
  "Confused Pokémon sometimes miss their attack entirely, no matter how good your answer was.",
  "Some Pokémon carry a signature ability that fires on its own trigger — check the Pokédex entry to see what sets it off.",

  // Arena / PvP
  "Battle rewards come in sets of five: every win in a set unlocks the next slot, and the fifth one is a premium item.",
  "Unclaimed reward slots are granted automatically when a set rolls over, so a reward you forgot to collect is never lost.",
  "Your friend code doubles as your Battle Code — let a nearby trainer scan it to start a PvP battle instantly.",
  "PvP and Training wins both feed your reward set, but each has its own badge to climb.",
  "Badges rank up at 50, 250, 500 and 1000 battles: bronze, silver, gold, then platinum.",
  "Only winners collect berries. Losing a battle costs you nothing else, so there is no reason not to try.",

  // Progression
  "A Lucky Egg doubles every point of XP you earn while it is active. Save it for a Mega Raid.",
  "Training Points go to the partner you battled with — switch partners to spread them around.",
  "Poké Eggs only hatch Legendary and Mythical Pokémon. Winning a Mega Raid, levelling up, or referring a friend earns one.",
  "The Daily Gift Box resets every day, and the streak keeps growing as long as you don't miss one.",
  "Who's That Pokémon? runs once an hour. It is the cheapest XP in the game.",
  "Elite Four and Weekly League battles pull from a harder question pool — bring items.",

  // Meta
  "Turn on Reduce Motion in Settings if the battle animations are too much.",
];

/**
 * Picks a tip at random.
 *
 * `rand` is injectable so tests can pin the choice; it must behave like
 * `Math.random` (return values in [0, 1)).
 */
export function randomTip(rand: () => number = Math.random): string {
  return LOADING_TIPS[Math.floor(rand() * LOADING_TIPS.length)];
}
