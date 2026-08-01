/**
 * Modules synthesised by Vite plugins rather than existing on disk.
 *
 * `virtual:loading-art` — every .webp in public/loading, as URL paths
 * ("/loading/07.webp"), sorted by filename. Built by loadingArtManifest() in
 * vite.config.ts; empty when the folder holds no art.
 */
declare module "virtual:loading-art" {
  const paths: readonly string[];
  export default paths;
}

/**
 * `virtual:dex-backdrops` — which Pokédex detail backdrops exist on disk.
 *
 * `types` holds the basenames in public/dex/type ("fire", "water", …);
 * `pokemon` holds the numeric basenames in public/dex/pokemon (national dex
 * ids). Built by dexBackdropManifest() in vite.config.ts; both are empty when
 * no art has been added, which the detail page renders as its plain gradient.
 */
declare module "virtual:dex-backdrops" {
  const manifest: { readonly types: readonly string[]; readonly pokemon: readonly number[] };
  export default manifest;
}
