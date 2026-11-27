// Pixel props: the Pokédex snow globe (back and front layers, the sprite goes between) and the Poké Ball
// (any tilt, closed or open) for the catch. Art px; shown at 2x.
import { hexU32 as H, image, set, get, dither, ellipse, disc, noise2, fbm2, blend } from './raster.js';

/** Snow globe, 112 x 118 art px. Returns { back, front, floor: [x, y] } — floor is where the sprite's feet go. */
export function drawGlobe(seed = 3) {
  const W = 112, Hh = 118, back = image(W, Hh), front = image(W, Hh), n2 = noise2(seed);
  const cx = 56, cy = 52, R = 48;
  // glass interior: a faint cool tint, a little denser at the rim
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
    if (d < 1 && y < cy + R * 0.62) { if (dither(x, y, 0.03 + Math.pow(d, 6) * 0.4)) set(back, x, y, H('#bfe8ff', 255)); }
  }
  // pedestal under the glass: a stone ring with a lit lip, drawn first so the island sits on it (Paul, 2026-11-23)
  ellipse(back, cx, cy + R * 0.84 + 6, R * 0.86, 8, H('#2c2c38'));
  ellipse(back, cx, cy + R * 0.84 + 4, R * 0.86, 8, H('#5c5c6b'));
  ellipse(back, cx, cy + R * 0.84 + 3, R * 0.82, 6, H('#7d7d8c'), (x, y) => y < cy + R * 0.84 + 3);
  ellipse(back, cx, cy + R * 0.84 + 3, R * 0.7, 4.5, H('#42424f'));
  // the island: earth sides, a grass top with a lit centre, tufts and two flowers
  const ix = cx, iy = cy + 30, rx = 38, ry = 10;
  for (let k = 5; k >= 1; k--) ellipse(back, ix, iy + k, rx, ry, H(k > 3 ? '#4a2f20' : k > 1 ? '#6a4630' : '#87603d'));
  ellipse(back, ix, iy, rx, ry, H('#3a7a2c'));
  ellipse(back, ix, iy, rx - 1, ry - 1, H('#4f9a3a'));
  ellipse(back, ix - 3, iy - 1, rx * 0.84, ry * 0.8, H('#62b04a'), (x, y) => dither(x, y, 0.55 + fbm2(n2, x * 0.3, y * 0.6) * 0.8));
  ellipse(back, ix - 6, iy - 2, rx * 0.56, ry * 0.52, H('#7cc65c'), (x, y) => dither(x, y, 0.5 + fbm2(n2, x * 0.3 + 7, y * 0.6) * 0.8));
  for (const [tx, ty] of [[ix - 30, iy + 6], [ix - 22, iy + 8], [ix + 25, iy + 7], [ix + 31, iy + 4], [ix + 10, iy + 9]]) { set(back, tx, ty, H('#86cf64')); set(back, tx, ty - 1, H('#a5df7c')); set(back, tx + 1, ty - 2, H('#86cf64')); }
  for (const [fx, fy, c] of [[ix - 26, iy - 2, '#ffe36b'], [ix + 24, iy - 1, '#ff9fc4'], [ix + 18, iy + 3, '#ffffff']]) { set(back, fx, fy, H(c)); set(back, fx, fy + 1, H('#3a7a2c')); }
  // FRONT layer: the rim, a curved highlight, a cool reflection and drifting sparkles over the sprite
  for (let a = 0; a < Math.PI * 2; a += 0.004) {
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R; if (y > cy + R * 0.66) continue;
    const lit = Math.cos(a - 3.9);
    set(front, x, y, H(lit > 0.3 ? '#e8faff' : lit > -0.4 ? '#9fd8f2' : '#5f9fc4'));
  }
  for (let a = 3.5; a < 4.55; a += 0.01) { const x = cx + Math.cos(a) * (R - 6), y = cy + Math.sin(a) * (R - 6); set(front, x, y, H('#ffffff')); if (a > 3.75 && a < 4.35) set(front, x + 1, y + 1, H('#dff6ff')); }
  for (let a = 5.75; a < 6.2; a += 0.02) { const x = cx + Math.cos(a) * (R - 5), y = cy + Math.sin(a) * (R - 5); set(front, x, y, H('#cdefff')); }
  for (const [sx, sy] of [[cx - 22, cy - 24], [cx + 16, cy - 30], [cx + 30, cy - 8], [cx - 34, cy + 2], [cx + 6, cy - 14], [cx - 12, cy - 36]]) {
    set(front, sx, sy, H('#ffffff')); if ((sx + sy) % 3 === 0) { set(front, sx - 1, sy, H('#cdefff')); set(front, sx + 1, sy, H('#cdefff')); set(front, sx, sy - 1, H('#cdefff')); set(front, sx, sy + 1, H('#cdefff')); }
  }
  return { back, front, floor: [ix, iy + 1], size: [W, Hh] };
}

/** A Poké Ball, 16 x 16 art px, tilted by `ang` (radians), open (0..1 lid lift) and button glow (0..1). */
export function drawBall(ang = 0, open = 0, glow = 0) {
  const S = 16, img = image(S, S + 6), c = S / 2, r = 6.6;
  const red = [H('#9c1420'), H('#d42a36'), H('#ff5a5e'), H('#ffb0b0')], white = [H('#9aa0ae'), H('#d4d8e2'), H('#f6f7fb')], ink = H('#16141c');
  const ca = Math.cos(-ang), sa = Math.sin(-ang), lift = open * 5;
  for (let y = 0; y < S + 6; y++) for (let x = 0; x < S; x++) {
    // test the lower half (bottom shell) and the lid separately; the lid rises by `lift`
    for (const part of ['base', 'lid']) {
      const oy = part === 'lid' ? lift : 0, px = x + 0.5 - c, py = y + 0.5 - c - 3 + oy;
      const lx = px * ca - py * sa, ly = px * sa + py * ca, d = Math.hypot(lx, ly);
      if (d > r) continue;
      const top = ly < 0; if ((part === 'lid') !== top) continue;
      let col;
      if (d > r - 1) col = ink;
      else if (Math.abs(ly) < 1.1 && open < 0.2) col = ink;
      else if (top) col = d < r - 1 && lx < -1 && ly < -2.5 ? red[3] : lx < 1.5 && ly < -1.5 ? red[2] : lx > 2.5 || ly > -1 ? red[0] : red[1];
      else col = lx > 2 || ly > 4 ? white[0] : lx < -1 && ly < 3 ? white[2] : white[1];
      // the button
      const bd = Math.hypot(lx, ly - (top ? 0 : 0));
      if (open < 0.2 && bd < 2.6) col = bd < 1.6 ? (glow > 0.5 ? H('#fff6a0') : white[2]) : ink;
      set(img, x, y, col);
    }
  }
  return img;
}
