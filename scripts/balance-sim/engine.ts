/**
 * Signature-ability balance simulator — the battle engine.
 *
 * Runs the REAL catalog (`SIGNATURE_ABILITIES`) and the REAL damage math
 * (`computePvpDamage`, `evaluateHitModifiers`, `evaluateIndexFactor`,
 * `stepBespokeFx`) through a faithful re-implementation of the live PvP loop
 * (`live-pvp-battle-screen.tsx`) and the server tick (`_pvp_sig_engine_apply`).
 *
 * The point is to measure each Legendary/Mythical's win rate against the others
 * so the overpowered rows can be found by evidence rather than by eye. Nothing
 * here is imported by the app — it is a measuring instrument, not game code.
 *
 * FIDELITY (verified against the shipped code, 2026-07-13):
 *  - HP 120, 20 questions, base damage 6, flat 8 self-damage on a wrong answer.
 *  - Win = opponent at 0 HP, else higher HP after q20, else higher accuracy.
 *  - Freeze forfeits the question outright (deal nothing, take no self-damage);
 *    30%/q thaw, guaranteed after 2. Confusion = 25% chance a correct answer
 *    misses. Burn = -15% output. Paralysis = timer x0.75. Sleep = locked for the
 *    first 40% of the timer. Poison/badly-poison deal NO damage in PvP — the
 *    live loop has no DoT tick (solo does; PvP does not).
 *  - A major status REPLACES the major status already there (_pvp_apply_status).
 *  - Magnitudes for the server-owned phases come from `pvp_signature_effects`
 *    (mirrored in db-effects.ts), not from the catalog's legacy `effect` field.
 *
 * KNOWN SIMPLIFICATIONS (stated so the numbers are not oversold):
 *  - No held items, no type abilities, no weather. Isolating the signature is
 *    the point; those channels are the same for every row and would add noise.
 *  - Both players answer with the same skill and the same answer-time
 *    distribution, so a win-rate gap is caused by the ability and nothing else.
 *  - Manual (player-fired) abilities fire under a fixed greedy policy.
 *  - Mew's copy-opponent and the ability-suppression rows are modelled, but
 *    Mew's copy resolves to the opponent's row at battle start.
 */
import {
  SIGNATURE_ABILITIES,
  engineTriggerFired,
  NO_HIT_MODIFIERS,
  type SignatureAbility,
  type SignatureEngineSpec,
  type StatChangeSpec,
  type HitModifiers,
  type SignatureContext,
} from "../../src/lib/signature-abilities";
import {
  computePvpDamage,
  evaluateHitModifiers as evaluateSigMultiplier,
  evaluateIndexFactor,
  multiplierConditionHolds,
  timerMsForSpeedStage,
  clampStage,
  PVP_MAX_HP,
  PVP_BASE_TIMER_MS,
  NO_SIGNATURE_HIT_MODIFIERS,
} from "../../src/lib/pvp-combat";
import {
  stepBespokeFx,
  EMPTY_BESPOKE_FX_STATE,
  type BespokeFxState,
} from "../../src/lib/signature-bespoke-fx";
import { findPokemon } from "../../src/lib/pokemon-data";
import { DB_EFFECTS, type DbEffect } from "./db-effects";

export const QUESTIONS = 20;
type Stat = "attack" | "defense" | "speed" | "crit";
type Status =
  | "poisoned"
  | "badly-poisoned"
  | "burn"
  | "paralysis"
  | "sleep"
  | "freeze"
  | "confused";

const MAJOR: Record<string, boolean> = {
  poisoned: true,
  "badly-poisoned": true,
  burn: true,
  paralysis: true,
  sleep: true,
  freeze: true,
  confused: false,
};

interface Runtime {
  stacks: number;
  netByStat: Record<string, number>;
  consecutiveWrong: number;
  disabled: boolean;
  increaseDisabled: boolean;
  firedThisBattle: boolean;
  phaseIdx: number;
  disabledUntilQ: number;
  predictedStatus: string | null;
  /** Question a timed window opened on (0 = none), and whether it has been spent. */
  winOpenQ: number;
  winSpent: boolean;
}

interface Side {
  dex: number;
  ability: SignatureAbility | null;
  engine: SignatureEngineSpec | null;
  hp: number;
  stages: Record<Stat, number>;
  statuses: { kind: Status; cures: number; ticks?: number }[];
  streak: number;
  wrongStreak: number;
  correct: number;
  answered: number;
  rt: Runtime;
  fx: BespokeFxState;
  latched: boolean;
  revived: boolean;
  // M4 windows
  shieldThroughQ: number;
  oppTimerMs: number;
  oppTimerThroughQ: number;
  selfDmgZero: boolean;
  // cross-side suppression: this side's ability is locked through this question
  suppressedThroughQ: number;
  manualUsesLeft: number;
  manualFired: boolean;
  usedHealingItem: boolean;
}

const emptyRuntime = (): Runtime => ({
  stacks: 0,
  netByStat: {},
  consecutiveWrong: 0,
  disabled: false,
  increaseDisabled: false,
  firedThisBattle: false,
  phaseIdx: 0,
  disabledUntilQ: -1,
  predictedStatus: null,
  winOpenQ: 0,
  winSpent: false,
});

function makeSide(dex: number, useAbility: boolean): Side {
  const ability = useAbility ? (SIGNATURE_ABILITIES[dex] ?? null) : null;
  const engine = ability?.engine ?? null;
  const manualUses =
    ability?.trigger.type === "manual" ? (ability.trigger.usesPerBattle ?? 1) : 0;
  return {
    dex,
    ability,
    engine,
    hp: PVP_MAX_HP,
    stages: { attack: 0, defense: 0, speed: 0, crit: 0 },
    statuses: [],
    streak: 0,
    wrongStreak: 0,
    correct: 0,
    answered: 0,
    rt: emptyRuntime(),
    fx: { ...EMPTY_BESPOKE_FX_STATE },
    latched: false,
    revived: false,
    shieldThroughQ: -1,
    oppTimerMs: 0,
    oppTimerThroughQ: -1,
    selfDmgZero: false,
    suppressedThroughQ: -1,
    manualUsesLeft: manualUses,
    manualFired: false,
    usedHealingItem: false,
  };
}

function bump(side: Side, stat: Stat | "random", delta: number, rng: () => number): void {
  const s: Stat =
    stat === "random"
      ? (["attack", "defense", "speed", "crit"] as Stat[])[Math.floor(rng() * 4)]
      : stat;
  side.stages[s] = clampStage(side.stages[s] + delta);
}

function applyStatus(side: Side, kind: Status, questions: number): void {
  side.statuses = side.statuses.filter(
    (s) => s.kind !== kind && !(MAJOR[kind] && MAJOR[s.kind]),
  );
  side.statuses.push({ kind, cures: questions });
}

function has(side: Side, kind: Status): boolean {
  return side.statuses.some((s) => s.kind === kind);
}

function tickCure(side: Side, kind: Status): void {
  const s = side.statuses.find((x) => x.kind === kind);
  if (!s) return;
  s.cures -= 1;
  if (s.cures <= 0) side.statuses = side.statuses.filter((x) => x !== s);
}

// ── Server tick (_pvp_sig_engine_apply), re-implemented ──────────────────────
function revertNet(me: Side, opp: Side): void {
  for (const [key, net] of Object.entries(me.rt.netByStat)) {
    if (!net) continue;
    const [target, stat] = key.split(":") as ["self" | "opp" | "opponent", Stat];
    const t = target === "self" ? me : opp;
    t.stages[stat] = clampStage(t.stages[stat] - net);
  }
  me.rt.netByStat = {};
}

function tickEngine(
  me: Side,
  opp: Side,
  engine: SignatureEngineSpec,
  qNo: number,
  correct: boolean,
  triggerFired: boolean,
  statSpecs: (StatChangeSpec | { mode: "predicted_status" })[],
  rng: () => number,
): void {
  const rt = me.rt;
  const d = engine.disable;
  const kinds = d.kind === "any_of" ? d.of.map((x) => x.kind) : [d.kind];
  const nOf = (k: string): number => {
    const found =
      d.kind === "any_of"
        ? d.of.find((x) => x.kind === k)
        : d.kind === k
          ? d
          : undefined;
    return found && "n" in found ? found.n : 1;
  };
  const alreadyFired = rt.firedThisBattle;

  rt.consecutiveWrong = correct ? 0 : rt.consecutiveWrong + 1;

  if (!correct) {
    if (
      kinds.includes("revert_stat_after_incorrect") &&
      rt.consecutiveWrong >= Math.max(nOf("revert_stat_after_incorrect"), 1)
    ) {
      revertNet(me, opp);
      rt.stacks = 0;
      rt.disabled = true;
    } else if (
      kinds.includes("disable_increase_after_incorrect") &&
      rt.consecutiveWrong >= Math.max(nOf("disable_increase_after_incorrect"), 1)
    ) {
      rt.increaseDisabled = true;
    } else if (
      kinds.includes("disable_effect_after_incorrect") &&
      rt.consecutiveWrong >= Math.max(nOf("disable_effect_after_incorrect"), 1)
    ) {
      rt.disabled = true;
      revertNet(me, opp);
      rt.stacks = 0;
    } else if (
      kinds.includes("disable_multiplier_after_incorrect") &&
      rt.consecutiveWrong >= Math.max(nOf("disable_multiplier_after_incorrect"), 1)
    ) {
      rt.disabled = true;
    }
  }
  if (kinds.includes("once_per_battle") && rt.firedThisBattle) rt.disabled = true;

  // ── Timed window (mirrors the migrated `_pvp_sig_engine_apply`) ────────────
  // A question the trigger does NOT fire on releases the row, so a fresh window
  // may open later. A window is anchored to the question it OPENED on and closes
  // N questions later EVEN IF the trigger is still held — the four Paradox rows
  // trigger on "self HP below 50%", a STATE that never stops being true, so the
  // old `!triggerFired` expiry never ran and their 3-question window was forever.
  const expireN =
    engine.expireAfterQuestions ??
    (engine.disable.kind === "disable_effect_after_questions" ? engine.disable.n : 0);
  if (!triggerFired) rt.winSpent = false;
  if (expireN > 0 && triggerFired && !rt.winSpent && rt.winOpenQ === 0) {
    rt.winOpenQ = qNo;
  }
  if (expireN > 0 && rt.winOpenQ > 0 && qNo >= rt.winOpenQ + expireN) {
    revertNet(me, opp);
    rt.stacks = 0;
    rt.disabled = true;
    rt.winSpent = true;
    rt.winOpenQ = 0;
  }

  if (triggerFired && !kinds.includes("once_per_battle") && !rt.winSpent) {
    rt.disabled = false;
    rt.increaseDisabled = false;
  }
  if (triggerFired) {
    rt.phaseIdx = qNo;
    rt.firedThisBattle = true;
  }

  const wantsPredicted = statSpecs.some((s) => (s as { mode: string }).mode === "predicted_status");
  if (wantsPredicted && triggerFired && !alreadyFired && rt.predictedStatus === null) {
    rt.predictedStatus = (
      ["poisoned", "burn", "paralysis", "sleep", "freeze", "confused"] as const
    )[Math.floor(rng() * 6)];
  }

  const skipThisQ = rt.disabledUntilQ === qNo;
  let didApply = false;
  let didRamp = false;

  if (!skipThisQ && !rt.disabled) {
    const rampArm =
      (triggerFired || (correct && alreadyFired && qNo > rt.phaseIdx)) &&
      !rt.increaseDisabled &&
      rt.stacks < 3;

    for (const raw of statSpecs) {
      const spec = raw as StatChangeSpec;
      if (!("stat" in spec) || !spec.stat) continue;
      const target = spec.target ?? "self";
      const t = target === "opponent" ? opp : me;
      const key = `${target}:${spec.stat}`;

      if (spec.mode === "ramp") {
        if (!rampArm) continue;
        const before = t.stages[spec.stat as Stat];
        bump(t, spec.stat as Stat, spec.perCorrect, rng);
        const delta = t.stages[spec.stat as Stat] - before;
        rt.netByStat[key] = (rt.netByStat[key] ?? 0) + delta;
        didRamp = true;
        didApply = true;
      } else if (spec.mode === "decay") {
        const cur = rt.netByStat[key] ?? 0;
        if (triggerFired) {
          if (cur !== 0) t.stages[spec.stat as Stat] = clampStage(t.stages[spec.stat as Stat] - cur);
          const before = t.stages[spec.stat as Stat];
          bump(t, spec.stat as Stat, spec.initial, rng);
          rt.netByStat[key] = t.stages[spec.stat as Stat] - before;
          didApply = true;
        } else if (qNo > rt.phaseIdx) {
          const target_total =
            spec.perQuestion < 0
              ? Math.max(spec.floor, cur + spec.perQuestion)
              : Math.min(spec.floor, cur + spec.perQuestion);
          const incr = target_total - cur;
          if (incr !== 0) {
            const before = t.stages[spec.stat as Stat];
            bump(t, spec.stat as Stat, incr, rng);
            rt.netByStat[key] = cur + (t.stages[spec.stat as Stat] - before);
            didApply = true;
          }
        }
      } else if (spec.mode === "one_shot") {
        if (triggerFired && !alreadyFired) {
          const before = { ...t.stages };
          bump(t, spec.stat as Stat | "random", spec.delta, rng);
          for (const k of ["attack", "defense", "speed", "crit"] as Stat[]) {
            const diff = t.stages[k] - before[k];
            if (diff !== 0) {
              const kk = `${target}:${k}`;
              rt.netByStat[kk] = (rt.netByStat[kk] ?? 0) + diff;
            }
          }
          didApply = true;
        }
      }
    }

    if (!correct && engine.incorrectStat?.length) {
      for (const spec of engine.incorrectStat) {
        const target = spec.target ?? "self";
        const t = target === "opponent" ? opp : me;
        const delta =
          "delta" in spec ? spec.delta : "perCorrect" in spec ? spec.perCorrect : 0;
        if (!delta) continue;
        const before = t.stages[spec.stat as Stat];
        bump(t, spec.stat as Stat, delta, rng);
        const key = `${target}:${spec.stat}`;
        rt.netByStat[key] = (rt.netByStat[key] ?? 0) + (t.stages[spec.stat as Stat] - before);
        didApply = true;
      }
    }

    if (didRamp) rt.stacks = Math.min(3, rt.stacks + 1);
    if (didApply) rt.phaseIdx = qNo;
  }

  if (kinds.includes("disable_next_question_after_effect")) {
    if (skipThisQ) rt.disabledUntilQ = -1;
    else if (didApply) rt.disabledUntilQ = qNo + 1;
  }
}

// ── DB effect application (the server-owned phases) ──────────────────────────
function applyDbEffects(
  me: Side,
  opp: Side,
  phase: DbEffect["phase"],
  rng: () => number,
  qNo: number,
): void {
  for (const e of DB_EFFECTS[me.dex] ?? []) {
    if (e.phase !== phase) continue;
    const t = e.target === "opponent" ? opp : me;
    const p = e.payload;
    switch (e.kind) {
      case "stat_stage":
        bump(t, p.stat as Stat, p.delta as number, rng);
        break;
      case "status": {
        if (typeof p.chance === "number" && rng() >= p.chance) break;
        if (
          Array.isArray(p.ifOpponentSpeciesAny) &&
          !(p.ifOpponentSpeciesAny as number[]).includes(opp.dex)
        )
          break;
        const kind =
          p.status === "random"
            ? (["poisoned", "burn", "paralysis", "sleep", "freeze", "confused"] as Status[])[
                Math.floor(rng() * 6)
              ]
            : (p.status as Status);
        applyStatus(t, kind, (p.questions as number) ?? 3);
        break;
      }
      case "heal":
        t.hp = Math.min(PVP_MAX_HP, t.hp + (p.amount as number));
        break;
      case "drain":
        opp.hp -= p.amount as number;
        me.hp = Math.min(PVP_MAX_HP, me.hp + (p.amount as number));
        break;
      case "cure":
        t.statuses = [];
        break;
      case "cleanse":
        me.hp -= Math.round((me.hp * (p.hpCostPct as number)) / 100);
        me.statuses = [];
        for (const k of ["attack", "defense", "speed"] as Stat[]) {
          if (me.stages[k] < 0) me.stages[k] = 0;
        }
        break;
      case "swap_stages": {
        // Manaphy: give the opponent our most-negative stage, take their best.
        const mine = (Object.keys(me.stages) as Stat[]).reduce((a, b) =>
          me.stages[a] <= me.stages[b] ? a : b,
        );
        const theirs = (Object.keys(opp.stages) as Stat[]).reduce((a, b) =>
          opp.stages[a] >= opp.stages[b] ? a : b,
        );
        const lo = me.stages[mine];
        const hi = opp.stages[theirs];
        if (lo < 0) {
          me.stages[mine] = 0;
          opp.stages[mine] = clampStage(opp.stages[mine] + lo);
        }
        if (hi > 0) {
          opp.stages[theirs] = 0;
          me.stages[theirs] = clampStage(me.stages[theirs] + hi);
        }
        break;
      }
      case "suppress_ability":
        opp.suppressedThroughQ = qNo + ((p.questions as number) ?? 3);
        break;
      case "stat_scale":
        // Ogerpon-style pokedex scaling — a full dex is not modelled; assume max.
        bump(me, p.stat as Stat, (p.max as number) ?? 1, rng);
        break;
      case "dot_frac_hp":
        opp.hp -= Math.round(PVP_MAX_HP * (p.pct as number));
        break;
      case "flat_next_question_damage":
        opp.hp -= p.amount as number;
        break;
      case "frac_hp_random": {
        const pct = (p.minPct as number) + rng() * ((p.maxPct as number) - (p.minPct as number));
        opp.hp -= Math.round(PVP_MAX_HP * pct);
        break;
      }
      case "frac_hp_current":
        opp.hp -= Math.round(opp.hp * (p.pct as number));
        break;
      case "instant_ko":
        if (rng() < (p.chance as number)) opp.hp = 0;
        break;
      case "predicted_status_apply":
        if (me.rt.predictedStatus)
          applyStatus(opp, me.rt.predictedStatus as Status, (p.questions as number) ?? 3);
        break;
      case "reflect_opponent_stat": {
        // Heart Swap: flip our negative stages positive.
        for (const k of ["attack", "defense", "speed", "crit"] as Stat[]) {
          if (me.stages[k] < 0) me.stages[k] = clampStage(-me.stages[k]);
        }
        break;
      }
      default:
        break;
    }
  }
}

function sigContext(
  me: Side,
  opp: Side,
  qIdx: number,
  correct: boolean,
  streakAfter: number,
  elapsedMs: number,
  totalMs: number,
): SignatureContext {
  return {
    correct,
    streak: streakAfter,
    questionIndex: qIdx,
    questionNo: qIdx + 1,
    elapsedMs,
    totalMs,
    category: "",
    answeredCategories: new Set<string>(),
    selfHpPct: me.hp / PVP_MAX_HP,
    oppHpPct: opp.hp / PVP_MAX_HP,
    selfAfflicted: me.statuses.length > 0,
    prevCorrect: false,
    prevElapsedMs: 0,
    pokedexCaught: 0,
    oppType: findPokemon(opp.dex)?.types ?? [],
    oppSpecies: opp.dex,
  } as unknown as SignatureContext;
}

/** One side's turn. Returns the damage it deals to `opp` this question. */
function takeTurn(
  me: Side,
  opp: Side,
  qIdx: number,
  skill: number,
  rng: () => number,
): number {
  const qNo = qIdx + 1;
  const suppressed = qNo <= me.suppressedThroughQ;

  // Freeze forfeits the question outright.
  if (has(me, "freeze")) {
    const f = me.statuses.find((s) => s.kind === "freeze")!;
    const thaws = f.cures <= 1 || rng() < 0.3;
    if (thaws) tickCure(me, "freeze");
    me.streak = 0;
    me.answered += 1;
    return 0;
  }

  let timer = timerMsForSpeedStage(me.stages.speed, PVP_BASE_TIMER_MS);
  if (has(me, "paralysis")) timer = Math.max(4000, Math.round(timer * 0.75));
  if (opp.oppTimerMs > 0 && qNo <= opp.oppTimerThroughQ && !opp.rt.disabled) {
    timer = Math.min(timer, opp.oppTimerMs);
  }
  // Answer time: skewed early. Sleep locks the first 40% of the window.
  let elapsed = timer * (0.12 + 0.75 * Math.pow(rng(), 1.4));
  if (has(me, "sleep")) elapsed = Math.max(elapsed, timer * 0.4 + timer * 0.15 * rng());
  elapsed = Math.min(elapsed, timer);

  const correct = rng() < skill;
  me.answered += 1;
  let dmg = 0;
  let selfDmg = 0;
  let landed = false;
  let streakAfter = 0;

  if (correct) {
    me.wrongStreak = 0;
    const confused = has(me, "confused");
    if (confused && rng() < 0.25) {
      tickCure(me, "confused");
      me.streak = 0;
    } else {
      me.streak += 1;
      streakAfter = me.streak;
      me.correct += 1;
      landed = true;

      const ctx = sigContext(me, opp, qIdx, true, streakAfter, elapsed, timer);
      const eng = me.engine;

      // No legacy passive_damage fold. The comment here used to claim those modifiers
      // "still fold in alongside the engine" — they never did. `evaluateHitModifiers`
      // (signature-abilities) bailed on every engine-owned row, i.e. all 104, so it
      // always returned NO_HIT_MODIFIERS. It was deleted 2026-07-13. The engine's own
      // multiplier is applied below via `evaluateSigMultiplier` (a DIFFERENT function
      // that happened to share the name — see the note in signature-abilities).
      const mods: HitModifiers = NO_HIT_MODIFIERS;

      if (eng?.latchOnTrigger && engineTriggerFired(eng.trigger, ctx)) me.latched = true;
      const triggerHeld =
        !!eng &&
        (engineTriggerFired(eng.trigger, ctx) || (eng.latchOnTrigger === true && me.latched));
      const multLive = !suppressed && !!eng && !me.rt.disabled && triggerHeld;
      const sigMult = multLive
        ? evaluateSigMultiplier(eng!.multiplier, {
            correct: true,
            oppType: findPokemon(opp.dex)?.types ?? [],
            oppSpecies: opp.dex,
            selfHpPct: me.hp / PVP_MAX_HP,
          })
        : NO_SIGNATURE_HIT_MODIFIERS;
      const indexFactor =
        !suppressed && eng && !me.rt.disabled
          ? evaluateIndexFactor(eng, {
              correct: true,
              questionNo: qNo,
              selfHpPct: me.hp / PVP_MAX_HP,
              oppHpPct: opp.hp / PVP_MAX_HP,
            })
          : 1;

      const speedRatio = Math.max(0, (timer - elapsed) / timer);
      const firstHalf = elapsed <= timer / 2;
      const baseAttack = mods.ignoreOwnNegativeStages
        ? Math.max(0, me.stages.attack)
        : me.stages.attack;
      const baseCrit = mods.ignoreOwnNegativeStages ? Math.max(0, me.stages.crit) : me.stages.crit;

      const { dmg: computed } = computePvpDamage({
        streak: streakAfter,
        speedRatio,
        attackStage: baseAttack + mods.bonusAttackStage,
        defenseStage: mods.ignoreOppDefenseStage ? 0 : opp.stages.defense,
        critStage: baseCrit + mods.bonusCritStage,
        firstHalf,
        burned: has(me, "burn"),
        hitFactor: sigMult.factor,
        ignoreDefense: sigMult.ignoreDefense,
        outgoingFactor: indexFactor,
        rng,
      });
      dmg = computed + (mods.secondHitFraction ? Math.round(computed * mods.secondHitFraction) : 0);

      // The legacy passive_damage side-effect route was here, gated on
      // `evaluatePassiveDamageSideEffects(...)` — which bailed on every engine-owned row
      // and so returned [] always. It never fired. Deleted with the function.
    }
  } else {
    me.streak = 0;
    me.wrongStreak += 1;
    if (me.wrongStreak === 2) applyStatus(me, "confused", 2);
    selfDmg = me.selfDmgZero ? 0 : 8;
  }

  // Defensive: the target's shield window and fixed-index receive-0 marks.
  if (dmg > 0) {
    // `receivePct` is a whole percent (0 = a total shield), like fixedIndex below.
    // Gated on the defender's row NOT being disabled — the server's
    // `_pvp_m4_window_active` does exactly this, and without it a shield outlives
    // the window that opened it.
    if (qNo <= opp.shieldThroughQ && opp.engine?.shield && !opp.rt.disabled) {
      dmg = Math.round(dmg * (opp.engine.shield.receivePct / 100));
    }
    const mark = opp.engine?.fixedIndex?.find(
      (f) => f.index === qNo && f.receiveDamagePct != null,
    );
    if (mark && !opp.rt.disabled) dmg = Math.round(dmg * (mark.receiveDamagePct! / 100));
  }

  // Poison bites once per question (migration 20260713120000). Poisoned = flat 5;
  // badly-poisoned ramps 5/10/15/20. Before this, poison dealt NOTHING in PvP and
  // every poison-based signature was close to worthless.
  for (const s of me.statuses) {
    if (s.kind === "poisoned") selfDmg += 5;
    else if (s.kind === "badly-poisoned") {
      s.ticks = (s.ticks ?? 0) + 1;
      selfDmg += 5 * Math.min(s.ticks, 4);
    }
  }

  me.hp -= selfDmg;

  // Status cure ticks (every answer).
  for (const k of ["poisoned", "badly-poisoned", "burn", "paralysis", "sleep"] as Status[]) {
    tickCure(me, k);
  }

  // The legacy post_answer path was here. Its comment claimed it "still fires for
  // `wiring: post_answer` rows, alongside the engine tick below (this is the shipped
  // behaviour)". That was false: it was gated on `evaluatePostAnswer(...)`, which bailed
  // on every engine-owned row — all 104 — so it returned [] and the phase never fired,
  // in the sim OR in the game. Deleted 2026-07-13 with the function. This is why the
  // `post_answer` rows still sitting in `pvp_signature_effects` are inert (the audit
  // reports them as INERT_POST_ANSWER).

  // Engine tick.
  const eng = me.engine;
  if (eng) {
    const ctx = sigContext(me, opp, qIdx, correct, streakAfter, elapsed, timer);
    const fired = engineTriggerFired(eng.trigger, ctx);

    const statSpecs: (StatChangeSpec | { mode: "predicted_status" })[] = [...(eng.stat ?? [])];
    if (eng.bespoke?.some((b) => b.fx === "predicted_status_reveal")) {
      statSpecs.push({ mode: "predicted_status" });
    }
    if (eng.multiplier) {
      const holds = multiplierConditionHolds(eng.multiplier.condition, {
        oppType: findPokemon(opp.dex)?.types ?? [],
        oppSpecies: opp.dex,
      });
      const conditional = holds ? eng.multiplier.onSuccess : eng.multiplier.fallback;
      if (conditional?.length) statSpecs.push(...conditional);
    }

    if (!suppressed) {
      tickEngine(me, opp, eng, qNo, correct, fired, statSpecs, rng);

      // engine.status rolls
      if (fired && !me.rt.disabled) {
        for (const st of eng.status ?? []) {
          if (st.ifOpponentSpeciesAny && !st.ifOpponentSpeciesAny.includes(opp.dex)) continue;
          if (rng() >= st.chance) continue;
          const kind =
            st.status === "random"
              ? (["poisoned", "burn", "paralysis", "sleep", "freeze", "confused"] as Status[])[
                  Math.floor(rng() * 6)
                ]
              : (st.status as Status);
          applyStatus(st.target === "opponent" ? opp : me, kind, st.questions);
        }
      }

      // Bespoke scheduling → server bespoke phase.
      const out = stepBespokeFx(eng.bespoke, me.fx, {
        questionNo: qNo,
        triggerFired: fired,
        disabled: me.rt.disabled,
        oppHpPct: opp.hp / PVP_MAX_HP,
        predictedStatus: me.rt.predictedStatus,
      });
      me.fx = out.state;
      if (out.fireBespoke) applyDbEffects(me, opp, "bespoke", rng, qNo);

      // Cosmog #789: its halve-HP is the PAYOFF of a phase window, so it fires off
      // the question number, NOT off the trigger (start_of_battle is long gone by
      // q4). live-pvp-battle-screen fires this before the trigger/disable gates.
      const ph = eng.phase;
      if (ph?.payoffEffect && qNo === (ph.payoffAtIndex ?? ph.windowN + 1)) {
        applyDbEffects(me, opp, "m4_fx", rng, qNo);
      }

      // Signature moves are AUTOMATIC (owner ruling 2026-07-13): the row's manual-
      // phase effects fire on its own engine trigger now, not on a button tap,
      // still capped at the uses they always had.
      if (fired && !me.rt.disabled && me.manualUsesLeft > 0) {
        me.manualUsesLeft -= 1;
        applyDbEffects(me, opp, "manual", rng, qNo);
      }

      // M4 channels, on a live trigger only.
      if (fired && !me.rt.disabled) {
        if (eng.bespoke?.some((b) => b.fx === "frac_hp_damage" || b.fx === "instant_ko")) {
          applyDbEffects(me, opp, "m4_fx", rng, qNo);
        }
        if (eng.shield) {
          me.shieldThroughQ = qNo + eng.shield.questions;
        }
        if (eng.opponentTimer) {
          me.oppTimerMs = eng.opponentTimer.ms;
          me.oppTimerThroughQ = qNo + eng.opponentTimer.questions;
        }
        if (eng.nullifySelfDamage) me.selfDmgZero = true;
      }
    }
  }

  return dmg;
}

export interface BattleResult {
  winner: 0 | 1 | null;
  hp: [number, number];
}

export function simulateBattle(
  dexA: number,
  dexB: number,
  skill: number,
  rng: () => number,
  opts: { abilityA?: boolean; abilityB?: boolean } = {},
): BattleResult {
  const a = makeSide(dexA, opts.abilityA ?? true);
  const b = makeSide(dexB, opts.abilityB ?? true);

  // NO battle_start DB effects — the phase no longer exists.
  //
  // It never fired in a live match: the battle screen gated it on
  // `evaluateBattleStart(...)` returning something, and that function bailed on every
  // engine-owned row — which is all 104 of them. Simulating it handed five abilities
  // an entry buff the game never gave them, which is why Zacian measured 60.9%
  // ("too strong") off a +1 Attack it does not actually get.
  //
  // The evaluator, the `"battle_start"` WiringMode, and the five `pvp_signature_effects`
  // rows (Zacian, Zamazenta, Wo-Chien, Fezandipiti, Ogerpon) were all deleted on
  // 2026-07-13. An ability that buffs on entry does it through its OWN engine trigger
  // (`start_of_battle`), which the tick below runs.
  // Eternatus-style hard matchup counters.
  for (const [me, opp] of [
    [a, b],
    [b, a],
  ] as [Side, Side][]) {
    const d = me.engine?.disable;
    if (d?.kind === "disabled_if_opponent_species" && d.dexIds.includes(opp.dex)) {
      me.rt.disabled = true;
      me.engine = null;
    }
  }

  for (let q = 0; q < QUESTIONS; q++) {
    const dmgA = takeTurn(a, b, q, skill, rng);
    const dmgB = takeTurn(b, a, q, skill, rng);
    b.hp -= dmgA;
    a.hp -= dmgB;

    // Ho-Oh's Sacred Fire — the `hp_reaches_zero` revive. Gated on the ability
    // actually being switched on, so the vs-neutral control does NOT get it.
    for (const me of [a, b]) {
      const rev = me.engine?.bespoke?.find((x) => x.fx === "revive");
      if (rev && me.hp <= 0 && !me.revived && !me.rt.disabled) {
        me.revived = true;
        // `hpPct` is a WHOLE percent (25), not a 0..1 fraction — the server does
        // round(120 * 0.25) = 30 HP. Reading it as a fraction here handed Ho-Oh a
        // 3000 HP bar and put it near the top of the first ranking.
        me.hp = Math.round(PVP_MAX_HP * (rev.hpPct / 100));
        me.stages.attack = clampStage(me.stages.attack + 1);
        if (rev.cure) me.statuses = [];
      }
    }

    if (a.hp <= 0 || b.hp <= 0) break;
  }

  if (a.hp === b.hp) {
    const accA = a.correct / Math.max(1, a.answered);
    const accB = b.correct / Math.max(1, b.answered);
    if (accA === accB) return { winner: null, hp: [a.hp, b.hp] };
    return { winner: accA > accB ? 0 : 1, hp: [a.hp, b.hp] };
  }
  return { winner: a.hp > b.hp ? 0 : 1, hp: [a.hp, b.hp] };
}

/** Deterministic RNG so a run is reproducible. */
export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
