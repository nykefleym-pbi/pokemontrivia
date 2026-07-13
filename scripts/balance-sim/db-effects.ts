/**
 * A snapshot of `pvp_signature_effects` from production (project dvdorceiasaipdvyfhil,
 * read 2026-07-13). These are the magnitudes the SERVER actually pays out — the
 * client only names the phase. Balancing any server-owned effect means editing
 * these rows, so the simulator reads the real table rather than the catalog's
 * legacy `effect` field, which no longer decides magnitude.
 *
 * The five `battle_start` rows (888, 889, 1001, 1016, 1017) are gone — deleted from
 * production 2026-07-13. The phase never fired in a live match, so simulating them
 * handed those five an entry buff the real game never gave them.
 */
export interface DbEffect {
  effectIndex: number;
  phase: "post_answer" | "manual" | "bespoke" | "m4_fx" | "engine_status" | "index_shield";
  target: "self" | "opponent";
  kind: string;
  payload: Record<string, unknown>;
}

const E = (
  effectIndex: number,
  phase: DbEffect["phase"],
  target: DbEffect["target"],
  kind: string,
  payload: Record<string, unknown> = {},
): DbEffect => ({ effectIndex, phase, target, kind, payload });

export const DB_EFFECTS: Record<number, DbEffect[]> = {
  146: [E(0, "post_answer", "opponent", "status", { status: "sleep", questions: 1 })],
  244: [E(0, "post_answer", "opponent", "status", { status: "burn", questions: 3 })],
  245: [E(1, "post_answer", "self", "cure", { status: "any" })],
  485: [
    E(0, "manual", "opponent", "suppress_ability", { uses: 1, questions: 3 }),
    E(1, "manual", "opponent", "status", { status: "badly-poisoned", questions: 3 }),
    E(90, "bespoke", "opponent", "dot_frac_hp", { pct: 0.125, questions: 5 }),
  ],
  385: [E(90, "bespoke", "opponent", "flat_next_question_damage", { amount: 20 })],
  480: [E(90, "bespoke", "opponent", "predicted_status_apply", { questions: 3 })],
  487: [E(91, "index_shield", "self", "receive_zero", { indices: [1, 11] })],
  488: [E(0, "manual", "self", "cleanse", { uses: 1, hpCostPct: 0 })],
  490: [
    E(0, "manual", "opponent", "swap_stages", { uses: 1 }),
    E(90, "bespoke", "self", "reflect_opponent_stat", {}),
  ],
  491: [E(0, "manual", "opponent", "status", { uses: 1, status: "sleep", questions: 2 })],
  493: [E(90, "bespoke", "opponent", "frac_hp_random", { minPct: 0.01, maxPct: 0.05 })],
  642: [E(0, "post_answer", "opponent", "status", { status: "paralysis", questions: 3 })],
  643: [E(0, "post_answer", "opponent", "status", { chance: 0.4, status: "burn", questions: 3 })],
  644: [E(0, "post_answer", "opponent", "status", { status: "paralysis", questions: 3 })],
  645: [E(0, "post_answer", "opponent", "status", { status: "burn", questions: 3 })],
  648: [E(1, "manual", "opponent", "status", { uses: 2, chance: 0.3, status: "sleep", questions: 1 })],
  717: [E(0, "post_answer", "opponent", "drain", { amount: 2 })],
  718: [E(0, "manual", "opponent", "suppress_ability", { uses: 1, questions: 3 })],
  721: [E(0, "post_answer", "opponent", "status", { status: "burn", questions: 3 })],
  785: [E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 })],
  786: [E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 })],
  787: [
    E(0, "post_answer", "self", "heal", { amount: 4 }),
    E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 }),
  ],
  788: [
    E(0, "post_answer", "self", "cure", { status: "any" }),
    E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 }),
  ],
  789: [E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 })],
  807: [
    E(0, "post_answer", "self", "stat_stage", { stat: "speed", delta: 1 }),
    E(1, "post_answer", "self", "stat_stage", { stat: "crit", delta: 1 }),
  ],
  808: [E(0, "post_answer", "self", "stat_stage", { stat: "attack", delta: 1 })],
  809: [E(0, "post_answer", "opponent", "status", { chance: 0.3, status: "sleep", questions: 1 })],
  891: [E(0, "post_answer", "self", "stat_stage", { stat: "crit", delta: 1 })],
  892: [E(90, "m4_fx", "opponent", "instant_ko", { chance: 0.3 })],
  // The legacy post_answer heal-8-and-cure is GONE (it was firing on top of the
  // engine's big heal); the big heal itself is now 60% of the bar, not 100%.
  893: [
    E(90, "bespoke", "self", "heal", { amount: 72 }),
    E(91, "bespoke", "self", "cure", { status: "any" }),
  ],
  894: [
    E(0, "manual", "opponent", "suppress_ability", { uses: 1, questions: 3 }),
    E(1, "manual", "opponent", "status", { status: "paralysis", questions: 3 }),
    E(90, "bespoke", "opponent", "frac_hp_random", { minPct: 0.01, maxPct: 0.15 }),
  ],
  896: [E(0, "post_answer", "opponent", "stat_stage", { stat: "speed", delta: -1 })],
  897: [E(0, "post_answer", "opponent", "drain", { amount: 2 })],
  898: [
    E(0, "post_answer", "opponent", "stat_stage", { stat: "speed", delta: -2 }),
    E(1, "post_answer", "self", "heal", { amount: 3 }),
  ],
  1001: [E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 })],
  1002: [
    E(0, "manual", "opponent", "stat_stage", { stat: "defense", uses: 1, delta: -2 }),
    E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 }),
  ],
  1003: [
    E(0, "manual", "self", "stat_stage", { stat: "defense", uses: 1, delta: 2 }),
    E(1, "manual", "opponent", "stat_stage", { stat: "crit", uses: 1, delta: -1 }),
    E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 }),
  ],
  1004: [E(90, "m4_fx", "opponent", "frac_hp_current", { pct: 0.5 })],
  1008: [E(0, "post_answer", "self", "stat_stage", { stat: "speed", delta: 1 })],
  1015: [E(0, "post_answer", "opponent", "status", { status: "poisoned", questions: 3 })],
  1016: [E(90, "m4_fx", "opponent", "instant_ko", { chance: 0.1 })],
  1021: [
    E(0, "post_answer", "self", "stat_stage", { stat: "attack", delta: 1 }),
    E(1, "post_answer", "opponent", "stat_stage", { stat: "attack", delta: -1 }),
  ],
  1024: [
    E(0, "manual", "self", "stat_stage", { stat: "attack", uses: 1, delta: 2 }),
    E(1, "manual", "self", "stat_stage", { stat: "defense", uses: 1, delta: 1 }),
    E(2, "manual", "self", "stat_stage", { stat: "speed", uses: 1, delta: 2 }),
    E(90, "m4_fx", "opponent", "instant_ko", { chance: 0.15 }),
  ],
  1025: [
    E(0, "manual", "opponent", "suppress_ability", { uses: 1, questions: 3 }),
    E(1, "manual", "opponent", "status", { status: "badly-poisoned", questions: 3 }),
  ],
  10194: [E(0, "post_answer", "opponent", "drain", { amount: 3 })],
};
