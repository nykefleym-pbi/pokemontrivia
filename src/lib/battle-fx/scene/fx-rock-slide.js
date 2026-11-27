// Rock Slide, as a pixelfx effect: three chunky boulders tumble onto the target, each lands with a dust puff
// and flying grit, then cracks into chips that drop away. Ground effect: origin at the target's feet.
// Written for pixelfx's painter API (no imports, so the same file runs in Node and in the browser).

const hx = (h) => { const n = parseInt(h.slice(1), 16); return (((n >> 16) & 255) | (((n >> 8) & 255) << 8) | ((n & 255) << 16) | (255 << 24)) >>> 0; };
const STONE = ['#1c1a22', '#3a3542', '#5a5262', '#7c7484', '#a39aa6', '#cfc7cf'].map(hx);
const DUST = ['#5e5244', '#8a7a62', '#b8a684'].map(hx);
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const ease = (x) => x * x;

export const meta = {
  name: 'Rock slide', desc: 'Three boulders tumble onto the target, land in dust and crack apart.',
  tags: ['rock', 'stone', 'impact', 'ground'], size: [140, 170], origin: [70, 156], duration: 1.25, loop: false, fps: 30, bg: 'ground',
  options: { seed: 4 },
};

const ROCKS = [ // x offset, landing time, radius, landing y, spin
  [-16, 0.34, 11, -5, 1], [11, 0.48, 13, -3, -1], [28, 0.62, 8, -7, 1],
];

function rockShape(r, seed, ang) {
  const pts = [];
  for (let i = 0; i < 9; i++) { const a = ang + (i / 9) * Math.PI * 2, k = r * (0.78 + rnd(seed + i) * 0.3); pts.push([Math.cos(a) * k, Math.sin(a) * k * 0.86]); }
  return pts;
}
function drawRock(p, x, y, r, seed, ang, alpha = 1) {
  const pts = rockShape(r, seed, ang).map(([a, b]) => [x + a, y + b]);
  p.poly(pts, STONE[2], alpha);
  // lit top-left facet, dark bottom-right
  const lit = rockShape(r * 0.62, seed + 3, ang).map(([a, b]) => [x + a - r * 0.22, y + b - r * 0.24]);
  p.poly(lit, STONE[4], alpha);
  p.poly(rockShape(r * 0.28, seed + 7, ang).map(([a, b]) => [x + a - r * 0.36, y + b - r * 0.4]), STONE[5], alpha);
  const sh = rockShape(r * 0.55, seed + 5, ang).map(([a, b]) => [x + a + r * 0.3, y + b + r * 0.32]);
  p.poly(sh, STONE[1], alpha * 0.9);
  p.polyline([...pts, pts[0]], STONE[0], alpha);
}

export function draw(p, t, o) {
  const seed = o.seed ?? 4;
  ROCKS.forEach(([dx, land, r, ly, spin], i) => {
    const t0 = land - 0.32;
    if (t < t0) return;
    if (t < land) { // falling: accelerate in from above, streaks behind
      const k = (t - t0) / (land - t0), y = -170 + (ly + 170) * ease(k), x = dx - 6 * (1 - k) * spin;
      for (let s = 1; s < 4; s++) p.line(x - 1, y - r - s * 6, x - 1, y - r - s * 6 - 4, DUST[2], 0.5 - s * 0.12);
      drawRock(p, x, y, r, seed + i * 11, spin * k * 2.4);
      return;
    }
    const since = t - land;
    // landing: dust billows out low and fades, grit flies
    if (since < 0.6) {
      const k = since / 0.6;
      for (let j = 0; j < 5; j++) { const a = (j / 4) * Math.PI, d = 6 + k * (14 + j * 3); p.disc(dx + Math.cos(a) * d * (j % 2 ? -1 : 1), ly + 2 - k * 6 - j, 4 + k * 6, DUST[j % 3], 0.55 * (1 - k)); }
      for (let j = 0; j < 6; j++) { const vx = (rnd(seed + i * 7 + j) - 0.5) * 90, vy = -60 - rnd(seed + j * 3) * 50, gx = dx + vx * since, gy = ly + vy * since + 240 * since * since; if (gy < 4) p.px(gx, gy, j % 2 ? STONE[3] : DUST[1]); }
      if (since < 0.08) p.glow(dx, ly, 16, DUST[2], 0.35 * (1 - since / 0.08));
    }
    // the rock sits, then cracks into chips that fall away and fade
    if (since < 0.3) drawRock(p, dx, ly, r, seed + i * 11, spin * 2.4);
    else if (since < 0.75) {
      const k = (since - 0.3) / 0.45;
      for (let j = 0; j < 4; j++) { const a = (j / 4) * Math.PI * 2 + i, cx = dx + Math.cos(a) * (2 + k * 10), cy = ly + Math.sin(a) * 2 + k * k * 10; drawRock(p, cx, cy, r * 0.45, seed + i * 11 + j, a + k * 3, 1 - k); }
    }
  });
}
