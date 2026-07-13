/* Emits the `pvp_signature_effects` catalog INSERT rows from the TS catalog so
 * the server-side magnitudes stay in lockstep with src/lib/signature-abilities.ts.
 * Run: npx vite-node scripts/gen-signature-sql.ts
 * Only post_answer / capped_payload abilities produce server-applied rows
 * (stat_stage / status / cure / heal / drain). damage_calc, hamper, help,
 * flat_damage and bespoke effects are handled client-side or not auto-fired.
 *
 * NOTE — the one place the rename does NOT reach. The TypeScript wiring mode is
 * `capped_payload`, but the DATABASE phase token it emits is still the string
 * "manual". That token is a wire protocol: the client passes it to
 * `apply_pvp_signature_effect(_phase => 'manual')`, live RPC bodies filter on
 * `phase = 'manual'`, and 20 rows in production carry it. Renaming it would mean
 * migrating the data AND redefining the live functions AND shipping a matching
 * client, in that order — and any gap between them breaks matches in progress for
 * no gain, since inside SQL the meaning is unambiguous. So the token stays; the
 * TypeScript that humans read does not.
 *
 * `battle_start` used to emit here too. That is what created the five dead rows
 * deleted on 2026-07-13 — the phase never fired in a live match (see `WiringMode`),
 * so every row this produced for it was inert. */
import {
  SIGNATURE_ABILITIES,
  type SignatureAbility,
  type SignatureEffect,
} from "../src/lib/signature-abilities";

type Row = { pokemonId: number; idx: number; phase: string; target: string; kind: string; payload: string };

function flatten(e: SignatureEffect, out: SignatureEffect[]): void {
  if (e.type === "compound") e.effects.forEach((x) => flatten(x, out));
  else out.push(e);
}

/**
 * Wiring mode -> DATABASE phase token. These are NOT the same vocabulary and the rows
 * emitted here must speak the database's.
 *
 * This function used to be `phase: a.wiring` — the wiring label passed straight through
 * as the phase. That silently coupled a TypeScript identifier to a live wire protocol:
 * renaming the wiring mode to `capped_payload` would have emitted
 * `phase = 'capped_payload'` rows that NO RPC looks for (they all filter `phase =
 * 'manual'`), quietly un-wiring 20 abilities. TypeScript cannot catch it — `phase` is a
 * `string`. Hence the explicit map.
 */
const DB_PHASE: Record<string, string> = {
  post_answer: "post_answer",
  capped_payload: "manual", // historical token; see the header note
};

function rowsFor(a: SignatureAbility): Row[] {
  // Both route through the same server RPC. A capped_payload row's effects are fired
  // automatically by its own engine trigger (`fireCappedPayload`), capped at `uses`.
  if (a.wiring !== "post_answer" && a.wiring !== "capped_payload") return [];
  const flat: SignatureEffect[] = [];
  flatten(a.effect, flat);
  const rows: Row[] = [];
  let idx = 0;
  // Capped-payload abilities carry their per-battle use cap on each emitted row so the
  // server can enforce it without a companion table.
  const uses =
    a.wiring === "capped_payload" && a.trigger.type === "capped_payload"
      ? a.trigger.usesPerBattle
      : 0;
  const withUses = (payload: Record<string, unknown>) =>
    JSON.stringify(uses > 0 ? { ...payload, uses } : payload);
  // pokedex_scaling stores per/max; server computes the clamped delta.
  if (a.trigger.type === "pokedex_scaling") {
    rows.push({
      pokemonId: a.pokemonId,
      idx: idx++,
      phase: DB_PHASE[a.wiring],
      target: "self",
      kind: "stat_scale",
      payload: JSON.stringify({ stat: "attack", per: a.trigger.per, max: a.trigger.max }),
    });
    return rows;
  }
  for (const e of flat) {
    if (e.type === "stat_stage") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: DB_PHASE[a.wiring],
        target: e.target,
        kind: "stat_stage",
        payload: withUses({ stat: e.stat, delta: e.delta }),
      });
    } else if (e.type === "status") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: DB_PHASE[a.wiring],
        target: e.target,
        kind: "status",
        payload: withUses({ status: e.status, questions: e.questions }),
      });
    } else if (e.type === "cure") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: DB_PHASE[a.wiring],
        target: e.target,
        kind: "cure",
        payload: withUses({ status: e.status }),
      });
    } else if (e.type === "heal") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: DB_PHASE[a.wiring],
        target: e.target,
        kind: "heal",
        payload: withUses({ amount: e.amount }),
      });
    } else if (e.type === "drain") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: DB_PHASE[a.wiring],
        target: "opponent",
        kind: "drain",
        payload: withUses({ amount: e.amount }),
      });
    }
    // stat_stage with a computed stat (highest_self, etc.) is stored as-is; the
    // RPC resolves the meta-stat. random/highest are passed through in payload.
  }
  return rows;
}

const all: Row[] = [];
for (const a of Object.values(SIGNATURE_ABILITIES)) all.push(...rowsFor(a));

const values = all
  .map(
    (r) =>
      `  (${r.pokemonId}, ${r.idx}, '${r.phase}', '${r.target}', '${r.kind}', '${r.payload.replace(/'/g, "''")}'::jsonb)`,
  )
  .join(",\n");

console.log(
  `insert into public.pvp_signature_effects (pokemon_id, effect_index, phase, target, kind, payload) values\n${values};`,
);
console.error(`-- ${all.length} rows from ${new Set(all.map((r) => r.pokemonId)).size} abilities`);
