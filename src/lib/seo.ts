/** One place that knows the site's public identity.
 *
 *  Before this, every route inherited a single title and description from
 *  `__root.tsx`, so /pokedex, /shop, /arena and / were four URLs claiming to be
 *  the same page. Search engines treat that as duplicate content and pick one
 *  to show — which is why "more pages" had not meant "more listings".
 */

/** The canonical origin. Hardcoded rather than read from the request: a
 *  canonical URL that echoes whatever Host header arrived is not a canonical
 *  URL, and preview deployments would each declare themselves authoritative. */
export const SITE_URL = "https://pokemontriviabattle.vercel.app";

/** The share image. Self-hosted on purpose.
 *
 *  This previously pointed at an R2 bucket belonging to the Lovable prototype
 *  this app was scaffolded from — a preview screenshot on infrastructure nobody
 *  here controls, which can disappear without warning and take every social
 *  preview with it. */
export const OG_IMAGE = `${SITE_URL}/og-image.png`;
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;

export interface PageMeta {
  /** Route path, exactly as the router knows it. */
  path: string;
  title: string;
  description: string;
  /** Sitemap priority. Omitted pages are not listed. */
  priority?: number;
  /** True for pages that must never be indexed — see NOINDEX below. */
  noindex?: boolean;
}

/** Titles are written to be distinguishable in a result list, which means the
 *  differentiating word comes FIRST: a page called "Pokémon Trivia Battle —
 *  Pokédex" is truncated to the same seven characters as every other page on
 *  small screens.
 *
 *  Descriptions stay under ~155 characters, the point past which Google
 *  generally truncates. */
export const PAGES: readonly PageMeta[] = [
  {
    path: "/",
    title: "Pokémon Trivia Battle — Free Browser Trivia Game",
    description:
      "Answer Pokémon trivia to attack. Type matchups decide your damage, streaks multiply it. Free, no download, plays in the browser.",
    priority: 1.0,
  },
  {
    path: "/battle",
    title: "Battle — Pokémon Trivia Battle",
    description:
      "Fight trainers by answering Pokémon questions. Correct answers hit, wrong ones let your opponent strike back. Earn XP and climb the leagues.",
    priority: 0.9,
  },
  {
    path: "/pokedex",
    title: "Pokédex — Pokémon Trivia Battle",
    description:
      "Every Pokémon you have caught, with types, stats and the sprites you unlocked. Fill it by winning trivia battles.",
    priority: 0.8,
  },
  {
    path: "/arena",
    title: "Battle Arena — Pokémon Trivia Battle",
    description:
      "Take on gym leaders and the Elite Four, or face another trainer live. Ranked Pokémon trivia against real opponents.",
    priority: 0.8,
  },
  {
    path: "/shop",
    title: "PokéMart — Pokémon Trivia Battle",
    description:
      "Spend coins on potions, revives and battle items that swing a trivia fight. Stock rotates as you rank up.",
    priority: 0.7,
  },
  {
    path: "/whos-that-pokemon",
    title: "Who's That Pokémon? — Silhouette Guessing Game",
    description:
      "Name the Pokémon from its silhouette, or guess it from its typing. A quick daily round inside Pokémon Trivia Battle.",
    priority: 0.8,
  },
  {
    path: "/profile",
    title: "Your Trainer — Pokémon Trivia Battle",
    description: "Your trainer card, badges, league rank and battle record.",
  },
  {
    path: "/refer",
    title: "Invite a Friend — Pokémon Trivia Battle",
    description: "Claim a friend's referral code and start with a bonus.",
  },
];

/** Paths that must carry `noindex`.
 *
 *  This is the one legitimate use of the tag: these URLs are either personal or
 *  per-match, so indexing them would fill the index with dead ends — a finished
 *  PvP match is a page that will never be useful to a stranger, and there is one
 *  per game played. They are absent from the sitemap too, but a shared invite
 *  link is enough for a crawler to find them, so the tag is what actually
 *  settles it.
 *
 *  Prefix match: `/pvp` covers `/pvp/$matchId` and its chat and live variants. */
export const NOINDEX_PREFIXES: readonly string[] = ["/pvp", "/profile", "/refer"];

export function isNoindex(path: string): boolean {
  return NOINDEX_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export function findPage(path: string): PageMeta | undefined {
  return PAGES.find((p) => p.path === path);
}

export function canonicalFor(path: string): string {
  return path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}`;
}

export interface HeadTag {
  [key: string]: string | undefined;
}

/** Builds the per-page half of `head()`: the tags that must DIFFER per route.
 *
 *  Everything shared (charset, viewport, icons, the JSON-LD block) stays in
 *  `__root.tsx`. TanStack merges by `name`/`property`, so repeating a key here
 *  overrides the root's value rather than appending a second tag — which is what
 *  makes one title per page possible without touching the root for each one. */
export function pageMeta(path: string): { meta: HeadTag[]; links: HeadTag[] } {
  const page = findPage(path);
  const canonical = canonicalFor(path);
  const noindex = isNoindex(path);

  const meta: HeadTag[] = [];

  if (page) {
    meta.push(
      { title: page.title },
      { name: "description", content: page.description },
      { property: "og:title", content: page.title },
      { property: "og:description", content: page.description },
      { name: "twitter:title", content: page.title },
      { name: "twitter:description", content: page.description },
    );
  }

  meta.push({ property: "og:url", content: canonical });

  if (noindex) {
    // `follow` on purpose: the page should not be listed, but the links out of
    // it still lead somewhere worth crawling.
    meta.push({ name: "robots", content: "noindex, follow" });
  }

  const links: HeadTag[] = [{ rel: "canonical", href: canonical }];

  return { meta, links };
}

/** `head()` for a page route, ready to spread. */
export function pageHead(path: string) {
  const { meta, links } = pageMeta(path);
  return { meta, links };
}

/** `head()` for a route that must never be indexed and has no stable URL to
 *  declare canonical — every PvP route is one match, identified by an id that
 *  will never be requested again once the game ends.
 *
 *  Deliberately emits no canonical: pointing a thousand match URLs at one
 *  canonical would ask Google to consolidate pages that are genuinely different,
 *  and pointing each at itself invites indexing the very thing `noindex` is
 *  here to prevent. */
export function noindexHead() {
  return { meta: [{ name: "robots", content: "noindex, follow" }] };
}
