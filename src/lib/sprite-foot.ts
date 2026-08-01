import { useEffect, useState } from "react";
import { spriteFallbacks } from "@/lib/pokemon-data";
import { SPRITE_FOOT_PAD } from "@/lib/result-art";

/**
 * How much empty space a PokéAPI sprite leaves under the creature, MEASURED.
 *
 * A sprite is a fixed square with the creature drawn somewhere inside it, so
 * anchoring the image's bottom edge to a platform leaves the visible feet
 * hovering. Every previous attempt at this used one constant for every species,
 * and a constant cannot be right: Bulbasaur sits high in its frame and floats,
 * a frame-filling Pokémon sinks. The owner has now reported the same "floating"
 * twice — on the battle field and on the result screen — which is the signal
 * that the constant was never the answer.
 *
 * This reads the actual pixels. `battle-field.ts` wrote this down as "the exact
 * fix, if this is ever worth the code"; it is.
 *
 * Everything about it degrades quietly. It needs a canvas and a CORS-clean
 * image, so on the server, on a `drawImage` failure, or before the load
 * finishes, it returns `SPRITE_FOOT_PAD` — the old constant — and the sprite
 * sits where it always did. Results are memoised per URL, so the second
 * Bulbasaur of a session costs nothing.
 */
const cache = new Map<string, number>();

/** Alpha at or below this counts as empty — sprite edges are anti-aliased. */
const ALPHA_FLOOR = 16;

function measure(img: HTMLImageElement): number | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return null;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  try {
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let y = h - 1; y >= 0; y--) {
      const row = y * w * 4;
      for (let x = 0; x < w; x++) {
        if (data[row + x * 4 + 3] > ALPHA_FLOOR) return (h - 1 - y) / h;
      }
    }
  } catch {
    // Tainted canvas — the CDN answered without CORS headers this time.
    return null;
  }
  // Fully transparent image: nothing to stand on the pad anyway.
  return null;
}

export function useSpriteFootPad(pokemonId: number, shiny = false): number {
  const src = spriteFallbacks(pokemonId, shiny)[0];
  const [pad, setPad] = useState(() => cache.get(src) ?? SPRITE_FOOT_PAD);

  useEffect(() => {
    const cached = cache.get(src);
    if (cached !== undefined) {
      setPad(cached);
      return;
    }
    if (typeof document === "undefined") return;
    let alive = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const measured = measure(img);
      if (measured === null) return;
      cache.set(src, measured);
      if (alive) setPad(measured);
    };
    // No onerror handler on purpose: a failed load leaves the constant in
    // place, which is exactly the fallback we want.
    img.src = src;
    return () => {
      alive = false;
    };
  }, [src]);

  return pad;
}
