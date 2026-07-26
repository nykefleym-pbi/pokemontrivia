/**
 * Suppresses the browser's own long-press gestures app-wide.
 *
 * Owner report (2026-07-26): text anywhere in the app could be selected and
 * copied, and long-pressing the Arena's PvP / Training trophy badges opened
 * Chrome's image menu — "Copy image", "Download image" — instead of running the
 * badge's press-and-hold colourise. Each badge is a <button> wrapping an <img>,
 * and the browser's image menu wins over any pointer handler on the button.
 *
 * The CSS in styles.css does most of the work (`user-select: none` plus
 * `-webkit-touch-callout: none` on <html>), but it cannot finish the job:
 * `-webkit-touch-callout` is WebKit-only, so on Android Chrome the long-press
 * image menu still opens. There it arrives as a `contextmenu` event, and only
 * preventDefault() stops it.
 *
 * Desktop right-click is deliberately left alone. We remember the pointer type
 * of the gesture that produced the menu, so a mouse right-click still opens the
 * browser's menu (handy for "Open image in new tab", and for debugging) while a
 * finger or stylus long-press does not.
 */

/**
 * Elements that opt back into native selection: anything the player types into,
 * plus anything tagged with Tailwind's select-text / select-all utilities (the
 * Battle Code, for one — it has no Copy button beside it, so hand-selecting it
 * has to keep working).
 */
const SELECTABLE_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [contenteditable=""], .select-text, .select-all';

function isSelectable(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(SELECTABLE_SELECTOR) !== null;
}

/** Installs the guards on `doc`; returns a cleanup that removes them. */
export function installNativeGestureGuards(doc: Document): () => void {
  // Default to "mouse" so a keyboard context-menu key, or any menu that arrives
  // without a preceding pointerdown, behaves like desktop and is left alone.
  let lastPointerType = "mouse";

  // Capture phase: the pointer type must be recorded even when a component
  // stops the event from bubbling.
  const onPointerDown = (e: Event) => {
    const type = (e as PointerEvent).pointerType;
    if (type) lastPointerType = type;
  };

  // Bubble phase, so a component that wants its own long-press menu can opt out
  // by calling stopPropagation().
  const onContextMenu = (e: Event) => {
    if (lastPointerType === "mouse") return;
    if (isSelectable(e.target)) return;
    e.preventDefault();
  };

  // Dragging a sprite out of the app is the desktop equivalent of the image
  // menu. CSS `-webkit-user-drag: none` covers Chrome and Safari; this covers
  // the rest.
  const onDragStart = (e: Event) => {
    const el = e.target instanceof Element ? e.target : null;
    if (el?.tagName === "IMG" && !isSelectable(el)) e.preventDefault();
  };

  doc.addEventListener("pointerdown", onPointerDown, true);
  doc.addEventListener("contextmenu", onContextMenu);
  doc.addEventListener("dragstart", onDragStart);

  return () => {
    doc.removeEventListener("pointerdown", onPointerDown, true);
    doc.removeEventListener("contextmenu", onContextMenu);
    doc.removeEventListener("dragstart", onDragStart);
  };
}
