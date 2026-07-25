/**
 * Renderer for the owner-supplied .webp icon art in src/lib/app-icons.ts.
 *
 * Deliberately does NOT use the `.sprite` class: that forces
 * `image-rendering: pixelated` for PokeAPI's low-res pixel sprites, which would
 * visibly destroy these smooth high-resolution icons.
 *
 * `alt` defaults to "" because nearly every icon here sits beside its own text
 * label (a button caption, a trophy name), making the image decorative — a
 * duplicate alt would just make screen readers say everything twice. Pass an
 * explicit alt only where the icon carries meaning no nearby text conveys.
 */
export function AppIcon({
  src,
  alt = "",
  className = "",
  style,
  eager = false,
}: {
  src: string;
  alt?: string;
  className?: string;
  /** Escape hatch for one-off effects (e.g. a drop-shadow on a hero icon). */
  style?: React.CSSProperties;
  /** Set for above-the-fold art (a hero logo) so it isn't lazy-loaded into a
   *  visible pop-in on first paint. */
  eager?: boolean;
}) {
  return (
    <img
      // Asset filenames contain spaces — encode so the URL is always valid.
      src={encodeURI(src)}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding={eager ? "sync" : "async"}
      draggable={false}
      className={`select-none object-contain ${className}`}
      style={style}
    />
  );
}
