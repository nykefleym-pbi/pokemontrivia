/**
 * Frozen shared contract for Training / Nearby-Battle combat FX cues.
 *
 * Both the local-player path (inline in the battle screen) and the opponent path
 * (the route's `pvp_live_effects` subscription) funnel every player-visible combat
 * event through ONE emit function so cue style, wording, ordering and motion are
 * identical for either side (spec Stories 2-5 + 7). This file declares the event
 * shapes and the emitter/consumer signatures only — no logic. Do not add runtime
 * code here; implementations live in the UI/UX cue module and the battle screen.
 *
 * Owners: Architect authors & freezes this file. Backend/Frontend/UI-UX import it.
 */

import type { ItemId } from "./game-data";

/** Which combatant an FX event is attributed to, from the local player's POV. */
export type BattleSide = "self" | "opponent";

/** The combat-status kinds a cue can announce (mirrors ActiveStatus["kind"]). */
export type BattleStatusKind =
  | "confused"
  | "poisoned"
  | "badly-poisoned"
  | "burn"
  | "paralysis"
  | "sleep"
  | "freeze";

/** Discriminator for the FX-event union. */
export type BattleFxKind =
  | "item"
  | "type-ability"
  | "signature"
  | "status-applied"
  | "status-expired"
  | "answer-result";

interface BattleFxBase {
  kind: BattleFxKind;
  /** Who the cue is attributed to. */
  side: BattleSide;
  /** Shared question slot this resolved on (for ordering / dedup). */
  questionIndex: number;
  /**
   * Stable idempotency key so the same underlying effect (e.g. a bot row that
   * arrives via both the effects broadcast and a row-diff) toasts at most once.
   */
  dedupeKey: string;
}

/** Item / berry used by either side (spec Story 2). */
export interface ItemFxEvent extends BattleFxBase {
  kind: "item";
  itemId: ItemId;
  /** true when the item was aimed at the OTHER combatant (berry debuffs). */
  hitsOpponent: boolean;
}

/** Non-legendary TYPE ability activation (spec Story 3). */
export interface TypeAbilityFxEvent extends BattleFxBase {
  kind: "type-ability";
  abilityId: string;
  /** true when the effect landed on the other combatant. */
  hitsOpponent: boolean;
}

/** Legendary/Mythical signature ability activation (spec Story 5). */
export interface SignatureFxEvent extends BattleFxBase {
  kind: "signature";
  /** Partner dex id — the cue resolves move name + description locally from this. */
  partnerId: number;
  hitsOpponent: boolean;
}

/** A status landed on a side (spec Story 4). */
export interface StatusAppliedFxEvent extends BattleFxBase {
  kind: "status-applied";
  status: BattleStatusKind;
  /** Remaining question-ticks the status will last, when known. */
  durationTicks?: number;
}

/** A status cleared / expired on a side (spec Story 4 removal cue). */
export interface StatusExpiredFxEvent extends BattleFxBase {
  kind: "status-expired";
  status: BattleStatusKind;
}

/** A slot resolved right/wrong for a side, including no-answer (spec Story 6). */
export interface AnswerResultFxEvent extends BattleFxBase {
  kind: "answer-result";
  correct: boolean;
  /** true when the side ran the slot out without submitting a choice. */
  noAnswer: boolean;
}

/** The full event union every cue flows through. */
export type BattleFxEvent =
  | ItemFxEvent
  | TypeAbilityFxEvent
  | SignatureFxEvent
  | StatusAppliedFxEvent
  | StatusExpiredFxEvent
  | AnswerResultFxEvent;

/**
 * The single cue path. Implemented by the UI/UX cue module; called by the battle
 * screen (local acts) and by the route subscription (opponent acts). The consumer
 * owns toast wording, emoji, motion and the legible ordering/queue for multiple
 * events in one slot (spec Story 7). Callers never call `toast` directly.
 */
export type EmitBattleFx = (event: BattleFxEvent) => void;

/** Toast severities a battle cue can surface. */
export type BattleToastLevel = "info" | "success" | "warning" | "error";

/** Extra presentation for a battle toast — matches Regular battle's grouped
 * `toast(title, { description, duration })` so activation + effect read as one. */
export interface BattleToastOptions {
  /** Secondary line under the title (e.g. the ability's effect). */
  description?: string | null;
  /** Override the default battle-cue duration (ms). */
  duration?: number;
}

/**
 * A plain battle toast (start-of-battle announcements and one-off attributions
 * that are NOT part of the frozen event union). Routed through the SAME
 * staggered queue as `emit` so every battle toast reads one-by-one instead of
 * a burst of simultaneous toasts blocking each other.
 */
export type NotifyBattleFx = (
  level: BattleToastLevel,
  message: string,
  opts?: BattleToastOptions,
) => void;

/** Shape the UI/UX cue hook returns to the battle screen + route. */
export interface BattleFxCueApi {
  emit: EmitBattleFx;
  notify: NotifyBattleFx;
}
