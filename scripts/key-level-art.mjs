/**
 * Turns the three owner-supplied level-up PNGs into trimmed, transparent webp.
 *
 * They arrived as opaque PNGs: the art sits on a dark checkerboard (the shields)
 * or on flat black (the arrows), which is a rendering of transparency, not
 * transparency. Dropped on the level-up screen's navy backdrop they show as
 * black tiles.
 *
 * The key is an UN-PREMULTIPLY, not a colour-distance matte: a glow drawn on
 * black is already `colour * coverage`, so recovering `alpha = maxChannel/255`
 * and `rgb = pixel/alpha` reconstructs exactly the layer that was flattened —
 * every ray and sparkle keeps its own soft falloff instead of getting a cut-out
 * edge. `floor` is measured off the image's own border band so the checkerboard
 * lands at alpha 0 with no guessing.
 *
 * The shield FACE breaks that rule: it is dark on purpose (near-black navy,
 * dark red), so the same formula would make it 15% opaque. It is recovered
 * separately as a flood fill inward from the centre, which stops dead at the
 * bright metal rim, and forced opaque.
 */
/*
 * Usage: npm i -D sharp && node scripts/key-level-art.mjs
 *
 * One-shot: the webp it writes is committed, so this is here to be re-run if
 * the art is ever redrawn, not as part of the build. `sharp` is deliberately
 * NOT a dependency of the app for the same reason.
 */
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const UI = fileURLToPath(new URL("../public/ui", import.meta.url));

async function key(name, { solidFill, outWidth }) {
  const src = sharp(`${UI}/${name}.png`);
  const { data, info } = await src.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const N = W * H;

  const maxc = new Uint8Array(N);
  for (let i = 0, p = 0; i < N; i++, p += C) {
    maxc[i] = Math.max(data[p], data[p + 1], data[p + 2]);
  }

  // The background floor, measured rather than assumed: scan a 30px border band
  // (which is always background in all three files) and take its brightest
  // pixel. Anything at or below that is the checkerboard/black and must vanish.
  let floor = 0;
  const band = 30;
  for (let y = 0; y < H; y++) {
    const edgeRow = y < band || y >= H - band;
    for (let x = 0; x < W; x++) {
      if (!edgeRow && x >= band && x < W - band) continue;
      if (maxc[y * W + x] > floor) floor = maxc[y * W + x];
    }
  }
  floor += 3; // a hair of headroom so the brightest tile lands exactly at 0

  // The shield face: flood fill in from the centre over everything darker than
  // the rim. The rim is 248+ all the way round, the faces peak at 134, so the
  // fill cannot escape.
  const solid = new Uint8Array(N);
  if (solidFill) {
    const stack = [(H >> 1) * W + (W >> 1)];
    solid[stack[0]] = 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % W;
      const y = (i / W) | 0;
      for (const j of [
        x > 0 ? i - 1 : -1,
        x < W - 1 ? i + 1 : -1,
        y > 0 ? i - W : -1,
        y < H - 1 ? i + W : -1,
      ]) {
        if (j >= 0 && !solid[j] && maxc[j] < solidFill) {
          solid[j] = 1;
          stack.push(j);
        }
      }
    }
  }

  const out = Buffer.alloc(N * 4);
  const span = 255 - floor;
  for (let i = 0, p = 0, q = 0; i < N; i++, p += C, q += 4) {
    const m = maxc[i];
    let a = m <= floor ? 0 : Math.round(((m - floor) / span) * 255);
    if (solid[i]) {
      // Original colour, fully opaque — this is a surface, not a light.
      out[q] = data[p];
      out[q + 1] = data[p + 1];
      out[q + 2] = data[p + 2];
      out[q + 3] = 255;
      continue;
    }
    if (a === 0) {
      out[q + 3] = 0;
      continue;
    }
    // Un-premultiply against black. Below ~2% coverage the division amplifies
    // compression noise into confetti, so leave those as-is.
    const k = m > 6 ? 255 / m : 1;
    out[q] = Math.min(255, Math.round(data[p] * k));
    out[q + 1] = Math.min(255, Math.round(data[p + 1] * k));
    out[q + 2] = Math.min(255, Math.round(data[p + 2] * k));
    out[q + 3] = a;
  }

  // Trim to what is actually painted, so the asset's box is the art's box.
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (out[(y * W + x) * 4 + 3] > 4) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const tw = x1 - x0 + 1;
  const th = y1 - y0 + 1;

  // Where the shield FACE sits inside that trimmed box — the number has to be
  // centred on the face, not on the glow's bounding box.
  let f = null;
  if (solidFill) {
    let fx0 = W, fy0 = H, fx1 = -1, fy1 = -1;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++)
        if (solid[y * W + x]) {
          if (x < fx0) fx0 = x;
          if (x > fx1) fx1 = x;
          if (y < fy0) fy0 = y;
          if (y > fy1) fy1 = y;
        }
    f = {
      left: (fx0 - x0) / tw,
      right: (fx1 - x0) / tw,
      top: (fy0 - y0) / th,
      bottom: (fy1 - y0) / th,
    };
  }

  const outH = Math.round((outWidth / tw) * th);
  const info2 = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: x0, top: y0, width: tw, height: th })
    .resize(outWidth, outH, { fit: "fill" })
    .webp({ quality: 88, effort: 6, alphaQuality: 100 })
    .toFile(`${UI}/${name}.webp`);

  console.log(
    `${name}: floor=${floor} trim=${tw}x${th} -> ${outWidth}x${outH} ${(info2.size / 1024).toFixed(1)}KB` +
      (f
        ? `\n   face x ${f.left.toFixed(3)}..${f.right.toFixed(3)}  y ${f.top.toFixed(3)}..${f.bottom.toFixed(3)}`
        : ""),
  );
}

await key("Level Up from", { solidFill: 160, outWidth: 320 });
await key("Level Up to", { solidFill: 160, outWidth: 320 });
await key("Level Up arrow", { solidFill: 0, outWidth: 288 });
