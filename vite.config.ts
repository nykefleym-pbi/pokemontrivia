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

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
    loadingArtManifest(),
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
