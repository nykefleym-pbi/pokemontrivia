/**
 * Sizing for a combat panel's type-badge row, kept on ONE line.
 *
 * The panel is a fixed `clamp()` width and the widest real pair —
 * ELECTRIC/FIGHTING (Pawmo), 16 characters — is far wider than that at the
 * badge's normal 9px. Wrapping to a second line was rejected (owner ruling
 * 2026-07-26) and truncating a type name is worse, so the row shrinks to fit:
 * full 9px whenever the pair is short enough, smaller only when it must be.
 *
 * Expressed as CSS arithmetic rather than a measure-then-resize effect because
 * every input is known up front — the panel width is a CSS expression, the
 * character count comes from the types — so there is no layout pass to race and
 * nothing to recompute on resize.
 *
 * Lives in `lib/` (not beside the component) with no imports beyond a type, so
 * the browser-geometry harness can load the REAL function instead of a copy.
 */

/**
 * Per-character advance of Press Start 2P at the badge's `tracking-tight`, in
 * ems.
 *
 * The font's nominal advance is 0.975em, but that is the wrong number to divide
 * by: at the fractional font sizes this formula produces, the browser quantizes
 * each glyph's advance upward and the effective ratio drifts as high as
 * ~1.047em/char. 1.06 is calibrated — swept against all 136 real dual-type
 * pairs at 7 viewports (320–480px) with the real webfont, it is the smallest
 * constant that overflows zero of the 952 combinations, worst case ~3.7px of
 * slack.
 *
 * Re-measure if the badge font or its tracking changes. Deriving this from the
 * font's nominal advance rather than measuring it is exactly the mistake that
 * left 67 of those 952 combinations still overflowing.
 */
export const PIXEL_ADVANCE_EM = 1.06;

/** `px-1` on each badge. */
const TYPE_BADGE_PAD_PX = 8;
/** `gap-0.5` between badges. */
const TYPE_ROW_GAP_PX = 2;
/** The combat panel's own `px-3`, which the row cannot use. */
const PANEL_PAD_PX = 24;

/** Largest badge font size, matching the badge's default `text-[9px]`. */
const MAX_BADGE_PX = 9;

/**
 * The combat panel's width, shared by the panel box and `typeRowFontSize` so
 * the two can never disagree. The 9rem floor (up from 8rem) buys the narrowest
 * phones enough room to keep the longest pair legible on one line.
 */
export const COMBAT_PANEL_WIDTH = "clamp(9rem,38vw,10.5rem)";

/**
 * A Pokedex grid card's outer width, and what it spends on border + padding.
 *
 * Written as an expression rather than a measured number so it tracks the grid
 * on every screen: the grid container is `px-3` (24px) and `grid-cols-3
 * gap-2.5` spends 2 x 10px between the columns, leaving `(100vw - 44px) / 3`
 * per card. The card itself then spends `border-2` (4px) and `px-2` (16px).
 *
 * Kept here rather than in the route so the arithmetic that has to agree with
 * `typeRowFontSize` sits next to it, and so tests can reach it without pulling
 * in a TanStack route.
 */
export const DEX_CARD_WIDTH = "calc((100vw - 44px) / 3)";
export const DEX_CARD_PAD_PX = 20;

/**
 * A CSS `font-size` that fits `types` on one line inside `containerWidthCss`.
 *
 * `containerPadPx` is everything between that width and the row's own content
 * box — padding plus border on both sides. It defaults to the combat panel's
 * `px-3`; the Pokedex card passes its own, since its box is padded differently.
 */
export function typeRowFontSize(
  types: readonly string[],
  containerWidthCss: string,
  containerPadPx: number = PANEL_PAD_PX,
): string {
  const chars = types.reduce((n, t) => n + t.length, 0);
  if (chars === 0) return `${MAX_BADGE_PX}px`;
  const overhead =
    types.length * TYPE_BADGE_PAD_PX + Math.max(0, types.length - 1) * TYPE_ROW_GAP_PX;
  const per = (chars * PIXEL_ADVANCE_EM).toFixed(2);
  return `min(${MAX_BADGE_PX}px, calc((${containerWidthCss} - ${containerPadPx}px - ${overhead}px) / ${per}))`;
}
