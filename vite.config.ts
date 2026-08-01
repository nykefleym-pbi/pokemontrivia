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
