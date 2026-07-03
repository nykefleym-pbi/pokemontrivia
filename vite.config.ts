// Self-contained Vite config (no Lovable build wrapper) for a TanStack Start
// app deployed to Vercel. The Nitro Vite plugin compiles the server into a
// Vercel Function (and auto-detects the host: vercel on Vercel, node locally).
import { defineConfig } from "vite";
import { nitro } from "nitro/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  resolve: { dedupe: ["react", "react-dom"] },
  plugins: [
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
