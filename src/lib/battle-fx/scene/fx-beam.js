// An aimed beam (Psybeam, Flash Cannon): it shoots from its origin along +x to a target `length` px away, then
// holds, so the stage can aim it like Water Gun. pixelfx's arcane-beam starts at a hand 24 px above its origin and
// is always 168 px long, which made it miss. The look (banded across, pulses running down it, strands twisting round
// it, a flaring source, an end that sprays sparks) is adapted from that effect, itself adapted from Sprite Fusion's
// open-source energy beam (https://www.spritefusion.com/pixel-art-vfx/energy), MIT License, Copyright (c) 2026 Hugo
// Duprez. No imports, so the same file runs in Node and the browser: the stage passes pixelfx's core as o.core.

const D = 1.2, W = 5, GROW = 0.12;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((Math.floor(y) & 3) << 2) | (Math.floor(x) & 3)];

export const meta = {
  name: 'Aimed beam',
  desc: 'A beam shoots from the source to the target and holds: a white core, strands twisting round it, pulses running down it, a flaring source and an end that sprays sparks.',
  tags: ['beam', 'ray', 'directional'],
  size: [200, 80], origin: [16, 40], duration: D, loop: false, fps: 30, bg: 'dark',
  options: { palette: ['#140a26', '#2b1252', '#481c88', '#6b2cc0', '#9a48ec', '#c684ff', '#ecc8ff', '#ffffff'], length: 120, seed: 10 },
};

function mote(p, scale, x, y, vx, vy, c, k) {
  const sp = Math.hypot(vx, vy) || 1, ux = vx / sp, uy = vy / sp, len = Math.min(16, 0.5 + sp * 0.026) * 0.6, a = k < 0.35 ? k / 0.35 : 1;
  p.line(x - ux * len, y - uy * len, x - ux * len * 0.35, y - uy * len * 0.35, scale(c, 0.55), a);
  p.line(x - ux * len * 0.4, y - uy * len * 0.4, x, y, c, a);
  p.glow(x, y, 3.1, c, 0.3 * k);
}

export function draw(p, t, o) {
  const { fit, cycle, fly, flyV, loopNoise, fract, ease, sparkle, scale, TAU, WHITE } = o.core;
  const C = fit(o.palette, 8), ph = t / D, S = o.seed, grow = Math.min(1, t / GROW), L = o.length * ease.outCubic(grow);
  // the body, white core banded out to a dithered edge, wobbling and pulsing as it goes
  const LV = [WHITE, C[6], C[5], C[4], C[3], C[2]];
  for (let d = 0; d <= L; d += 0.5) {
    const w = W * (1 + 0.12 * Math.sin(d * 0.35 - ph * TAU * 8)) * Math.min(1, (d + 3) / 7);
    const pulse = fract(d * 0.025 - ph * 4) < 0.07 ? 1 : 0;
    for (let q0 = -w * 1.3; q0 <= w * 1.3; q0 += 0.5) {
      const q = Math.abs(q0) / w;
      let lv = q < 0.2 ? 0 : q < 0.4 ? 1 : q < 0.62 ? 2 : q < 0.85 ? 3 : q < 1 ? 4 : 5;
      lv = Math.max(0, lv - pulse);
      if (lv === 5 && bayer(d, q0) > (1.3 - q) / 0.3) continue;
      p.px(d, q0, LV[lv]);
    }
    // three strands twisting round it: bright on the near side, gone behind
    for (let s = 0; s < 3; s++) {
      const a = d * 0.17 - ph * TAU * 6 + (s * TAU) / 3, off = Math.sin(a) * w * 1.05;
      if (Math.cos(a) > -0.15) p.dot(d, off, Math.cos(a) > 0.55 ? WHITE : C[6]);
    }
    if ((Math.round(d * 2) & 11) === 0) p.glow(d, 0, w * 2.2 + 4, C[5], 0.2);
  }

  // the source: a flickering flare with spinning rays, energy drawn into it
  const fr = 4 + Math.sin(ph * TAU * 10) * 0.6;
  for (let i = 0; i < 4; i++) {
    const a = ph * TAU * 2.5 + (i * TAU) / 4, l = 7 + 3 * Math.sin(ph * TAU * 6 + i);
    p.line(0, 0, Math.cos(a) * l, Math.sin(a) * l, (u) => (u < 0.5 ? WHITE : C[6]), (u) => (u < 0.6 ? 1 : 1.6 - u));
  }
  p.circle(0, 0, fr + 1.5, C[4]);
  p.circle(0, 0, fr, C[6]);
  p.circle(0, 0, fr * 0.6, WHITE);
  p.glow(0, 0, 28, C[5], 0.8);
  cycle(t, D, 10, S * 3 + 1, 0.18, (age, life, r) => {
    const a = r.range(0, TAU), dd = 16 * (1 - age / life) + 3;
    p.dot(Math.cos(a) * dd, Math.sin(a) * dd, age / life > 0.6 ? WHITE : C[6]);
  });

  // still on its way: just a hot head
  if (grow < 1) { p.circle(L, 0, 3, C[6]); p.circle(L, 0, 1.8, WHITE); p.glow(L, 0, 16, C[5], 0.7); return; }

  // the end, on the target: a hot flare spraying rays back, rings shocking out, sparks thrown off and falling
  const EX = L, ir = 5 + Math.sin(ph * TAU * 12) * 0.8;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI + (i - 3) * 0.36, l = 8 + 8 * Math.abs(loopNoise(ph, 4, S * 7 + i));
    p.line(EX, 0, EX + Math.cos(a) * l, Math.sin(a) * l, (u) => (u < 0.4 ? WHITE : i % 2 ? C[5] : C[6]), (u) => (u < 0.6 ? 1 : 1.6 - u));
  }
  for (let k = 0; k < 3; k++) {
    const q = fract(ph * 3 + k / 3);
    p.ring(EX, 0, 3 + 15 * ease.outCubic(q), Math.max(1, 2 * (1 - q)), q < 0.25 ? WHITE : C[5], 1.1 - q);
  }
  p.circle(EX, 0, ir + 1.5, C[4]);
  p.circle(EX, 0, ir, C[6]);
  p.circle(EX, 0, ir * 0.55, WHITE);
  p.glow(EX, 0, 36, C[5], 0.9);
  p.glow(EX, 0, 12, WHITE, 0.6);
  cycle(t, D, 160, S * 3 + 2, (g) => g.range(0.18, 0.45), (age, life, r) => {
    const a = Math.PI * 1.5 + r.range(-1.7, 0.45), sp = r.range(70, 220), vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - 30;
    const [x, y] = fly(EX, 0, vx, vy, age, 480, 2.2), [ux, uy] = flyV(vx, vy, age, 480, 2.2), k = 1 - age / life;
    if (y > 22) return;
    const head = k > 0.6 ? WHITE : k > 0.3 ? C[6] : C[5], sp2 = Math.hypot(ux, uy) || 1, len = Math.min(7, 1 + sp2 * 0.022);
    p.line(x - (ux / sp2) * len, y - (uy / sp2) * len, x, y, (u) => (u > 0.5 ? head : C[4]));
    p.glow(x, y, 3, head, 0.45 * k);
  });
  cycle(t, D, 6, S * 3 + 3, 0.3, (age, life, r) => {
    const k = Math.sin((age / life) * Math.PI);
    sparkle(p, EX + r.range(-12, 4), r.range(-12, 12), 1 + 2.5 * k, C[6], C[5], 0.4 * k);
  });
  // motes shed along the beam
  cycle(t, D, 14, S * 3 + 4, (g) => g.range(0.3, 0.6), (age, life, r) => {
    const q = age / life, x = r.range(10, Math.max(12, L - 10)) + q * 20, y = r.sign() * (W + 1 + q * r.range(4, 10));
    mote(p, scale, x, y, 40, y * 1.5, r.chance(0.5) ? C[6] : C[5], 1 - q);
  });
}
