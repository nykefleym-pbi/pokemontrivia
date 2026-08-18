// The action/event vocabulary for a server-authoritative solo battle
// (02-architecture.md P3 scope), plus the pure turn engine for it.
//
// `applyAnswer` is a mechanical, behavior-preserving port of
// battle-screen.tsx's `handleAnswer` (the correct/wrong-answer branches) and
// `applyStatus`/`tickStatusCure`. It is verified byte-for-byte against the
// REAL, unmodified BattleMode component (not a possibly-stale snapshot) — see
// src/components/battle-screen-engine-verification.test.tsx, which renders
// battle-screen.tsx via React Testing Library AND drives `applyAnswer`
// through the identical fixed script, for all 51 rolled abilities plus the
// confused-miss and Elite/Weekly cases, and asserts the resulting
// playerHp/enemyHp/streak/won trajectory matches exactly (one documented
// exception: "stealth-rock", see that test — the engine fixes a stale-closure
// bug in the client's round-boundary chip rather than reproducing it). Any
// future change here MUST be re-verified the same way — falsify by running
// the comparison test, not by re-reading the code (see CLAUDE.md's
// signature-ability liveness precedent: this is the same class of risk, just
// a different ability system).
//
// Item support: `config.items`/`state.items` carry the 8 whole-battle
// auto-triggers (Assault Vest, King's Rock, Leftovers, Metronome, Silk Scarf,
// Revive, Focus Band, Oran Berry) plus X Attack, mirroring how `abilityId`
// already works — the CALLER (solo-battle-config.ts's resolveBattleSetup)
// resolves whether each is active/available from raw inventory/cooldown
// facts, the same way it resolves superEff/disadvantaged from raw types;
// this file never reaches into inventory state itself. `applyUseItem`
// handles the three manual heals (potion/superpotion/maxpotion) and X
// Attack's activation as their own action, since (unlike the auto-triggers)
// they're client-initiated mid-battle, not battle-start facts.
//
// DELIBERATELY NOT PORTED (documented gaps, not silent omissions):
//   - Quick Claw: resets the client's on-screen countdown, which has no
//     server-side equivalent — the engine already trusts whatever
//     `elapsedMs` the client reports for its speed-bonus math regardless of
//     how much real wall-clock time the player had, so Quick Claw needs no
//     engine change at all.
//   - scope/zoomlens/xaccuracy/repel: reveal-a-wrong-option (or skip) UI
//     hints. They can influence which choiceIdx a player is likely to
//     submit, but never the resulting math — the server independently
//     checks choiceIdx against the question's own answer key regardless of
//     any hint, so these have nothing for `applyAnswer` to model.
//   - escape: ends the battle early — already exactly `{ type: "forfeit" }`
//     (see `applyForfeit`); a caller wiring the manual-item UI to actions
//     should submit forfeit, not a new item case.
//   - amuletcoin/expcharm/luckypunch/starpiece/candy/bignugget/luckyegg/
//     choicespecs: reward-multiplier or out-of-battle economy effects
//     resolved at `finish()`, never touching the HP/streak/status trajectory
//     `applyAnswer` computes. Reward calculation is out of scope for this
//     module entirely (still resolved client-side).
//   - The poisoned-status tick is redefined as PER-TURN, not real-time. The
//     client's `startPoisonTick` runs a real `setInterval(…, 2000)` — there is
//     no equivalent "keep ticking in the background" concept for a
//     request/response server turn. Here, one poison tick (if the status is
//     active and the ability isn't magic-guard) resolves at the start of each
//     `applyAnswer` call instead, before that turn's own answer is scored.
//     This is a deliberate redesign for the turn-based server model, not a
//     bug — it is NOT verified against battle-screen.characterization.test's
//     ATTRITION_SCRIPT snapshots (those bake in the client's real-time tick
//     cadence, which this intentionally does not reproduce).
import type { ItemId } from "../content/items/item-def";
import type { AbilityId } from "../lib/abilities";
import { baseDamageForLevel, getTpMultiplier } from "../lib/level-curve";
import { streakMultiplier } from "./damage";
import { typeMatchup } from "../lib/type-chart";
import type { PokeType } from "../lib/pokemon-data.generated";
import type { Rng } from "./rng";

/** A client-submitted action in a solo battle. */
export type BattleAction =
  | { type: "submit_answer"; questionIdx: number; choiceIdx: number; elapsedMs: number }
  | { type: "use_item"; itemId: ItemId }
  | { type: "forfeit" };

/** A server-emitted event resulting from applying one BattleAction. */
export type BattleEvent =
  | { type: "damage_dealt"; target: "player" | "enemy"; amount: number; crit?: boolean }
  | { type: "type_effect"; attackType: PokeType; band: "immune" | "resisted" | "neutral" | "super"; multiplier: number }
  | { type: "status_applied"; target: "player" | "enemy"; kind: StatusKind }
  | { type: "status_cured"; target: "player" | "enemy"; kind: StatusKind }
  | { type: "item_consumed"; itemId: ItemId }
  | { type: "battle_ended"; won: boolean };

// Solo battle only ever applies these two — mirrors battle-screen.tsx's own
// local `type StatusKind = "confused" | "poisoned"` narrowing of the broader
// content/statuses vocabulary (burn/paralysis/sleep/freeze/badly-poisoned are
// PvP-only).
export type StatusKind = "confused" | "poisoned";

export interface BattleStatusEntry {
  kind: StatusKind;
  curesRemaining: number;
}

/** Mirrors battle-screen.tsx's `abilityStateRef` (minus `triggered`, which is
 *  purely a toast-dedup concern, not battle math). */
export interface BattleAbilityState {
  sturdyUsed: boolean;
  iceFirstWrongConsumed: boolean;
  hydrationUsed: boolean;
  cursedBodyPending: { hpBefore: number; appliedAtMs: number } | null;
  torrentUsed: boolean;
  sandForceUsed: number;
  moxieBonus: number;
  hadWrong: boolean;
  lastWasWrong: boolean;
  venom: number;
}

export function initialAbilityState(): BattleAbilityState {
  return {
    sturdyUsed: false,
    iceFirstWrongConsumed: false,
    hydrationUsed: false,
    cursedBodyPending: null,
    torrentUsed: false,
    sandForceUsed: 0,
    moxieBonus: 0,
    hadWrong: false,
    lastWasWrong: false,
    venom: 0,
  };
}

/** Per-battle consumption tracking for the item effects `applyAnswer`/
 *  `applyUseItem` model — mirrors `BattleAbilityState`'s "used once" flags,
 *  just for items instead of abilities. */
export interface BattleItemState {
  silkScarfUsed: boolean;
  focusBandUsed: boolean;
  reviveUsed: boolean;
  oranBerryUsed: boolean;
  /** Set by `applyUseItem("xattack")`; consumed by the next correct answer. */
  xAttackActive: boolean;
}

export function initialItemState(): BattleItemState {
  return {
    silkScarfUsed: false,
    focusBandUsed: false,
    reviveUsed: false,
    oranBerryUsed: false,
    xAttackActive: false,
  };
}

/** Mirrors src/lib/store/slices/itemsSlice.ts's MAX_ITEMS_PER_BATTLE (3) —
 *  duplicated by hand, not imported: engine/** cannot import from lib/store/**
 *  (the isomorphic engine/content boundary eslint enforces), and this is a
 *  single small integer, not battle math that could silently drift. If the
 *  client's cap ever changes, update this too. */
export const MAX_ITEMS_PER_BATTLE = 3;

export interface BattleState {
  playerHp: number;
  enemyHp: number;
  streak: number;
  maxStreak: number;
  wrongStreak: number;
  correctCount: number;
  topDmg: number;
  /** Cumulative real time elapsed in the battle, in ms — the sum of every
   *  action's `elapsedMs` so far. Used only for Cursed Body's 5s window. */
  clockMs: number;
  statuses: BattleStatusEntry[];
  ability: BattleAbilityState;
  items: BattleItemState;
  /** Manual + auto item uses so far, capped at MAX_ITEMS_PER_BATTLE — mirrors
   *  the client's shared budget across ALL items (see the module doc). The
   *  whole-battle auto-triggers (Assault Vest/King's Rock/Leftovers/
   *  Metronome) each consume one slot too, already reflected in whatever
   *  `startingCount` the caller passes in — see solo-battle-config.ts's
   *  `resolveBattleSetup`. */
  itemsUsedThisBattleCount: number;
  phase: "in_progress" | "won" | "lost";
}

export function initialBattleState(
  playerMaxHp: number,
  enemyMaxHp: number,
  startingItemsUsedCount = 0,
): BattleState {
  return {
    playerHp: playerMaxHp,
    enemyHp: enemyMaxHp,
    streak: 0,
    maxStreak: 0,
    wrongStreak: 0,
    correctCount: 0,
    topDmg: 0,
    clockMs: 0,
    statuses: [],
    ability: initialAbilityState(),
    items: initialItemState(),
    itemsUsedThisBattleCount: startingItemsUsedCount,
    phase: "in_progress",
  };
}

/** Everything about the battle that's fixed for its whole duration — the
 *  equivalent of battle-screen.tsx's per-battle memoized values (superEff,
 *  disadvantaged, immune) and store reads (level, TP) hoisted into one input
 *  rather than re-derived every turn. */
export interface BattleConfig {
  abilityId: AbilityId | null;
  level: number;
  isElite: boolean;
  isWeekly: boolean;
  playerMaxHp: number;
  enemyMaxHp: number;
  superEff: boolean;
  disadvantaged: boolean;
  immune: boolean;
  /** Raw types for the per-question type-effectiveness roll (typeMatchup). The
   *  booleans above stay for the whole-battle ability flags and intro banner;
   *  these drive the correct-answer damage multiplier, which is rolled fresh
   *  each question. */
  playerTypes: PokeType[];
  enemyTypes: PokeType[];
  /** Player's LIFETIME Training Points for this partner (balance + spent) —
   *  feeds getTpMultiplier. Lifetime rather than balance so evolving, which
   *  spends the balance, doesn't drop the partner's damage multiplier; see
   *  `lifetimeTp`. Named for the cfg field it is copied from, which is
   *  persisted on solo_battles rows and so cannot be renamed freely. */
  trainingPoints: number;
  /** Extra timer seconds this battle (Sand Veil's onBattleStart effect). */
  bonusTime: number;
  /** True if the player's partner has the Normal type — feeds Silk Scarf's
   *  bonus multiplier, which differs for Normal-type partners. A raw fact
   *  (not a derived matchup boolean), like `playerMaxHp`. */
  isNormalType: boolean;
  items: BattleItemConfig;
}

/** Whole-battle item facts, claimed by the caller at battle start (mirrors
 *  `abilityId`'s trust tier — resolved from the authenticated client's
 *  inventory/cooldown state, not independently verified server-side; see
 *  solo-battle-config.ts's module doc). */
export interface BattleItemConfig {
  assaultVestActive: boolean;
  kingsRockActive: boolean;
  leftoversActive: boolean;
  metronomeActive: boolean;
  /** Claimed as unused/in-inventory; consumed on the first correct answer. */
  silkScarfAvailable: boolean;
  focusBandAvailable: boolean;
  reviveAvailable: boolean;
  oranBerryAvailable: boolean;
}

const TIMER_BASE = 20;
const QUESTIONS_PER_SET = 5;

/** The one piece of trivia-content knowledge `applyAnswer` needs that the
 *  engine itself can't know (it has no access to the question bank): whether
 *  the submitted choice was correct. The caller (the battle-solo Edge
 *  Function, which holds the question set) resolves `BattleAction.submit_answer`
 *  into this before calling in — that resolution is a content lookup, not
 *  battle math, so it stays out of this isomorphic module. */
export interface AnswerInput {
  correct: boolean;
  /** 0-indexed position of the question just answered within the battle. */
  questionIdx: number;
  elapsedMs: number;
}

export interface ApplyAnswerResult {
  state: BattleState;
  events: BattleEvent[];
}

function withMajorStatus(
  statuses: BattleStatusEntry[],
  entry: BattleStatusEntry,
): BattleStatusEntry[] {
  // Solo's only major status is "poisoned" ("confused" is the sole volatile
  // and coexists with everything) — mirrors store.ts's applyBattleStatus.
  const withoutSameKind = statuses.filter((s) => s.kind !== entry.kind);
  const withoutOtherMajors =
    entry.kind === "poisoned" ? withoutSameKind.filter((s) => s.kind !== "poisoned") : withoutSameKind;
  return [...withoutOtherMajors, entry];
}

function tickCure(statuses: BattleStatusEntry[], kind: StatusKind): { statuses: BattleStatusEntry[]; cleared: boolean } {
  const cleared = statuses.some((s) => s.kind === kind && s.curesRemaining === 1);
  const next = statuses
    .map((s) => (s.kind === kind ? { ...s, curesRemaining: s.curesRemaining - 1 } : s))
    .filter((s) => s.curesRemaining > 0);
  return { statuses: next, cleared };
}

/** Mirrors battle-screen.tsx's `applyStatus`. Returns the updated status list
 *  and any events; a no-op (Hydration's first-confuse block) returns the
 *  input list unchanged. */
function applyStatus(
  statuses: BattleStatusEntry[],
  kind: StatusKind,
  ability: BattleAbilityState,
  abilityId: AbilityId | null,
): { statuses: BattleStatusEntry[]; ability: BattleAbilityState; events: BattleEvent[] } {
  if (kind === "confused" && abilityId === "hydration" && !ability.hydrationUsed) {
    return { statuses, ability: { ...ability, hydrationUsed: true }, events: [] };
  }
  const curesRemaining = kind === "confused" ? (abilityId === "toxic" ? 1 : 2) : 3;
  const nextStatuses = withMajorStatus(statuses, { kind, curesRemaining });
  return {
    statuses: nextStatuses,
    ability,
    events: [{ type: "status_applied", target: "player", kind }],
  };
}

/**
 * Pure port of `loadQuestion`'s Stealth Rock chip: 3 damage to the enemy at
 * the start of every round after the first (`questionIdx > 0 && % 5 === 0`).
 * This is a question-LOAD-time trigger, not a per-answer one — matching
 * `handleAnswer`, `applyAnswer` doesn't call this itself. The caller invokes
 * it once per question, right before resolving that question's answer, for
 * every `questionIdx` (not just stealth-rock battles — the ability check is
 * inside).
 */
export function applyRoundStart(
  state: BattleState,
  config: BattleConfig,
  questionIdx: number,
): ApplyAnswerResult {
  if (state.phase !== "in_progress") return { state, events: [] };
  if (config.abilityId !== "stealth-rock" || questionIdx === 0 || questionIdx % QUESTIONS_PER_SET !== 0) {
    return { state, events: [] };
  }
  const enemyHp = Math.max(0, state.enemyHp - 3);
  const events: BattleEvent[] = [{ type: "damage_dealt", target: "enemy", amount: 3 }];
  if (enemyHp <= 0) {
    events.push({ type: "battle_ended", won: true });
    return { state: { ...state, enemyHp: 0, phase: "won" }, events };
  }
  return { state: { ...state, enemyHp }, events };
}

/**
 * Pure port of `handleAnswer`'s correct/wrong branches. One `applyAnswer`
 * call is one submitted answer; the poisoned-status tick (see the module
 * doc's redesign note) resolves first, before this turn's own answer.
 */
export function applyAnswer(
  state: BattleState,
  config: BattleConfig,
  input: AnswerInput,
  rng: Rng,
): ApplyAnswerResult {
  if (state.phase !== "in_progress") return { state, events: [] };

  const events: BattleEvent[] = [];
  let s: BattleState = { ...state, clockMs: state.clockMs + input.elapsedMs };

  // ── Poisoned tick (per-turn redesign — see module doc) ──────────────────
  if (s.statuses.some((st) => st.kind === "poisoned") && config.abilityId !== "magic-guard") {
    const tick = Math.max(1, Math.floor(config.playerMaxHp * 0.02));
    const nextHp = Math.max(0, s.playerHp - tick);
    events.push({ type: "damage_dealt", target: "player", amount: tick });
    s = { ...s, playerHp: nextHp };
    if (nextHp <= 0) {
      events.push({ type: "battle_ended", won: false });
      return { state: { ...s, phase: "lost" }, events };
    }
  }

  const abilityId = config.abilityId;
  let ability = s.ability;
  let statuses = s.statuses;
  let items = s.items;
  let itemsUsedThisBattleCount = s.itemsUsedThisBattleCount;

  if (input.correct) {
    const correctCount = s.correctCount + 1;
    const wrongStreak = 0;

    // Confused miss: 25% chance to do nothing.
    if (statuses.some((st) => st.kind === "confused") && rng.chance(0.25)) {
      const cure = tickCure(statuses, "confused");
      if (cure.cleared) events.push({ type: "status_cured", target: "player", kind: "confused" });
      return {
        state: {
          ...s,
          statuses: cure.statuses,
          correctCount,
          wrongStreak,
          streak: 0,
        },
        events,
      };
    }

    const newStreak = s.streak + 1;
    const maxStreak = Math.max(s.maxStreak, newStreak);

    let baseDmg = config.isElite || config.isWeekly ? 10 : baseDamageForLevel(config.level);
    if (abilityId === "dragon-dance") baseDmg += Math.floor(input.questionIdx / QUESTIONS_PER_SET);
    // Metronome locks the streak multiplier at its max value all battle.
    let dmg = Math.round(baseDmg * (config.items.metronomeActive ? 3.0 : streakMultiplier(newStreak)));

    const tpMult = getTpMultiplier(config.trainingPoints);
    if (tpMult > 1.0) dmg = Math.round(dmg * tpMult);

    const elapsedSec = input.elapsedMs / 1000;
    const totalTime = TIMER_BASE + config.bonusTime;
    const speedRatio = Math.max(0, (totalTime - elapsedSec) / totalTime);
    let speedBonus = Math.round(5 * speedRatio);
    if (abilityId === "aerilate") speedBonus = Math.round(speedBonus * 1.5);
    if (abilityId === "swift-swim") speedBonus = Math.max(3, speedBonus);
    dmg += speedBonus;

    // Per-question type effectiveness (owner ruling 2026-08-04): the attacker
    // rolls one of its types this question and the mainline product against the
    // enemy's type(s) scales the hit (immune floored to 0.25×). Replaces the old
    // whole-battle `superEff ? ×2` flag; `config.superEff` still drives the
    // intro banner and the flag-reading abilities below.
    const matchup = typeMatchup(config.playerTypes, config.enemyTypes, input.questionIdx);
    if (matchup.multiplier !== 1) dmg = Math.max(1, Math.round(dmg * matchup.multiplier));
    events.push({
      type: "type_effect",
      attackType: matchup.attackType,
      band: matchup.band,
      multiplier: matchup.multiplier,
    });
    if (items.xAttackActive) {
      dmg += 20;
      items = { ...items, xAttackActive: false };
    }
    // Silk Scarf: bonus on the first correct answer only, once per battle.
    if (
      config.items.silkScarfAvailable &&
      !items.silkScarfUsed &&
      itemsUsedThisBattleCount < MAX_ITEMS_PER_BATTLE
    ) {
      dmg = Math.round(dmg * (config.isNormalType ? 1.75 : 1.5));
      items = { ...items, silkScarfUsed: true };
      itemsUsedThisBattleCount += 1;
    }
    if (abilityId === "tailwind" && input.questionIdx < 3) dmg = Math.round(dmg * 1.2);
    if (abilityId === "guts" && s.playerHp < config.playerMaxHp / 2) dmg = Math.round(dmg * 1.15);
    if (abilityId === "flash-fire") dmg = Math.round(dmg * 1.08);
    if (abilityId === "no-guard") dmg = Math.round(dmg * 1.18);
    if (abilityId === "blaze" && s.playerHp < config.playerMaxHp * 0.4) dmg = Math.round(dmg * 1.2);
    if (abilityId === "overgrow" && s.enemyHp > config.enemyMaxHp / 2) dmg = Math.round(dmg * 1.12);
    if (abilityId === "bulldoze" && config.disadvantaged) dmg = Math.round(dmg * 1.25);
    if (abilityId === "acrobatics" && s.playerHp === config.playerMaxHp) dmg = Math.round(dmg * 1.3);
    if (abilityId === "berserk" && ability.hadWrong) dmg = Math.round(dmg * 1.12);
    if (abilityId === "hex" && statuses.length > 0) dmg = Math.round(dmg * 1.3);
    if (abilityId === "dark-aura" && (config.isElite || config.isWeekly)) dmg = Math.round(dmg * 1.1);
    if (abilityId === "even-tempo" && !config.superEff && !config.disadvantaged && !config.immune) dmg += 2;
    if (abilityId === "charge") dmg += 2;
    if (abilityId === "swarm" && newStreak >= 3) dmg += 3;
    if (abilityId === "moonblast" && newStreak >= 3) dmg += 4;
    if (abilityId === "volt-absorb" && elapsedSec <= 5) dmg += 3;
    if (abilityId === "counter" && ability.lastWasWrong) dmg += 4;

    let moxieBonus = ability.moxieBonus;
    if (abilityId === "moxie") {
      dmg += moxieBonus;
      if (newStreak > 0 && newStreak % 3 === 0) moxieBonus += 1;
    }

    // Poison Touch: venom from the previous correct answer lands now.
    dmg += ability.venom;
    let venom = 0;
    if (abilityId === "poison-touch") venom = 2;
    const lastWasWrong = false;

    const newEnemyHp = Math.max(0, s.enemyHp - dmg);
    const topDmg = Math.max(s.topDmg, dmg);
    events.push({ type: "damage_dealt", target: "enemy", amount: dmg });

    let playerHp = s.playerHp;
    // Leftovers: +5 HP after every correct answer, whole battle.
    if (config.items.leftoversActive) playerHp = Math.min(config.playerMaxHp, playerHp + 5);
    if (abilityId === "leech-seed") playerHp = Math.min(config.playerMaxHp, playerHp + 2);
    if (abilityId === "ice-body" && correctCount % 4 === 0) {
      playerHp = Math.min(config.playerMaxHp, playerHp + 6);
    }
    if (abilityId === "pixie-dust" && newStreak > 0 && newStreak % 3 === 0) {
      playerHp = Math.min(config.playerMaxHp, playerHp + 5);
    }
    let cursedBodyPending = ability.cursedBodyPending;
    if (abilityId === "cursed-body" && cursedBodyPending) {
      if (s.clockMs - cursedBodyPending.appliedAtMs <= 5000) {
        playerHp = cursedBodyPending.hpBefore;
      }
      cursedBodyPending = null;
    }

    const confuseCure = tickCure(statuses, "confused");
    if (confuseCure.cleared) events.push({ type: "status_cured", target: "player", kind: "confused" });
    const poisonCure = tickCure(confuseCure.statuses, "poisoned");
    if (poisonCure.cleared) events.push({ type: "status_cured", target: "player", kind: "poisoned" });
    statuses = poisonCure.statuses;

    ability = {
      ...ability,
      moxieBonus,
      venom,
      lastWasWrong,
      cursedBodyPending,
    };

    if (newEnemyHp <= 0) {
      events.push({ type: "battle_ended", won: true });
      return {
        state: {
          ...s,
          playerHp,
          enemyHp: 0,
          streak: newStreak,
          maxStreak,
          wrongStreak,
          correctCount,
          topDmg,
          statuses,
          ability,
          items,
          itemsUsedThisBattleCount,
          phase: "won",
        },
        events,
      };
    }

    return {
      state: {
        ...s,
        playerHp,
        enemyHp: newEnemyHp,
        streak: newStreak,
        maxStreak,
        wrongStreak,
        correctCount,
        topDmg,
        statuses,
        ability,
        items,
        itemsUsedThisBattleCount,
      },
      events,
    };
  }

  // ── Wrong answer ──────────────────────────────────────────────────────────
  const wrongStreak = s.wrongStreak + 1;

  let wrongDmg = 10;
  // The opponent counterattacks on a miss: roll the ENEMY's attack type into
  // the PLAYER (roles swapped from the correct-answer hit), so a wrong answer
  // is scaled by the real Gen 6+ matchup — 0.25/0.5/1/2/4 — instead of the old
  // flat 5/10/15 flags. Immune floors to 0.25x (never 0), same as the offense.
  const wrongMatchup = typeMatchup(config.enemyTypes, config.playerTypes, input.questionIdx);
  if (wrongMatchup.multiplier !== 1) wrongDmg = Math.max(1, Math.round(wrongDmg * wrongMatchup.multiplier));
  if (abilityId === "no-guard") wrongDmg += 2;
  if (config.items.assaultVestActive) wrongDmg = Math.floor(wrongDmg / 2);
  // King's Rock: 50% chance to negate wrong-answer HP loss entirely, whole battle.
  if (config.items.kingsRockActive && rng.chance(0.5)) wrongDmg = 0;

  if (abilityId === "multiscale" && s.playerHp === config.playerMaxHp) wrongDmg = Math.floor(wrongDmg / 2);
  if (abilityId === "filter" && config.disadvantaged) wrongDmg = Math.floor(wrongDmg * 0.75);
  if (abilityId === "slush-rush" && config.disadvantaged) wrongDmg = Math.max(0, wrongDmg - 5);
  if (abilityId === "iron-barbs") wrongDmg = Math.max(0, wrongDmg - 3);
  if (abilityId === "solid-rock" && wrongDmg > 12) wrongDmg = 12;
  if (abilityId === "static" && rng.chance(0.2)) wrongDmg = Math.floor(wrongDmg / 2);
  let iceFirstWrongConsumed = ability.iceFirstWrongConsumed;
  if (abilityId === "snow-cloak" && !iceFirstWrongConsumed) {
    wrongDmg = 0;
    iceFirstWrongConsumed = true;
  }
  if (abilityId === "flame-body" && rng.chance(0.15)) wrongDmg = 0;
  if (abilityId === "cute-charm" && rng.chance(0.15)) wrongDmg = 0;

  let cursedBodyPending = ability.cursedBodyPending;
  if (abilityId === "cursed-body") {
    cursedBodyPending = { hpBefore: s.playerHp, appliedAtMs: s.clockMs };
  }

  let newPlayerHp = Math.max(0, s.playerHp - wrongDmg);
  let sturdyUsed = ability.sturdyUsed;
  if (abilityId === "sturdy" && newPlayerHp <= 0 && !sturdyUsed) {
    newPlayerHp = 1;
    sturdyUsed = true;
  }

  // Revive: survive a would-be KO at 25% max HP, once per battle.
  let reviveUsed = items.reviveUsed;
  if (
    newPlayerHp <= 0 &&
    config.items.reviveAvailable &&
    !reviveUsed &&
    itemsUsedThisBattleCount < MAX_ITEMS_PER_BATTLE
  ) {
    newPlayerHp = Math.round(config.playerMaxHp * 0.25);
    reviveUsed = true;
    itemsUsedThisBattleCount += 1;
  }

  // Focus Band: auto-heal to 50% max HP when HP is 10 or below, once per week.
  let focusBandUsed = items.focusBandUsed;
  if (
    newPlayerHp <= 10 &&
    config.items.focusBandAvailable &&
    !focusBandUsed &&
    itemsUsedThisBattleCount < MAX_ITEMS_PER_BATTLE
  ) {
    newPlayerHp = Math.round(config.playerMaxHp * 0.5);
    focusBandUsed = true;
    itemsUsedThisBattleCount += 1;
  }

  let torrentUsed = ability.torrentUsed;
  if (abilityId === "torrent" && !torrentUsed && newPlayerHp > 0 && newPlayerHp < config.playerMaxHp * 0.3) {
    torrentUsed = true;
    newPlayerHp = Math.min(config.playerMaxHp, newPlayerHp + 10);
  }

  // Oran Berry: auto-heal 15 HP the instant HP first drops below 30% max, once per battle.
  let oranBerryUsed = items.oranBerryUsed;
  if (
    newPlayerHp > 0 &&
    newPlayerHp < config.playerMaxHp * 0.3 &&
    config.items.oranBerryAvailable &&
    !oranBerryUsed &&
    itemsUsedThisBattleCount < MAX_ITEMS_PER_BATTLE
  ) {
    newPlayerHp = Math.min(config.playerMaxHp, newPlayerHp + 15);
    oranBerryUsed = true;
    itemsUsedThisBattleCount += 1;
  }

  events.push({ type: "damage_dealt", target: "player", amount: wrongDmg });

  let sandForceUsed = ability.sandForceUsed;
  let streak = s.streak;
  const keepStreak = abilityId === "sand-force" && sandForceUsed < 2;
  if (keepStreak) {
    sandForceUsed += 1;
  } else {
    streak = 0;
  }

  // Chip damage to the enemy (Corrosion / Shadow Tag / landed venom).
  let chip = ability.venom;
  const venom = 0;
  if (abilityId === "corrosion") chip += 2;
  if (abilityId === "shadow-tag" && wrongDmg > 0) chip += 2;
  let enemyHp = s.enemyHp;
  if (chip > 0 && newPlayerHp > 0) {
    enemyHp = Math.max(0, enemyHp - chip);
    if (chip > 0) events.push({ type: "damage_dealt", target: "enemy", amount: chip });
  }

  ability = {
    ...ability,
    sturdyUsed,
    iceFirstWrongConsumed,
    torrentUsed,
    sandForceUsed,
    venom,
    cursedBodyPending,
    hadWrong: true,
    lastWasWrong: true,
  };

  items = {
    ...items,
    reviveUsed,
    focusBandUsed,
    oranBerryUsed,
  };

  if (enemyHp <= 0) {
    events.push({ type: "battle_ended", won: true });
    return {
      state: {
        ...s,
        playerHp: newPlayerHp,
        enemyHp: 0,
        streak,
        wrongStreak,
        statuses,
        ability,
        items,
        itemsUsedThisBattleCount,
        phase: "won",
      },
      events,
    };
  }

  // Status thresholds (Amnesia delays both by one wrong answer).
  const confuseAt = abilityId === "amnesia" ? 3 : 2;
  const poisonAt = abilityId === "amnesia" ? 6 : 5;
  if (wrongStreak === confuseAt && !statuses.some((st) => st.kind === "confused") && abilityId !== "shield-dust") {
    const applied = applyStatus(statuses, "confused", ability, abilityId);
    statuses = applied.statuses;
    ability = applied.ability;
    events.push(...applied.events);
  }
  if (wrongStreak === poisonAt && !statuses.some((st) => st.kind === "poisoned") && abilityId !== "toxic") {
    const applied = applyStatus(statuses, "poisoned", ability, abilityId);
    statuses = applied.statuses;
    ability = applied.ability;
    events.push(...applied.events);
  }

  if (newPlayerHp <= 0) {
    events.push({ type: "battle_ended", won: false });
    return {
      state: {
        ...s,
        playerHp: 0,
        enemyHp,
        streak,
        wrongStreak,
        statuses,
        ability,
        items,
        itemsUsedThisBattleCount,
        phase: "lost",
      },
      events,
    };
  }

  return {
    state: {
      ...s,
      playerHp: newPlayerHp,
      enemyHp,
      streak,
      wrongStreak,
      statuses,
      ability,
      items,
      itemsUsedThisBattleCount,
    },
    events,
  };
}

/**
 * Pure port of `tryUseItem`'s battle-math-affecting manual items: the three
 * flat heals and X Attack's activation. Other itemIds (scope/zoomlens/
 * xaccuracy/repel/escape/etc.) have nothing for this function to do — see
 * the module doc for why — and are a no-op here; the caller decides whether
 * to even forward them.
 */
export function applyUseItem(
  state: BattleState,
  config: BattleConfig,
  itemId: ItemId,
): ApplyAnswerResult {
  if (state.phase !== "in_progress") return { state, events: [] };
  if (itemId !== "potion" && itemId !== "superpotion" && itemId !== "maxpotion" && itemId !== "xattack") {
    return { state, events: [] };
  }
  // Shared budget with the auto-triggers — mirrors useItem()'s own cap check.
  if (state.itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE) return { state, events: [] };
  const itemsUsedThisBattleCount = state.itemsUsedThisBattleCount + 1;

  const healMult = config.abilityId === "synthesis" ? 1.5 : 1;
  let playerHp = state.playerHp;
  if (itemId === "potion") playerHp = Math.min(config.playerMaxHp, playerHp + Math.round(30 * healMult));
  else if (itemId === "superpotion") {
    playerHp = Math.min(config.playerMaxHp, playerHp + Math.round(60 * healMult));
  } else if (itemId === "maxpotion") playerHp = config.playerMaxHp;
  else {
    return {
      state: {
        ...state,
        items: { ...state.items, xAttackActive: true },
        itemsUsedThisBattleCount,
      },
      events: [{ type: "item_consumed", itemId }],
    };
  }

  return {
    state: { ...state, playerHp, itemsUsedThisBattleCount },
    events: [{ type: "item_consumed", itemId }],
  };
}

/** Pure port of the forfeit path — ends the battle as a loss immediately. */
export function applyForfeit(state: BattleState): ApplyAnswerResult {
  if (state.phase !== "in_progress") return { state, events: [] };
  return {
    state: { ...state, phase: "lost" },
    events: [{ type: "battle_ended", won: false }],
  };
}

/** Shared shape validator for a client-submitted `BattleAction` — used by
 *  both battle-solo (live submit_action) and save-sync (replaying a queued
 *  offline battle's whole log), so the two Edge Functions never drift on
 *  what counts as a well-formed action. */
export function isValidBattleAction(action: unknown): action is BattleAction {
  if (!action || typeof action !== "object") return false;
  const a = action as Record<string, unknown>;
  if (a.type === "forfeit") return true;
  if (a.type === "use_item") return typeof a.itemId === "string";
  if (a.type === "submit_answer") {
    return (
      typeof a.questionIdx === "number" &&
      typeof a.choiceIdx === "number" &&
      typeof a.elapsedMs === "number"
    );
  }
  return false;
}
