/*
 * Usage: npm i -D sharp && node scripts/build-type-icons.mjs
 *
 * Builds public/types/<type>.svg — one Pokémon type symbol per file, as a
 * single filled path, so it can be drawn at any size and in any colour.
 *
 * ## Where the art comes from
 *
 * PokéAPI has no standalone type ICONS. What it has is the Gen-VIII BADGE: a
 * 200x44 PNG carrying a coloured icon block on the left and the type NAME on
 * the right. Rendered whole next to our own label it would print the word
 * twice, so this crops the icon block off the left and throws the rest away.
 *
 * The glyph inside that block is white on the type's own colour, so separating
 * them is a key against THAT COLOUR — see the comment on `bg` below for why
 * neither luminance nor the minimum channel is good enough across all eighteen.
 *
 * ## Why SVG, when a webp mask already worked
 *
 * The mask could already be any colour — that is what masking `currentColor`
 * buys. What it could not do is scale: the source block is 44x44, so at the
 * 20px the chips draw it at it was fine and anywhere larger it was mush.
 * Vector has no such ceiling, and it costs less: 18 paths total under 20 KB.
 *
 * ## How the trace works
 *
 * There is no tracer in this toolchain, so this is one: the 44x44 alpha is
 * upscaled 8x with a smoothing kernel and re-thresholded (which turns the
 * staircase into something with a slope worth following), contours are walked
 * with marching squares, and each ring is simplified with Ramer-Douglas-Peucker
 * before being emitted at the original 44-unit scale.
 *
 * Rings come out in both winding directions and are emitted into ONE path with
 * `fill-rule="evenodd"`, which is what makes holes — the eye of the Ghost
 * symbol, the gaps in Steel — holes rather than blobs.
 *
 * One-shot: the SVGs it writes are committed. `sharp` is deliberately not a
 * dependency of the app.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

/** PokéAPI type ids. Order is theirs, not ours. */
const TYPES = {
  normal: 1,
  fighting: 2,
  flying: 3,
  poison: 4,
  ground: 5,
  rock: 6,
  bug: 7,
  ghost: 8,
  steel: 9,
  fire: 10,
  water: 11,
  grass: 12,
  electric: 13,
  psychic: 14,
  ice: 15,
  dragon: 16,
  dark: 17,
  fairy: 18,
};

const OUT = fileURLToPath(new URL("../public/types", import.meta.url));
const SRC = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/types/generation-viii/sword-shield/${id}.png`;
/** Side of the icon block at the left of the 200x44 badge. */
const BLOCK = 44;
/** Trace at 8x. Below ~6x the staircase survives simplification as visible steps. */
const UP = 8;
/** RDP tolerance, in upscaled pixels. ~1.2 keeps curves and drops jaggies. */
const EPS = 1.2;
/** Alpha at or above this is inside the shape. */
const CUT = 128;

/** Signed polygon area (shoelace). Sign is the winding direction. */
function area(r) {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  }
  return a / 2;
}

/** Perpendicular distance from p to the line ab. */
function dist(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const n = Math.hypot(dx, dy);
  if (n === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / n;
}

/**
 * Ramer-Douglas-Peucker on an OPEN polyline.
 *
 * Rings must be closed by the caller — pass `[...ring, ring[0]]` — because the
 * algorithm keeps its two endpoints and measures everything else against the
 * chord between them. Handed a ring raw, those endpoints are two ADJACENT
 * corners one pixel apart, so the chord is a near-degenerate line and the whole
 * outline is judged against it. Closing the ring first makes the endpoints
 * identical, which takes the `n === 0` branch in `dist` and splits at the point
 * furthest from the start — the correct first cut for a loop.
 */
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let worst = 0;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = dist(pts[i], pts[0], pts[pts.length - 1]);
    if (d > worst) {
      worst = d;
      idx = i;
    }
  }
  if (worst <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/**
 * Every closed contour of a binary bitmap, as pixel-corner rings.
 *
 * Not a walk: a STITCH. Each inside pixel contributes one directed unit
 * segment per side whose neighbour is outside, all wound the same way (inside
 * on the left). Those segments can only join end-to-start, so following that
 * chain reconstructs every ring exactly once — outer edges and holes alike,
 * with no turn table and no special cases.
 *
 * The obvious alternative, marching squares with a turn table, is where the
 * first attempt went wrong: a table with one wrong entry does not fail loudly,
 * it just terminates each walk immediately, and the tracer quietly returned one
 * degenerate ring per scanline (352 of them for a 44px glyph) instead of two.
 *
 * Diagonal touches are the one ambiguity — two segments end at the same corner.
 * Taking whichever candidate turns least keeps the two lobes separate, which is
 * what the eye expects of a pixel diagonal.
 */
function contours(bin, W, H) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : bin[y * W + x]);
  /** start corner -> list of segments leaving it */
  const out = new Map();
  const push = (ax, ay, bx, by) => {
    const k = `${ax},${ay}`;
    const list = out.get(k);
    if (list) list.push([bx, by]);
    else out.set(k, [[bx, by]]);
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!at(x, y)) continue;
      if (!at(x, y - 1)) push(x, y, x + 1, y);
      if (!at(x + 1, y)) push(x + 1, y, x + 1, y + 1);
      if (!at(x, y + 1)) push(x + 1, y + 1, x, y + 1);
      if (!at(x - 1, y)) push(x, y + 1, x, y);
    }
  }

  const rings = [];
  for (const [startKey] of out) {
    while ((out.get(startKey) ?? []).length) {
      const ring = [];
      let key = startKey;
      let prev = null;
      let guard = 0;
      while (guard++ < W * H * 4) {
        const list = out.get(key);
        if (!list || !list.length) break;
        const [cx, cy] = key.split(",").map(Number);
        // Least-turn choice, which only matters where two segments share a
        // corner — i.e. a diagonal touch.
        let pick = 0;
        if (list.length > 1 && prev) {
          const inDx = cx - prev[0];
          const inDy = cy - prev[1];
          let best = -Infinity;
          list.forEach(([nx, ny], i) => {
            const dot = inDx * (nx - cx) + inDy * (ny - cy);
            if (dot > best) {
              best = dot;
              pick = i;
            }
          });
        }
        const [nx, ny] = list.splice(pick, 1)[0];
        ring.push([cx, cy]);
        prev = [cx, cy];
        key = `${nx},${ny}`;
        if (key === startKey) break;
      }
      // Drop specks. Anti-aliasing round the glyph leaves a scatter of
      // one- and two-pixel islands that survive thresholding, and each one
      // would otherwise become a ring: 170 of them for Ice. Shoelace area,
      // not point count — a long thin noise ring has plenty of points.
      if (ring.length <= 6 || Math.abs(area(ring)) <= UP * UP * 3) continue;
      // Drop anything touching the edge of the block. These badges are drawn
      // with a bevelled corner, and the sliver of frame left behind by it is
      // large enough to clear the speck filter — it printed a stray triangle in
      // the bottom-left of most of the eighteen. A type symbol is centred with
      // clear margin all round, so "touches the border" identifies the frame
      // and can never identify the glyph.
      if (ring.some(([x, y]) => x <= 0 || y <= 0 || x >= W || y >= H)) continue;
      rings.push(ring);
    }
  }
  return rings;
}

mkdirSync(OUT, { recursive: true });

for (const [name, id] of Object.entries(TYPES)) {
  const res = await fetch(SRC(id));
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  const png = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(png).metadata();

  const { data, info } = await sharp(png)
    .extract({ left: 0, top: 0, width: BLOCK, height: Math.min(BLOCK, meta.height) })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Glyph coverage, keyed against the block's OWN background colour rather than
  // against black or against a channel rule.
  //
  // The obvious keys both fail on this set. Luminance keeps half of a yellow
  // block; the minimum channel handles the saturated types but collapses on the
  // pale ones — Normal, Flying, Rock and Fairy are light enough that their
  // background's minimum channel is nearly as high as white's, and all four
  // traced as a solid rectangle.
  //
  // Sampling the corner gives the background exactly, so coverage is just
  // "how far from that, on the way to white".
  const { width: W0, height: H0, channels: C } = info;
  // The background is the block's MODAL opaque colour, not its corner pixel.
  // The corner is where this went wrong first: these blocks have a rounded or
  // slanted edge, so (0,0) is transparent and its stored RGB is black —
  // measuring "distance from black" then scored the orange background at half
  // coverage, everything crossed the threshold, and the glyphs traced as solid
  // horizontal bands.
  const counts = new Map();
  for (let i = 0, p = 0; i < W0 * H0; i++, p += C) {
    if (data[p + 3] < 250) continue;
    const k = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2];
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  let modal = 0;
  let best = -1;
  for (const [k, n] of counts) if (n > best) ((best = n), (modal = k));
  const bg = [(modal >> 16) & 255, (modal >> 8) & 255, modal & 255];
  const span = Math.hypot(255 - bg[0], 255 - bg[1], 255 - bg[2]) || 1;
  const alpha = Buffer.alloc(W0 * H0);
  for (let i = 0, p = 0; i < W0 * H0; i++, p += C) {
    const d = Math.hypot(data[p] - bg[0], data[p + 1] - bg[1], data[p + 2] - bg[2]);
    // Scaled by the source pixel's own alpha, not merely skipped when it is
    // zero. These blocks have a bevelled bottom-left corner, so the pixels
    // along it are PARTLY transparent over black — far from the background
    // colour, and a plain distance scores them as solid glyph. That printed a
    // stray wedge in the corner of eight of the eighteen icons.
    alpha[i] = Math.min(255, Math.round((d / span) * 255 * (data[p + 3] / 255)));
  }

  // Upscale before tracing so the contour has a slope to follow.
  //
  // `toColourspace("b-w")` is not cosmetic. sharp promotes a raw one-channel
  // input to THREE channels on the way out, so the returned buffer is
  // interleaved RGB and `big[y * W + x]` walks it at a third of the real
  // stride — the read drifts a row every three rows and the "bitmap" comes out
  // as horizontal stripes. That is what made the first two SVG attempts trace
  // one degenerate ring per scanline: the tracer was right and its input was
  // shredded. Forcing greyscale makes the stride match the indexing.
  const W = W0 * UP;
  const H = H0 * UP;
  const { data: big, info: bigInfo } = await sharp(alpha, {
    raw: { width: W0, height: H0, channels: 1 },
  })
    .resize(W, H, { kernel: "cubic" })
    .toColourspace("b-w")
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (bigInfo.channels !== 1) throw new Error(`upscale returned ${bigInfo.channels} channels`);
  const bin = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) bin[i] = big[i] >= CUT ? 1 : 0;

  const rings = contours(bin, W, H);
  const d = rings
    .map((r) => {
      const s = rdp([...r, r[0]], EPS).slice(0, -1);
      const pt = ([x, y]) => `${((x / UP) * 100 / BLOCK).toFixed(2)} ${((y / UP) * 100 / BLOCK).toFixed(2)}`;
      return `M${pt(s[0])}` + s.slice(1).map((p) => `L${pt(p)}`).join("") + "Z";
    })
    .join("");

  // viewBox 0 0 100 100 so the path is resolution-free and the file can be
  // dropped anywhere without knowing the source block's size.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<path fill="currentColor" fill-rule="evenodd" d="${d}"/></svg>\n`;
  writeFileSync(`${OUT}/${name}.svg`, svg);
  console.log(`${name.padEnd(9)} ${rings.length} ring(s)  ${String(svg.length).padStart(5)} B`);
}
