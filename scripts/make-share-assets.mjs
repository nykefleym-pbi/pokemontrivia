// Generates the two images that carry the site's first impression:
//
//   public/og-image.png  — the 1200x630 card every social platform and some
//                          search results render. Self-hosted, because the
//                          previous one lived in the Lovable prototype's R2
//                          bucket and would have taken every preview with it.
//   public/icons/Pokemon Trivia Battle Logo.webp
//                        — the landing page's LCP element. The source artwork
//                          is 2000x2000 and is rendered at 224 CSS px, so the
//                          browser was downloading roughly eighty times the
//                          pixels it could show, at fetchPriority=high, before
//                          anything else could paint.
//
//   node scripts/make-share-assets.mjs
//
// Idempotent: re-running on an already-resized logo is a no-op, so this cannot
// quietly degrade the artwork a second time. The 2000px original stays in git
// history if a larger rendition is ever needed.
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";

const LOGO = "public/icons/Pokemon Trivia Battle Logo.webp";
const OG = "public/og-image.png";

// Rendered at w-[224px]; 2x covers every phone DPR in use. Going to 3x would
// add weight for a difference no one can see on a logo this size.
const LOGO_WIDTH = 448;

// The landing page's own gradient, converted from the oklch values in
// styles.css to sRGB so the card matches the page it links to.
const TOP = "#fcf7e4";
const BOTTOM = "#c7efff";

const before = readFileSync(LOGO);
const meta = await sharp(before).metadata();

if (meta.width > LOGO_WIDTH) {
  const resized = await sharp(before)
    .resize({ width: LOGO_WIDTH, withoutEnlargement: true })
    .webp({ quality: 88 })
    .toBuffer();
  writeFileSync(LOGO, resized);
  const pct = Math.round((1 - resized.length / before.length) * 100);
  console.log(
    `logo  ${meta.width}px ${(before.length / 1024).toFixed(0)}KB ->` +
      ` ${LOGO_WIDTH}px ${(resized.length / 1024).toFixed(0)}KB (-${pct}%)`,
  );
} else {
  console.log(`logo  already ${meta.width}px — left alone`);
}

// The card: the app's gradient, with the wordmark centred. No text is drawn on
// top — the logo already contains the wordmark as artwork, and compositing real
// text would depend on whichever fonts happen to exist on the machine running
// this, which is not something to discover from a bad preview months later.
const background = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
     <defs>
       <linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">
         <stop offset="0%" stop-color="${TOP}"/>
         <stop offset="100%" stop-color="${BOTTOM}"/>
       </linearGradient>
     </defs>
     <rect width="1200" height="630" fill="url(#g)"/>
   </svg>`,
);

const mark = await sharp(readFileSync(LOGO))
  .resize({ width: 760, withoutEnlargement: true })
  .toBuffer();
const markMeta = await sharp(mark).metadata();

const og = await sharp(background)
  .composite([
    {
      input: mark,
      top: Math.round((630 - markMeta.height) / 2),
      left: Math.round((1200 - markMeta.width) / 2),
    },
  ])
  // Palette PNG, not truecolour: 383KB -> 91KB on this artwork. JPEG is smaller
  // still (53KB) but puts ringing artifacts on the wordmark's hard edges, which
  // is the one part of this image anybody actually reads.
  .png({ compressionLevel: 9, palette: true })
  .toBuffer();

writeFileSync(OG, og);
console.log(`og    1200x630 ${(og.length / 1024).toFixed(0)}KB -> ${OG}`);
