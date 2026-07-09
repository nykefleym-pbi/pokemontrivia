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
import { BAG_SHORT_DESC } from "@/lib/item-categories";
import { getAbilityById, type AbilityId } from "@/lib/abilities";
import { typeAbilityPvp } from "@/lib/pvp-type-abilities";
import { signatureMoveName, describeSignatureEffect } from "@/lib/signature-abilities";
import type {
  BattleFxCueApi,
  BattleFxEvent,
  BattleFxKind,
} from "@/lib/training-battle-fx-types";

type ToastLevel = "info" | "success" | "warning" | "error";

interface Cue {
  level: ToastLevel;
  message: string;
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

const DEFAULT_STAGGER_MS = 350;

function showToast(level: ToastLevel, message: string): void {
  switch (level) {
    case "success":
      toast.success(message);
      break;
    case "warning":
      toast.warning(message);
      break;
    case "error":
      toast.error(message);
      break;
    default:
      toast.info(message);
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
      const effect = BAG_SHORT_DESC[def.id] ?? def.desc;
      if (mine) {
        return {
          // Offensive berry reads as a positive action; self buffs/reveals stay
          // low-key info — matches the shipped local-item toast levels.
          level: event.hitsOpponent ? "success" : "info",
          message: event.hitsOpponent
            ? `${def.emoji} You used ${def.name} on the opponent — ${effect}`
            : `${def.emoji} You used ${def.name} — ${effect}`,
        };
      }
      return event.hitsOpponent
        ? {
            level: "warning",
            message: `${def.emoji} Opponent used ${def.name} — affects YOU! ${effect}`,
          }
        : { level: "info", message: `${def.emoji} Opponent used ${def.name} — ${effect}` };
    }

    case "type-ability": {
      const ability = getAbilityById(event.abilityId as AbilityId);
      if (!ability) return null;
      const wiring = typeAbilityPvp(event.abilityId as AbilityId);
      const owner = mine ? "Your" : "Opponent's";
      const base = wiring ? `${owner} ${ability.name} — ${wiring.note}` : `${owner} ${ability.name} activates`;
      if (mine) {
        return { level: "success", message: `⚡ ${base}${event.hitsOpponent ? " — affects them!" : ""}` };
      }
      return { level: "warning", message: `⚡ ${base} — affects ${event.hitsOpponent ? "YOU" : "them"}!` };
    }

    case "signature": {
      const move = signatureMoveName(event.partnerId);
      if (!move) return null;
      const desc = describeSignatureEffect(event.partnerId);
      if (mine) {
        return { level: "success", message: desc ? `✨ ${move} — ${desc}!` : `✨ ${move} activates!` };
      }
      const base = desc ? `Opponent's ${move} — ${desc}` : `Opponent's ${move} activates`;
      return { level: "warning", message: `✨ ${base} — affects ${event.hitsOpponent ? "YOU" : "them"}!` };
    }

    case "status-applied": {
      const meta = STATUS_META[event.status];
      const label = meta.label.toLowerCase();
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
        : { level: "info", message: `${meta.emoji} Opponent is no longer ${label}.` };
    }

    case "answer-result": {
      // Only a NO-answer needs a cue — answered slots already show their result
      // through the HP bars / streak UI, so toasting every answer would flood.
      if (!event.noAnswer) return null;
      return mine
        ? { level: "error", message: "⏱️ No answer — counted incorrect." }
        : { level: "info", message: "⏱️ Opponent didn't answer — counted incorrect." };
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
      // Slot advance: reset dedupe and drop any stale cues still queued from a
      // prior slot so nothing bleeds across question boundaries.
      if (event.questionIndex > slotRef.current) {
        slotRef.current = event.questionIndex;
        seenKeysRef.current.clear();
        queueRef.current = [];
      }
      // Idempotency: the same underlying effect (e.g. a bot row arriving via both
      // the broadcast and a row-diff) toasts at most once per slot.
      if (seenKeysRef.current.has(event.dedupeKey)) return;
      seenKeysRef.current.add(event.dedupeKey);

      const cue = resolveCue(event);
      if (!cue) return;

      queueRef.current.push({
        order: KIND_ORDER.indexOf(event.kind),
        show: () => showToast(cue.level, cue.message),
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

  return React.useMemo(() => ({ emit }), [emit]);
}
