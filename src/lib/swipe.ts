import { useRef } from "react";

/**
 * Horizontal swipe detection for full-screen sheets that also scroll
 * vertically.
 *
 * Deliberately NOT framer-motion's `drag="x"`. That captures the pointer and
 * suppresses native scrolling on the element it is attached to, so putting it
 * on a scrollable sheet trades vertical scroll for horizontal paging. Here the
 * browser keeps vertical scrolling (via `touch-action: pan-y`, which the hook
 * returns) and only horizontal movement reaches us.
 *
 * The axis is decided ONCE per gesture, at the moment the finger passes
 * `AXIS_LOCK_PX`, and never revisited: without that, a diagonal drag flickers
 * between scrolling and paging, and a long vertical scroll that happens to end
 * with a sideways flick fires a page turn the player did not ask for.
 */

/** Movement before the gesture commits to an axis. */
const AXIS_LOCK_PX = 10;

/** How far a horizontal swipe must travel to count. */
const COMMIT_PX = 56;

/** …or how fast, so a short flick still turns the page. px per ms. */
const COMMIT_VELOCITY = 0.45;

export interface SwipeSample {
  /** Total horizontal travel, positive rightwards. */
  dx: number;
  /** Total vertical travel, positive downwards. */
  dy: number;
  /** Duration of the gesture in ms. */
  dt: number;
}

/**
 * What a finished gesture means: the PREVIOUS entry, the NEXT one, or nothing.
 *
 * Dragging right (`dx > 0`) reveals what is to the left, which is the previous
 * entry — the same direction as a book page or a photo carousel.
 *
 * Pure, so the thresholds can be tested without a browser.
 */
export function swipeIntent({ dx, dy, dt }: SwipeSample): "prev" | "next" | null {
  // Vertical-dominant gestures are scrolls, whatever their horizontal travel.
  if (Math.abs(dy) > Math.abs(dx)) return null;
  const velocity = dt > 0 ? Math.abs(dx) / dt : 0;
  if (Math.abs(dx) < COMMIT_PX && velocity < COMMIT_VELOCITY) return null;
  return dx > 0 ? "prev" : "next";
}

export interface HorizontalSwipeHandlers {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: () => void;
  /** Spread onto the element's style so the browser keeps vertical scrolling. */
  style: React.CSSProperties;
}

/**
 * Calls `onPrev` / `onNext` when the player swipes the element horizontally.
 *
 * Either callback may be undefined — at the ends of a list there is nowhere to
 * go — and the gesture is then simply ignored rather than wrapping around.
 */
export function useHorizontalSwipe({
  onPrev,
  onNext,
}: {
  onPrev?: () => void;
  onNext?: () => void;
}): HorizontalSwipeHandlers {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const axis = useRef<"undecided" | "x" | "y">("undecided");

  return {
    onPointerDown: (e) => {
      // Mouse drags on desktop are not a paging gesture — they are text
      // selection and click targets. Touch and pen only.
      if (e.pointerType === "mouse") return;
      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
      axis.current = "undecided";
    },
    onPointerMove: (e) => {
      const s = start.current;
      if (!s || axis.current !== "undecided") return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
      axis.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
    },
    onPointerUp: (e) => {
      const s = start.current;
      start.current = null;
      if (!s || axis.current !== "x") return;
      const intent = swipeIntent({
        dx: e.clientX - s.x,
        dy: e.clientY - s.y,
        dt: e.timeStamp - s.t,
      });
      if (intent === "prev") onPrev?.();
      else if (intent === "next") onNext?.();
    },
    onPointerCancel: () => {
      start.current = null;
    },
    // The browser owns vertical scrolling; we only ever see horizontal moves.
    style: { touchAction: "pan-y" },
  };
}
