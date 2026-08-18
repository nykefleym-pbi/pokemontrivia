// Self-contained Vite config (no Lovable build wrapper) for a TanStack Start
// app deployed to Vercel. The Nitro Vite plugin compiles the server into a
// Vercel Function (and auto-detects the host: vercel on Vercel, node locally).
import { readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

/** Bytes are the whole point here: this art is fetched during the boot screen's
 *  five-second hold, so anything much heavier than this risks not being painted
 *  before the screen hands off. Matches public/loading/readme.txt. */
const LOADING_ART_BUDGET_KB = 320;

/**
 * Exposes the boot loading-screen artwork in public/loading as
 * `virtual:loading-art` — a plain array of URL paths.
 *
 * The screen picks one at random per app open, so it needs to know what is
 * there. It cannot find out at runtime: static hosting serves no directory
 * index, and files under public/ are copied verbatim rather than imported, so
 * they never appear in the module graph. Listing them here is the one place
 * that can see the folder, and it keeps the folder's promise that dropping in a
 * new .webp needs no code change (a dev server restart, yes — the list is read
 * once when the module is first requested).
 */
function loadingArtManifest(): Plugin {
  const virtualId = "virtual:loading-art";
  const resolvedId = `\0${virtualId}`;
  return {
    name: "loading-art-manifest",
    resolveId(source) {
      return source === virtualId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      const dir = fileURLToPath(new URL("public/loading/", import.meta.url));
      let entries: string[] = [];
      try {
        entries = readdirSync(dir).sort();
      } catch {
        // No folder at all is a valid state — the screen falls back to the
        // brand gradient, exactly as it does for a folder with no art in it.
      }
      const files = entries.filter((name) => name.toLowerCase().endsWith(".webp"));

      // Art is uploaded straight into the folder, so nothing else checks it.
      // Both of these have happened once already: an 11 MB .png that the screen
      // silently ignored, and 2000px-wide files carrying pixels no phone shows.
      // Warn rather than fail — a heavy image still works, it is just slow.
      for (const name of entries) {
        if (name === "readme.txt" || files.includes(name)) continue;
        this.warn(
          `public/loading/${name} is not a .webp, so the loading screen ignores it. ` +
            `Convert it (1284x2778, quality ~80) to put it in the rotation.`,
        );
      }
      for (const name of files) {
        const kb = statSync(`${dir}${name}`).size / 1024;
        if (kb > LOADING_ART_BUDGET_KB) {
          this.warn(
            `public/loading/${name} is ${kb.toFixed(0)} KB — over the ${LOADING_ART_BUDGET_KB} KB ` +
              `budget for art fetched inside the 5s boot phase. Re-encode it at 1284x2778, quality ~80.`,
          );
        }
      }

      return `export default ${JSON.stringify(files.map((name) => `/loading/${name}`))};`;
    },
  };
}

/**
 * Which public/ folders the boot screen warms into the browser cache, exposed
 * as `virtual:preload-assets` — a plain array of URL paths.
 *
 * These are the app's CHROME: type glyphs, reward and item art, the UI set, the
 * battle field. Small, and drawn on almost every screen, which is exactly the
 * set that used to pop in — or briefly 404-flash — a beat after a screen opened.
 *
 * Deliberately NOT here: `trainers/` (6 MB, 357 files, one is needed per
 * player), `badges/` (7.7 MB), `versus/`, `loading/` (the splash picks one
 * itself), `icons/` (15 MB of iOS splash screens the OS fetches on its own),
 * `dex/` (its art is nested per type and per species, and the detail screen
 * needs exactly one of them) and `song/`. Warming those would spend the boot window competing with the work
 * the app is actually doing behind the screen.
 *
 * Same mechanism and same reasons as `loadingArtManifest` above: files under
 * public/ never enter the module graph, and static hosting serves no directory
 * index, so a build-time read is the only way to know what is there.
 */
const PRELOAD_DIRS = ["types", "rewards", "items", "ui", "field"] as const;
/** Total budget for the warm set. It shares the network with the app booting
 *  behind the splash, so this is a ceiling, not a target. */
const PRELOAD_BUDGET_KB = 2048;

function preloadAssetsManifest(): Plugin {
  const virtualId = "virtual:preload-assets";
  const resolvedId = `\0${virtualId}`;
  return {
    name: "preload-assets-manifest",
    resolveId(source) {
      return source === virtualId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      const urls: string[] = [];
      let totalKb = 0;
      for (const folder of PRELOAD_DIRS) {
        const dir = fileURLToPath(new URL(`public/${folder}/`, import.meta.url));
        let entries: string[] = [];
        try {
          entries = readdirSync(dir).sort();
        } catch {
          continue; // A folder that isn't there yet is simply nothing to warm.
        }
        for (const name of entries) {
          if (name.startsWith(".") || name.endsWith(".txt")) continue;
          const stat = statSync(`${dir}${name}`);
          if (!stat.isFile()) continue;
          totalKb += stat.size / 1024;
          urls.push(`/${folder}/${encodeURIComponent(name)}`);
        }
      }
      if (totalKb > PRELOAD_BUDGET_KB) {
        this.warn(
          `The boot preload set is ${totalKb.toFixed(0)} KB, over its ${PRELOAD_BUDGET_KB} KB ` +
            `budget. It is fetched while the app boots behind the splash, so trim a folder out ` +
            `of PRELOAD_DIRS or re-encode what grew.`,
        );
      }
      return `export default ${JSON.stringify(urls)};`;
    },
  };
}

/** A Pokédex detail backdrop is painted behind a 56-unit sprite disc and read
 *  at full-bleed, so it is heavier than an icon but still fetched on a tap. */
const DEX_BACKDROP_BUDGET_KB = 220;

/**
 * Exposes the Pokédex detail-page backdrops as `virtual:dex-backdrops`.
 *
 * Same reasoning as `loadingArtManifest` above: files under public/ never enter
 * the module graph and static hosting serves no directory index, so the only
 * way the app can know which backdrops exist is to read the folder at build
 * time. Knowing rather than guessing matters more here than for the loading
 * screen — the alternative is requesting `/dex/type/fire.webp` on the chance it
 * is there and showing a broken layer for a beat when it is not.
 *
 *   public/dex/type/<type>.webp       one per type, the fallback for a species
 *   public/dex/pokemon/<id>.webp      overrides for Legendaries and Mythicals,
 *                                     keyed by NATIONAL DEX ID rather than name
 *                                     so a rename cannot silently unwire one
 */
function dexBackdropManifest(): Plugin {
  const virtualId = "virtual:dex-backdrops";
  const resolvedId = `\0${virtualId}`;
  return {
    name: "dex-backdrop-manifest",
    resolveId(source) {
      return source === virtualId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      const read = (sub: string) => {
        const dir = fileURLToPath(new URL(`public/dex/${sub}/`, import.meta.url));
        let entries: string[] = [];
        try {
          entries = readdirSync(dir).sort();
        } catch {
          // No folder is a valid state: the detail page keeps the plain type
          // gradient it had before any art existed.
          return [];
        }
        const files = entries.filter((n) => n.toLowerCase().endsWith(".webp"));
        for (const name of files) {
          const kb = statSync(`${dir}${name}`).size / 1024;
          if (kb > DEX_BACKDROP_BUDGET_KB) {
            this.warn(
              `public/dex/${sub}/${name} is ${kb.toFixed(0)} KB — over the ` +
                `${DEX_BACKDROP_BUDGET_KB} KB budget. Re-encode at 1170x1320, quality ~80.`,
            );
          }
        }
        return files.map((n) => n.replace(/\.webp$/i, ""));
      };
      const types = read("type");
      const pokemon = read("pokemon")
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0);
      return `export default ${JSON.stringify({ types, pokemon })};`;
    },
  };
}

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    loadingArtManifest(),
    preloadAssetsManifest(),
    dexBackdropManifest(),
    nitro(),
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      devOptions: {
        enabled: false,
      },
      manifest: {
        name: "Pokémon Trivia Battle",
        short_name: "Trivia Battle",
        description:
          "Pokémon trivia battles with type-based combat, evolutions, gym leagues, and shareable victories.",
        theme_color: "#dc2626",
        // The OS paints this behind the platform splash, and BootSplash paints
        // the same value (SPLASH_BG in components/boot-splash.tsx) so the handoff
        // from the OS screen to ours is invisible. Change one, change both.
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        categories: ["games", "entertainment"],
      },
      // Runtime caching now lives in src/sw.ts (injectManifest custom worker),
      // since generateSW's declarative `workbox.runtimeCaching` can't run
      // alongside our own push/notificationclick listeners.
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        globIgnores: ["**/badges/**", "**/trainers/**", "**/items/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
});
