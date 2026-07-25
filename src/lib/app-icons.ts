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
 */

/** Profile buttons and one-off chrome. */
export const UI_ICON = {
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
