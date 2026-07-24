/**
 * useBattleFxCues — the single UI/UX cue module that implements the frozen
 * `EmitBattleFx` contract (`src/lib/training-battle-fx-types.ts`).
 *
 * Both combat-cue sources funnel through the one `emit` this hook returns:
 *   - the local player path (inline in `live-pvp-battle-screen.tsx`), and
 *   - the opponent path (the route's `pvp_live_effects` subscription).
 * Callers NEVER call `toast` directly — they build a `BattleFxEvent` and emit it
 * so wording, emoji, toast level, ordering and motion are identical for either
 * side (spec Stories 2-5 + 7).
 *
 * Wording/emoji are kept at parity with the strings the battle screen + route
 * shipped before this refactor; the underlying names are resolved LOCALLY from
 * ids via the same helper fns those files use (never trusted off the wire).
 *
 * Story 7 (multiple effects in one slot): events are de-duplicated by
 * `dedupeKey` within a question slot and released through a small staggered
 * queue in a stable by-kind order so a burst reads legibly instead of a stack
 * of toasts firing at once.
 */
import * as React from "react";
import { toast } from "sonner";

import { ITEMS, STATUS_META } from "@/lib/game-data";
import { getAbilityById, type AbilityId } from "@/lib/abilities";
import { signatureMoveName, describeSignatureEffect } from "@/lib/signature-abilities";
import { typeAbilityPvp } from "@/lib/pvp-type-abilities";
import type {
  BattleFxCueApi,
  BattleFxEvent,
  BattleFxKind,
  BattleToastOptions,
} from "@/lib/training-battle-fx-types";

type ToastLevel = "info" | "success" | "warning" | "error";

interface Cue {
  level: ToastLevel;
  message: string;
  /** Secondary line — the ability's effect, so activation + effect read as one. */
  description?: string | null;
}

/**
 * Stable release order when several cues land in one slot (Story 7): the slot's
 * outcome first, then the actions taken (item/ability/signature), then the
 * resulting status changes (clears before new statuses land).
 */
const KIND_ORDER: readonly BattleFxKind[] = [
  "answer-result",
  "item",
  "type-ability",
  "signature",
  "status-expired",
  "status-applied",
];

// At least ~1s between toasts so a burst never stacks up and blocks the last
// one before it can be read (feedback: toasts were overwhelming at 350ms).
const DEFAULT_STAGGER_MS = 1200;
// Battle-cue lifetime — short enough that a paced sequence never piles up, in
// the same ballpark as Regular battle's ability toasts (2200ms).
const DEFAULT_DURATION_MS = 2600;

function showToast(level: ToastLevel, message: string, opts?: BattleToastOptions): void {
  const o = {
    description: opts?.description ?? undefined,
    duration: opts?.duration ?? DEFAULT_DURATION_MS,
  };
  switch (level) {
    case "success":
      toast.success(message, o);
      break;
    case "warning":
      toast.warning(message, o);
      break;
    case "error":
      toast.error(message, o);
      break;
    default:
      toast.info(message, o);
  }
}

/**
 * Pure event → cue mapping (no React state). Returns `null` when an event should
 * NOT surface a toast (e.g. an *answered* answer-result, which already has its
 * own in-battle feedback — only a no-answer needs a cue).
 */
function resolveCue(event: BattleFxEvent): Cue | null {
  const mine = event.side === "self";

  switch (event.kind) {
    case "item": {
      const def = ITEMS.find((i) => i.id === event.itemId);
      if (!def) return null;
      // Some items carry no emoji (they rely on their sprite); skip the prefix
      // so the toast doesn't start with a stray space.
      const pre = def.emoji ? `${def.emoji} ` : "";
      if (mine) {
        return {
          // Offensive berry reads as a positive action; self buffs/reveals stay
          // low-key info — matches the shipped local-item toast levels.
          level: event.hitsOpponent ? "success" : "info",
          message: event.hitsOpponent
            ? `${pre}You used ${def.name} on the opponent!`
            : `${pre}You used ${def.name}.`,
        };
      }
      return event.hitsOpponent
        ? { level: "warning", message: `${pre}Opponent's ${def.name} hit you!` }
        : { level: "info", message: `${pre}Opponent used ${def.name}.` };
    }

    case "type-ability": {
      const ability = getAbilityById(event.abilityId as AbilityId);
      if (!ability) return null;
      // Group activation + effect into ONE toast (title + description), matching
      // Regular battle's `toast.info(name activated, { description })`.
      const effect = typeAbilityPvp(event.abilityId as AbilityId)?.note ?? ability.description;
      return mine
        ? { level: "success", message: `⚡ ${ability.name} activated!`, description: effect }
        : { level: "warning", message: `⚡ Opponent's ${ability.name}!`, description: effect };
    }

    case "signature": {
      const move = signatureMoveName(event.partnerId);
      if (!move) return null;
      const effect = describeSignatureEffect(event.partnerId);
      return mine
        ? { level: "success", message: `✨ ${move}!`, description: effect }
        : { level: "warning", message: `✨ Opponent's ${move}!`, description: effect };
    }

    case "status-applied": {
      const meta = STATUS_META[event.status];
      const label = meta.label.toLowerCase();
      // Confused reads like Regular battle's "🌀 Confused! Some correct answers
      // may miss." rather than the generic status line.
      if (event.status === "confused") {
        return mine
          ? { level: "warning", message: "🌀 Confused!", description: "Some correct answers may miss." }
          : { level: "success", message: "🌀 Opponent is confused!" };
      }
      const dur =
        typeof event.durationTicks === "number" && event.durationTicks > 0
          ? ` (${event.durationTicks} question${event.durationTicks === 1 ? "" : "s"})`
          : "";
      return mine
        ? { level: "warning", message: `${meta.emoji} You're ${label}!${dur}` }
        : { level: "success", message: `${meta.emoji} Opponent is ${label}!${dur}` };
    }

    case "status-expired": {
      const meta = STATUS_META[event.status];
      const label = meta.label.toLowerCase();
      return mine
        ? { level: "success", message: `${meta.emoji} You're no longer ${label}.` }
        : { level: "info", message: `${meta.emoji} Opponent's ${label} wore off.` };
    }

    case "answer-result": {
      // Only a NO-answer needs a cue — answered slots already show their result
      // through the HP bars / streak UI, so toasting every answer would flood.
      if (!event.noAnswer) return null;
      return mine
        ? { level: "error", message: "⏱️ No answer — counted wrong." }
        : { level: "info", message: "⏱️ Opponent didn't answer." };
    }
  }
}

/**
 * Returns the `BattleFxCueApi` ({ emit }) the battle screen + route call. `emit`
 * is stable across renders, so it is safe to list in effect deps.
 *
 * @param options.staggerMs spacing between queued toasts in a burst (Story 7).
 */
export function useBattleFxCues(options?: { staggerMs?: number }): BattleFxCueApi {
  const staggerMs = options?.staggerMs ?? DEFAULT_STAGGER_MS;

  // Dedupe keys seen in the current slot; cleared when the slot advances so the
  // set stays bounded (keys already embed the questionIndex — see contract §3).
  const seenKeysRef = React.useRef<Set<string>>(new Set());
  const slotRef = React.useRef<number>(-1);
  // Pending cues waiting for their staggered release, newest slot only.
  const queueRef = React.useRef<Array<{ order: number; show: () => void }>>([]);
  const lastShownRef = React.useRef<number>(0);
  const flushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleFlush = React.useCallback(
    (delay: number) => {
      if (flushTimerRef.current !== null) return; // a flush is already armed
      flushTimerRef.current = setTimeout(
        () => {
          flushTimerRef.current = null;
          const q = queueRef.current;
          if (q.length === 0) return;
          const wait = staggerMs - (Date.now() - lastShownRef.current);
          if (wait > 0) {
            scheduleFlush(wait); // respect the min gap since the last toast
            return;
          }
          // Stable sort by kind so a same-tick burst reads in a fixed order,
          // then release exactly one and re-arm for the remainder.
          q.sort((a, b) => a.order - b.order);
          const next = q.shift();
          if (next) {
            next.show();
            lastShownRef.current = Date.now();
          }
          if (q.length > 0) scheduleFlush(staggerMs);
        },
        Math.max(0, delay),
      );
    },
    [staggerMs],
  );

  const emit = React.useCallback(
    (event: BattleFxEvent) => {
      // Slot advance: reset dedupe only. Any cues still queued from the prior
      // slot stay in the queue and keep draining one-by-one through the stagger
      // (they are never dropped), so a slot boundary no longer dumps a burst of
      // simultaneous toasts that block each other.
      if (event.questionIndex > slotRef.current) {
        slotRef.current = event.questionIndex;
        seenKeysRef.current.clear();
      }
      // Idempotency: the same underlying effect (e.g. a bot row arriving via both
      // the broadcast and a row-diff) toasts at most once per slot.
      if (seenKeysRef.current.has(event.dedupeKey)) return;
      seenKeysRef.current.add(event.dedupeKey);

      const cue = resolveCue(event);
      if (!cue) return;

      queueRef.current.push({
        order: KIND_ORDER.indexOf(event.kind),
        show: () => showToast(cue.level, cue.message, { description: cue.description }),
      });
      scheduleFlush(0);
    },
    [scheduleFlush],
  );

  // Plain battle toast (start-of-battle announcements, one-off attributions):
  // routed through the SAME staggered queue as `emit` so it never bursts
  // simultaneously with the cues. Ordered after the event kinds so, in a
  // same-tick batch, the slot's resolved cues lead and the announcement trails.
  const notify = React.useCallback(
    (level: ToastLevel, message: string, opts?: BattleToastOptions) => {
      queueRef.current.push({
        order: KIND_ORDER.length,
        show: () => showToast(level, message, opts),
      });
      scheduleFlush(0);
    },
    [scheduleFlush],
  );

  React.useEffect(() => {
    return () => {
      if (flushTimerRef.current !== null) clearTimeout(flushTimerRef.current);
    };
  }, []);

  return React.useMemo(() => ({ emit, notify }), [emit, notify]);
}
