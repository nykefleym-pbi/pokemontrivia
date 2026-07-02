// Tiny pixel-art SVG icons (crispEdges rects on a fixed grid) so decorative
// icons match the game's pixel design style better than emoji.
import type { ReactNode } from "react";

function PixelGrid({
  rows,
  palette,
  className,
  label,
}: {
  rows: string[];
  palette: Record<string, string>;
  className?: string;
  label: string;
}) {
  const h = rows.length;
  const w = rows[0].length;
  const rects: ReactNode[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      const fill = palette[c];
      if (!fill) continue;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill} />);
    }
  });
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      {rects}
    </svg>
  );
}

/** Pixel-art gift box (red box, yellow ribbon + bow). */
export function PixelGift({ className }: { className?: string }) {
  return (
    <PixelGrid
      className={className}
      label="Gift"
      palette={{
        o: "#3a2a20", // outline
        r: "#e23b2e", // box
        d: "#b5341f", // box shade
        y: "#f2d64e", // ribbon
        w: "#fff6e3", // highlight
      }}
      rows={[
        "....oo..oo....",
        "...oyyooyyo...",
        "...oyyyyyyo...",
        "....oyyyyo....",
        "oooooooooooooo",
        "orrrrryyrrrrro",
        "orwrrryyrrrrdo",
        "oooooooooooooo",
        ".orrrryyrrrrd.",
        ".orrrryyrrrrd.",
        ".orrrryyrrrrd.",
        ".orrrryyrrrrd.",
        ".oddddyyddddd.",
        ".oooooooooooo.",
      ]}
    />
  );
}

/** Pixel-art Poké Egg (cream shell with green markings). */
export function PixelEgg({ className }: { className?: string }) {
  return (
    <PixelGrid
      className={className}
      label="Poké Egg"
      palette={{
        o: "#3a2a20", // outline
        c: "#fff6e3", // shell
        s: "#f0e2c0", // shell shade
        g: "#7ac74c", // markings
      }}
      rows={[
        ".....oooo.....",
        "....occcco....",
        "...occcccco...",
        "..occgccccco..",
        "..ocggcccgco..",
        ".occcgccggcco.",
        ".occcccccgcco.",
        ".occccccccsso.",
        "occgccccccsso.",
        "ocggccccccssso",
        "occgccccccssso",
        ".occcccccssso.",
        "..occcccssso..",
        "...oossssoo...",
        ".....oooo.....",
      ]}
    />
  );
}
