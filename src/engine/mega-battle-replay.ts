// Reproducible replay of a Mega Raid run's whole action log (server-first-
// refactor's Phase 2 — see /root/.claude/plans/prancy-spinning-sedgewick.md).
// Mirrors engine/solo-battle-replay.ts's role for solo battles: turns an
// append-only log of client-submitted actions into the current
// engine/mega-replay.ts state, so the mega-run Edge Function never has to
// trust a client-reported final tally.
//
// KEY DIFFERENCE FROM solo-battle-replay.ts: solo battle's `cfg` embeds the
// full question set (with correct answers) up front, so replaying is a pure,
// synchronous, in-memory operation every time. Mega Raid's answer key lives
// server-side ONLY (`mega_event_questions`, SELECT revoked from every role —
// see that table's migration) and is revealed one question at a time via the
// `reveal_mega_answer` RPC. To keep replay itself pure and RPC-free, the
// mega-run Edge Function resolves each `answer` action's correctness EXACTLY
// ONCE, the first time it's submitted, and persists that resolution
// (`correct: boolean`) directly on the stored log entry — so replaying an
// already-persisted log is just as pure/sync as solo battle's, and a given
// question is only ever looked up once regardless of how many times the run
// gets replayed afterward.
import {
  applyMegaAnswer,
  applyMegaPotion,
  applyMegaXAttack,
  applyMegaForfeit,
  initialMegaRaidState,
  type MegaRaidState,
} from "./mega-replay";

export type MegaHealItemId = "potion" | "superpotion" | "maxpotion";

/** A client-submitted action, as received over the wire — no correctness
 *  resolution yet. `choiceIdx` is in the question's ORIGINAL option order
 *  (the client already holds the shuffle permutation it applied for display,
 *  see MegaRaidScreen.tsx's `toDisplayIdx`, and converts back before
 *  submitting) so the server never needs to know a client's per-question
 *  shuffle to check it against the held answer key. `choiceIdx: null` is a
 *  timed-out/no-pick answer — mirrors `answer(null)`, always incorrect. */
export type MegaRaidAction =
  | { type: "answer"; questionIdx: number; choiceIdx: number | null }
  | { type: "use_potion"; itemId: MegaHealItemId }
  | { type: "use_xattack" }
  | { type: "forfeit" };

/** The persisted form of a `MegaRaidAction` — identical except `answer`
 *  actions carry the server-resolved `correct` flag, computed once at submit
 *  time (see the module doc) and baked into the log from then on. */
export type StoredMegaRaidAction =
  | { type: "answer"; questionIdx: number; choiceIdx: number | null; correct: boolean }
  | { type: "use_potion"; itemId: MegaHealItemId }
  | { type: "use_xattack" }
  | { type: "forfeit" };

export function isValidMegaRaidAction(action: unknown): action is MegaRaidAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type === "forfeit" || a.type === "use_xattack") return true;
  if (a.type === "use_potion") {
    return a.itemId === "potion" || a.itemId === "superpotion" || a.itemId === "maxpotion";
  }
  if (a.type === "answer") {
    return typeof a.questionIdx === "number" && (a.choiceIdx === null || typeof a.choiceIdx === "number");
  }
  return false;
}

export class MegaRaidActionError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "MegaRaidActionError";
  }
}

function applyOne(state: MegaRaidState, totalQuestions: number, action: StoredMegaRaidAction): MegaRaidState {
  switch (action.type) {
    case "answer":
      return applyMegaAnswer(state, totalQuestions, { correct: action.correct });
    case "use_potion":
      return applyMegaPotion(state, action.itemId);
    case "use_xattack":
      return applyMegaXAttack(state);
    case "forfeit":
      return applyMegaForfeit(state);
  }
}

/** Pure, synchronous replay of an already-resolved log from the run's start.
 *  Used both to reconstruct the current state before applying a new action,
 *  and (by the client, once wired in Phase 2's UI step) to display an
 *  in-progress run's state after a `get`. */
export function replayMegaLog(totalQuestions: number, log: StoredMegaRaidAction[]): MegaRaidState {
  let state = initialMegaRaidState();
  for (const action of log) {
    state = applyOne(state, totalQuestions, action);
  }
  return state;
}

/**
 * Replays `log` (every already-resolved action) to reconstruct the current
 * state, then applies `next` (a freshly resolved action) on top. Throws
 * `MegaRaidActionError` if the run already ended — mirrors
 * solo-battle-replay.ts's `applyNextAction` guard. The caller (the mega-run
 * Edge Function) is responsible for resolving `next`'s correctness (an
 * `answer` action) against the held answer key BEFORE calling in here; this
 * module has no DB/RPC access by design (isomorphic engine/content boundary).
 */
export function applyNextMegaAction(
  totalQuestions: number,
  log: StoredMegaRaidAction[],
  next: StoredMegaRaidAction,
): { state: MegaRaidState; log: StoredMegaRaidAction[] } {
  const state = replayMegaLog(totalQuestions, log);
  if (state.phase !== "in_progress") {
    throw new MegaRaidActionError("battle_ended", "this run has already ended");
  }
  return { state: applyOne(state, totalQuestions, next), log: [...log, next] };
}
