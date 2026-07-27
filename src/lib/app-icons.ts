/**
 * Custom icon art (owner-supplied .webp under public/). One module maps every
 * logical icon to its file so components never hardcode asset paths — moving or
 * renaming art is a one-line change here.
 *
 * Filenames contain spaces, so always render these through <AppIcon> (or
 * encodeURI) rather than dropping them straight into a src attribute.
 *
 * Folder layout (see the assets PR):
 *   public/ui/       — profile buttons + app chrome
 *   public/rewards/  — Arena set-of-5 reward glyphs + the locked-slot padlock
 *   public/trophies/ — achievement trophies + the two Arena tier badges
 *   public/items/    — item category art
 *   public/loading/  — boot loading-screen artwork, one picked at random per open
 */

/** Profile buttons and one-off chrome. */
export const UI_ICON = {
  /** Master wordmark (Pokémon + Pokéball + Trivia Battle) — the onboarding hero.
   *  Also the source the PWA icons and Apple splash screens were generated from. */
  appLogo: "/icons/Pokemon Trivia Battle Logo.webp",
  battleHistory: "/ui/Battle History.webp",
  trophies: "/ui/Trophies.webp",
  badges: "/ui/Badges.webp",
  settings: "/ui/Settings.webp",
  dailyGift: "/ui/Daily Gift Box.webp",
  pokeEgg: "/ui/Poke Egg.webp",
} as const;

/** Arena set-of-5 reward slots, keyed by ArenaRewardKind. */
export const REWARD_ICON = {
  tp: "/rewards/Training Points.webp",
  xp: "/rewards/Experience.webp",
  item: "/rewards/Random Items.webp",
  coins: "/rewards/Coin.webp",
  premium: "/rewards/Premium Items.webp",
} as const;

/**
 * Full-bleed backdrop behind the pre-battle VS screen.
 *
 * One portrait image; the VS screen fills both halves with it (top anchored to
 * the top edge, bottom to the bottom) so the horizon reads as continuous across
 * the divide — the same trick Pokémon GO uses.
 *
 * Null until the artwork lands, which makes the screen fall back to a themed
 * gradient rather than a broken image. Dropping a file at
 * `public/versus/backdrop.webp` and setting this string is the whole swap.
 */
export const VERSUS_BACKDROP: string | null = null;

/**
 * The Training Bot's face-off presence: its avatar and its own half of the
 * backdrop. Both null until the artwork lands, which falls the screen back to
 * the default trainer sprite and the themed gradient rather than a broken
 * image. Dropping the files in and setting these two strings is the whole swap.
 * Sizes and the recipe are in public/versus/readme.txt.
 */
export const TRAINING_BOT_AVATAR: string | null = null;
export const TRAINING_BOT_BACKDROP: string | null = null;

/** Padlock — locked Arena reward slots and locked achievement trophies. */
export const LOCK_ICON = "/rewards/Lock.webp";

/** Coin currency (shop balance pill, level-up coin reward). */
export const COIN_ICON = "/rewards/Coin.webp";

/** The two Arena battle-count tier badges. */
export const ARENA_BADGE_ICON = {
  nearby: "/trophies/Nearby Battle Badge.webp",
  training: "/trophies/Training Badge.webp",
} as const;

/**
 * Item category art, used as ItemIcon's visual fallback when an item's own
 * sprite fails to load. Only categories with supplied art appear here; items
 * outside it have no fallback and render nothing.
 */
export const ITEM_CATEGORY_ICON = {
  berries: "/items/Berries.webp",
  potions: "/items/Potions.webp",
} as const;

/**
 * Picks the boot loading-screen artwork for one app open.
 *
 * `paths` is every .webp in public/loading (see `virtual:loading-art`), so the
 * art rotates on its own as files are added — no naming scheme, no calendar.
 *
 * `last` is the path the previous open used. With two or more files it is
 * excluded, because "random" that repeats itself half the time does not read as
 * changing; with only one file there is nothing to rotate to and it is returned
 * again. Returns null for an empty folder — the screen falls back to its brand
 * gradient, which is also what a failed image load degrades to.
 *
 * Pure, with `rand` injectable, so the distribution is testable.
 */
export function pickLoadingArt(
  paths: readonly string[],
  { last, rand = Math.random }: { last?: string | null; rand?: () => number } = {},
): string | null {
  if (paths.length === 0) return null;
  const pool = paths.length > 1 && last ? paths.filter((p) => p !== last) : paths;
  const choices = pool.length > 0 ? pool : paths;
  // Math.random() can never return 1, but an injected rand might; clamp rather
  // than hand back undefined.
  return choices[Math.min(choices.length - 1, Math.floor(rand() * choices.length))];
}
