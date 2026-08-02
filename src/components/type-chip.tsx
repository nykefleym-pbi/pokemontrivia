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
 * Art is public/types/*.webp, cropped out of PokéAPI's Gen-VIII type badges by
 * scripts/build-type-icons.mjs. A missing file simply masks nothing and the
 * chip shows its label alone, which is a legible state rather than a broken
 * one.
 */
export function TypeIcon({ type, className = "h-4 w-4" }: { type: PokeType; className?: string }) {
  const url = `url(/types/${type}.webp)`;
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
}: {
  type: PokeType;
  selected?: boolean;
  onClick?: () => void;
  size?: "md" | "lg";
}) {
  const c = typeColorVar(type);
  const style: React.CSSProperties = selected
    ? { background: c, borderColor: "#fff", color: "#fff" }
    : { background: `color-mix(in oklab, ${c} 20%, transparent)`, borderColor: c, color: c };
  const box =
    size === "lg" ? "gap-2 px-5 py-3 text-base" : "gap-1.5 px-2 py-2.5 text-[9px] justify-center";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      onClick={onClick}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      style={style}
      className={`inline-flex items-center rounded-full border-2 font-pixel uppercase tracking-wide transition ${box} ${
        onClick ? "press" : ""
      }`}
    >
      <TypeIcon type={type} className={size === "lg" ? "h-5 w-5" : "h-3.5 w-3.5"} />
      {type}
    </Tag>
  );
}
