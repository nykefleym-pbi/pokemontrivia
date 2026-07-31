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
 * Measured off a real device screenshot: the two combatants sat 5.6% and 6.8%
 * of the stage too high, and the gap between those two figures tracks their
 * different box sizes (h-36 vs h-40) — which is the tell that this is frame
 * padding rather than a positioning error.
 *
 * It cannot be exact for every species, because the padding varies with how
 * tall the creature is drawn. Tuned so the common case stands ON the pad and
 * outliers sink a few pixels into it, which reads far better than floating.
 */
export const BATTLE_PLATFORM = {
  /** Upper right — the opponent. */
  enemy: { cx: 74, cy: 23.1, w: 41, sink: 7.2 },
  /** Lower left — your partner. */
  player: { cx: 26.5, cy: 34.8, w: 44.6, sink: 8.4 },
} as const;
