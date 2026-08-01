import MANIFEST from "virtual:dex-backdrops";

/**
 * The artwork behind a Pokémon's Pokédex detail header.
 *
 * Two tiers, most specific first:
 *
 *   public/dex/pokemon/<national dex id>.webp   a one-off scene for a
 *                                               Legendary or Mythical
 *   public/dex/type/<primary type>.webp         the habitat every other
 *                                               species of that type shares
 *
 * Keyed by ID rather than name for the per-species tier: names change spelling
 * and casing between sources, an ID does not, and a filename that no longer
 * matches would fail silently as "no art" rather than loudly.
 *
 * Returns null when neither exists, which the header renders as the plain type
 * gradient it had before any art was added. That is a supported state, not a
 * degraded one — the folder can be empty, half full, or complete, and adding a
 * file is the whole of the work (the manifest is read at build time; a dev
 * server needs a restart to notice a new one).
 */
export function dexBackdropSrc(pokemonId: number, primaryType: string): string | null {
  if (MANIFEST.pokemon.includes(pokemonId)) return `/dex/pokemon/${pokemonId}.webp`;
  if (MANIFEST.types.includes(primaryType)) return `/dex/type/${primaryType}.webp`;
  return null;
}

/** True when any backdrop art at all has been added. */
export function hasDexBackdrops(): boolean {
  return MANIFEST.types.length > 0 || MANIFEST.pokemon.length > 0;
}
