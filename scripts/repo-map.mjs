// Repo map builder.  `node scripts/repo-map.mjs`  ->  graphify-out/
//
// /graphify is the canonical mapper for this repo and should be preferred when
// it is installed. This script exists because /graphify is a local plugin: it
// is absent from CI and from Claude Code web containers, where the repo still
// needs mapping. It uses only the TypeScript compiler API (already a devDep),
// so it runs anywhere `npm ci` has run, and writes into the same gitignored
// graphify-out/ directory.
//
// Like graphify, this is a "where to read" tool, NOT a liveness oracle. A call
// edge proves the call is reachable, not that the work happens — see CLAUDE.md
// and scripts/balance-sim/liveness.ts.
//
// Layers:
//   1. modules   — file nodes + import edges (TS compiler resolution)
//   2. symbols   — exported declarations per file, with kind + line
//   3. calls     — identifier call edges between exported symbols
//   4. collisions— same exported name declared in >1 file (graphify's best trick)
//   5. boundary  — supabase .rpc()/functions.invoke() names vs SQL definitions
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const ts = (
  await import(pathToFileURL(path.join(ROOT, "node_modules/typescript/lib/typescript.js")))
).default;
const OUT = path.join(ROOT, "graphify-out");
fs.mkdirSync(OUT, { recursive: true });

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

// ---------- collect sources ----------
function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|mts|mjs)$/.test(e.name)) acc.push(p);
  }
  return acc;
}
const files = [
  ...walk(path.join(ROOT, "src")),
  ...walk(path.join(ROOT, "scripts")),
  ...(fs.existsSync(path.join(ROOT, "supabase/functions"))
    ? walk(path.join(ROOT, "supabase/functions"))
    : []),
].filter((f) => !f.endsWith("routeTree.gen.ts"));

const cfgPath = ts.findConfigFile(ROOT, ts.sys.fileExists, "tsconfig.json");
const cfg = ts.parseJsonConfigFileContent(
  ts.readConfigFile(cfgPath, ts.sys.readFile).config,
  ts.sys,
  ROOT,
);
const program = ts.createProgram(files, {
  ...cfg.options,
  noEmit: true,
  allowJs: true,
});

const isTest = (f) => /\.(test|spec)\.[tj]sx?$/.test(f);

// ---------- layer 1+2+3 ----------
const modules = new Map(); // rel path -> node
const importEdges = [];
const symbols = []; // {file, name, kind, line, exported}
const callEdges = [];

const moduleSpecs = new Map(); // rel -> Set(resolved rel)

for (const sf of program.getSourceFiles()) {
  if (sf.isDeclarationFile) continue;
  const f = rel(sf.fileName);
  if (!f.startsWith("src/") && !f.startsWith("scripts/") && !f.startsWith("supabase/")) continue;
  // The generated route tree is a build artefact, not a module anyone reads. Left
  // in, its 17 imports read as a lib -> route back-edge that does not exist.
  if (f.endsWith("routeTree.gen.ts")) continue;

  const loc = sf.getLineAndCharacterOfPosition(sf.end).line + 1;
  modules.set(f, {
    id: f,
    layer: f.startsWith("src/routes/")
      ? "route"
      : f.startsWith("src/components/")
        ? "component"
        : f.startsWith("src/engine/")
          ? "engine"
          : f.startsWith("src/services/")
            ? "service"
            : f.startsWith("src/hooks/")
              ? "hook"
              : f.startsWith("src/content/")
                ? "content"
                : f.startsWith("src/integrations/")
                  ? "integration"
                  : f.startsWith("supabase/functions/")
                    ? "edge-function"
                    : f.startsWith("scripts/")
                      ? "script"
                      : f.startsWith("src/lib/")
                        ? "lib"
                        : "app", // src/router.tsx, src/sw.ts and friends
    lines: loc,
    test: isTest(f),
    exports: [],
  });

  const declaredHere = new Set();
  const localCalls = new Set();

  const visit = (node) => {
    // imports
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const spec = node.moduleSpecifier.text;
      const resolved = ts.resolveModuleName(
        spec,
        sf.fileName,
        program.getCompilerOptions(),
        ts.sys,
      ).resolvedModule;
      const target =
        resolved && !resolved.isExternalLibraryImport ? rel(resolved.resolvedFileName) : null;
      if (target) {
        importEdges.push({ from: f, to: target, kind: "import" });
        if (!moduleSpecs.has(f)) moduleSpecs.set(f, new Set());
        moduleSpecs.get(f).add(target);
      } else {
        importEdges.push({ from: f, to: `external:${spec}`, kind: "external" });
      }
    }

    // exported declarations
    const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
    const exported = !!mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const push = (name, kind) => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
      symbols.push({ file: f, name, kind, line, exported, test: isTest(f) });
      declaredHere.add(name);
    };
    if (ts.isFunctionDeclaration(node) && node.name) push(node.name.text, "function");
    else if (ts.isClassDeclaration(node) && node.name) push(node.name.text, "class");
    else if (ts.isInterfaceDeclaration(node)) push(node.name.text, "interface");
    else if (ts.isTypeAliasDeclaration(node)) push(node.name.text, "type");
    else if (ts.isEnumDeclaration(node)) push(node.name.text, "enum");
    else if (ts.isVariableStatement(node)) {
      const vmods = ts.getModifiers(node);
      const vexp = !!vmods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      for (const d of node.declarationList.declarations) {
        if (!ts.isIdentifier(d.name)) continue;
        const init = d.initializer;
        const kind =
          init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
            ? "function"
            : "const";
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        symbols.push({ file: f, name: d.name.text, kind, line, exported: vexp, test: isTest(f) });
        declaredHere.add(d.name.text);
      }
    }

    // call sites (identifier-level)
    if (ts.isCallExpression(node)) {
      const e = node.expression;
      if (ts.isIdentifier(e)) localCalls.add(e.text);
      else if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.name))
        localCalls.add(e.name.text);
    }

    ts.forEachChild(node, visit);
  };
  ts.forEachChild(sf, visit);
  modules.get(f).callsRaw = [...localCalls];
  modules.get(f).declares = [...declaredHere];
}

// resolve call edges: caller file -> (callee name, defining file)
const defIndex = new Map(); // name -> [files]
for (const s of symbols) {
  if (!s.exported) continue;
  if (!defIndex.has(s.name)) defIndex.set(s.name, []);
  defIndex.get(s.name).push(s.file);
}
for (const [f, m] of modules) {
  for (const name of m.callsRaw ?? []) {
    const defs = defIndex.get(name);
    if (!defs) continue;
    for (const d of defs) {
      if (d === f) continue;
      // only count it if f actually imports d (avoids the duplicate-name trap)
      if (moduleSpecs.get(f)?.has(d)) callEdges.push({ from: f, to: d, symbol: name });
    }
  }
  delete m.callsRaw;
}

// ---------- layer 4: name collisions ----------
const collisions = [];
for (const [name, defs] of defIndex) {
  const prod = [...new Set(defs.filter((d) => !isTest(d)))];
  if (prod.length > 1) collisions.push({ name, files: prod });
}
collisions.sort((a, b) => b.files.length - a.files.length || a.name.localeCompare(b.name));

// ---------- layer 5: client <-> database boundary ----------
const sqlFiles = fs.existsSync(path.join(ROOT, "supabase/migrations"))
  ? fs
      .readdirSync(path.join(ROOT, "supabase/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .map((f) => path.join(ROOT, "supabase/migrations", f))
  : [];

const sqlDefs = new Map(); // fn name -> [migration files]
for (const f of sqlFiles) {
  const text = fs.readFileSync(f, "utf8");
  for (const m of text.matchAll(
    /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
  )) {
    const n = m[1].toLowerCase();
    if (!sqlDefs.has(n)) sqlDefs.set(n, []);
    sqlDefs.get(n).push(path.basename(f));
  }
}

const rpcCalls = new Map(); // rpc name -> Set(caller files)
const invokes = new Map(); // edge function name -> Set(caller files)
const tableRefs = new Map();
for (const [f] of modules) {
  const text = fs.readFileSync(path.join(ROOT, f), "utf8");
  for (const m of text.matchAll(/\.rpc\(\s*["'`]([a-zA-Z0-9_]+)["'`]/g)) {
    const n = m[1];
    if (!rpcCalls.has(n)) rpcCalls.set(n, new Set());
    rpcCalls.get(n).add(f);
  }
  for (const m of text.matchAll(/functions\.invoke\(\s*["'`]([a-zA-Z0-9_-]+)["'`]/g)) {
    const n = m[1];
    if (!invokes.has(n)) invokes.set(n, new Set());
    invokes.get(n).add(f);
  }
  for (const m of text.matchAll(/\.from\(\s*["'`]([a-z0-9_]+)["'`]/g)) {
    const n = m[1];
    if (!tableRefs.has(n)) tableRefs.set(n, new Set());
    tableRefs.get(n).add(f);
  }
}

const edgeFunctionDirs = fs.existsSync(path.join(ROOT, "supabase/functions"))
  ? fs
      .readdirSync(path.join(ROOT, "supabase/functions"), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
  : [];

const boundary = {
  rpc: [...rpcCalls.entries()]
    .map(([name, callers]) => ({
      name,
      callers: [...callers].sort(),
      definedInMigrations: sqlDefs.get(name.toLowerCase()) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  edgeFunctions: [...new Set([...edgeFunctionDirs, ...invokes.keys()])].sort().map((name) => ({
    name,
    hasSource: edgeFunctionDirs.includes(name),
    invokedFrom: [...(invokes.get(name) ?? [])].sort(),
  })),
  tables: [...tableRefs.entries()]
    .map(([name, f]) => ({ name, referencedFrom: [...f].sort() }))
    .sort((a, b) => b.referencedFrom.length - a.referencedFrom.length),
  sqlFunctionsDefined: [...sqlDefs.keys()].sort(),
};

// ---------- fan-in / fan-out ----------
const fanIn = new Map();
const fanOut = new Map();
for (const e of importEdges) {
  if (e.to.startsWith("external:")) continue;
  fanOut.set(e.from, (fanOut.get(e.from) ?? 0) + 1);
  fanIn.set(e.to, (fanIn.get(e.to) ?? 0) + 1);
}
for (const [f, m] of modules) {
  m.fanIn = fanIn.get(f) ?? 0;
  m.fanOut = fanOut.get(f) ?? 0;
  m.exports = symbols.filter((s) => s.file === f && s.exported).map((s) => s.name);
}

const graph = {
  generatedAt: new Date().toISOString(),
  generator: "scratchpad/repo-map.mjs (graphify stand-in; ts compiler API)",
  counts: {
    modules: modules.size,
    productionModules: [...modules.values()].filter((m) => !m.test).length,
    testModules: [...modules.values()].filter((m) => m.test).length,
    symbols: symbols.length,
    exportedSymbols: symbols.filter((s) => s.exported).length,
    importEdges: importEdges.filter((e) => !e.to.startsWith("external:")).length,
    externalImportEdges: importEdges.filter((e) => e.to.startsWith("external:")).length,
    callEdges: callEdges.length,
    nameCollisions: collisions.length,
    sqlFunctions: sqlDefs.size,
    rpcNamesCalledFromClient: rpcCalls.size,
    migrations: sqlFiles.length,
  },
  modules: [...modules.values()],
  importEdges,
  callEdges,
  symbols,
  collisions,
  boundary,
};

fs.writeFileSync(path.join(OUT, "graph.json"), JSON.stringify(graph, null, 2));
fs.writeFileSync(
  path.join(OUT, "collisions.json"),
  JSON.stringify(
    { collisions, note: "same exported name declared in >1 production file" },
    null,
    2,
  ),
);
fs.writeFileSync(path.join(OUT, "boundary.json"), JSON.stringify(boundary, null, 2));

console.log(JSON.stringify(graph.counts, null, 2));
console.log("\n-- top fan-in (most depended on) --");
console.log(
  [...modules.values()]
    .filter((m) => !m.test)
    .sort((a, b) => b.fanIn - a.fanIn)
    .slice(0, 15)
    .map((m) => `${String(m.fanIn).padStart(3)}  ${m.id}`)
    .join("\n"),
);
console.log("\n-- largest modules --");
console.log(
  [...modules.values()]
    .filter((m) => !m.test)
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 15)
    .map((m) => `${String(m.lines).padStart(5)}  ${m.id}`)
    .join("\n"),
);
console.log("\n-- layers --");
const byLayer = {};
for (const m of modules.values()) {
  if (m.test) continue;
  byLayer[m.layer] = byLayer[m.layer] ?? { files: 0, lines: 0 };
  byLayer[m.layer].files++;
  byLayer[m.layer].lines += m.lines;
}
console.log(JSON.stringify(byLayer, null, 2));
console.log("\n-- collisions --");
console.log(collisions.map((c) => `${c.name}: ${c.files.join(", ")}`).join("\n") || "(none)");
console.log("\n-- rpc names with no migration definition --");
console.log(
  boundary.rpc
    .filter((r) => r.definedInMigrations.length === 0)
    .map((r) => `${r.name}  <- ${r.callers.join(", ")}`)
    .join("\n") || "(all resolved)",
);
