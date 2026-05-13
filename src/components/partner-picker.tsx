import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { STARTING_PARTNERS, type PokeEntry } from "@/lib/pokemon-data";
import { getAbility } from "@/lib/abilities";
import { PokemonSprite, TypeBadge } from "@/components/game-ui";

interface Props {
  onPick: (p: PokeEntry) => void;
  selected: PokeEntry | null;
  limit?: number;
}

export function PartnerPicker({ onPick, selected, limit = 24 }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STARTING_PARTNERS
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true))
      .slice(0, limit);
  }, [query, limit]);

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-2xl bg-poke-yellow/15 px-3 py-2 text-[11px] text-foreground/80">
        🌱 Choose a starter — train it through battles to evolve into stronger forms.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search starters..."
          className="rounded-2xl border-2 bg-card pl-10 text-base"
        />
      </div>
      <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const isSel = selected?.id === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className={`flex flex-col items-center rounded-2xl p-2 transition active:scale-95 ${
                isSel
                  ? "bg-primary/15 ring-2 ring-primary"
                  : "border-2 border-border bg-card hover:border-primary/50"
              }`}
            >
              <PokemonSprite id={p.id} alt={p.name} className="sprite h-14 w-14" />
              <div className="mt-1 truncate text-[11px] font-semibold">{p.name}</div>
              <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                {p.types.map((t) => (
                  <TypeBadge key={t} type={t} size="sm" />
                ))}
              </div>
              <div className="font-pixel text-[8px] text-primary">⚡ {getAbility(p.types).name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
