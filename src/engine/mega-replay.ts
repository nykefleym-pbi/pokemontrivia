// Pure, isomorphic replay of a Mega Raid run's HP trajectory (server-first-
// refactor's Phase 2 — see /root/.claude/plans/prancy-spinning-sedgewick.md).
//
// `applyMegaAnswer` is a mechanical, behavior-preserving port of
// MegaRaidScreen.tsx's `answer`/`advance` HP math (boss/player HP deltas, the
// win/loss/ran-out-of-questions branches). It is verified byte-for-byte
// against the REAL, unmodified MegaRaidScreen component — see
// src/components/mega/MegaRaidScreen.engine-verification.test.tsx — not read
// through and guessed (see CLAUDE.md's signature-ability liveness precedent:
// same class of risk, a different battle system). Any future change here
// MUST be re-verified the same way.
//
// Much smaller than engine/turn.ts's solo-battle port: Mega Raid has no
// abilities, no statuses, and no per-answer speed bonus — just a flat
// +10 boss dmg / -8 player dmg per question, doubled boss dmg while X Attack
// is armed.
//
// Like engine/turn.ts's `AnswerInput.correct`, whether the submitted choice
// was actually correct is NOT this module's job to determine — the engine has
// no access to the question bank or (for Mega Raid) the server-held answer
// key. The caller (the Edge Function replacing `submit_mega_run`'s trust in
// client-supplied numbers) resolves each logged answer into `correct` by
// comparing the client's submitted choice index against the held key, then
// calls in here.
//
// DELIBERATELY NOT PORTED (documented gaps, not silent omissions):
//   - Scope / X-Accuracy: reveal-a-wrong-option / reveal-the-answer hints.
//     Like turn.ts's scope/zoomlens/xaccuracy/repel note, these can influence
//     which choice a player submits but never the resulting math — the server
//     checks the submitted choice against the answer key regardless of any
//     hint, so there's nothing for this module to model.
//   - Escape Rope: a free exit that ends the run WITHOUT ever calling
//     `submit_mega_run` at all (see MegaRaidScreen.tsx's `escape()`) — there is
//     no server call to replay, so no engine action exists for it either.
//   - elapsedMs / time_ms: Mega Raid's damage math has no speed-bonus term
//     (unlike solo battles), so per-answer timing doesn't affect this
//     module's output at all. The caller derives `time_ms` itself from
//     wall-clock deltas around the whole run, same as `finish()` does today.
/** Mirrors lib/mega/schedule.ts's `MEGA_BOSS_HP` constant. Duplicated by hand
 *  rather than imported: `engine/**` cannot import from `lib/**` at all —
 *  lib/mega/schedule.ts itself imports the Supabase client and uses React
 *  hooks, so even a type-only-looking import would pull a non-isomorphic
 *  module into the engine/content bundle (confirmed by the mega-run Edge
 *  Function's esbuild step failing to resolve `@supabase/supabase-js` until
 *  this was hand-duplicated instead). Same reason engine/turn.ts
 *  hand-duplicates MAX_ITEMS_PER_BATTLE. Keep this in sync if either changes. */
export const MEGA_BOSS_HP = 400;
/** Mirrors MegaRaidScreen.tsx's local `PLAYER_MAX_HP` constant. */
export const MEGA_PLAYER_MAX_HP = 100;
/** Mirrors MegaRaidScreen.tsx's local `BOSS_DMG` constant (per correct answer;
 *  doubled while X Attack is armed). Hand-duplicated for the same reason as
 *  MEGA_BOSS_HP above. */
const BOSS_DMG = 10;
/** Mirrors MegaRaidScreen.tsx's local `PLAYER_DMG` constant (per wrong/timed-
 *  out answer). */
const PLAYER_DMG = 8;

export type MegaRaidPhase = "in_progress" | "won" | "lost";

export interface MegaRaidState {
  bossHp: number;
  playerHp: number;
  correctCount: number;
  /** Count of questions answered (or timed out) so far, used only to detect
   *  the "ran out of questions" branch — mirrors `advance()`'s `qIndex + 1`. */
  questionsAnswered: number;
  /** Set by `applyMegaXAttack`; consumed (and reset) by the next answer,
   *  correct or wrong — mirrors the client's `xAtkArmed` state, which resets
   *  every answer regardless of outcome. */
  xAttackArmed: boolean;
  phase: MegaRaidPhase;
}

export function initialMegaRaidState(): MegaRaidState {
  return {
    bossHp: MEGA_BOSS_HP,
    playerHp: MEGA_PLAYER_MAX_HP,
    correctCount: 0,
    questionsAnswered: 0,
    xAttackArmed: false,
    phase: "in_progress",
  };
}

export interface MegaAnswerInput {
  /** Resolved by the caller by comparing the submitted choice against the
   *  server-held answer key (or `false` for a timed-out/no-pick answer,
   *  matching `answer(null)`'s `isCorrect` always being false). */
  correct: boolean;
}

/**
 * Pure port of MegaRaidScreen.tsx's `answer`/`advance` HP math. One call is
 * one submitted (or timed-out) answer. `totalQuestions` is the event's fixed
 * question-set size — needed to reproduce `advance()`'s "ran out of
 * questions" branch, which only counts as a win if the boss's full 400 HP
 * was ALSO depleted by exactly the final correct answer
 * (`correctCount >= MEGA_BOSS_HP / BOSS_DMG`), not merely finishing the set.
 * Check order matches `advance()` exactly: boss-depleted, then
 * player-depleted, then ran-out-of-questions.
 */
export function applyMegaAnswer(
  state: MegaRaidState,
  totalQuestions: number,
  input: MegaAnswerInput,
): MegaRaidState {
  if (state.phase !== "in_progress") return state;

  let bossHp = state.bossHp;
  let playerHp = state.playerHp;
  let correctCount = state.correctCount;

  if (input.correct) {
    correctCount += 1;
    bossHp = Math.max(0, state.bossHp - BOSS_DMG * (state.xAttackArmed ? 2 : 1));
  } else {
    playerHp = Math.max(0, state.playerHp - PLAYER_DMG);
  }

  const questionsAnswered = state.questionsAnswered + 1;
  const next: MegaRaidState = {
    ...state,
    bossHp,
    playerHp,
    correctCount,
    questionsAnswered,
    xAttackArmed: false,
  };

  if (bossHp <= 0) return { ...next, phase: "won" };
  if (playerHp <= 0) return { ...next, phase: "lost" };
  if (questionsAnswered >= totalQuestions) {
    return { ...next, phase: correctCount >= MEGA_BOSS_HP / BOSS_DMG ? "won" : "lost" };
  }
  return next;
}

export type MegaHealItemId = "potion" | "superpotion" | "maxpotion";

const HEAL: Record<MegaHealItemId, number> = {
  potion: 30,
  superpotion: 60,
  maxpotion: MEGA_PLAYER_MAX_HP,
};

/** Pure port of `applyPotion` — a no-op (mirrors the "HP already full" early
 *  return) if HP is already at max. Stackable: no once-per-run limit. */
export function applyMegaPotion(state: MegaRaidState, itemId: MegaHealItemId): MegaRaidState {
  if (state.phase !== "in_progress") return state;
  if (state.playerHp >= MEGA_PLAYER_MAX_HP) return state;
  return { ...state, playerHp: Math.min(MEGA_PLAYER_MAX_HP, state.playerHp + HEAL[itemId]) };
}

/** Pure port of `applyBattleItem("xattack")` — arms double boss damage for
 *  the next answer. Once-per-run enforcement (`usedOnce`) is the caller's
 *  concern (an inventory/consumption fact, same tier as solo battle's
 *  itemsUsedThisBattleCount cap living in solo-battle-config.ts, not turn.ts). */
export function applyMegaXAttack(state: MegaRaidState): MegaRaidState {
  if (state.phase !== "in_progress") return state;
  return { ...state, xAttackArmed: true };
}

/** Pure port of leaving via the confirm-leave dialog — ends the run as a
 *  loss immediately with whatever `correctCount` has accrued so far (an
 *  attempt IS consumed, unlike Escape Rope; see the module doc). Mirrors
 *  engine/turn.ts's `applyForfeit`. */
export function applyMegaForfeit(state: MegaRaidState): MegaRaidState {
  if (state.phase !== "in_progress") return state;
  return { ...state, phase: "lost" };
}
