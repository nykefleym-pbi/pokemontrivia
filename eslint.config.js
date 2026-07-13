import js from "@eslint/js";
import eslintConfigPrettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The battle engine and game content are isomorphic: the same files run in
    // Edge Functions (authority) and the browser (optimistic preview). Nothing
    // in here may touch UI, the network, or ambient randomness/time.
    files: ["src/engine/**/*.ts", "src/content/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react", "react-dom", "react-*"], message: "engine/content are isomorphic — no React." },
            { group: ["@tanstack/*"], message: "engine/content are isomorphic — no router/query." },
            { group: ["@supabase/*", "@/integrations/*"], message: "engine/content never talk to the network or database." },
            { group: ["@/routes/*", "@/components/*", "@/hooks/*"], message: "engine/content must not depend on UI." },
            { group: ["@/lib/store", "@/lib/store/*"], message: "engine/content must not depend on client state." },
          ],
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: "Engine code must be deterministic — take an Rng (src/engine/rng.ts) as input.",
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "Engine code must be deterministic — time arrives in action payloads.",
        },
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Engine code must be deterministic — time arrives in action payloads.",
        },
      ],
    },
  },
  eslintConfigPrettier,
);
