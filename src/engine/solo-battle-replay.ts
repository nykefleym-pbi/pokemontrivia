// The server-authoritative replay driver for a solo battle: given the
// frozen `cfg` a battle was started with (SoloBattleCfg) and the append-only
// action log (solo_battles.log), deterministically derives the current
// BattleState from scratch every time — matching the p3_solo_battles
// migration's own documented design ("seed + log are the reproducibility
// pair"). No mutable state is ever persisted directly; replaying the same
// cfg+log+seed always yields the same result, so the server never has to
// trust a client-reported HP/score.
import { createRng } from "./rng";
import { resolveBattleSetup, type SoloBattleCfg } from "./solo-battle-config";
import {
  applyAnswer,
  applyForfeit,
  applyRoundStart,
  applyUseItem,
  initialBattleState,
  type BattleAction,
  type BattleEvent,
  type BattleState,
} from "./turn";

export interface ReplayResult {
  state: BattleState;
  /** Events from just the LAST action in `log` — what a submit_action caller
   *  actually wants to show the player (damage dealt, status applied, ...). */
  lastEvents: BattleEvent[];
}

function applyOneAction(
  state: BattleState,
  cfg: SoloBattleCfg,
  config: ReturnType<typeof resolveBattleSetup>["config"],
  masterRng: ReturnType<typeof createRng>,
  action: BattleAction,
): { state: BattleState; events: BattleEvent[] } {
  if (action.type === "forfeit") return applyForfeit(state);
  if (action.type === "use_item") return applyUseItem(state, config, action.itemId);

  const roundStart = applyRoundStart(state, config, action.questionIdx);
  if (roundStart.state.phase !== "in_progress") return roundStart;

  const question = cfg.questions[action.questionIdx];
  const correct = !!question && action.choiceIdx === question.correct;
  const questionRng = masterRng.fork(String(action.questionIdx));
  const answer = applyAnswer(
    roundStart.state,
    config,
    { correct, questionIdx: action.questionIdx, elapsedMs: action.elapsedMs },
    questionRng,
  );
  return { state: answer.state, events: [...roundStart.events, ...answer.events] };
}

/** Replays the whole `log` from the battle's start and returns the resulting
 *  state, plus the events the final logged action produced. */
export function replayBattle(cfg: SoloBattleCfg, log: BattleAction[], seed: string): ReplayResult {
  const { config, startingEnemyHp, startingItemsUsedCount } = resolveBattleSetup(cfg);
  let state = initialBattleState(config.playerMaxHp, startingEnemyHp, startingItemsUsedCount);
  const masterRng = createRng(seed);
  let lastEvents: BattleEvent[] = [];

  for (const action of log) {
    if (state.phase !== "in_progress") break;
    const result = applyOneAction(state, cfg, config, masterRng, action);
    state = result.state;
    lastEvents = result.events;
  }

  return { state, lastEvents };
}

/**
 * Validates and applies one new action on top of the battle's existing log,
 * returning the resulting state/events — what battle-solo's `submit_action`
 * op needs. Does NOT persist anything; the caller appends `action` to `log`
 * and writes the returned state's derived status/result once it's satisfied
 * the result is valid.
 *
 * Rejects (throws `SoloBattleActionError`):
 *   - the battle already ended (replay of the existing log is not
 *     "in_progress"),
 *   - a `submit_answer` whose `questionIdx` isn't exactly the next unanswered
 *     question (no skipping ahead, no re-answering), or
 *   - a `submit_answer` whose `questionIdx` is outside `cfg.questions` (the
 *     server only ever offers as many questions as it started the battle
 *     with — unlike the client, which can run out of questions mid-set and
 *     decide the outcome by remaining HP, see loadQuestion's `!data` branch;
 *     that fallback isn't replicated here, so callers must always start a
 *     battle with enough questions to reach a natural win/loss).
 */
export class SoloBattleActionError extends Error {
  constructor(
    public code: "battle_already_ended" | "unexpected_question_idx" | "question_idx_out_of_range",
    message: string,
  ) {
    super(message);
  }
}

export function applyNextAction(
  cfg: SoloBattleCfg,
  existingLog: BattleAction[],
  seed: string,
  action: BattleAction,
): ReplayResult {
  const before = replayBattle(cfg, existingLog, seed);
  if (before.state.phase !== "in_progress") {
    throw new SoloBattleActionError("battle_already_ended", "this battle has already ended");
  }
  if (action.type === "submit_answer") {
    const expectedIdx = existingLog.filter((a) => a.type === "submit_answer").length;
    if (action.questionIdx !== expectedIdx) {
      throw new SoloBattleActionError(
        "unexpected_question_idx",
        `expected an answer for question ${expectedIdx}, got ${action.questionIdx}`,
      );
    }
    if (action.questionIdx < 0 || action.questionIdx >= cfg.questions.length) {
      throw new SoloBattleActionError(
        "question_idx_out_of_range",
        `question ${action.questionIdx} is outside this battle's ${cfg.questions.length}-question set`,
      );
    }
  }
  return replayBattle(cfg, [...existingLog, action], seed);
}
