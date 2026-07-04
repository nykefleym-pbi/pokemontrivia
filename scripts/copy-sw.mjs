// vite-plugin-pwa's injectManifest strategy runs its service-worker build as
// a separate nested Vite build that only respects its own `outDir` option —
// which is NOT the same directory Nitro actually deploys from. Nitro writes
// the real client static output to `.vercel/output/static` (Vercel builds)
// or `.output/public` (plain node builds), while vite-plugin-pwa's default
// `outDir` is just the literal string "dist". Without this copy step,
// sw.js/workbox-*.js silently land somewhere nothing serves, `/sw.js` 404s
// in production, and `navigator.serviceWorker.ready` hangs forever on the
// client (surfaced as "Service worker registration timed out").
import { existsSync, copyFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const candidates = [".vercel/output/static", ".output/public"];
const target = candidates.find((d) => existsSync(d));

if (!target) {
  console.warn("[copy-sw] No recognized static output directory found; skipping.");
  process.exit(0);
}

if (!existsSync("dist")) {
  console.warn("[copy-sw] No dist/ directory found; skipping.");
  process.exit(0);
}

const files = readdirSync("dist").filter((f) => f === "sw.js" || f.startsWith("workbox-"));
if (files.length === 0) {
  console.warn("[copy-sw] No sw.js/workbox-*.js found in dist/; skipping.");
  process.exit(0);
}

for (const f of files) {
  copyFileSync(join("dist", f), join(target, f));
  console.log(`[copy-sw] Copied dist/${f} -> ${target}/${f}`);
}
