/**
 * Sizing for a combat panel's / Pokédex card's type-chip row, kept on ONE line.
 *
 * The panel is a fixed `clamp()` width and the widest real pair —
 * ELECTRIC/FIGHTING (Pawmo), 16 characters — is wider than that at the chip's
 * normal 8px. Wrapping to a second line was rejected (owner ruling 2026-07-26)
 * and truncating a type name is worse, so the row shrinks to fit: full 8px
 * whenever the pair is short enough, smaller only when it must be.
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
 * Per-character advance of the chip's label, in ems.
 *
 * The label is Outfit (`font-display`) at `font-extrabold uppercase
 * tracking-wide`. Measured in Chromium with the real webfont at 100px across
 * all 18 type names, the widest per-character advance is 0.766em (GROUND, BUG,
 * DRAGON); 0.79 is that plus a margin for the browser quantizing each glyph's
 * advance upward at the fractional font sizes this formula produces.
 *
 * It was 1.06 when the row was drawn with `TypeBadge` in Press Start 2P — a
 * fixed-pitch face nearly half again as wide per character. Re-measure if the
 * chip's font or tracking changes; deriving this from a font's nominal advance
 * rather than measuring it is exactly the mistake that once left 67 of 952
 * rendered combinations overflowing.
 */
export const CHIP_ADVANCE_EM = 0.79;

/**
 * What one chip spends regardless of font size: `px-1.5` (12px), `border-2`
 * (4px) and the `gap-0.5` (2px) between its glyph and its label.
 */
const CHIP_FIXED_PX = 18;

/** The chip's type glyph, sized in `em` so it shrinks with the label. */
const CHIP_ICON_EM = 1.25;

/** The widest gap any caller puts between two chips (`gap-1` in the Pokédex
 *  grid; the combat panel's `gap-0.5` is narrower, so this is the safe one). */
const TYPE_ROW_GAP_PX = 4;
/** The combat panel's own `px-3`, which the row cannot use. */
const PANEL_PAD_PX = 24;

/** Largest label size, matching the `sm` chip's own `text-[8px]` — so a row
 *  with room to spare is exactly the chip every other screen draws. */
const MAX_BADGE_PX = 8;

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
 *
 * Capped at `--frame-width` (the phone-column / desktop-mockup width) rather
 * than the raw viewport, so a wide desktop — where the grid lives inside the
 * 480px phone frame — doesn't blow the cards up past the column.
 */
export const DEX_CARD_WIDTH = "calc((min(100vw, var(--frame-width)) - 44px) / 3)";
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
    types.length * CHIP_FIXED_PX + Math.max(0, types.length - 1) * TYPE_ROW_GAP_PX;
  // The glyph scales with the label, so it belongs in the divisor beside the
  // characters, not in the fixed overhead.
  const per = (chars * CHIP_ADVANCE_EM + types.length * CHIP_ICON_EM).toFixed(2);
  return `min(${MAX_BADGE_PX}px, calc((${containerWidthCss} - ${containerPadPx}px - ${overhead}px) / ${per}))`;
}
