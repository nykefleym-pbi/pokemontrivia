import { NaGlossIcon } from "@/components/na/gloss-icon";

/** Figma "Region row": map tile, region name, a caption, its caught meter and a radio. */
export function NaRegionRow({
  name,
  sub,
  pct,
  on,
  onClick,
}: {
  name: string;
  sub: string;
  /** 0..1, how much of the region is caught. */
  pct: number;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-2xl bg-white/[0.08] p-3 text-left ${on ? "border-2 border-primary" : "border border-white/[0.12]"}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-night-deep/60">
        <NaGlossIcon kind="map" size={22} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="na-headline text-foreground">{name}</span>
        <span className="na-caption text-text-secondary">{sub}</span>
        <span className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.12]">
          <span className="na-fill-gold block h-full rounded-full" style={{ width: `${pct * 100}%` }} />
        </span>
      </span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-primary" : "border-white/30"}`}>
        {on && <span className="h-3 w-3 rounded-full bg-primary" />}
      </span>
    </button>
  );
}
