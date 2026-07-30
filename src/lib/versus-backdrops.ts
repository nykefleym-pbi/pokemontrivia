/**
 * The face-off backdrops a player can choose between, and the one they get if
 * they never do.
 *
 * Each entry is a file in `public/versus/`. The catalogue is hand-listed rather
 * than enumerated from the folder (the way `public/loading` is) because these
 * need a label a player reads, and a stable `id` that a saved preference can
 * point at even if the file is later renamed or re-cut. Adding a backdrop is:
 * drop the .webp in, add a row here.
 *
 * Sizes, budget and the encoding recipe are in public/versus/readme.txt.
 */
export interface VersusBackdrop {
  /** Stable key persisted in the save. Never reuse one for different art. */
  id: string;
  /** Shown under the thumbnail in the picker. */
  label: string;
  /** Filename inside public/versus/, spaces and all. */
  file: string;
}

export const VERSUS_BACKDROPS: readonly VersusBackdrop[] = [
  { id: "forest", label: "Forest", file: "Forest.webp" },
  { id: "blue-dome", label: "Blue Dome", file: "Blue Dome.webp" },
  { id: "boulder-gym", label: "Boulder Gym", file: "Boulder Gym.webp" },
  { id: "charicific-valley", label: "Charicific Valley", file: "Charicific Valley.webp" },
  { id: "dark-colosseum", label: "Dark Colosseum", file: "Dark Colosseum.webp" },
  { id: "dragons-nest", label: "Dragon's Nest", file: "Dragon's Nest.webp" },
  { id: "dry-valleys", label: "Dry Valleys", file: "Dry Valleys.webp" },
  { id: "haunted-mansion", label: "Haunted Mansion", file: "Haunted Mansion.webp" },
  { id: "into-the-gym", label: "Into the Gym", file: "Into the Gym.webp" },
  { id: "kingdom-arena", label: "Kingdom Arena", file: "Kingdom Arena.webp" },
  { id: "light-vs-dark", label: "Light vs Dark", file: "Light vs Dark.webp" },
  { id: "mega-evolution", label: "Mega Evolution", file: "Mega Evolution.webp" },
  { id: "stonehenge", label: "Night at the Stonehenge", file: "Night at the Stonehenge.webp" },
  { id: "regi-ruins", label: "Regi Ruins", file: "Regi Ruins.webp" },
  { id: "ultra-moon", label: "Ultra Moon", file: "Ultra Moon.webp" },
  { id: "ultra-sun", label: "Ultra Sun", file: "Ultra Sun.webp" },
  { id: "ultra-wormhole", label: "Ultra Wormhole", file: "Ultraworm Hole.webp" },
  { id: "under-the-sea", label: "Under the Sea", file: "Under the Sea.webp" },
];

/** What a player who has never opened the picker battles on. */
export const DEFAULT_VERSUS_BACKDROP_ID = "forest";

const BY_ID = new Map(VERSUS_BACKDROPS.map((b) => [b.id, b]));

/** The catalogue entry for an id, falling back to the default. Never null: an
 *  id from an older save whose art has since been removed still has to draw
 *  something, and a missing backdrop is more jarring than the wrong one. */
export function versusBackdrop(id?: string | null): VersusBackdrop {
  return (id ? BY_ID.get(id) : undefined) ?? BY_ID.get(DEFAULT_VERSUS_BACKDROP_ID)!;
}

/** Public URL for a backdrop id. Encoded because the filenames carry spaces
 *  and an apostrophe — they are the owner's, and renaming their uploads to
 *  suit a URL is the wrong way round. */
export function versusBackdropSrc(id?: string | null): string {
  return encodeURI(`/versus/${versusBackdrop(id).file}`);
}
