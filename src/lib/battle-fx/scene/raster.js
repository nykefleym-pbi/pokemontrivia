// Tiny raster toolkit shared by the Node asset build and the live preview page (no imports, no DOM).
// Pixels are Uint32 in pixelfx's layout: r | g << 8 | b << 16 | a << 24.

export function hexU32(h, a = 255) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return (((n >> 16) & 255) | (((n >> 8) & 255) << 8) | ((n & 255) << 16) | (a << 24)) >>> 0;
}
export function rgbaOf(c) { return [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24]; }
export function mixU32(a, b, t) {
  const A = rgbaOf(a), B = rgbaOf(b), f = (i) => Math.round(A[i] + (B[i] - A[i]) * t);
  return (f(0) | (f(1) << 8) | (f(2) << 16) | (f(3) << 24)) >>> 0;
}
export function image(w, h) { return { w, h, px: new Uint32Array(w * h) }; }
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const B4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** Ordered-dither test: true when a coverage of t (0..1) should paint this pixel. */
export function dither(x, y, t) { return t > (B4[(y & 3) * 4 + (x & 3)] + 0.5) / 16; }
export function set(img, x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= img.w || y >= img.h) return; img.px[y * img.w + x] = c; }
export function get(img, x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= img.w || y >= img.h) return 0; return img.px[y * img.w + x]; }
/** Paint over with alpha (straight alpha blend) — used for shadows and glows. */
export function blend(img, x, y, c, a) {
  x |= 0; y |= 0; if (x < 0 || y < 0 || x >= img.w || y >= img.h || a <= 0) return;
  const i = y * img.w + x, d = img.px[i];
  if ((d >>> 24) === 0) { const [r, g, b] = rgbaOf(c); img.px[i] = (r | (g << 8) | (b << 16) | (Math.round(a * 255) << 24)) >>> 0; return; }
  img.px[i] = mixU32(d, (c & 0xffffff) | ((d >>> 24) << 24), Math.min(1, a)) >>> 0;
}
export function rect(img, x, y, w, h, c) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) set(img, i, j, c); }
export function disc(img, cx, cy, r, c, fn) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r; if (d <= 1) { if (!fn || fn(x, y, d)) set(img, x, y, c); }
  }
}
export function ellipse(img, cx, cy, rx, ry, c, fn) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
    const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry); if (d <= 1) { if (!fn || fn(x, y, d)) set(img, x, y, c); }
  }
}
// value noise + fbm (seeded, tileable enough for our widths)
export function noise1(seed) {
  const r = rng(seed), T = new Float32Array(512); for (let i = 0; i < 512; i++) T[i] = r();
  return (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return T[i & 511] * (1 - u) + T[(i + 1) & 511] * u; };
}
export function noise2(seed) {
  const r = rng(seed), T = new Float32Array(256 * 256); for (let i = 0; i < T.length; i++) T[i] = r();
  const at = (x, y) => T[((y & 255) << 8) | (x & 255)];
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
}
export function fbm2(n, x, y, oct = 4) { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); t += a; a *= 0.5; f *= 2; } return s / t; }
/** Draw RGBA bytes (a decoded sprite) into an image at an integer scale; alpha below 128 is skipped (pixel art). */
export function blitRGBA(img, spr, dx, dy, k = 1, opts = {}) {
  const { flip = false, tint = null, tintK = 0, alpha = 1, mask = null } = opts;
  for (let y = 0; y < spr.h; y++) for (let x = 0; x < spr.w; x++) {
    const s = (y * spr.w + (flip ? spr.w - 1 - x : x)) * 4, a = spr.rgba[s + 3];
    if (a < 128) continue;
    let r = spr.rgba[s], g = spr.rgba[s + 1], b = spr.rgba[s + 2];
    if (tint) { r = Math.round(r + (tint[0] - r) * tintK); g = Math.round(g + (tint[1] - g) * tintK); b = Math.round(b + (tint[2] - b) * tintK); }
    const c = (r | (g << 8) | (b << 16) | (255 << 24)) >>> 0;
    for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) {
      const X = dx + x * k + i, Y = dy + y * k + j;
      if (mask && !mask(X, Y)) continue;
      if (alpha >= 1) set(img, X, Y, c); else if (dither(X, Y, alpha)) set(img, X, Y, c);
    }
  }
}
/** Image (Uint32) to RGBA bytes, optionally upscaled by an integer factor (nearest neighbour). */
export function toRGBA(img, k = 1) {
  const W = img.w * k, H = img.h * k, out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = img.px[((y / k) | 0) * img.w + ((x / k) | 0)], o = (y * W + x) * 4;
    out[o] = c & 255; out[o + 1] = (c >>> 8) & 255; out[o + 2] = (c >>> 16) & 255; out[o + 3] = c >>> 24;
  }
  return { w: W, h: H, rgba: out };
}
