// Bundles a Supabase Edge Function that imports isomorphic code from src/
// (e.g. battle-solo/index.ts importing src/engine/**) into one
// self-contained ESM file, so it can be deployed as-is — Deno can't resolve
// relative imports outside its own function directory when deployed via
// Supabase's flat file-list API, so shared engine/ code can't be imported
// live at deploy time the way it can at runtime in a git-based deploy.
//
// This keeps a single source of truth (src/engine/**) instead of a
// hand-copied, drift-prone duplicate inside supabase/functions/. Edit the
// function's index.ts (normal relative imports into src/), then re-run this
// to regenerate the deployable bundle — never hand-edit the bundle output.
//
// Usage: node scripts/bundle-edge-function.mjs <function-name>
//   e.g. node scripts/bundle-edge-function.mjs battle-solo
// Writes supabase/functions/<function-name>/.bundle.ts (gitignored — it's a
// build artifact, regenerate it before every deploy).
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const name = process.argv[2];
if (!name) {
  console.error("Usage: node scripts/bundle-edge-function.mjs <function-name>");
  process.exit(1);
}

const entry = path.join(repoRoot, "supabase", "functions", name, "index.ts");
const outfile = path.join(repoRoot, "supabase", "functions", name, ".bundle.ts");

await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "esnext",
  // Deno resolves npm: specifiers itself at runtime — esbuild has no
  // "npm:" resolver and shouldn't try to bundle these; leave them as literal
  // import statements in the output, same as every other edge function here.
  external: ["npm:*", "jsr:*"],
  // Most of the bundle's size is legitimate data (the full Pokédex, needed
  // to look up any player/enemy species by id) rather than code to read —
  // minify so the deployed artifact stays reasonably small.
  minify: true,
  logLevel: "info",
});

console.log(`Bundled ${entry} -> ${outfile}`);
