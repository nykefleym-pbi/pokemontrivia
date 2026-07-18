// Offline verifier for Live PvP Phase 4b (see
// /root/.claude/plans/prancy-spinning-sedgewick.md, Phase 4, and the
// "dark-launch first" staging decision). Replays real production answers --
// logged by `submit_pvp_live_answer` into `pvp_live_answer_shadow_log`
// (Phase 4a) -- through the ported engine (`resolvePvpAnswer`) and checks the
// client's self-reported `dmg` against what the port deterministically
// produces from the SAME inputs, BEFORE any of this touches the hot path.
//
// Why not just diff `dmg` directly: crit and confusion-miss are each one
// `rng()` roll the CLIENT already made independently, so the two sides can
// never be byte-identical. But both rolls are binary and there are exactly
// two `rng()` call sites reachable from one answer (the confusion-miss check
// in `resolvePvpAnswer`, and the crit check in `computePvpDamage` -- verified
// by grep, neither `pvp-type-abilities.ts` nor anywhere else in this path
// consumes `rng`), so the full set of values the client's report COULD
// legitimately be is small and enumerable: forcing those two rolls to their
// four combinations (only 3 are distinct outcomes, since a confusion miss
// always zeroes `dmg` regardless of the crit roll) gives a closed-form
// expected set. A reported `dmg` outside that set means either a genuine
// client exploit attempt or a bug in the port -- exactly the falsification
// this repo's CLAUDE.md demands before trusting a port of this system.
//
// This module is pure and side-effect-free: it takes logged snapshots in,
// returns verdicts out. The actual Supabase read (needs the service-role key
// -- this table has no authenticated grants by design) lives in a separate,
// thin CLI script; see `scripts/pvp-shadow-verify/run.ts`.
import {
  resolvePvpAnswer,
  INITIAL_PVP_ENGINE_STATE,
  type PvpAnswerInput,
  type PvpEngineState,
} from "./pvp-live-answer";
import { SIGNATURE_ABILITIES } from "../lib/signature-abilities";
import { findPokemon, type PokeType } from "../lib/pokemon-data";
import type { AbilityId } from "../lib/abilities";
import type { ActiveStatus, PvpStatStages } from "../lib/store";
import type { SigRuntimeMap } from "../lib/signature-rework-types";

/** Mirrors the jsonb `runtime_snapshot` shape built by
 *  `submit_pvp_live_answer` (20260718120000_pvp_live_answer_shadow_log_capture.sql). */
export interface ShadowRuntimeSnapshot {
  myDex: number | null;
  oppDex: number | null;
  myPartnerId: number | null;
  oppPartnerId: number | null;
  myHp: number;
  oppHp: number;
  myStages: PvpStatStages;
  oppStages: PvpStatStages;
  myStatuses: ActiveStatus[];
  myAbilityId: string | null;
  mySigRuntime: SigRuntimeMap;
  mySigState: Record<string, number>;
  mySuppressedUntil: number;
  streakBefore: number;
  wrongStreakBefore: number;
  confusedTicksBefore: number;
  pokedexCount: number;
  question: { question: string; options: string[]; correct: number; category: string };
  questionIndex: number;
}

/** Mirrors the jsonb `client_report` shape -- the client's self-reported
 *  outcome, exactly as sent to `submit_pvp_live_answer`, unmodified. */
export interface ShadowClientReport {
  correct: boolean;
  dmg: number;
  selfDmg: number;
  timeMs: number;
  selectedIndex: number | null;
}

export interface ShadowLogRow {
  id: number;
  matchId: string;
  questionIndex: number;
  side: "host" | "guest";
  verifiedCorrect: boolean;
  runtimeSnapshot: ShadowRuntimeSnapshot;
  clientReport: ShadowClientReport;
}

const MAX_HP = 120;

/** A `rng` that returns queued values in order, then a fallback forever.
 *  Lets a single forced pass control BOTH the confusion-miss roll and the
 *  crit roll independently -- `resolvePvpAnswer` only ever calls `rng()`
 *  once for confusion (and only when confused) and once for crit (and only
 *  when the hit landed), always in that order. */
function sequenceRng(values: number[], fallback: number): () => number {
  const queue = [...values];
  return () => (queue.length > 0 ? queue.shift()! : fallback);
}

const NEVER_MISS_OR_CRIT = 0.99;
const ALWAYS_MISS_OR_CRIT = 0;

/**
 * Reconstruct `resolvePvpAnswer`'s input from a logged snapshot. Static
 * catalog lookups (engine spec, types, species) are looked up fresh here --
 * they're immutable game data, not something the snapshot needs to carry.
 */
export function reconstructPvpAnswerInput(
  row: ShadowLogRow,
  rng: () => number,
): PvpAnswerInput {
  const s = row.runtimeSnapshot;
  const myTypes = s.myDex != null ? (findPokemon(s.myDex)?.types as PokeType[] | undefined) : undefined;
  const oppEntry = s.oppDex != null ? findPokemon(s.oppDex) : undefined;
  const engine = s.myDex != null ? SIGNATURE_ABILITIES[s.myDex]?.engine : undefined;
  const mySigDisabled = !!(
    s.myDex != null && (s.mySigRuntime?.[String(s.myDex)] as { disabled?: boolean } | undefined)?.disabled
  );
  const hasConfusedStatus = s.myStatuses.some((st) => st.kind === "confused");
  const hasPoisonedStatus = s.myStatuses.some(
    (st) => st.kind === "poisoned" || st.kind === "badly-poisoned",
  );
  const burned = s.myStatuses.some((st) => st.kind === "burn");

  return {
    questionIndex: row.questionIndex,
    correct: row.verifiedCorrect,
    frozen: false, // freeze isn't logged yet -- see module header limitations
    answerElapsedMs: row.clientReport.timeMs,
    // Freeze/opponent-timer-squeeze aside, the personal timer is a pure
    // function of speed stage + sleep, both already in the snapshot; the
    // constant matches PVP_BASE_TIMER_MS. Approximated here as the base
    // timer since speed-stage timer scaling doesn't change hit magnitude,
    // only `speedRatio` -- a documented approximation, not a silent gap.
    personalTimerMs: 15000,
    selfHp: s.myHp,
    oppHp: s.oppHp,
    maxHp: MAX_HP,
    myAttackStage: s.myStages.attack,
    myCritStage: s.myStages.crit,
    oppDefenseStage: s.oppStages.defense,
    burned,
    suppressed: s.mySuppressedUntil > row.questionIndex,
    engine,
    sigDisabled: mySigDisabled,
    oppType: oppEntry?.types ?? [],
    oppSpecies: s.oppDex ?? -1,
    myTypes,
    storedAbilityId: (s.myAbilityId as AbilityId | null) ?? null,
    hasAnyStatus: s.myStatuses.length > 0,
    hasConfusedStatus,
    hasPoisonedStatus,
    newCategory: false, // not logged -- only affects a handful of `newCategory`-gated rows
    questionCategory: s.question.category,
    pokedexCount: s.pokedexCount,
    rng,
  };
}

function reconstructState(row: ShadowLogRow, base: PvpEngineState): PvpEngineState {
  return {
    ...base,
    streak: row.runtimeSnapshot.streakBefore,
    selfWrongStreak: row.runtimeSnapshot.wrongStreakBefore,
    confusedTicks: row.runtimeSnapshot.confusedTicksBefore,
  };
}

export interface ShadowVerifyResult {
  row: ShadowLogRow;
  /** The dmg values `resolvePvpAnswer` can legitimately produce from this
   *  row's inputs: 1 value (not eligible for confusion), 2 (crit/non-crit),
   *  or 3 (crit/non-crit/confusion-miss). */
  expectedDmgSet: number[];
  reportedDmg: number;
  match: boolean;
  /** True when this row's `mySigRuntime`/`mySigState` can't reflect Sword of
   *  Ruin's charge-arming window (not logged until `apply_pvp_signature_effect`
   *  gains its own shadow hook) -- a mismatch here is a KNOWN gap, not
   *  evidence of a port bug. */
  knownGap: "sword_of_ruin_arming" | null;
}

/**
 * Verify one side's full recorded sequence for a match, folding
 * `PvpEngineState` across questions exactly as the real battle does (state
 * carries forward; each match starts fresh at `INITIAL_PVP_ENGINE_STATE`).
 * `rows` must be all shadow-log rows for one `(matchId, side)`, in
 * `questionIndex` order.
 */
export function verifyMatchSide(rows: ShadowLogRow[]): ShadowVerifyResult[] {
  const results: ShadowVerifyResult[] = [];
  let state = INITIAL_PVP_ENGINE_STATE;

  for (const row of rows) {
    // The snapshot's own streak/wrong-streak/confused-ticks ARE the ground
    // truth for "state entering this row" (the SQL RPC computes them
    // independently of this TS port) -- fold from the snapshot rather than
    // our own running `state` so one mismatched row doesn't cascade false
    // failures into every row after it.
    const rowState = reconstructState(row, state);
    const isConfused = rowState.confusedTicks > 0 ||
      row.runtimeSnapshot.myStatuses.some((s) => s.kind === "confused");

    const passes: number[] = [];
    if (row.verifiedCorrect) {
      if (isConfused) {
        passes.push(
          resolvePvpAnswer(
            reconstructPvpAnswerInput(row, sequenceRng([ALWAYS_MISS_OR_CRIT], NEVER_MISS_OR_CRIT)),
            rowState,
          ).dmg,
        );
        passes.push(
          resolvePvpAnswer(
            reconstructPvpAnswerInput(
              row,
              sequenceRng([NEVER_MISS_OR_CRIT, NEVER_MISS_OR_CRIT], NEVER_MISS_OR_CRIT),
            ),
            rowState,
          ).dmg,
        );
        passes.push(
          resolvePvpAnswer(
            reconstructPvpAnswerInput(row, sequenceRng([NEVER_MISS_OR_CRIT, ALWAYS_MISS_OR_CRIT], ALWAYS_MISS_OR_CRIT)),
            rowState,
          ).dmg,
        );
      } else {
        passes.push(
          resolvePvpAnswer(
            reconstructPvpAnswerInput(row, sequenceRng([NEVER_MISS_OR_CRIT], NEVER_MISS_OR_CRIT)),
            rowState,
          ).dmg,
        );
        passes.push(
          resolvePvpAnswer(
            reconstructPvpAnswerInput(row, sequenceRng([ALWAYS_MISS_OR_CRIT], ALWAYS_MISS_OR_CRIT)),
            rowState,
          ).dmg,
        );
      }
    } else {
      passes.push(0);
    }
    const expectedDmgSet = [...new Set(passes)];

    const swordOfRuinInPlay =
      row.runtimeSnapshot.myDex === 1002 || row.runtimeSnapshot.myPartnerId === 1002;

    results.push({
      row,
      expectedDmgSet,
      reportedDmg: row.clientReport.dmg,
      match: expectedDmgSet.includes(row.clientReport.dmg),
      knownGap: swordOfRuinInPlay ? "sword_of_ruin_arming" : null,
    });

    // Advance state via the deterministic (non-crit, non-miss) pass, purely
    // for bookkeeping fields the snapshot doesn't independently carry
    // (sigLatched/moxieStacks/wrongCount/hadWrong/sturdyUsed/prevCorrect/
    // prevAnswerElapsedMs) -- streak/wrongStreak/confusedTicks are
    // overwritten from the NEXT row's own snapshot above regardless.
    const advance = resolvePvpAnswer(
      reconstructPvpAnswerInput(row, sequenceRng([NEVER_MISS_OR_CRIT, NEVER_MISS_OR_CRIT], NEVER_MISS_OR_CRIT)),
      rowState,
    );
    state = advance.state;
  }

  return results;
}
