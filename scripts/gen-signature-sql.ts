/* Emits the `pvp_signature_effects` catalog INSERT rows from the TS catalog so
 * the server-side magnitudes stay in lockstep with src/lib/signature-abilities.ts.
 * Run: npx vite-node scripts/gen-signature-sql.ts
 * Only post_answer / manual abilities produce server-applied rows
 * (stat_stage / status / cure / heal / drain). damage_calc, hamper, help,
 * flat_damage and bespoke effects are handled client-side or not auto-fired.
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

function rowsFor(a: SignatureAbility): Row[] {
  // post_answer effects apply automatically; manual effects fire on the player's
  // Fire tap. Both route through the same server RPC.
  if (a.wiring !== "post_answer" && a.wiring !== "manual") return [];
  const flat: SignatureEffect[] = [];
  flatten(a.effect, flat);
  const rows: Row[] = [];
  let idx = 0;
  // Manual abilities carry their per-battle use cap on each emitted row so the
  // server can enforce it without a companion table.
  const uses = a.wiring === "manual" && a.trigger.type === "manual" ? a.trigger.usesPerBattle : 0;
  const withUses = (payload: Record<string, unknown>) =>
    JSON.stringify(uses > 0 ? { ...payload, uses } : payload);
  // pokedex_scaling stores per/max; server computes the clamped delta.
  if (a.trigger.type === "pokedex_scaling") {
    rows.push({
      pokemonId: a.pokemonId,
      idx: idx++,
      phase: a.wiring,
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
        phase: a.wiring,
        target: e.target,
        kind: "stat_stage",
        payload: withUses({ stat: e.stat, delta: e.delta }),
      });
    } else if (e.type === "status") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: a.wiring,
        target: e.target,
        kind: "status",
        payload: withUses({ status: e.status, questions: e.questions }),
      });
    } else if (e.type === "cure") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: a.wiring,
        target: e.target,
        kind: "cure",
        payload: withUses({ status: e.status }),
      });
    } else if (e.type === "heal") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: a.wiring,
        target: e.target,
        kind: "heal",
        payload: withUses({ amount: e.amount }),
      });
    } else if (e.type === "drain") {
      rows.push({
        pokemonId: a.pokemonId,
        idx: idx++,
        phase: a.wiring,
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
