import { useId } from "react";
import { glossSvg } from "@/components/na/gloss-data";

export type GlossIconKind =
  | "star" | "crown" | "map" | "heart" | "heart-empty" | "lock" | "question" | "globe" | "dex" | "profile"
  | "volume" | "music" | "wifi-off" | "calendar" | "bag" | "pokeball" | "play" | "keyboard" | "target" | "bot"
  | "refresh" | "qr" | "gear" | "shield" | "bell" | "pencil" | "idea" | "bug" | "facebook" | "share" | "warning";

/** Unique gradient ids per instance, so several icons on one screen never share a gradient. */
export function uniqueIds(markup: string, uid: string): string {
  return markup.replace(/id="(a|b|hs|hd)"/g, `id="$1${uid}"`).replace(/url\(#(a|b|hs|hd)\)/g, `url(#$1${uid})`);
}

/**
 * Figma's glossy icon (every icon outside the tab bar, owner rule 2026-11-23):
 * drawn from the design file's own definitions in gloss-data.ts.
 */
export function NaGlossIcon({ kind, size = 24, className }: { kind: GlossIconKind; size?: number; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const inner = uniqueIds(glossSvg(kind) as string, uid).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      className={className}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}
