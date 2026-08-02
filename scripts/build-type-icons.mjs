/*
 * Usage: npm i -D sharp && node scripts/build-type-icons.mjs
 *
 * Builds public/types/<type>.webp — one white glyph per Pokémon type, on
 * transparency, meant to be used as a CSS mask so the caller picks the colour.
 *
 * PokéAPI has no standalone type ICONS. What it has is the full Gen-VIII
 * BADGE: a 200x44 PNG carrying a coloured icon block on the left and the type
 * NAME on the right. Rendered whole next to our own label it would print the
 * word twice, so this crops the icon block off the left and throws the rest
 * away.
 *
 * The glyph inside that block is white on the type's own colour, which makes
 * the extraction a LUMINANCE key rather than a colour one: alpha comes from how
 * white a pixel is, and every output pixel is white. That leaves an
 * uncoloured mask, which is the point — the chip needs the same glyph in the
 * type's colour when idle and in white when selected, and a pre-tinted PNG
 * could only ever do one of those.
 *
 * One-shot: the webp it writes is committed. `sharp` is deliberately not a
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
/** Rendered size. 2x the ~16px the chip draws it at. */
const SIZE = 32;

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

  const { width: W, height: H, channels: C } = info;
  const out = Buffer.alloc(W * H * 4);
  for (let i = 0, p = 0, q = 0; i < W * H; i++, p += C, q += 4) {
    // The glyph is white; the block behind it is the type's colour. Whiteness
    // is therefore coverage — and the MINIMUM channel is what separates them,
    // because a saturated colour always has one low channel while white has
    // none. Luminance would keep half of a yellow block.
    const a = Math.min(data[p], data[p + 1], data[p + 2]);
    out[q] = out[q + 1] = out[q + 2] = 255;
    out[q + 3] = data[p + 3] === 0 ? 0 : a;
  }

  const info2 = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toBuffer();
  writeFileSync(`${OUT}/${name}.webp`, info2);
  console.log(`${name.padEnd(9)} ${String(info2.length).padStart(5)} B`);
}
