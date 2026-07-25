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
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      // Asset filenames contain spaces — encode so the URL is always valid.
      src={encodeURI(src)}
      alt={alt}
      aria-hidden={alt === "" ? true : undefined}
      loading="lazy"
      decoding="async"
      draggable={false}
      className={`select-none object-contain ${className}`}
    />
  );
}
