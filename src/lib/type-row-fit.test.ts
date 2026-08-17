// The combat panel's type row must stay on ONE line (owner ruling 2026-07-26:
// wrapping to a second line was rejected). These tests pin the arithmetic that
// makes that possible; the geometry itself was verified separately by rendering
// all 136 real dual-type pairs at 8 viewports in Chromium with the real
// webfont (1088 combinations, zero overflow, zero wrapped rows).
import { describe, expect, it } from "vitest";
import {
  typeRowFontSize,
  COMBAT_PANEL_WIDTH,
  DEX_CARD_WIDTH,
  DEX_CARD_PAD_PX,
  CHIP_ADVANCE_EM,
} from "@/lib/type-row-fit";

/** Solve the emitted `min(8px, calc((W - 24px - Npx) / D))` for a given panel
 *  width, so a test can assert the real rendered size rather than a string. */
function resolvePx(css: string, panelPx: number): number {
  const m = css.match(/min\((\d+)px, calc\(\(.+ - (\d+)px - (\d+)px\) \/ ([\d.]+)\)\)/);
  if (!m) throw new Error(`unrecognised font-size expression: ${css}`);
  const [, max, panelPad, overhead, divisor] = m;
  return Math.min(Number(max), (panelPx - Number(panelPad) - Number(overhead)) / Number(divisor));
}

/** Width the row actually needs at a given font size, per the same model:
 *  each chip spends 18px of padding + border + icon gap, the row spends 4px
 *  between chips, and label plus glyph both scale with the font size. */
function neededPx(types: string[], fontPx: number): number {
  const chars = types.reduce((n, t) => n + t.length, 0);
  const overhead = types.length * 18 + (types.length - 1) * 4;
  return (chars * CHIP_ADVANCE_EM + types.length * 1.25) * fontPx + overhead;
}

// The clamp()'s two ends, in px: 9rem floor and 10.5rem ceiling.
const NARROW = 144;
const WIDE = 168;

describe("typeRowFontSize", () => {
  it("keeps the full 8px for a single type that fits easily", () => {
    expect(resolvePx(typeRowFontSize(["bug"], COMBAT_PANEL_WIDTH), WIDE)).toBe(8);
  });

  it("keeps the full 8px for a short pair", () => {
    expect(resolvePx(typeRowFontSize(["bug", "rock"], COMBAT_PANEL_WIDTH), WIDE)).toBe(8);
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

  it("never exceeds the 8px ceiling, however much room there is", () => {
    expect(resolvePx(typeRowFontSize(["bug"], COMBAT_PANEL_WIDTH), 1000)).toBe(8);
  });

  it("degrades to the plain chip size when there are no types", () => {
    expect(typeRowFontSize([], COMBAT_PANEL_WIDTH)).toBe("8px");
  });

  // The Pokedex grid reuses the same trick at a different width and padding —
  // the owner asked for both types on ONE line there too (2026-07-31). Its
  // cards are much narrower than a combat panel (~92px at 320 wide against the
  // panel's 144), so the fit is tighter and worth pinning separately.
  describe("in a Pokedex card", () => {
    /** Card outer width at a given viewport, per `DEX_CARD_WIDTH`. */
    const cardPx = (vw: number) => (vw - 44) / 3;

    it("fits the widest real pair on the narrowest phone", () => {
      const types = ["electric", "fighting"]; // Pawmo, 16 chars
      const card = cardPx(320);
      const px = resolvePx(typeRowFontSize(types, DEX_CARD_WIDTH, DEX_CARD_PAD_PX), card);
      expect(px).toBeGreaterThan(0);
      expect(neededPx(types, px)).toBeLessThanOrEqual(card - DEX_CARD_PAD_PX + 1e-9);
    });

    it("fits every length from 1 to 20 characters across phone widths", () => {
      for (const vw of [320, 360, 390, 412, 430]) {
        for (let len = 1; len <= 20; len++) {
          const types = ["a".repeat(Math.ceil(len / 2)), "b".repeat(Math.floor(len / 2))].filter(
            (t) => t.length > 0,
          );
          const card = cardPx(vw);
          const px = resolvePx(typeRowFontSize(types, DEX_CARD_WIDTH, DEX_CARD_PAD_PX), card);
          expect(neededPx(types, px)).toBeLessThanOrEqual(card - DEX_CARD_PAD_PX + 1e-9);
        }
      }
    });

    it("still tops out at the 8px chip size when a short type has room", () => {
      expect(resolvePx(typeRowFontSize(["bug"], DEX_CARD_WIDTH, DEX_CARD_PAD_PX), 1000)).toBe(8);
    });
  });

  it("uses an advance measured with a margin over the widest real label", () => {
    // Guards the specific regression: dividing by a font's nominal advance left
    // 67 of 1088 rendered combinations overflowing, because the browser rounds
    // each glyph's advance up at fractional font sizes. 0.766em is the widest
    // per-character advance measured across the 18 type names in Chromium.
    expect(CHIP_ADVANCE_EM).toBeGreaterThan(0.766);
  });
});
