/**
 * M3 — per-question bespoke effects for the signature engine.
 *
 * The engine tick (`pvp_sig_engine_tick`) owns the stat lifecycle, and the four
 * HP-mutating bespoke kinds live server-side behind the `bespoke` phase of
 * `apply_pvp_signature_effect`. What NEITHER of them owns is *scheduling*: which
 * question a delayed strike lands on, how long a damage-over-time window stays
 * open, which question's choices get culled. That is this module.
 *
 * It is deliberately pure — no network, no React. It takes the state it was
 * handed and returns the next state plus a flag saying "call the bespoke RPC
 * now". The caller (live-pvp-battle-screen) does the I/O. That keeps every
 * scheduling rule unit-testable without a live match, which matters because
 * these rows are the ones a player notices when they misfire.
 *
 * Magnitudes are NOT decided here. The client only ever names the phase; the
 * server reads the amount out of `pvp_signature_effects` (same trust model as
 * every other effect). A tampered client can change WHEN, never HOW MUCH.
 */
import type { BespokeEffectRef } from "./signature-abilities";

/** Jirachi's Doom Desire lands this many questions after it is armed. */
export const DOOM_DESIRE_DELAY_Q = 2;

/** Per-battle scheduling state for the bespoke rows. All question numbers are
 * 1-indexed (q1..q20), matching the engine's `phaseIdx`. */
export interface BespokeFxState {
  /** Jirachi #385: question at which the armed strike resolves. */
  pendingStrikeAtQ: number | null;
  /** Heatran #485: last question of the open damage-over-time window (inclusive). */
  dotThroughQ: number | null;
  /** Regieleki #894 (M4): last question of the open random-chip window (inclusive).
   *  Separate from `dotThroughQ` because Arceus #493 uses the SAME `frac_hp_random`
   *  fx with no window at all — the presence of `questions` is what distinguishes
   *  a 5-question cage from a fire-every-question chip. */
  chipThroughQ: number | null;
  /** Azelf #482: question whose choices should be culled, and by how many. */
  eliminateOnQ: number | null;
  eliminateCount: number;
  /** Uxie #480: the status the server rolled + revealed, and whether it has landed. */
  predictedStatus: string | null;
  predictionLanded: boolean;
}

export const EMPTY_BESPOKE_FX_STATE: BespokeFxState = {
  pendingStrikeAtQ: null,
  dotThroughQ: null,
  chipThroughQ: null,
  eliminateOnQ: null,
  eliminateCount: 0,
  predictedStatus: null,
  predictionLanded: false,
};

export interface BespokeFxContext {
  /** 1-indexed question just answered. */
  questionNo: number;
  /** Did this row's own engine trigger fire on this answer? */
  triggerFired: boolean;
  /** Is the row on cooldown / suppressed right now? A disabled row schedules nothing. */
  disabled: boolean;
  /** Opponent HP as a 0..1 fraction, AFTER this answer resolved. */
  oppHpPct: number;
  /** Prediction echoed back by the tick's runtime entry (Uxie); null until it fires. */
  predictedStatus?: string | null;
}

export interface BespokeFxOutcome {
  state: BespokeFxState;
  /** True → call `applyPvpSignatureEffect(match, idx, dex, "bespoke")` now. The
   * server resolves every bespoke row for this dex id in one shot. */
  fireBespoke: boolean;
  /** Player-facing cue, or null for silence. Never fabricated: only emitted for a
   * transition this function actually decided. */
  cue: string | null;
}

/** Advance one question's worth of bespoke scheduling for a single row.
 *
 * Called once per answer for the acting side, AFTER the engine tick has returned
 * (so `disabled` and `predictedStatus` reflect authoritative runtime, not a guess). */
export function stepBespokeFx(
  bespoke: readonly BespokeEffectRef[] | undefined,
  prev: BespokeFxState,
  ctx: BespokeFxContext,
  rng: () => number = Math.random,
): BespokeFxOutcome {
  if (!bespoke || bespoke.length === 0) {
    return { state: prev, fireBespoke: false, cue: null };
  }

  let state: BespokeFxState = { ...prev };
  let fireBespoke = false;
  let cue: string | null = null;

  for (const fx of bespoke) {
    switch (fx.fx) {
      case "flat_next_question_damage": {
        // Jirachi: arm on the trigger, resolve 2 questions later. Re-arming while a
        // strike is already in flight would let a lucky streak stack strikes onto one
        // question — so an armed strike blocks a new one until it lands.
        if (state.pendingStrikeAtQ === ctx.questionNo) {
          state = { ...state, pendingStrikeAtQ: null };
          fireBespoke = true;
          cue = "💥 Doom Desire struck!";
        } else if (ctx.triggerFired && !ctx.disabled && state.pendingStrikeAtQ === null) {
          state = { ...state, pendingStrikeAtQ: ctx.questionNo + DOOM_DESIRE_DELAY_Q };
          cue = `🌠 Doom Desire — impact in ${DOOM_DESIRE_DELAY_Q} questions`;
        }
        break;
      }

      case "dot_frac_hp": {
        // Heatran: the trigger opens a window; every question inside it chips the
        // opponent. A disable (2 misses) slams the window shut early — that is the
        // owner's "the DoT stops if Heatran misses twice" ruling, so we clear rather
        // than merely skip, and a later re-trigger opens a fresh window.
        if (ctx.disabled) {
          state = { ...state, dotThroughQ: null };
          break;
        }
        if (ctx.triggerFired) {
          state = { ...state, dotThroughQ: ctx.questionNo + fx.questions };
          cue = "🔥 Magma Storm — the opponent is burning";
        } else if (state.dotThroughQ !== null && ctx.questionNo <= state.dotThroughQ) {
          fireBespoke = true;
        }
        if (state.dotThroughQ !== null && ctx.questionNo >= state.dotThroughQ) {
          state = { ...state, dotThroughQ: null };
        }
        break;
      }

      case "frac_hp_random": {
        if (fx.questions === undefined) {
          // Arceus #493: fires every question its trigger holds. No window to track.
          if (ctx.triggerFired && !ctx.disabled) fireBespoke = true;
          break;
        }
        // Regieleki #894 (M4): the trigger opens a `questions`-long cage that chips
        // the opponent every question inside it. Same shape as Heatran's DoT — and,
        // like it, a disable slams the cage shut early rather than merely pausing it.
        if (ctx.disabled) {
          state = { ...state, chipThroughQ: null };
          break;
        }
        if (ctx.triggerFired) {
          state = { ...state, chipThroughQ: ctx.questionNo + fx.questions };
          cue = "⚡ Thunder Cage — they can't escape";
        } else if (state.chipThroughQ !== null && ctx.questionNo <= state.chipThroughQ) {
          fireBespoke = true;
        }
        if (state.chipThroughQ !== null && ctx.questionNo >= state.chipThroughQ) {
          state = { ...state, chipThroughQ: null };
        }
        break;
      }

      case "full_heal_cure": {
        // Zarude #893 (M4): below 25% HP, heal to full and clear every status (the
        // -1 own Defence it pays is a stat spec, applied by the tick). Once per
        // battle — the engine's `once_per_battle` disable is what enforces that, so
        // all we do here is fire on the trigger.
        if (ctx.triggerFired && !ctx.disabled) {
          fireBespoke = true;
          cue = "🌿 Jungle Healing — back to full";
        }
        break;
      }

      case "reflect_opponent_stat": {
        // Manaphy: reactive to the opponent's signature (the observer supplies
        // triggerFired). Server flips Manaphy's own debuffs into buffs.
        if (ctx.triggerFired && !ctx.disabled) {
          fireBespoke = true;
          cue = "🔄 Heart Swap — the debuff turned in your favour";
        }
        break;
      }

      case "eliminate_choices": {
        // Azelf: cull wrong answers on the NEXT question (the trigger fires on the
        // answer to q5/q10/q15/q20, so the help lands on the one after).
        if (ctx.triggerFired && !ctx.disabled) {
          const span = Math.max(0, fx.max - fx.min);
          const count = fx.min + Math.floor(rng() * (span + 1));
          state = { ...state, eliminateOnQ: ctx.questionNo + 1, eliminateCount: count };
          cue = `🧠 Future Sight — ${count} wrong answer${count === 1 ? "" : "s"} removed next question`;
        }
        break;
      }

      case "predicted_status_reveal": {
        // Uxie: the SERVER rolled the status and echoed it back through the tick's
        // runtime; we only mirror it, so the reveal and the eventual infliction are
        // provably the same status. It lands the first time the opponent drops below
        // the threshold — once per battle.
        if (ctx.predictedStatus && state.predictedStatus === null) {
          state = { ...state, predictedStatus: ctx.predictedStatus };
          cue = `🔮 Future Sight foresees: ${ctx.predictedStatus}`;
        }
        const known = state.predictedStatus ?? ctx.predictedStatus ?? null;
        if (
          known &&
          !state.predictionLanded &&
          !ctx.disabled &&
          ctx.oppHpPct < fx.applyIfOppHpBelowPct / 100
        ) {
          state = { ...state, predictionLanded: true };
          fireBespoke = true;
          cue = `🔮 The future arrived — ${known}!`;
        }
        break;
      }

      // item_lockout (Mesprit) and use_opponent_item (Marshadow) are resolved
      // entirely inside use_pvp_live_item server-side — they need no client
      // scheduling, and reacting here would double-apply them.
      case "item_lockout":
      case "use_opponent_item":
        break;

      // M4: the instant KO (Urshifu/Fezandipiti/Terapagos) and the Ruination
      // quartet's halve-current-HP go through their OWN server phase (`m4_fx`,
      // via sigM4Fx) — the KO must be rolled server-side, so it deliberately does
      // not route through the client-scheduled `bespoke` phase. Firing here too
      // would double-apply them.
      case "instant_ko":
      case "frac_hp_damage":
        break;

      // Effects owned by the legacy bespoke path or the stat engine, not by this
      // scheduler. Listed so a new fx kind is a compile error, not a silent no-op.
      default:
        break;
    }
  }

  return { state, fireBespoke, cue };
}

/** Azelf: pick which wrong-answer indices to grey out on the question now on screen.
 * Returns [] when Azelf isn't culling this question.
 *
 * Owner ruling (2026-07-12): a max roll MAY remove every wrong answer, leaving only
 * the correct one — a jackpot roll genuinely hands the player the point. The only
 * invariant is that the correct answer is never culled. */
export function eliminatedChoiceIndices(
  state: BespokeFxState,
  questionNo: number,
  choiceCount: number,
  correctIndex: number,
  rng: () => number = Math.random,
): number[] {
  if (state.eliminateOnQ !== questionNo || state.eliminateCount <= 0) return [];
  const wrong: number[] = [];
  for (let i = 0; i < choiceCount; i++) if (i !== correctIndex) wrong.push(i);
  const take = Math.min(state.eliminateCount, wrong.length);
  for (let i = wrong.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [wrong[i], wrong[j]] = [wrong[j], wrong[i]];
  }
  return wrong.slice(0, take).sort((a, b) => a - b);
}
