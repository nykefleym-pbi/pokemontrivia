/*
 * Usage: npm i -D sharp && node scripts/key-catch-art.mjs
 *
 * Turns the two owner-supplied Who's That result assets — the "YOU CAUGHT A"
 * ribbon and the light burst — into transparent, optimised webp, and re-encodes
 * the Pokedex book icon.
 *
 * ## Why not scripts/key-level-art.mjs
 *
 * That script un-premultiplies against BLACK, because the level-up plaques were
 * flattened onto a dark checkerboard. These two arrived on a LIGHT one (two
 * greys around 246 and 254), and the same formula would key the art itself to
 * near-opaque white.
 *
 * The obvious replacement — recover alpha from how much checker contrast
 * survives at each pixel — is exact in principle and useless here in practice:
 * the two greys differ by 8 levels, so alpha would land in steps of about an
 * eighth with 8-bit rounding on top. Measured, not assumed; see the border
 * histogram this script prints.
 *
 * So each asset is keyed by what it actually IS:
 *
 *   ribbon  A hard-edged graphic. Everything the background can REACH from the
 *           border is background; everything it cannot is art. That flood fill
 *           is what protects the white lettering, which is the same colour as
 *           the checkerboard and would otherwise be punched out. The drop
 *           shadow is neutral and darker than the checker, so it is recovered
 *           as black at `alpha = (bg - value) / bg` — the exact solution for a
 *           black shadow over a known background.
 *
 *   burst   Coloured light. Its alpha is CHROMA: the background is neutral, the
 *           glow is saturated yellow, and the distance between those is the one
 *           signal the flatten did not destroy. The white core is the exception
 *           — it is genuinely indistinguishable from a white checker square —
 *           so it is recovered the same way the lettering is, by being enclosed:
 *           any transparent region the border cannot reach is interior, and
 *           interior of a burst is opaque.
 */
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const UI = fileURLToPath(new URL("../public/ui", import.meta.url));

/** Pixels the background can reach from the border, 4-connected. */
function floodFromBorder(isBg, W, H) {
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) {
    for (const i of [x, (H - 1) * W + x]) if (isBg[i] && !seen[i]) ((seen[i] = 1), stack.push(i));
  }
  for (let y = 0; y < H; y++) {
    for (const i of [y * W, y * W + W - 1]) if (isBg[i] && !seen[i]) ((seen[i] = 1), stack.push(i));
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % W;
    const y = (i / W) | 0;
    if (x > 0 && isBg[i - 1] && !seen[i - 1]) ((seen[i - 1] = 1), stack.push(i - 1));
    if (x < W - 1 && isBg[i + 1] && !seen[i + 1]) ((seen[i + 1] = 1), stack.push(i + 1));
    if (y > 0 && isBg[i - W] && !seen[i - W]) ((seen[i - W] = 1), stack.push(i - W));
    if (y < H - 1 && isBg[i + W] && !seen[i + W]) ((seen[i + W] = 1), stack.push(i + W));
  }
  return seen;
}

/**
 * Reconstruct the checkerboard exactly: its two greys, its square size, and
 * which parity is which.
 *
 * Worth the trouble because a single averaged "background" is what ruined the
 * first attempt. The two squares differ by about 8 levels, so keying against
 * the light one leaves the dark one as a 3%-black shadow — a faint grid printed
 * across the whole asset, clearly visible over the app's cream. Knowing b(x, y)
 * per pixel makes the background land at exactly zero on both squares.
 *
 * The size is read off the longest run of one grey along a border row, which is
 * background by construction.
 */
function measureChecker(data, W, H, C) {
  const hist = new Map();
  const band = 10;
  for (let y = 0; y < H; y++) {
    const edge = y < band || y >= H - band;
    for (let x = 0; x < W; x++) {
      if (!edge && x >= band && x < W - band) continue;
      const p = (y * W + x) * C;
      hist.set(data[p], (hist.get(data[p]) ?? 0) + 1);
    }
  }
  const modes = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  const light = Math.max(modes[0][0], modes[1][0]);
  const dark = Math.min(modes[0][0], modes[1][0]);
  const mid = (light + dark) / 2;

  // Square size: the most common run length along a border row.
  const isLight = (x, y) => data[(y * W + x) * C] > mid;
  const runs = new Map();
  let run = 1;
  for (let x = 1; x < W; x++) {
    if (isLight(x, 2) === isLight(x - 1, 2)) run++;
    else {
      if (run > 4) runs.set(run, (runs.get(run) ?? 0) + 1);
      run = 1;
    }
  }
  const size = [...runs.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 40;

  // Phase: square (0,0) is whatever the top-left corner is.
  const cornerLight = isLight(2, 2);
  const bgAt = (x, y) => {
    const even = ((((x / size) | 0) + ((y / size) | 0)) & 1) === 0;
    return even === cornerLight ? light : dark;
  };
  return { light, dark, size, bgAt, modes: modes.slice(0, 3) };
}

async function keyRibbon(name, outWidth) {
  const { data, info } = await sharp(`${UI}/${name}.png`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const N = W * H;
  const { light, dark, size, bgAt, modes } = measureChecker(data, W, H, C);
  console.log(`${name}: checker ${dark}/${light} @${size}px  modes ${JSON.stringify(modes)}`);

  // Background candidate: neutral, and no darker than the dark square. Anything
  // below that is the drop shadow and must survive.
  const isBg = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += C) {
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (chroma <= 6 && r >= dark - 2) isBg[i] = 1;
  }
  const outside = floodFromBorder(isBg, W, H);

  const out = Buffer.alloc(N * 4);
  for (let i = 0, p = 0, q = 0; i < N; i++, p += C, q += 4) {
    const x = i % W;
    const y = (i / W) | 0;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const chroma = Math.max(r, g, b) - Math.min(r, g, b);
    if (outside[i]) {
      // Checker, or the soft shadow lying on it. Against the EXACT local square
      // a black shadow solves cleanly: alpha is how far the pixel was pulled
      // down from that square. Using one averaged grey here is what printed the
      // checker back out as a 3% grid.
      const bgv = bgAt(x, y);
      const raw = chroma <= 8 ? Math.max(0, Math.min(1, (bgv - r) / bgv)) : 0;
      // The checker's edges are not crisp — the border histogram shows 247 and
      // 252 alongside the two true greys — so even exact cancellation leaves a
      // couple of percent, which reads as a faint grid around the ribbon. Lift
      // the floor away rather than clipping it, so the shadow keeps its
      // gradient instead of gaining a hard rim.
      const a = Math.max(0, (raw - 0.06) / 0.94);
      out[q] = out[q + 1] = out[q + 2] = 0;
      out[q + 3] = Math.round(a * 255);
    } else {
      out[q] = r;
      out[q + 1] = g;
      out[q + 2] = b;
      out[q + 3] = 255;
    }
  }

  const buf = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .resize({ width: outWidth })
    .trim({ threshold: 1 })
    .webp({ quality: 92, alphaQuality: 100, effort: 6 })
    .toBuffer();
  return buf;
}

async function keyBurst(name, outWidth) {
  const { data, info } = await sharp(`${UI}/${name}.png`).raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const N = W * H;
  const { size, bgAt, light, dark, modes } = measureChecker(data, W, H, C);
  console.log(`${name}: checker ${dark}/${light} @${size}px  modes ${JSON.stringify(modes)}`);

  // Chroma is the signal: the checkerboard is neutral and the glow is saturated
  // yellow, and that separation is the one thing flattening onto a near-white
  // background did NOT destroy. (Brightness is useless here — a bright glow over
  // a 250 background can only add five levels.) Scaled by the image's own
  // strong-glow level so a re-drawn burst keys the same way.
  const chroma = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += C) {
    chroma[i] =
      Math.max(data[p], data[p + 1], data[p + 2]) - Math.min(data[p], data[p + 1], data[p + 2]);
  }
  const sorted = Uint8Array.from(chroma).sort();
  const peak = Math.max(24, sorted[Math.floor(N * 0.995)]);

  const alpha = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = chroma[i] / peak;
    // Anything under a few percent is checker noise, not glow. Without this
    // floor the un-premultiply below divides by ~0.02 and turns a neutral grid
    // into saturated garbage — which is exactly how the checkerboard printed
    // itself back across the first attempt.
    alpha[i] = a < 0.06 ? 0 : Math.min(1, a);
  }

  // The white core carries no chroma at all, so fill it the way the ribbon's
  // lettering is protected: anything transparent the border cannot reach is
  // inside the glow, and inside the glow is solid light.
  const isClear = new Uint8Array(N);
  for (let i = 0; i < N; i++) isClear[i] = alpha[i] < 0.12 ? 1 : 0;
  const outside = floodFromBorder(isClear, W, H);
  for (let i = 0; i < N; i++) if (isClear[i] && !outside[i]) alpha[i] = 1;

  const out = Buffer.alloc(N * 4);
  for (let i = 0, p = 0, q = 0; i < N; i++, p += C, q += 4) {
    const a = alpha[i];
    const bgv = bgAt(i % W, (i / W) | 0);
    // Un-premultiply against the EXACT local square so a half-covered ray keeps
    // the glow's own colour instead of a washed-out blend of it.
    for (let c = 0; c < 3; c++) {
      out[q + c] =
        a <= 0 ? 0 : Math.max(0, Math.min(255, Math.round((data[p + c] - bgv * (1 - a)) / a)));
    }
    out[q + 3] = Math.round(a * 255);
  }

  return sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .resize({ width: outWidth })
    .webp({ quality: 88, alphaQuality: 100, effort: 6 })
    .toBuffer();
}

const ribbon = await keyRibbon("You caught a", 900);
await sharp(ribbon).toFile(`${UI}/You caught a.webp`);
console.log(`You caught a.webp  ${(ribbon.length / 1024).toFixed(1)} KB`);

const burst = await keyBurst("Light Burst", 720);
await sharp(burst).toFile(`${UI}/Light Burst.webp`);
console.log(`Light Burst.webp   ${(burst.length / 1024).toFixed(1)} KB`);

// The Pokedex book is already transparent webp; this only shrinks it to the
// size it is actually drawn at.
const dex = await sharp(`${UI}/Pokedex.webp`)
  .resize({ width: 160 })
  .webp({ quality: 90, alphaQuality: 100, effort: 6 })
  .toBuffer();
await sharp(dex).toFile(`${UI}/Pokedex.webp`);
console.log(`Pokedex.webp       ${(dex.length / 1024).toFixed(1)} KB`);
