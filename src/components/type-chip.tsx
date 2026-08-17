import type { PokeType } from "@/lib/pokemon-data";
import { typeColorVar } from "@/lib/type-color";

/**
 * The type's symbol, drawn as a MASK rather than an image.
 *
 * The glyph has to be the type's colour when the chip is idle and white when
 * it is selected, and one PNG cannot be both. Masking `currentColor` through
 * the shape makes the icon inherit whatever the chip's text colour already is,
 * so the two can never disagree — and it costs no second asset.
 *
 * Art is public/types/*.svg, traced out of PokéAPI's Gen-VIII type badges by
 * scripts/build-type-icons.mjs. Vector, not the 44x44 raster it started as:
 * the source block is smaller than several of the places this is drawn, so a
 * bitmap mask was already soft on the type-picker's large chips and had no
 * headroom at all. A missing file simply masks nothing and the chip shows its
 * label alone, which is a legible state rather than a broken one.
 */
export function TypeIcon({
  type,
  className = "h-4 w-4",
  style,
}: {
  type: PokeType;
  className?: string;
  /** Merged AFTER the mask properties, so a caller can position or size the
   *  glyph without having to restate the mask. */
  style?: React.CSSProperties;
}) {
  const url = `url(/types/${type}.svg)`;
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 bg-current ${className}`}
      style={{
        maskImage: url,
        WebkitMaskImage: url,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
        ...style,
      }}
    />
  );
}

/**
 * A selectable type chip — icon, then name.
 *
 * Two states, both stated in the type's own colour:
 *
 *   idle      colour and border at full strength, fill at 20%
 *   selected  fill at full strength, everything on it white
 *
 * The 20% fill is `color-mix`, not an opacity on the whole chip: fading the
 * element would take the border and the label down with it, and the point of
 * the idle state is a strong outline over a soft ground.
 *
 * `selected` left undefined renders the idle look with no interaction — that is
 * the read-only use (mode 4's "name any Pokémon with this typing"), where the
 * chips state a fact rather than offering a choice.
 */
export function TypeChip({
  type,
  selected,
  onClick,
  size = "md",
  icon = true,
  fontSize,
  className = "",
}: {
  type: PokeType;
  selected?: boolean;
  onClick?: () => void;
  /**
   * `pick` is `md` with the vertical padding halved — the 18-type picker in
   * Who's That Pokémon mode 1B is six rows deep, so 8px a row is 48px of screen,
   * which is what lets the silhouette above it stay large. It keeps `md`'s pixel
   * face and 9px label; only the padding moves, so the tap target stays ~28px.
   */
  size?: "xs" | "sm" | "md" | "pick" | "lg";
  /**
   * Drop the glyph and keep the word.
   *
   * The label is what identifies a type; the glyph is decoration on top of it.
   * So where a chip has to fit somewhere genuinely narrow — two of them side by
   * side under an evolution rung — the icon is what goes, rather than the chip
   * being allowed to overflow or the word being truncated to "POIS…".
   */
  icon?: boolean;
  /**
   * CSS length overriding the size's label size, for rows that must stay on ONE
   * line inside a fixed-width card — the Pokédex grid cell and the battle combat
   * panel both compute one with `typeRowFontSize`. Everyone else leaves it
   * undefined and gets the size's own type size.
   */
  fontSize?: string;
  /** Extra classes for the wrapper (e.g. `min-w-0` in a nowrap row). */
  className?: string;
}) {
  const c = typeColorVar(type);
  const style: React.CSSProperties = selected
    ? { background: c, borderColor: "#fff", color: "#fff" }
    : { background: `color-mix(in oklab, ${c} 20%, transparent)`, borderColor: c, color: c };
  const box =
    size === "lg"
      ? "gap-2 px-5 py-3 text-base"
      : size === "xs"
        ? "gap-1 px-[3px] py-[3px] text-[7px] tracking-normal justify-center"
        : size === "sm"
          ? "gap-0.5 px-1.5 py-[3px] text-[8px] justify-center"
          : size === "pick"
            ? "gap-1 px-2 py-1.5 text-[9px] justify-center"
            : "gap-1.5 px-2 py-2.5 text-[9px] justify-center";
  // A caller-computed size wins over the size's own, so strip the class rather
  // than let two font sizes fight — the inline style would win anyway, but the
  // dead class is what makes a row look unaffected by `typeRowFontSize`.
  const boxCls = fontSize ? box.replace(/text-\[[^\]]+\]|text-base/, "") : box;
  // `xs` and `sm` are set in the DISPLAY face rather than the pixel one. Press
  // Start 2P is fixed-pitch and enormous per character — "ELECTRIC" at 8px is
  // about 64px of glyph before any padding — so two pixel-font chips physically
  // cannot sit side by side in the hero column or under an evolution rung,
  // which is what forced them to wrap. The proportional face is a little over
  // half the width and lets the pair stay on one row at every dual typing in
  // the roster.
  const face = size === "xs" || size === "sm" ? "font-display font-extrabold" : "font-pixel";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      style={fontSize ? { ...style, fontSize } : style}
      className={`inline-flex min-w-0 items-center whitespace-nowrap rounded-full border-2 uppercase tracking-wide transition ${face} ${boxCls} ${
        onClick ? "press" : ""
      } ${className}`}
    >
      {icon && (
        <TypeIcon
          type={type}
          // Under a caller-computed font size the glyph is sized in `em` so it
          // shrinks with the label. A fixed 12px icon beside a 6px word is the
          // icon wearing the chip, and it would eat the width the shrink was
          // buying in the first place.
          className={
            fontSize
              ? ""
              : size === "lg"
                ? "h-5 w-5"
                : size === "xs" || size === "sm"
                  ? "h-3 w-3"
                  : "h-3.5 w-3.5"
          }
          style={fontSize ? { width: "1.25em", height: "1.25em" } : undefined}
        />
      )}
      <span className="truncate">{type}</span>
    </Tag>
  );
}
