// Long-press suppression. `.tsx` purely so vitest gives this file the jsdom
// environment (see environmentMatchGlobs in vitest.config.ts) — there is no JSX
// here; the guards are plain DOM listeners.
//
// The bug (owner report 2026-07-26): app text was selectable and copyable, and
// long-pressing the Arena PvP / Training badges opened the browser's image menu
// instead of running the badge's press-and-hold colourise.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installNativeGestureGuards } from "@/lib/native-gestures";

let uninstall: () => void;

beforeEach(() => {
  uninstall = installNativeGestureGuards(document);
});

afterEach(() => {
  uninstall();
  document.body.innerHTML = "";
});

/** jsdom has no PointerEvent, and it is only the pointerType we care about. */
function pointerDown(target: Element, pointerType: string): void {
  const e = new MouseEvent("pointerdown", { bubbles: true });
  Object.defineProperty(e, "pointerType", { value: pointerType });
  target.dispatchEvent(e);
}

function contextMenu(target: Element): boolean {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e.defaultPrevented;
}

function mount(html: string): Element {
  document.body.innerHTML = html;
  return document.body.firstElementChild!;
}

describe("installNativeGestureGuards", () => {
  it("blocks the menu a finger long-press would open on a badge image", () => {
    const badge = mount('<button><img src="/icons/pvp.webp" alt="" /></button>');
    const img = badge.querySelector("img")!;
    pointerDown(img, "touch");
    expect(contextMenu(img)).toBe(true);
  });

  it("blocks it for a stylus too", () => {
    const img = mount('<img src="/icons/pvp.webp" alt="" />');
    pointerDown(img, "pen");
    expect(contextMenu(img)).toBe(true);
  });

  it("leaves a desktop mouse right-click alone", () => {
    const img = mount('<img src="/icons/pvp.webp" alt="" />');
    pointerDown(img, "mouse");
    expect(contextMenu(img)).toBe(false);
  });

  it("leaves a menu with no preceding pointer gesture alone (context-menu key)", () => {
    const img = mount('<img src="/icons/pvp.webp" alt="" />');
    expect(contextMenu(img)).toBe(false);
  });

  it("keeps the long-press paste menu on a text input", () => {
    const input = mount('<input type="text" />');
    pointerDown(input, "touch");
    expect(contextMenu(input)).toBe(false);
  });

  it("keeps it on anything marked select-text, however deeply nested", () => {
    const wrap = mount('<div class="select-text"><span><b>ABC123</b></span></div>');
    const leaf = wrap.querySelector("b")!;
    pointerDown(leaf, "touch");
    expect(contextMenu(leaf)).toBe(false);
  });

  it("does not treat a sibling of a selectable node as selectable", () => {
    const row = mount('<div><span class="select-text">ABC123</span><img src="/a.webp" alt="" /></div>');
    const img = row.querySelector("img")!;
    pointerDown(img, "touch");
    expect(contextMenu(img)).toBe(true);
  });

  it("stops an image being dragged out of the app", () => {
    const img = mount('<img src="/icons/pvp.webp" alt="" />');
    const e = new Event("dragstart", { bubbles: true, cancelable: true });
    img.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("does not interfere with dragging anything else", () => {
    const div = mount("<div>draggable panel</div>");
    const e = new Event("dragstart", { bubbles: true, cancelable: true });
    div.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });

  it("stops guarding once uninstalled", () => {
    const img = mount('<img src="/icons/pvp.webp" alt="" />');
    pointerDown(img, "touch");
    uninstall();
    expect(contextMenu(img)).toBe(false);
  });
});
