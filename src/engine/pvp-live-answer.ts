// Isomorphic per-answer resolver for live PvP (Nearby Battle / Training vs Bot).
//
// Lifted, byte-for-byte, from `live-pvp-battle-screen.tsx`'s `resolveQuestion` —
// specifically the SYNCHRONOUS damage math: the streak curve, the Legendary/
// Mythical signature engine's multiplier/phase/fixedIndex channels, Sword of
// Ruin's ignore-Defense window, confusion's miss roll, and the always-on
// (every-partner) type-ability layer that stacks on top of it. Verified
// byte-for-byte against `live-pvp-battle-screen.characterization.test.tsx`'s
// captured trace by `pvp-live-answer.test.ts`, per this repo's CLAUDE.md
// characterization-harness discipline — this exact system (signature
// abilities) has produced wrong conclusions before when read instead of
// exercised.
//
// Deliberately OUT of scope (still async, RPC-driven, and owned by a separate
// server-side lifecycle the caller must supply as plain inputs/outputs):
//  - `sigDisabled` — the engine-runtime disable/cooldown flag lives in
//    `pvp_sig_runtime` and is only known from the PREVIOUS answer's resolved
//    `sigEngineTick` response; this module treats it as an opaque input.
//  - Sword of Ruin's charge ARMING (`armSwordOfRuinCharges` below) — the -2
//    Def "manual" phase and the resulting 2-charge window only exist once
//    `apply_pvp_signature_effect(phase:"manual")` actually resolves; this
//    module only CONSUMES the charge count it's handed.
//  - bespoke fx / M4 channels / the type-ability's server catalog
//    `post_answer` effect (heals, stat bumps, statuses) — none of these
//    feed back into THIS answer's `dmg`/`selfDmg` number, only into future
//    HP/stat/status columns a later answer's inputs will already reflect.
import {
  computePvpDamage,
  evaluateHitModifiers as evaluateSigMultiplier,
  evaluateIndexFactor,
  NO_SIGNATURE_HIT_MODIFIERS,
} from "./damage";
import {
  engineTriggerFired,
  mergeHitModifiers,
  NO_HIT_MODIFIERS,
  type SignatureContext,
  type SignatureEngineSpec,
} from "../lib/signature-abilities";
import { typeMatchup, type EffectivenessBand } from "../lib/type-chart";
import {
  applyDamageMod,
  applySelfDmgMod,
  resolvePvpTypeAbilityId,
  typeAbilityDamageMod,
  typeAbilityPreventsConfusion,
  typeAbilityPvp,
  typeAbilitySelfDmgMod,
  type TypeAbilityCtx,
} from "../lib/pvp-type-abilities";
import type { AbilityId } from "../lib/abilities";
import type { PokeType } from "../lib/pokemon-data";

/** Consecutive wrong answers before confusion arms (mirrors live-pvp-battle-
 *  screen.tsx's `CONFUSE_AT`). */
export const CONFUSE_AT = 2;
/** Confusion cure ticks, matching Solo (`STATUS_META.confused.defaultCures`). */
export const CONFUSE_TICKS = 2;
/** Chien-Pao's dex id — the only row that arms a Sword-of-Ruin charge window. */
const SWORD_OF_RUIN_DEX_ID = 1002;

/** Battle-scoped state the client previously kept as a handful of `useRef`s.
 *  Threaded explicitly here so the resolver stays pure. */
export interface PvpEngineState {
  streak: number;
  correctCount: number;
  selfWrongStreak: number;
  /** >0 while confused; ticks down by one on each confusion-eaten hit. */
  confusedTicks: number;
  /** Remaining ignore-opponent-Defense charges from Chien-Pao's Sword of Ruin. */
  swordOfRuinCharges: number;
  /** Once true (a `latchOnTrigger` row's trigger having fired once), stays true
   *  for the rest of the battle regardless of whether the trigger re-holds. */
  sigLatched: boolean;
  /** Moxie's accumulated permanent Attack-adjacent bonus (type-ability layer). */
  moxieStacks: number;
  /** Wrong-answer tally this battle (Sand Force's `keepsStreakOnWrong`). */
  wrongCount: number;
  /** Any wrong answer yet this battle (Berserk/Snow Cloak-style gates). */
  hadWrong: boolean;
  /** Sturdy's one-time "survive at 1 HP" save, already spent. */
  sturdyUsed: boolean;
  prevCorrect: boolean;
  prevAnswerElapsedMs: number;
}

export const INITIAL_PVP_ENGINE_STATE: PvpEngineState = {
  streak: 0,
  correctCount: 0,
  selfWrongStreak: 0,
  confusedTicks: 0,
  swordOfRuinCharges: 0,
  sigLatched: false,
  moxieStacks: 0,
  wrongCount: 0,
  hadWrong: false,
  sturdyUsed: false,
  prevCorrect: false,
  prevAnswerElapsedMs: 0,
};

export interface PvpAnswerInput {
  /** 0-based index of the question being answered. */
  questionIndex: number;
  correct: boolean;
  /** Freeze auto-forfeits the question: no damage either way, streak resets. */
  frozen: boolean;
  answerElapsedMs: number;
  personalTimerMs: number;
  /** Attacker's own HP BEFORE this answer resolves. */
  selfHp: number;
  /** Defender's HP BEFORE this answer resolves. */
  oppHp: number;
  maxHp: number;
  myAttackStage: number;
  myCritStage: number;
  oppDefenseStage: number;
  burned: boolean;
  /** This side's signature ability is suppressed this question (Heatran/
   *  Zygarde/Regieleki/Pecharunt lift). */
  suppressed: boolean;
  /** The Legendary/Mythical partner's engine spec, if any (`ability?.engine`). */
  engine: SignatureEngineSpec | undefined;
  /** The engine runtime's disable/cooldown flag from the PREVIOUS answer's
   *  resolved `sigEngineTick` response (see module header). */
  sigDisabled: boolean;
  oppType: string[];
  oppSpecies: number;
  /** The player's own partner's types — the type-ability layer resolves off
   *  these for EVERY partner, Legendary or not (feedback #3: it stacks). */
  myTypes: PokeType[] | undefined;
  storedAbilityId: AbilityId | null;
  /** A status condition (any kind) is currently active, pre-answer. */
  hasAnyStatus: boolean;
  hasConfusedStatus: boolean;
  hasPoisonedStatus: boolean;
  newCategory: boolean;
  questionCategory: string;
  pokedexCount: number;
  rng?: () => number;
}

export interface PvpAnswerOutcome {
  dmg: number;
  selfDmg: number;
  /** True when confusion ate an objectively-correct click: `correct` is
   *  reported true but `dmg`/`selfDmg` are both 0. */
  confusionMissed: boolean;
  /** The engine trigger's fired/not-fired verdict for THIS answer — the same
   *  value the client's `sigEngineTick` call and `fireCappedPayload` gate on. */
  triggerFired: boolean;
  /** Per-question type matchup for the landed hit — the rolled attacking type
   *  and its effectiveness band/multiplier, for the compact effectiveness pill.
   *  Null on a miss/wrong/frozen answer (no hit to characterize). */
  matchup: { band: EffectivenessBand; attackType: PokeType; multiplier: number } | null;
  state: PvpEngineState;
}

/**
 * Resolve one live-PvP answer: the streak curve, the signature engine's
 * multiplier/phase/fixedIndex damage channels, Sword of Ruin's ignore-Defense
 * consumption, confusion's miss roll, and the always-on type-ability layer —
 * everything that determines the `dmg`/`selfDmg` a client (or, post-cutover,
 * the Edge Function) sends to `submit_pvp_live_answer`.
 */
export function resolvePvpAnswer(input: PvpAnswerInput, state: PvpEngineState): PvpAnswerOutcome {
  // TODO(P4 live-pvp cutover): the Edge Function must pass a seeded battle Rng
  // (src/engine/rng.ts); the ambient fallback exists only until then, same as
  // `computePvpDamage`'s own TODO.
  // eslint-disable-next-line no-restricted-syntax
  const rng = input.rng ?? Math.random;

  let streak = state.streak;
  let correctCount = state.correctCount;
  let selfWrongStreak = state.selfWrongStreak;
  let confusedTicks = state.confusedTicks;
  let swordOfRuinCharges = state.swordOfRuinCharges;
  let sigLatched = state.sigLatched;
  let moxieStacks = state.moxieStacks;
  let wrongCount = state.wrongCount;
  let hadWrong = state.hadWrong;
  let sturdyUsed = state.sturdyUsed;

  let dmg = 0;
  let selfDmg = 0;
  let landedHit = false;
  let streakAfterAnswer = 0;
  let confusionMissed = false;
  let landedMatchup: { band: EffectivenessBand; attackType: PokeType; multiplier: number } | null =
    null;

  // Pre-answer confused state never changes mid-resolution (mirrors the real
  // component: `selfConfused`/`myStatuses` are React state, immutable within
  // one `resolveQuestion` call).
  // Resolved before the confusion checks because both the miss roll and the
  // wrong-answer branch need it, not just the type-ability layer below.
  const resolvedTypeAbilityId = resolvePvpTypeAbilityId(input.myTypes, input.storedAbilityId);
  const confusionPrevented = typeAbilityPreventsConfusion(resolvedTypeAbilityId);

  // Immunity covers BOTH representations. `confusedTicks` should never arm for
  // an immune partner, but a `confused` entry can also arrive in the synced
  // status row from an opponent's signature ability — and that one lands
  // BEFORE any cure could run, so without this it would still eat an answer.
  const isConfused =
    !confusionPrevented && (confusedTicks > 0 || input.hasConfusedStatus);
  const selfAfflicted = input.hasAnyStatus || isConfused;

  if (input.frozen) {
    streak = 0;
  } else if (input.correct) {
    selfWrongStreak = 0;
    const missedFromConfusion = isConfused && rng() < 0.25;
    if (missedFromConfusion) {
      confusionMissed = true;
      if (confusedTicks > 0) confusedTicks -= 1;
      streak = 0;
    } else {
      const nextStreak = streak + 1;
      streak = nextStreak;
      streakAfterAnswer = nextStreak;
      landedHit = true;
      correctCount += 1;

      const totalMs = input.personalTimerMs;
      const speedRatio = Math.max(0, (totalMs - input.answerElapsedMs) / totalMs);
      const firstHalf = input.answerElapsedMs <= totalMs / 2;

      // Chien-Pao — Sword of Ruin (1002): consumes one charge per correct hit
      // once armed (see `armSwordOfRuinCharges`); suppression doesn't block it
      // (the -2 Def already landed server-side; this window is a pure
      // client-side damage-calc fold).
      let mods = NO_HIT_MODIFIERS;
      if (swordOfRuinCharges > 0) {
        mods = mergeHitModifiers(mods, { ...NO_HIT_MODIFIERS, ignoreOppDefenseStage: true });
        swordOfRuinCharges -= 1;
      }

      const baseAttack = mods.ignoreOwnNegativeStages
        ? Math.max(0, input.myAttackStage)
        : input.myAttackStage;
      const baseCrit = mods.ignoreOwnNegativeStages ? Math.max(0, input.myCritStage) : input.myCritStage;

      const engineSpec = input.engine;
      const sigCtx: SignatureContext = {
        questionIndex: input.questionIndex,
        correct: true,
        prevCorrect: state.prevCorrect,
        streak: nextStreak,
        streakBefore: state.streak,
        correctCount,
        answerElapsedMs: input.answerElapsedMs,
        prevAnswerElapsedMs: state.prevAnswerElapsedMs,
        personalTimerMs: totalMs,
        selfHpPct: input.selfHp / input.maxHp,
        oppHpPct: input.oppHp / input.maxHp,
        newCategory: input.newCategory,
        questionCategory: input.questionCategory,
        pokedexCount: input.pokedexCount,
        oppDefenseStage: input.oppDefenseStage,
        questionNo: input.questionIndex + 1,
        selfAfflicted,
        oppType: input.oppType,
        oppSpecies: input.oppSpecies,
      };

      // M4 `latchOnTrigger`: once the trigger fires, the row's multiplier
      // stays "held" for the rest of the battle even if the live trigger would
      // later go false again (owner ruling 2026-07-12 — healing back up does
      // NOT revoke it).
      if (engineSpec?.latchOnTrigger && engineTriggerFired(engineSpec.trigger, sigCtx)) {
        sigLatched = true;
      }
      const triggerHeld =
        !!engineSpec &&
        (engineTriggerFired(engineSpec.trigger, sigCtx) ||
          (engineSpec.latchOnTrigger === true && sigLatched));
      const multiplierLive = !input.suppressed && !!engineSpec && !input.sigDisabled && triggerHeld;
      const sigMult = multiplierLive
        ? evaluateSigMultiplier(engineSpec.multiplier, {
            correct: true,
            oppType: input.oppType,
            oppSpecies: input.oppSpecies,
            selfHpPct: input.selfHp / input.maxHp,
          })
        : NO_SIGNATURE_HIT_MODIFIERS;
      // M5: the question-indexed outgoing scale — NOT gated on `triggerHeld`
      // (a phase/charge window is anchored on the question number itself, see
      // `evaluateIndexFactor`); disable/suppress still switch it off.
      const indexFactor =
        !input.suppressed && engineSpec && !input.sigDisabled
          ? evaluateIndexFactor(engineSpec, {
              correct: true,
              questionNo: input.questionIndex + 1,
              selfHpPct: input.selfHp / input.maxHp,
              oppHpPct: input.oppHp / input.maxHp,
            })
          : 1;

      const { dmg: computed } = computePvpDamage({
        streak: nextStreak,
        speedRatio,
        attackStage: baseAttack + mods.bonusAttackStage,
        defenseStage: mods.ignoreOppDefenseStage ? 0 : input.oppDefenseStage,
        critStage: baseCrit + mods.bonusCritStage,
        firstHalf,
        burned: input.burned,
        hitFactor: sigMult.factor,
        ignoreDefense: sigMult.ignoreDefense,
        outgoingFactor: indexFactor,
        rng,
      });
      // Per-question type effectiveness (owner ruling 2026-08-04): roll one of
      // my types this question and scale by the mainline product into the
      // opponent's type(s), immune floored to 0.25×. Same resolver Solo uses.
      // Deterministic in (myTypes, oppType, questionIndex), so the client's
      // optimistic compute and any server recompute land on the identical number.
      const matchup =
        input.myTypes && input.myTypes.length > 0
          ? typeMatchup(input.myTypes, input.oppType as PokeType[], input.questionIndex)
          : null;
      landedMatchup = matchup;
      const scaled =
        matchup && matchup.multiplier !== 1
          ? Math.max(1, Math.round(computed * matchup.multiplier))
          : computed;
      dmg = scaled + (mods.secondHitFraction ? Math.round(scaled * mods.secondHitFraction) : 0);
    }
  } else {
    streak = 0;
    selfWrongStreak += 1;
    // Shield Dust is immune: the chain never arms. Mirrors Solo's
    // `abilityId !== "shield-dust"` guard in engine/turn.ts. This has to live
    // here, not in the server-catalog `cure` effect — PvP confusion is
    // `confusedTicks`, which no `cure` row can reach.
    if (selfWrongStreak === CONFUSE_AT && !confusionPrevented) {
      confusedTicks = CONFUSE_TICKS;
    }
    selfDmg = 8; // flat wrong-answer chip, mirroring solo's flat-loss model
  }

  // ── TYPE ability wiring — fires for EVERY partner (feedback #3), stacking
  // on top of the signature block above. Skipped entirely on a freeze.
  if (!input.frozen) {
    const typeAbilityId = resolvedTypeAbilityId;
    const typeWiring = typeAbilityPvp(typeAbilityId);
    if (typeAbilityId && typeWiring) {
      const taCtx: TypeAbilityCtx = {
        correct: landedHit,
        selfHpPct: input.selfHp / input.maxHp,
        oppHpPct: input.oppHp / input.maxHp,
        streakAfter: streakAfterAnswer,
        answerElapsedMs: input.answerElapsedMs,
        personalTimerMs: input.personalTimerMs,
        questionIndex: input.questionIndex,
        prevCorrect: state.prevCorrect,
        hadWrong,
        correctCount,
        moxieStacks,
        hasNegativeStatus: input.hasConfusedStatus || input.hasPoisonedStatus,
        hasConfused: input.hasConfusedStatus,
        hasPoisoned: input.hasPoisonedStatus,
        rng,
      };

      if (landedHit) {
        const mod = typeAbilityDamageMod(typeAbilityId, taCtx);
        if (mod.active) dmg = applyDamageMod(dmg, mod);
        // Moxie accrues a permanent +1 each time a 3-streak is reached.
        if (typeAbilityId === "moxie" && streakAfterAnswer > 0 && streakAfterAnswer % 3 === 0) {
          moxieStacks += 1;
        }
      } else if (!input.correct) {
        const selfMod = typeAbilitySelfDmgMod(typeAbilityId, taCtx);
        if (selfMod.active) selfDmg = applySelfDmgMod(selfDmg, selfMod);
        // Sturdy — survive one otherwise-lethal self hit at 1 HP.
        if (
          typeWiring.clampsLethalSelfDmg &&
          !sturdyUsed &&
          input.selfHp > 1 &&
          input.selfHp - selfDmg <= 0
        ) {
          selfDmg = input.selfHp - 1;
          sturdyUsed = true;
        }
        // Sand Force — the first two wrong answers don't break the streak.
        if (typeWiring.keepsStreakOnWrong?.(wrongCount + 1)) {
          streak = state.streak;
        }
      }

      if (!input.correct) {
        hadWrong = true;
        wrongCount += 1;
      }
    }
  }

  // The same minimal ctx `sigEngineTick`'s `_trigger_fired` argument uses
  // (EngineTriggerContext) — `correct` here is the OUTER answer, not
  // `landedHit`, so a confusion-eaten hit still reports `correct: true`.
  const triggerFired =
    !!input.engine &&
    engineTriggerFired(input.engine.trigger, {
      questionIndex: input.questionIndex,
      correct: input.correct,
      streak: streakAfterAnswer,
      questionNo: input.questionIndex + 1,
      selfAfflicted,
      selfHpPct: input.selfHp / input.maxHp,
      oppHpPct: input.oppHp / input.maxHp,
    } as SignatureContext);

  return {
    dmg,
    selfDmg,
    confusionMissed,
    triggerFired,
    matchup: landedMatchup,
    state: {
      streak,
      correctCount,
      selfWrongStreak,
      confusedTicks,
      swordOfRuinCharges,
      sigLatched,
      moxieStacks,
      wrongCount,
      hadWrong,
      sturdyUsed,
      prevCorrect: input.correct,
      prevAnswerElapsedMs: input.answerElapsedMs,
    },
  };
}

/**
 * Chien-Pao #1002: once its "manual" capped-payload phase actually applies
 * (the -2 opp Def landed server-side via `apply_pvp_signature_effect`), arm a
 * 2-charge ignore-Defense window for the next 2 correct answers. Mirrors
 * `fireCappedPayload`'s `swordOfRuinChargesRef.current = 2` — called by the
 * orchestrating caller (client today; the Edge Function post-cutover) right
 * after that RPC resolves `ok:true`, never from inside `resolvePvpAnswer`
 * itself (see module header).
 */
export function armSwordOfRuinCharges(state: PvpEngineState, partnerId: number): PvpEngineState {
  if (partnerId !== SWORD_OF_RUIN_DEX_ID) return state;
  return { ...state, swordOfRuinCharges: 2 };
}

/**
 * One side's `PvpEngineState`, persisted as `pvp_live_matches` columns (Phase
 * 4/5 cutover, slice 1: 20260718140000). `correctCount` reuses the
 * pre-existing `host_correct_live`/`guest_correct_live` columns (Phase 1,
 * `20260705000000`) rather than a new one — they already track exactly this
 * running total for both sides. Field names here are the "self" shape (no
 * host_/guest_ prefix); the caller picks the right side's columns.
 */
export interface PvpEngineStateRow {
  streakLive: number;
  correctLive: number;
  wrongStreakLive: number;
  confusedTicksLive: number;
  swordOfRuinCharges: number;
  sigLatched: boolean;
  moxieStacks: number;
  wrongCount: number;
  hadWrong: boolean;
  sturdyUsed: boolean;
  prevCorrect: boolean;
  prevAnswerElapsedMs: number;
}

/**
 * Reconstruct `PvpEngineState` from persisted columns (the new risk surface
 * the Phase 4/5 cutover introduces — each question is a separate stateless
 * RPC/Edge Function call, unlike the client's long-lived in-memory refs).
 * See `pvp-live-answer.persistence.test.ts` for the round-trip proof this
 * survives a full multi-question sequence byte-for-byte against continuous
 * in-memory folding.
 */
export function pvpEngineStateFromRow(row: PvpEngineStateRow): PvpEngineState {
  return {
    streak: row.streakLive,
    correctCount: row.correctLive,
    selfWrongStreak: row.wrongStreakLive,
    confusedTicks: row.confusedTicksLive,
    swordOfRuinCharges: row.swordOfRuinCharges,
    sigLatched: row.sigLatched,
    moxieStacks: row.moxieStacks,
    wrongCount: row.wrongCount,
    hadWrong: row.hadWrong,
    sturdyUsed: row.sturdyUsed,
    prevCorrect: row.prevCorrect,
    prevAnswerElapsedMs: row.prevAnswerElapsedMs,
  };
}

/** Inverse of `pvpEngineStateFromRow` — what the apply RPC should persist
 *  after `resolvePvpAnswer` returns its next `state`. */
export function pvpEngineStateToRow(state: PvpEngineState): PvpEngineStateRow {
  return {
    streakLive: state.streak,
    correctLive: state.correctCount,
    wrongStreakLive: state.selfWrongStreak,
    confusedTicksLive: state.confusedTicks,
    swordOfRuinCharges: state.swordOfRuinCharges,
    sigLatched: state.sigLatched,
    moxieStacks: state.moxieStacks,
    wrongCount: state.wrongCount,
    hadWrong: state.hadWrong,
    sturdyUsed: state.sturdyUsed,
    prevCorrect: state.prevCorrect,
    prevAnswerElapsedMs: state.prevAnswerElapsedMs,
  };
}
