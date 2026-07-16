import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // Component/characterization tests (.test.tsx) render real React
    // components and need a DOM; plain .test.ts unit tests stay on the
    // lighter "node" environment.
    environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
  },
});
