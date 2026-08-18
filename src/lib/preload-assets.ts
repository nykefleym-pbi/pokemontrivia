/**
 * Warm the browser cache with the app's own artwork while the boot screen holds.
 *
 * The five seconds the splash is up are otherwise spent waiting: the app mounts
 * behind it, but most of its images are only requested when a screen that uses
 * them first renders — so type glyphs, reward art and item icons arrived a beat
 * AFTER the screen asking for them, which reads as missing assets (owner report
 * 2026-08-17). Fetching them during the hold moves that cost into time the
 * player is already spending.
 *
 * Cache-warming only. Nothing here gates the splash or reports back: an asset
 * that fails still fails later exactly as it does today, and the screen must
 * hand off on its timer whatever the network is doing.
 */

/**
 * How many images are in flight at once.
 *
 * Not unbounded: the app is booting behind the splash and needs the connection
 * for its own chunks and the player's save. Six is roughly a browser's per-host
 * limit for HTTP/1.1 and a polite share of an HTTP/2 connection — enough to get
 * through a couple of hundred small files inside the hold, without the boot
 * itself queueing behind them.
 */
const CONCURRENCY = 6;

/** Warmed once per page load, however many callers ask. */
let started = false;

function warm(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const img = new Image();
    // Both arms resolve: a 404 here is not this module's problem to report, it
    // just means the queue should move on to the next file.
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}

/**
 * Fetch `urls` a few at a time. Resolves when the queue drains; callers are not
 * expected to await it.
 */
export async function preloadImages(urls: readonly string[], concurrency = CONCURRENCY) {
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      await warm(url);
    }
  });
  await Promise.all(workers);
}

/**
 * Start warming the app's chrome. Safe to call more than once — only the first
 * call does anything.
 *
 * `virtual:preload-assets` is built from public/ at build time; see
 * preloadAssetsManifest() in vite.config.ts for what is in the set and why the
 * heavy folders are not.
 */
export function preloadAppAssets(urls: readonly string[]): void {
  if (started || typeof window === "undefined" || urls.length === 0) return;
  started = true;
  void preloadImages(urls);
}

/** Test seam: forget that warming has already run. */
export function resetPreloadForTests(): void {
  started = false;
}
