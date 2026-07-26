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
