/**
 * Which arena artwork a battle is fought on, and where its two platforms are.
 *
 * The owner supplied a Morning and an Evening field and asked for them to be
 * picked by the local clock, so a battle at 8am and one at 9pm do not look like
 * the same afternoon.
 */

export const BATTLE_FIELDS = {
  morning: "/field/Battle Field Morning.webp",
  evening: "/field/Battle Field Evening.webp",
} as const;

export type BattleFieldId = keyof typeof BATTLE_FIELDS;

/** Evening art from 18:00 to 05:59 local, morning art through the day. */
export function battleFieldIdFor(date: Date = new Date()): BattleFieldId {
  const h = date.getHours();
  return h >= 18 || h < 6 ? "evening" : "morning";
}

/**
 * The value for the `--battle-field-art` custom property.
 *
 * Both filenames contain spaces, and a bare space inside `url()` is a parse
 * error that silently drops the whole declaration — the field would just not
 * paint, with nothing in the console. `encodeURI` is not optional here.
 */
export function battleFieldCssUrl(id: BattleFieldId = battleFieldIdFor()): string {
  return `url("${encodeURI(BATTLE_FIELDS[id])}")`;
}

/**
 * Where the artwork's two platforms are, as percentages of the painting.
 *
 * Measured off the real file rather than eyeballed: the platform rims are the
 * only dark near-neutral pixels in the upper half (grass shadows stay
 * green-dominant), so a row-by-row scan for them gives the bounding boxes
 * directly. Both fields are the same composition, so one set of numbers covers
 * morning and evening.
 *
 * `cx`/`cy` is the centre of the pad. `sink` is how far BELOW it the sprite
 * <img>'s bottom edge is anchored, in the same percentage-of-stage units.
 *
 * `sink` is large — 7-8%, where the pad itself is only ~5% tall — and that is
 * not a fudge. PokeAPI sprites are a fixed square canvas with the creature
 * drawn inside it and a wide band of transparent pixels underneath, so
 * anchoring the IMG's bottom edge on the pad puts the visible feet roughly a
 * third of the frame above it. That is the float the owner reported, and the
 * sink is that transparent band.
 *
 * Measured off real device screenshots rather than guessed. The first pass
 * (Cascoon / Bulbasaur) sat 5.6% and 6.8% of the stage too HIGH; the correction
 * for it then put the second pass (Floette / Bulbasaur) 4.4% and 1.8% too LOW.
 * These figures are the average of the two.
 *
 * That spread is the honest limit of this approach, and it is worth being blunt
 * about: the padding is a property of each species' artwork, not of the layout.
 * Cascoon is a small cocoon adrift in its frame and wants ~7%; Floette is drawn
 * nearly frame-height and wants ~3%. No single number satisfies both, so these
 * are tuned to the middle, biased slightly high — a creature hovering a couple
 * of pixels reads better than one with its feet buried in the pad.
 *
 * The exact fix, if this is ever worth the code: read each sprite into a canvas
 * on load and find its lowest opaque row, then offset by that. PokeAPI serves
 * CORS headers and the images are already loaded with `crossOrigin`, so it is
 * available — it is just more machinery than a constant.
 */
export const BATTLE_PLATFORM = {
  /** Upper right — the opponent. */
  enemy: { cx: 74, cy: 23.1, w: 41, sink: 3.8 },
  /** Lower left — your partner. */
  player: { cx: 26.5, cy: 34.8, w: 44.6, sink: 6.8 },
} as const;
