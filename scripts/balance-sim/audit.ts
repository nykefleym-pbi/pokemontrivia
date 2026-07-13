/**
 * Wiring audit: does every signature ability actually DO what its row says?
 *
 * Three sources have to agree, and nothing in the app checks that they do:
 *   1. the catalog row      (`SIGNATURE_ABILITIES` — what the player is told)
 *   2. the delivery path    (which phases the battle screen actually calls)
 *   3. `pvp_signature_effects` in production (the magnitudes the server applies)
 *
 * The server owns every magnitude, so a catalog row can promise a 35% Freeze
 * while the DB quietly applies 100% and nobody notices. Likewise a row can be
 * wired to TWO delivery paths and land its effect twice (the Zarude bug), or to
 * none and land it never.
 *
 *   npx vite-node -c scripts/balance-sim/vite.config.ts scripts/balance-sim/audit.ts
 */
import { readFileSync } from "node:fs";
import { SIGNATURE_ABILITIES } from "../../src/lib/signature-abilities";

interface DbRow {
  pokemon_id: number;
  phase: string;
  kind: string;
  payload: Record<string, unknown>;
}

const rows: DbRow[] = JSON.parse(
  readFileSync(new URL("./prod-effects.json", import.meta.url), "utf8"),
);

const byDex = new Map<number, DbRow[]>();
for (const r of rows) {
  const list = byDex.get(r.pokemon_id) ?? [];
  list.push(r);
  byDex.set(r.pokemon_id, list);
}

type Sev = "BUG" | "WARN";
interface Finding {
  dex: number;
  name: string;
  sev: Sev;
  code: string;
  detail: string;
}
const findings: Finding[] = [];

function flag(dex: number, sev: Sev, code: string, detail: string) {
  findings.push({ dex, name: SIGNATURE_ABILITIES[dex]?.signatureMove ?? "?", sev, code, detail });
}

for (const [idStr, row] of Object.entries(SIGNATURE_ABILITIES)) {
  const dex = Number(idStr);
  const db = byDex.get(dex) ?? [];
  const eng = row.engine;
  const has = (phase: string, kind?: string) =>
    db.filter((r) => r.phase === phase && (kind == null || r.kind === kind));

  // ── 1. Statuses the engine promises must exist server-side, at the same
  //       magnitude. The catalog number is what the ability DESCRIPTION is
  //       generated from, so drift here means the game lies to the player.
  for (const s of eng?.status ?? []) {
    const dbRows = has("engine_status", "status").filter(
      (r) => r.payload.status === s.status || r.payload.status === "random",
    );
    if (dbRows.length === 0) {
      flag(dex, "BUG", "STATUS_NEVER_LANDS", `engine promises ${s.status} but no engine_status row exists`);
      continue;
    }
    const p = dbRows[0].payload as { chance?: number; questions?: number };
    const catChance = s.chance ?? 1;
    const catQ = s.questions ?? 0;
    if ((p.chance ?? 1) !== catChance) {
      flag(dex, "BUG", "CHANCE_DRIFT", `${s.status}: catalog says ${pct(catChance)}, server applies ${pct(p.chance ?? 1)}`);
    }
    if (catQ && (p.questions ?? 0) !== catQ) {
      flag(dex, "WARN", "DURATION_DRIFT", `${s.status}: catalog says ${catQ}q, server applies ${p.questions ?? 0}q`);
    }
  }

  // ── 2. Can the legacy `post_answer` path double-apply an effect the engine
  //       already delivers? (The Zarude bug: "it also still runs its old heal-8
  //       path on top.")
  //
  //       NO — and it is worth being precise about why, because reading only the
  //       call sites suggests otherwise. `evaluatePostAnswer` and
  //       `evaluatePassiveDamageSideEffects` BOTH open with
  //
  //           if (!ability || isEngineOwned(ability)) return [];
  //
  //       and `isEngineOwned` is simply `ability.engine !== undefined`. Every one
  //       of the 104 rows has an engine, so both evaluators return [] for all of
  //       them, and the battle screen only calls the RPC when the evaluator
  //       returns something. The de-duplication is already done in code.
  //
  //       So a production `post_answer` row is INERT unless the client calls that
  //       phase without consulting an evaluator — which happens in exactly one
  //       place: the hardcoded call for Thunderclap #1021
  //       (live-pvp-battle-screen:1019). Everything else is dead weight in the
  //       table: harmless, but it makes the DB look like it does more than it does.
  const enginePreemptsLegacy = eng !== undefined && dex !== 1021;
  const paRows = has("post_answer");
  if (enginePreemptsLegacy && paRows.length > 0) {
    const kinds = [...new Set(paRows.map((r) => r.kind))].join(", ");
    flag(dex, "WARN", "INERT_POST_ANSWER", `${paRows.length} post_answer row(s) can never fire — the engine spec pre-empts the legacy path (${kinds})`);
  }

  // ── 4. `_pvp_shield_pct` DEFAULTS TO 0 when no row exists — and 0 means TOTAL
  //       immunity. A missing shield row is therefore not a no-op, it is the
  //       strongest possible effect. Fail loud.
  if (eng?.shield) {
    const sh = has("m4_window", "shield")[0];
    if (!sh) {
      flag(dex, "BUG", "SILENT_TOTAL_IMMUNITY", `engine declares a shield but no m4_window row exists — _pvp_shield_pct defaults to 0 = takes NO damage`);
    } else {
      const p = sh.payload as { receivePct?: number; questions?: number };
      if ((p.receivePct ?? 0) !== eng.shield.receivePct) {
        flag(dex, "BUG", "SHIELD_DRIFT", `catalog says takes ${eng.shield.receivePct}% damage, server applies ${p.receivePct ?? 0}%`);
      }
      if ((p.questions ?? 0) !== eng.shield.questions) {
        flag(dex, "WARN", "SHIELD_DURATION_DRIFT", `catalog says ${eng.shield.questions}q, server applies ${p.questions ?? 0}q`);
      }
    }
  }

  // ── 5. A timed window only closes if the client sends `_expire_after_questions
  //       > 0`. It derives that from `expireAfterQuestions` OR a
  //       `disable_effect_after_questions` disable. A row that declares neither,
  //       but triggers on a STATE (HP below X) rather than an EVENT, holds its
  //       effect for the rest of the battle. This is the Iron Boulder class.
  const d = eng?.disable;
  const expireN =
    eng?.expireAfterQuestions ??
    (d?.kind === "disable_effect_after_questions"
      ? d.n
      : d?.kind === "any_of"
        ? (d.of.find((a) => a.kind === "disable_effect_after_questions") as { n?: number } | undefined)?.n ?? 0
        : 0);
  const stateTrigger =
    eng?.trigger.type === "self_afflicted_or_hp_below" || eng?.trigger.type === "hp_threshold";
  const holdsSomething = Boolean(eng?.shield || eng?.multiplier || eng?.stat?.length);
  // A state trigger is only dangerous if NOTHING can ever switch the row off.
  // These three all close it legitimately, so they are not the Iron Boulder bug:
  //   • `latchOnTrigger` — permanence is the authored point (Walking Wake #1009 /
  //     Iron Leaves #1010: "once you've been on the ropes, the comeback is banked").
  //   • `once_per_battle` — fires once, then disabled forever (Zarude #893).
  //   • `revert_stat_after_incorrect` — a wrong answer reverts and disables
  //     (Kyogre #382 / Groudon #383 / Rayquaza #384 / Registeel #379).
  const hasCloser =
    eng?.latchOnTrigger === true ||
    d?.kind === "once_per_battle" ||
    d?.kind === "revert_stat_after_incorrect" ||
    d?.kind === "disable_effect_after_incorrect";
  if (stateTrigger && holdsSomething && expireN === 0 && !hasCloser) {
    flag(dex, "BUG", "WINDOW_NEVER_CLOSES", `triggers on a STATE (${eng!.trigger.type}) and holds an effect, but nothing can switch it off — it lasts the rest of the battle`);
  }
}

function pct(n: number) {
  return `${Math.round(n * 100)}%`;
}

const bugs = findings.filter((f) => f.sev === "BUG");
const warns = findings.filter((f) => f.sev === "WARN");

console.log(`\nWIRING AUDIT — ${Object.keys(SIGNATURE_ABILITIES).length} rows, ${rows.length} production effect rows\n`);
for (const group of [bugs, warns]) {
  if (!group.length) continue;
  console.log(`${group[0].sev === "BUG" ? "BUGS" : "WARNINGS"} (${group.length})`);
  for (const f of group.sort((a, b) => a.code.localeCompare(b.code) || a.dex - b.dex)) {
    console.log(`  #${String(f.dex).padEnd(5)} ${f.name.padEnd(18)} ${f.code.padEnd(24)} ${f.detail}`);
  }
  console.log("");
}
if (!findings.length) console.log("Clean — catalog, delivery path and production DB all agree.\n");
