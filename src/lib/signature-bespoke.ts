import type { PvpStat, StatusKind } from "./game-data";

/**
 * Bespoke signature-ability evaluators — the "doesn't fit the generic
 * trigger/effect engine" bucket from the v2 roster (Phase 3, bucket 2).
 *
 * Each is a PURE function that, given the relevant battle snapshot, returns the
 * resulting stat/status/HP delta — exactly the same trust model as
 * `signature-abilities.ts`: the client computes the resulting effect, but any
 * persistent mutation is still routed through a server-validated path (a stage
 * bump / status apply / HP change the server clamps). No hidden magnitudes.
 *
 * These are unit-tested here and are ready to be called from the live loop; the
 * live-loop netcode wiring for each (which server RPC branch applies the
 * returned delta) is the remaining integration step, tracked in the impl report.
 * The genuinely hard ones (lethal-intercept revives, weather-conflict netcode,
 * cross-battle stack tracking, category-conditional passives, terrain synergy)
 * are intentionally NOT here — see the report.
 */

export type StageMap = Record<PvpStat, number>;

const ALL_STATS: readonly PvpStat[] = ["attack", "defense", "speed", "crit"];

/** Mirror of the shipped ±3 stage clamp (pvp-combat `clampStage`). */
export function clampStage(n: number): number {
  return Math.max(-3, Math.min(3, Math.round(n)));
}

// ── Manaphy — Heart Swap (490) ───────────────────────────────────────────────
// "Give the opponent your lowest (most negative) stage and take their highest
// (most positive)." You shed your worst debuff onto them and steal their best
// buff. Self-cancels in a mirror (handled by the caller: if both fire the same
// question, skip). Returns the post-swap stage maps for both sides.
export interface HeartSwapResult {
  self: StageMap;
  opp: StageMap;
  /** True when neither a give nor a take applied (nothing worth swapping). */
  noop: boolean;
}

function lowestStat(m: StageMap): { stat: PvpStat; val: number } {
  let best = ALL_STATS[0];
  for (const s of ALL_STATS) if (m[s] < m[best]) best = s;
  return { stat: best, val: m[best] };
}
function highestStat(m: StageMap): { stat: PvpStat; val: number } {
  let best = ALL_STATS[0];
  for (const s of ALL_STATS) if (m[s] > m[best]) best = s;
  return { stat: best, val: m[best] };
}

export function resolveHeartSwap(self: StageMap, opp: StageMap): HeartSwapResult {
  const outSelf: StageMap = { ...self };
  const outOpp: StageMap = { ...opp };
  const low = lowestStat(self); // your most-negative stage
  const high = highestStat(opp); // their most-positive stage
  let applied = false;

  // Take their highest positive stage onto yourself (removed from them).
  if (high.val > 0) {
    outSelf[high.stat] = clampStage(outSelf[high.stat] + high.val);
    outOpp[high.stat] = clampStage(outOpp[high.stat] - high.val);
    applied = true;
  }
  // Give them your lowest negative stage (shed from you).
  if (low.val < 0) {
    outOpp[low.stat] = clampStage(outOpp[low.stat] + low.val);
    outSelf[low.stat] = clampStage(outSelf[low.stat] - low.val);
    applied = true;
  }
  return { self: outSelf, opp: outOpp, noop: !applied };
}

// ── Cresselia — Lunar Dance (488) ────────────────────────────────────────────
// "Spend 15% of current HP: cure all your statuses and set any NEGATIVE Attack/
// Defense/Speed stages back to 0 (shed all debuffs the opponent stacked)." A
// full self-cleanse via sacrifice. Returns the resulting stages, cured flag and
// HP cost. (Crit is left as-is — only the three combat stats reset per the doc.)
export interface LunarDanceResult {
  self: StageMap;
  hpCost: number;
  changed: boolean;
}

export function resolveLunarDance(self: StageMap, currentHp: number): LunarDanceResult {
  const out: StageMap = { ...self };
  let changed = false;
  for (const s of ["attack", "defense", "speed"] as PvpStat[]) {
    if (out[s] < 0) {
      out[s] = 0;
      changed = true;
    }
  }
  const hpCost = Math.round(Math.max(0, currentHp) * 0.15);
  return { self: out, hpCost, changed };
}

// ── Regigigas — Slow Start (486) ─────────────────────────────────────────────
// "For the first 5 questions all your stat stages are locked at 0; from question
// 6 on you gain a standing +2 Attack / +1 Speed." `questionIndex` is 0-based.
export function slowStartActive(questionIndex: number): boolean {
  return questionIndex < 5;
}
/** The standing buff to apply the first time Slow Start lifts (at q6). */
export const SLOW_START_LATE_BUFF: ReadonlyArray<{ stat: PvpStat; delta: number }> = [
  { stat: "attack", delta: 2 },
  { stat: "speed", delta: 1 },
];

// ── Necrozma — Photon Geyser (800) ───────────────────────────────────────────
// "Each question, auto-pick your stronger of Attack / Speed and give it +1 for
// that question (convert surplus into your weaker axis)." Ties favour Attack.
export function photonGeyserStat(self: StageMap): PvpStat {
  return self.speed > self.attack ? "speed" : "attack";
}

// ── Mew — Transform (151) ────────────────────────────────────────────────────
// "At battle start, copy the opponent's equipped signature ability; cannot copy
// a mascot (rating-5) ability — if it would, roll a random rating-3 instead."
// Pure selection helper: given the opponent's ability rarity and a pool of
// rating-3 ids (+ an rng), decide which dex id Mew runs this battle.
export function resolveTransformCopy(
  opponentAbilityId: number | null,
  opponentAbilityRarity: number | null,
  ratingThreeIds: readonly number[],
  rng: () => number = Math.random,
): number | null {
  if (opponentAbilityId != null && (opponentAbilityRarity ?? 0) < 5) {
    return opponentAbilityId; // copy it outright
  }
  if (ratingThreeIds.length === 0) return null;
  return ratingThreeIds[Math.floor(rng() * ratingThreeIds.length)];
}

/** Statuses Lunar Dance / a full cleanse removes (all of them). */
export const CLEANSABLE_STATUSES: readonly StatusKind[] = [
  "confused",
  "poisoned",
  "badly-poisoned",
  "burn",
  "paralysis",
  "sleep",
  "freeze",
];
