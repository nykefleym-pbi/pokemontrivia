// Live PvP Phase 4/5 cutover, slice 4: builds `resolvePvpAnswer`'s inputs
// from a live `pvp_live_matches` row, for BOTH the human path (Phase 4) and
// the bot-mirror path (Phase 5) -- the same shared engine covers both, since
// `resolvePvpAnswer` is generic over "self" (the answering side) vs
// "opponent" and doesn't care whether "self" is a human or the Training bot.
//
// This module is pure and side-effect-free: the Edge Function
// (supabase/functions/pvp-live-resolve-turn) does the actual DB read and
// passes plain data in, exactly like `pvp-shadow-verify.ts` does for the
// offline verifier. Deliberately a SEPARATE function from that module's
// `reconstructPvpAnswerInput` (which maps a *shadow-log snapshot*, not a live
// row) rather than a shared one -- the two have different source shapes and
// forcing one signature to cover both would obscure which fields come from
// where. Keep them in sync by hand if `resolvePvpAnswer`'s input shape ever
// changes; don't let them silently diverge.
import {
  resolvePvpAnswer,
  pvpEngineStateFromRow,
  type PvpAnswerInput,
  type PvpAnswerOutcome,
  type PvpEngineState,
  type PvpEngineStateRow,
} from "./pvp-live-answer";
import { SIGNATURE_ABILITIES } from "../lib/signature-abilities";
import { findPokemon, type PokeType } from "../lib/pokemon-data";
import type { AbilityId } from "../lib/abilities";
import type { ActiveStatus, PvpStatStages } from "../lib/store";
import type { SigRuntimeMap } from "../lib/signature-rework-types";
import {
  botAnswersCorrectly,
  botAnswerTimeMs,
  type BotProfile,
} from "../lib/pvp-bot";
import {
  resolvePvpTypeAbilityId,
  typeAbilityPvp,
  typeAbilityDamageMod,
  typeAbilitySelfDmgMod,
  type TypeAbilityCtx,
} from "../lib/pvp-type-abilities";

const MAX_HP = 120;

/** One side's plain, already-Mew-transform-resolved state, as read off
 *  `pvp_live_matches` (host_* or guest_* columns, picked by the caller). */
export interface PvpLiveSideState {
  dex: number | null;
  partnerId: number | null;
  hp: number;
  stages: PvpStatStages;
  statuses: ActiveStatus[];
  abilityId: string | null;
  sigRuntime: SigRuntimeMap;
  suppressedUntil: number;
  pokedexCount: number;
  engineState: PvpEngineStateRow;
}

export interface PvpLiveTurnContext {
  self: PvpLiveSideState;
  opp: PvpLiveSideState;
  question: { question: string; options: string[]; correct: number; category: string };
  questionIndex: number;
}

function statusFlags(statuses: ActiveStatus[]) {
  return {
    hasAnyStatus: statuses.length > 0,
    hasConfusedStatus: statuses.some((s) => s.kind === "confused"),
    hasPoisonedStatus: statuses.some((s) => s.kind === "poisoned" || s.kind === "badly-poisoned"),
    burned: statuses.some((s) => s.kind === "burn"),
  };
}

function commonInputFields(ctx: PvpLiveTurnContext) {
  const self = ctx.self;
  const opp = ctx.opp;
  const myTypes = self.dex != null ? (findPokemon(self.dex)?.types as PokeType[] | undefined) : undefined;
  const oppEntry = opp.dex != null ? findPokemon(opp.dex) : undefined;
  const engine = self.dex != null ? SIGNATURE_ABILITIES[self.dex]?.engine : undefined;
  const sigDisabled = !!(
    self.dex != null && (self.sigRuntime?.[String(self.dex)] as { disabled?: boolean } | undefined)?.disabled
  );
  const flags = statusFlags(self.statuses);
  return {
    myTypes,
    oppType: oppEntry?.types ?? [],
    oppSpecies: opp.dex ?? -1,
    engine,
    sigDisabled,
    storedAbilityId: (self.abilityId as AbilityId | null) ?? null,
    suppressed: self.suppressedUntil > ctx.questionIndex,
    ...flags,
  };
}

/**
 * Build `resolvePvpAnswer`'s input for a HUMAN'S own answer. Correctness is
 * derived HERE from the immutable `question.correct` vs. `selectedIndex` --
 * the caller (the apply RPC, under its own lock) must independently
 * re-verify this too, exactly as `submit_pvp_live_answer` already does today
 * (defense in depth: even a buggy Edge Function can't grant a bogus win).
 */
export function buildAnswerTurn(
  ctx: PvpLiveTurnContext,
  opts: { selectedIndex: number | null; answerElapsedMs: number; personalTimerMs: number; rng: () => number },
): { input: PvpAnswerInput; state: PvpEngineState; correct: boolean } {
  const correct = opts.selectedIndex !== null && opts.selectedIndex === ctx.question.correct;
  const common = commonInputFields(ctx);
  const input: PvpAnswerInput = {
    questionIndex: ctx.questionIndex,
    correct,
    frozen: false,
    answerElapsedMs: opts.answerElapsedMs,
    personalTimerMs: opts.personalTimerMs,
    selfHp: ctx.self.hp,
    oppHp: ctx.opp.hp,
    maxHp: MAX_HP,
    myAttackStage: ctx.self.stages.attack,
    myCritStage: ctx.self.stages.crit,
    oppDefenseStage: ctx.opp.stages.defense,
    newCategory: false,
    questionCategory: ctx.question.category,
    pokedexCount: ctx.self.pokedexCount,
    rng: opts.rng,
    ...common,
  };
  return { input, state: pvpEngineStateFromRow(ctx.self.engineState), correct };
}

/**
 * Build `resolvePvpAnswer`'s input for the Training BOT'S own turn. Unlike
 * the human path, there is no client self-report to reconcile against --
 * this Edge Function invocation IS the sole authority for the bot's outcome,
 * rolled fresh from its persisted `guest_bot_profile` (Phase 4/5 cutover
 * slice 1) via the same `rng` `resolvePvpAnswer` itself consumes next, so a
 * single sequential roll covers correctness, timing, confusion-miss, and
 * crit with no separate "was this a confusion miss" helper needed --
 * `resolvePvpAnswer` already rolls that internally when `correct` is true
 * and the bot is confused.
 */
export function rollBotTurn(
  ctx: PvpLiveTurnContext,
  profile: BotProfile,
  opts: { personalTimerMs: number; rng: () => number },
): { input: PvpAnswerInput; state: PvpEngineState; correct: boolean; answerElapsedMs: number } {
  const correct = botAnswersCorrectly(profile, opts.rng);
  const answerElapsedMs = botAnswerTimeMs(profile, opts.rng);
  const common = commonInputFields(ctx);
  const input: PvpAnswerInput = {
    questionIndex: ctx.questionIndex,
    correct,
    frozen: false,
    answerElapsedMs,
    personalTimerMs: opts.personalTimerMs,
    selfHp: ctx.self.hp,
    oppHp: ctx.opp.hp,
    maxHp: MAX_HP,
    myAttackStage: ctx.self.stages.attack,
    myCritStage: ctx.self.stages.crit,
    oppDefenseStage: ctx.opp.stages.defense,
    newCategory: false,
    questionCategory: ctx.question.category,
    pokedexCount: ctx.self.pokedexCount,
    rng: opts.rng,
    ...common,
  };
  return { input, state: pvpEngineStateFromRow(ctx.self.engineState), correct, answerElapsedMs };
}

export function resolve(input: PvpAnswerInput, state: PvpEngineState): PvpAnswerOutcome {
  return resolvePvpAnswer(input, state);
}

/**
 * Recompute the three toast-activation checks a client-side caller used to
 * derive itself from its OWN taCtx, purely to decide whether to show a toast
 * (`mod.active`/`sturdyUsed` flipping/`keepsStreakOnWrong` never fed back
 * into the ACTUAL dmg number, even before the Phase 4 cutover -- that's
 * `resolvePvpAnswer`'s job). Recomputing them here, from the exact same
 * before/after state `resolvePvpAnswer` already produced, keeps that toast
 * fidelity without a caller rebuilding a taCtx of its own (and risking it
 * drifting from what the engine actually used). All three predicates are
 * pure/deterministic -- verified no `ctx.rng` consumer exists in
 * pvp-type-abilities.ts -- so recomputing them is safe.
 *
 * Exported from this shared engine module (not defined inline in the Edge
 * Function) so both the real Edge Function AND its test doubles call the
 * exact same implementation -- never a hand-copied second version.
 */
export function toastNotices(
  input: PvpAnswerInput,
  before: PvpEngineState,
  outcome: PvpAnswerOutcome,
): { sturdyFired: boolean; sandForceKeptStreak: boolean; typeAbilityModFired: boolean } {
  const typeAbilityId = resolvePvpTypeAbilityId(input.myTypes, input.storedAbilityId);
  const typeWiring = typeAbilityPvp(typeAbilityId);
  if (!typeAbilityId || !typeWiring || input.frozen) {
    return { sturdyFired: false, sandForceKeptStreak: false, typeAbilityModFired: false };
  }
  const landedHit = input.correct && !outcome.confusionMissed;
  const taCtx: TypeAbilityCtx = {
    correct: landedHit,
    selfHpPct: input.selfHp / input.maxHp,
    oppHpPct: input.oppHp / input.maxHp,
    streakAfter: outcome.state.streak,
    answerElapsedMs: input.answerElapsedMs,
    personalTimerMs: input.personalTimerMs,
    questionIndex: input.questionIndex,
    prevCorrect: before.prevCorrect,
    hadWrong: before.hadWrong,
    correctCount: outcome.state.correctCount,
    moxieStacks: before.moxieStacks,
    hasNegativeStatus: input.hasConfusedStatus || input.hasPoisonedStatus,
    hasConfused: input.hasConfusedStatus,
    hasPoisoned: input.hasPoisonedStatus,
  };
  let sturdyFired = false;
  let sandForceKeptStreak = false;
  let typeAbilityModFired = false;
  if (landedHit) {
    if (typeAbilityDamageMod(typeAbilityId, taCtx).active) typeAbilityModFired = true;
  } else if (!input.correct) {
    if (typeAbilitySelfDmgMod(typeAbilityId, taCtx).active) typeAbilityModFired = true;
    if (typeWiring.clampsLethalSelfDmg && !before.sturdyUsed && outcome.state.sturdyUsed) {
      sturdyFired = true;
    }
    if (typeWiring.keepsStreakOnWrong?.(before.wrongCount + 1)) {
      sandForceKeptStreak = true;
      typeAbilityModFired = true;
    }
  }
  return { sturdyFired, sandForceKeptStreak, typeAbilityModFired };
}
