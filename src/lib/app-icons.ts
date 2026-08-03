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
 *   public/versus/   — face-off backdrops; catalogued in lib/versus-backdrops.ts
 */
import { DEFAULT_VERSUS_BACKDROP_ID, versusBackdropSrc } from "@/lib/versus-backdrops";

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
  /** Who's That Pokémon's title. 512x512 with 29.5% transparent top and bottom
   *  — see RESULT_ART.whosThat; render it through <WhosThatWordmark>. */
  whosThat: "/ui/Who's that Pokemon.webp",
  /** "YOU CAUGHT A" ribbon — the header of the Who's That result screen. */
  youCaught: "/ui/You caught a.webp",
  /** Radial light burst, drawn BEHIND the caught Pokémon's sprite. Replaces the
   *  conic-gradient sunburst that used to sit there. */
  lightBurst: "/ui/Light Burst.webp",
  /** Pokédex book — the "added to Pokédex" reward tile. */
  pokedexBook: "/ui/Pokedex.webp",
} as const;

/**
 * Result-screen artwork: the two outcome wordmarks and the two platforms the
 * partner stands on.
 *
 * The wordmarks carry their own copy — "BATTLE WON / VICTORY!" and "BATTLE LOST
 * / SO CLOSE!" — so they replace BOTH the eyebrow and the heading rather than
 * sitting above them.
 *
 * `Battle Lost` is a .png, not a .webp like its three siblings: that is how it
 * was supplied. It costs about 45 KB over an equivalent webp and is the one
 * file here worth re-encoding if the defeat screen ever feels slow.
 *
 * Every one of these is a 512x512 square with the art floating in the middle —
 * see RESULT_ART in lib/result-art.ts for the measured padding, which the
 * layout has to subtract or the screen ends up mostly empty space.
 */
export const RESULT_ICON = {
  victory: "/ui/Victory.webp",
  /** "LEVEL UP!" wordmark for the trainer level-up celebration. */
  levelUp: "/ui/Level Up.webp",
  defeat: "/ui/Battle Lost.png",
  platformWin: "/ui/Platform.webp",
  platformLose: "/ui/Platform Lose.webp",
} as const;

/**
 * The level-up screen's before/after plaques and the arrows between them.
 *
 * Supplied as opaque PNGs — the shields on a dark checkerboard, the arrows on
 * flat black, both of which are pictures OF transparency rather than the real
 * thing. They were keyed to true alpha and re-encoded as webp
 * (scripts/key-level-art.mjs); the glow around each shield is part of the art
 * and is kept, so these overlap their neighbours by design and must not be
 * given a background, border or `overflow-hidden` box.
 *
 * See LEVEL_PLAQUE in lib/result-art.ts for where the shield's FACE sits inside
 * each file — the number goes on the face, not in the middle of the glow.
 */
export const LEVEL_PLAQUE_ICON = {
  from: "/ui/Level Up from.webp",
  to: "/ui/Level Up to.webp",
  arrow: "/ui/Level Up arrow.webp",
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
 * The two share-card stat glyphs that are not rewards: accuracy and speed.
 *
 * They live beside REWARD_ICON rather than inside it because they are not
 * ArenaRewardKinds — nothing grants "avg time" — but they sit in the same
 * folder and are drawn at the same size on the share card's stat row, so all
 * four tiles read as one set.
 */
export const STAT_ICON = {
  correct: "/rewards/Correct.webp",
  avgTime: "/rewards/Avg Time.webp",
} as const;

/**
 * Backdrop for any VS-screen half whose trainer has none of their own — the
 * opponent's side (their pick is not synced) and yours before you have chosen.
 *
 * This is Forest, the default of the `VERSUS_BACKDROPS` catalogue rather than a
 * separate file, so "the shared fallback" and "what a new player sees" cannot
 * drift apart. Your own half comes from `versusBackdropSrc(versusBackdropId)`.
 */
export const VERSUS_BACKDROP: string = versusBackdropSrc(DEFAULT_VERSUS_BACKDROP_ID);

/**
 * The Training Bot's avatar: an animated PNG that replaces the trainer sprite
 * outright rather than sitting behind it. Sized and budgeted in
 * public/versus/readme.txt.
 *
 * It has no backdrop constant any more — the bot draws a RANDOM one per match
 * from the shared catalogue (see lib/training-bot.ts), so a run of Training
 * battles does not look like the same fight repeated.
 */
export const TRAINING_BOT_AVATAR: string | null = "/trainers/avatar/Clembot.png";

/**
 * The arena backdrop shared by every battle mode.
 *
 * Unlike every other entry here this one is NOT consumed by a component — the
 * path lives in `--battle-field-art` in styles.css, because it is painted by
 * the `.bg-battle-field` class rather than an <img>. It is recorded here so the
 * asset inventory stays complete and so anyone renaming the file finds both
 * references from one grep. Keep the two in sync.
 *
 * A missing file is a supported state: `.bg-battle-field` lists the art above
 * the gradients it always had, so a 404 paints the old look rather than
 * nothing.
 */
export const BATTLE_FIELD_BG = "/ui/Battle Field.webp";

/** Padlock — locked Arena reward slots and locked achievement trophies. */
export const LOCK_ICON = "/rewards/Lock.webp";

/** Coin currency (shop balance pill, level-up coin reward). */
export const COIN_ICON = "/rewards/Coin.webp";

/** Training Points — the partner's damage multiplier currency. */
export const TP_ICON = "/rewards/Training Points.webp";

/**
 * Daily-streak flame, on Home's stat strip.
 *
 * This one is OPTIONAL and may 404: the artwork is owner-supplied and the
 * strip shipped before it landed. Every consumer renders a lucide `Flame`
 * underneath and only reveals the image once it has loaded, so a missing file
 * degrades to the icon rather than to a broken-image glyph.
 */
export const STREAK_ICON = "/rewards/Streak.webp";

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
