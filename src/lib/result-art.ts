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
  /** Level Up.webp — opaque y 155-356 of 512. */
  levelUp: { top: 0.303, bottom: 0.303 } as ArtPadding,
  /** Who's that Pokemon.webp — opaque y 151-360 of 512. */
  whosThat: { top: 0.295, bottom: 0.295 } as ArtPadding,
  /** It fled.webp — opaque y 211-297 of 512. The tallest padding of the set:
   *  the lettering is a single short line, so untrimmed it reserves nearly six
   *  times the height it draws. */
  itFled: { top: 0.412, bottom: 0.418 } as ArtPadding,
  /** Dash.webp — opaque y 172-339 of 512. */
  dash: { top: 0.336, bottom: 0.336 } as ArtPadding,
} as const;

/**
 * Where the shield FACE sits inside each level-up plaque file.
 *
 * The plaques ship with their glow, and the two glows are not the same size, so
 * the files are NOT interchangeable at a shared width: rendered 320px wide the
 * silver shield's body is 59% of the box and the gold one's is 47%. Two numbers
 * follow from that and both matter.
 *
 * `face` is the body's width as a fraction of the file, so a caller that wants
 * two shields the same size can size each file by its own body instead of by
 * its bounding box — which is what `plaqueWidth` below does.
 *
 * `faceTop` and `faceBottom` are where that plate starts and ends vertically,
 * as fractions of the file. The label is centred BETWEEN them rather than
 * placed at a tuned offset: the two shields have differently-sized glows AND
 * differently-sized faces (the gold plate is 173px tall in its file, the silver
 * 215px), so a single offset that looked right on one sat high on the other —
 * which is exactly what it did.
 *
 * All three numbers are measured off the keyed files by flood-filling the dark
 * plate inward from the centre, not eyeballed. Re-measure if the art is
 * redrawn.
 */
export const LEVEL_PLAQUE = {
  from: { face: 0.591, faceTop: 0.191, faceBottom: 0.824 },
  to: { face: 0.469, faceTop: 0.249, faceBottom: 0.766 },
} as const;

/**
 * File width needed to draw a plaque's shield body at `bodyPx`.
 *
 * The glow then extends past that on every side, which is the intent — it is
 * light, and light is meant to spill onto what is behind it.
 */
export function plaqueWidth(kind: keyof typeof LEVEL_PLAQUE, bodyPx: number): number {
  return Math.round(bodyPx / LEVEL_PLAQUE[kind].face);
}

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
