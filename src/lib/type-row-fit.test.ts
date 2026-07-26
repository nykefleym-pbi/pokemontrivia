// The combat panel's type row must stay on ONE line (owner ruling 2026-07-26:
// wrapping to a second line was rejected). These tests pin the arithmetic that
// makes that possible; the geometry itself was verified separately by rendering
// all 136 real dual-type pairs at 8 viewports in Chromium with the real
// webfont (1088 combinations, zero overflow, zero wrapped rows).
import { describe, expect, it } from "vitest";
import { typeRowFontSize, COMBAT_PANEL_WIDTH, PIXEL_ADVANCE_EM } from "@/lib/type-row-fit";

/** Solve the emitted `min(9px, calc((W - 24px - Npx) / D))` for a given panel
 *  width, so a test can assert the real rendered size rather than a string. */
function resolvePx(css: string, panelPx: number): number {
  const m = css.match(/min\((\d+)px, calc\(\(.+ - (\d+)px - (\d+)px\) \/ ([\d.]+)\)\)/);
  if (!m) throw new Error(`unrecognised font-size expression: ${css}`);
  const [, max, panelPad, overhead, divisor] = m;
  return Math.min(Number(max), (panelPx - Number(panelPad) - Number(overhead)) / Number(divisor));
}

/** Width the row actually needs at a given font size, per the same model. */
function neededPx(types: string[], fontPx: number): number {
  const chars = types.reduce((n, t) => n + t.length, 0);
  const overhead = types.length * 8 + (types.length - 1) * 2;
  return chars * PIXEL_ADVANCE_EM * fontPx + overhead;
}

// The clamp()'s two ends, in px: 9rem floor and 10.5rem ceiling.
const NARROW = 144;
const WIDE = 168;

describe("typeRowFontSize", () => {
  it("keeps the full 9px for a single type that fits easily", () => {
    expect(resolvePx(typeRowFontSize(["bug"], COMBAT_PANEL_WIDTH), WIDE)).toBe(9);
  });

  it("keeps the full 9px for a short pair", () => {
    expect(resolvePx(typeRowFontSize(["bug", "rock"], COMBAT_PANEL_WIDTH), WIDE)).toBe(9);
  });

  it("shrinks only as much as the pair needs", () => {
    const short = resolvePx(typeRowFontSize(["bug", "rock"], COMBAT_PANEL_WIDTH), NARROW);
    const long = resolvePx(typeRowFontSize(["electric", "fighting"], COMBAT_PANEL_WIDTH), NARROW);
    expect(long).toBeLessThan(short);
  });

  it("fits the widest real pair inside the narrowest panel", () => {
    // ELECTRIC/FIGHTING (Pawmo), 16 characters — the worst case in the dex.
    const types = ["electric", "fighting"];
    const px = resolvePx(typeRowFontSize(types, COMBAT_PANEL_WIDTH), NARROW);
    expect(neededPx(types, px)).toBeLessThanOrEqual(NARROW - 24);
  });

  it("fits every length from 1 to 20 characters at both clamp ends", () => {
    for (const panel of [NARROW, WIDE]) {
      for (let len = 1; len <= 20; len++) {
        const types = ["a".repeat(Math.ceil(len / 2)), "b".repeat(Math.floor(len / 2))].filter(
          (t) => t.length > 0,
        );
        const px = resolvePx(typeRowFontSize(types, COMBAT_PANEL_WIDTH), panel);
        expect(neededPx(types, px)).toBeLessThanOrEqual(panel - 24 + 1e-9);
      }
    }
  });

  it("never exceeds the 9px ceiling, however much room there is", () => {
    expect(resolvePx(typeRowFontSize(["bug"], COMBAT_PANEL_WIDTH), 1000)).toBe(9);
  });

  it("degrades to the plain badge size when there are no types", () => {
    expect(typeRowFontSize([], COMBAT_PANEL_WIDTH)).toBe("9px");
  });

  it("uses the calibrated advance, not the font's nominal 0.975em", () => {
    // Guards the specific regression: dividing by the nominal advance left 67
    // of 1088 rendered combinations overflowing, because the browser rounds
    // each glyph's advance up at fractional font sizes.
    expect(PIXEL_ADVANCE_EM).toBeGreaterThan(1.047);
  });
});
