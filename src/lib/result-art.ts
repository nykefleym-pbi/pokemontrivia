/**
 * Where the art actually is inside the result screen's four square images.
 *
 * All four are 512x512 with the drawing floating in the middle and a wide
 * transparent band above and below it. Dropped into a layout at face value they
 * behave like a square, so a 300px-wide wordmark reserves 300px of height to
 * show 100px of lettering and the screen reads as mostly gap. Every number here
 * is the fraction of the square that is EMPTY on that edge, measured off the
 * real files by scanning the alpha channel (threshold 24/255) rather than
 * eyeballed:
 *
 *   Victory.webp        opaque y 171-340 of 512
 *   Battle Lost.png     opaque y 173-317
 *   Platform.webp       opaque y 156-355
 *   Platform Lose.webp  opaque y 191-321
 *
 * Re-measure if the art is ever redrawn. A file whose padding changed would
 * still render — it would just sit at the wrong height with a gap under it,
 * which no test and no type can see.
 */
export interface ArtPadding {
  /** Empty fraction above the drawing. */
  top: number;
  /** Empty fraction below it. */
  bottom: number;
}

export const RESULT_ART = {
  victory: { top: 0.334, bottom: 0.334 } as ArtPadding,
  defeat: { top: 0.338, bottom: 0.379 } as ArtPadding,
  platformWin: { top: 0.305, bottom: 0.305 } as ArtPadding,
  platformLose: { top: 0.373, bottom: 0.371 } as ArtPadding,
} as const;

/**
 * How far down each platform square the partner's feet belong, as a fraction of
 * the square's height.
 *
 * Not the middle of the disc: these are drawn in three-quarter view, so the top
 * face is an ellipse in the UPPER part of the shape and the lower part is the
 * rim seen from the side. Standing a sprite at the vertical centre of the
 * bounding box puts it on the front wall.
 */
export const PLATFORM_SURFACE = {
  win: 0.42,
  lose: 0.41,
} as const;

/**
 * The transparent band under a PokéAPI sprite, as a fraction of its box.
 *
 * The creature is drawn inside a fixed square with clear space beneath it, so
 * aligning the IMG's bottom edge to the platform leaves the visible feet
 * hovering. This is the same correction `BATTLE_PLATFORM.sink` makes on the
 * battle field, expressed against the sprite instead of the stage. It is an
 * average: the padding is a property of each species' artwork, so a compact
 * Pokémon sits a little high and a frame-filling one a little low.
 */
export const SPRITE_FOOT_PAD = 0.175;

/**
 * Styles for a wrapper/image pair that shows a square asset at its VISIBLE
 * height, with the empty bands taken out of the layout.
 *
 * Two parts, and both are load-bearing:
 *
 * `wrapper.paddingTop` is a percentage, and a percentage padding resolves
 * against the containing block's WIDTH — so it gives the wrapper a height equal
 * to the fraction of the square that is actually drawn on, with no fixed pixel
 * size and no aspect-ratio guessing.
 *
 * `image.marginTop` is negative and also a percentage, which likewise resolves
 * against width, so it slides the square up by exactly its own empty top band
 * and lands the first painted row on the wrapper's top edge.
 *
 * The naive version — negative margins straight on the image with no wrapper —
 * looks right in isolation and is wrong: the top margin pulls the whole image
 * up out of its parent's padding, so on the result screen it took the wordmark
 * off the top of the phone and clipped "BATTLE WON".
 */
export function trimmedArtStyles(pad: ArtPadding): {
  wrapper: React.CSSProperties;
  image: React.CSSProperties;
} {
  return {
    wrapper: { paddingTop: `${((1 - pad.top - pad.bottom) * 100).toFixed(2)}%` },
    image: { marginTop: `-${(pad.top * 100).toFixed(2)}%` },
  };
}
