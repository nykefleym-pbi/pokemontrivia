import type { PokeType } from "@/lib/pokemon-data";
import { TypeBadge } from "@/components/game-ui";

/**
 * Type chips for the partner pickers. The predicates that go with it live in
 * `@/lib/partner-filter` — this file is the presentation half only.
 */
export function PartnerTypeFilter({
  options,
  value,
  onChange,
}: {
  options: PokeType[];
  value: PokeType | null;
  onChange: (next: PokeType | null) => void;
}) {
  // One type in the pool means the chips can only ever say "All" or that type —
  // no filtering to do, so the row is noise.
  if (options.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Filter partners by type"
      className="-mx-1 flex gap-1.5 overflow-x-auto px-1 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <button
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={`shrink-0 rounded-full px-3 py-1 font-pixel text-[9px] uppercase tracking-wide transition press ${
          value === null ? "bg-foreground text-background shadow-sm" : "bg-muted text-foreground/50"
        }`}
      >
        All
      </button>
      {options.map((t) => (
        <button
          key={t}
          onClick={() => onChange(value === t ? null : t)}
          aria-pressed={value === t}
          aria-label={`${t} type`}
          // Tapping the active chip clears it, so the filter can be undone
          // without hunting for "All" at the far left of a scrolled row.
          className={`shrink-0 rounded-full transition press ${
            value === t
              ? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
              : "opacity-45"
          }`}
        >
          <TypeBadge type={t} />
        </button>
      ))}
    </div>
  );
}
