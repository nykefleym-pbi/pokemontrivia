/**
 * LIVENESS MAP — which signature delivery paths can actually run?
 *
 * WHY THIS EXISTS. In this codebase a function can be exported, imported, called
 * from the live battle screen, and backed by rows in production — and still be
 * stone dead, because of ONE line at the top of its body:
 *
 *     if (!ability || isEngineOwned(ability)) return [];      // isEngineOwned = a.engine !== undefined
 *
 * Every one of the 104 rows has an `engine` spec, so any function carrying that
 * guard returns empty every time. Nothing about the function's NAME, its call
 * edges, or its database rows reveals this. Reading those three signals and
 * concluding "it's live" is exactly the mistake that has been made repeatedly:
 *
 *   - `evaluateBattleStart` LOOKED live (called from two useEffects, five DB rows).
 *     It was dead. The rows were deleted 2026-07-13.
 *   - `hasServerManualEffect` LOOKED dead (legacy name, `wiring: "manual"`, a
 *     `phase='manual'` table). It is LIVE — `fireManualAuto` runs it off the engine
 *     trigger. Deleting it would have stripped 20 Pokemon of their ability.
 *
 * Names lie in both directions. So this file does not trust names, comments, or
 * memory. It reads the actual source of each delivery function, looks for the
 * guard, and computes liveness from the catalog. If someone adds a guard, or
 * removes one, or ships a row with no engine, the answer here changes by itself.
 *
 *   npx vite-node -c scripts/balance-sim/vite.config.ts scripts/balance-sim/liveness.ts
 */
import { readFileSync } from "node:fs";
import { SIGNATURE_ABILITIES } from "../../src/lib/signature-abilities";

const SRC = new URL("../../src/", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, SRC), "utf8");

const sigSrc = read("lib/signature-abilities.ts");
const screenSrc = read("components/live-pvp-battle-screen.tsx");

// ── Ground truth from the catalog, not from memory ───────────────────────────
const all = Object.values(SIGNATURE_ABILITIES);
const withEngine = all.filter((a) => a.engine !== undefined);
const ENGINE_IS_UNIVERSAL = withEngine.length === all.length;

/** Brace-match a `function` body from its declaration. */
function fnBody(src: string, decl: RegExp): string | null {
  const m = decl.exec(src);
  if (!m) return null;
  const start = src.indexOf("{", m.index);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(start, i + 1);
  }
  return null;
}

/** Read a `const x = <expr>;` initialiser. NOT brace-matched — a const's value ends
 *  at the semicolon, and brace-matching one walks off into the next function and
 *  reports a guard that belongs to somebody else. (That bug shipped once.) */
function constInit(src: string, decl: RegExp): string | null {
  const m = decl.exec(src);
  if (!m) return null;
  const end = src.indexOf(";", m.index);
  return end < 0 ? null : src.slice(m.index, end + 1);
}

/** Does this code bail out when the ability is engine-owned?
 *  For a function, only the first few lines count — a bail-out has to happen before
 *  the work. For a const initialiser, the whole expression counts. */
function engineGuard(code: string, kind: "fn" | "expr"): string | null {
  const region = kind === "fn" ? code.split("\n").slice(0, 6).join("\n") : code;
  if (/isEngineOwned\s*\(/.test(region)) return "isEngineOwned(ability)";
  if (/!\s*\w+\.engine\b/.test(region)) return "!ability.engine";
  if (/\.engine\s*===\s*undefined/.test(region)) return "ability.engine === undefined";
  return null;
}

interface Path {
  fn: string;
  kind: "fn" | "expr";
  src: string;
  decl: RegExp;
  /** What this path delivers if it runs. */
  delivers: string;
  /** Only reachable when this other path is live. A function with no guard of its
   *  own is still dead if the only thing that calls it is dead — `manualHitModifiers`
   *  is clean, but nothing reaches it once `isClientHitManual` is always false. */
  gatedBy?: string;
}

const PATHS: Path[] = [
  { fn: "evaluatePostAnswer", kind: "fn", src: sigSrc, decl: /export function evaluatePostAnswer\b/, delivers: "phase='post_answer' DB rows" },
  { fn: "evaluatePassiveDamageSideEffects", kind: "fn", src: sigSrc, decl: /export function evaluatePassiveDamageSideEffects\b/, delivers: "post_answer side-effects on a passive hit" },
  { fn: "evaluateHitModifiers", kind: "fn", src: sigSrc, decl: /export function evaluateHitModifiers\b/, delivers: "damage-calc modifiers folded into a hit" },
  { fn: "hasServerManualEffect", kind: "fn", src: sigSrc, decl: /export function hasServerManualEffect\b/, delivers: "phase='manual' DB rows (auto-fired by fireManualAuto)" },
  { fn: "isClientHitManual", kind: "expr", src: screenSrc, decl: /const isClientHitManual\s*=/, delivers: "arming the one-hit modifier in the battle screen" },
  { fn: "manualHitModifiers", kind: "fn", src: sigSrc, decl: /export function manualHitModifiers\b/, delivers: "an armed one-hit damage modifier", gatedBy: "isClientHitManual" },
  { fn: "hasClientManualHit", kind: "fn", src: sigSrc, decl: /export function hasClientManualHit\b/, delivers: "whether a row arms a one-hit modifier", gatedBy: "isClientHitManual" },
];

type Verdict = "LIVE" | "DEAD" | "GONE";
interface Row {
  fn: string;
  guard: string | null;
  verdict: Verdict;
  why: string;
  delivers: string;
}

const rows: Row[] = [];
for (const p of PATHS) {
  const code = p.kind === "fn" ? fnBody(p.src, p.decl) : constInit(p.src, p.decl);
  if (code == null) {
    rows.push({ fn: p.fn, guard: null, verdict: "GONE", why: "not found in source", delivers: p.delivers });
    continue;
  }
  const g = engineGuard(code, p.kind);
  const deadByGuard = g != null && ENGINE_IS_UNIVERSAL;
  rows.push({
    fn: p.fn,
    guard: g,
    verdict: deadByGuard ? "DEAD" : "LIVE",
    why: deadByGuard ? `guard ${g} is always true` : "no engine guard",
    delivers: p.delivers,
  });
}

// Second pass: a clean function is still dead if its only gate is dead.
const verdictOf = new Map(rows.map((r) => [r.fn, r]));
for (const p of PATHS) {
  if (!p.gatedBy) continue;
  const self = verdictOf.get(p.fn)!;
  const gate = verdictOf.get(p.gatedBy);
  if (self.verdict === "LIVE" && gate?.verdict === "DEAD") {
    self.verdict = "DEAD";
    self.why = `unreachable — its only gate ${p.gatedBy} is dead`;
  }
}

// `evaluateBattleStart` was deleted 2026-07-13. If it comes back, shout.
if (/export function evaluateBattleStart\b/.test(sigSrc)) {
  rows.push({
    fn: "evaluateBattleStart",
    guard: null,
    verdict: "LIVE",
    why: "RESURRECTED — this was deleted on 2026-07-13",
    delivers: "phase='battle_start' DB rows — the rows are GONE from production, so this now delivers nothing",
  });
}

// ── Report ───────────────────────────────────────────────────────────────────
console.log("\nLIVENESS MAP — computed from source + catalog, not from comments\n");
console.log(
  `catalog: ${all.length} rows, ${withEngine.length} with an engine spec` +
    (ENGINE_IS_UNIVERSAL
      ? "  ->  every engine guard is ALWAYS TRUE, so every guarded path is DEAD"
      : `  ->  ${all.length - withEngine.length} row(s) have NO engine, so guarded paths CAN still run`),
);
console.log("");

const pad = (s: string, n: number) => s.padEnd(n);
console.log(`  ${pad("DELIVERY PATH", 34)}${pad("", 6)}WHY`);
console.log(`  ${"-".repeat(88)}`);
for (const r of rows.sort((a, b) => a.verdict.localeCompare(b.verdict) || a.fn.localeCompare(b.fn))) {
  const mark = r.verdict === "LIVE" ? "LIVE" : r.verdict === "DEAD" ? "dead" : "GONE";
  console.log(`  ${pad(r.fn, 34)}${pad(mark, 6)}${r.why}`);
}

const live = rows.filter((r) => r.verdict === "LIVE");
const dead = rows.filter((r) => r.verdict === "DEAD");

console.log("");
console.log("BEFORE YOU DELETE ANYTHING:");
console.log("");
console.log(`  ${dead.length} path(s) CANNOT RUN — safe to delete, no behaviour change:`);
for (const r of dead) console.log(`      ${pad(r.fn, 34)}${r.why}`);
console.log("");
console.log(`  ${live.length} path(s) ARE LIVE — deleting these REMOVES ABILITIES FROM THE GAME:`);
for (const r of live) console.log(`      ${pad(r.fn, 34)}delivers ${r.delivers}`);
console.log("");
console.log("NAMING TRAP: `manual` no longer means player-fired. The Fire button was removed");
console.log("(owner ruling 2026-07-13). A row's manual-phase effects are the payload its ENGINE");
console.log("trigger delivers, auto-fired by `fireManualAuto`, capped at the uses it always had.");
console.log("");
