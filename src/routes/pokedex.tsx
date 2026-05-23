import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { ALL_POKEMON, type PokeType } from "@/lib/pokemon-data";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { TypeBadge, PokemonSprite } from "@/components/game-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/pokedex")({
  component: PokedexPage,
});

const ALL_TYPES: PokeType[] = [
  "normal","fire","water","electric","grass","ice","fighting","poison","ground",
  "flying","psychic","bug","rock","ghost","dragon","dark","steel","fairy",
];

const GEN_RANGES: Array<{ gen: number; from: number; to: number }> = [
  { gen: 1, from: 1, to: 151 },
  { gen: 2, from: 152, to: 251 },
  { gen: 3, from: 252, to: 386 },
  { gen: 4, from: 387, to: 493 },
  { gen: 5, from: 494, to: 649 },
  { gen: 6, from: 650, to: 721 },
  { gen: 7, from: 722, to: 809 },
  { gen: 8, from: 810, to: 905 },
  { gen: 9, from: 906, to: 1025 },
];

function PokedexPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const pokedex = useGameStore((s) => s.pokedex);
  const navigate = useNavigate();
  const [gen, setGen] = useState(1);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | PokeType>("all");
  const [capturedOnly, setCapturedOnly] = useState(false);
  const [shinyOnly, setShinyOnly] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showShiny, setShowShiny] = useState(false);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  const total = ALL_POKEMON.length;
  const captured = Object.keys(pokedex).length;
  const shinies = Object.values(pokedex).filter((e) => e.shinyUnlocked).length;
  const pct = Math.round((captured / total) * 100);

  const range = GEN_RANGES.find((g) => g.gen === gen)!;
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return ALL_POKEMON.filter((p) => {
      if (p.id < range.from || p.id > range.to) return false;
      if (q && !p.name.toLowerCase().startsWith(q)) return false;
      if (type !== "all" && !p.types.includes(type)) return false;
      if (capturedOnly && !pokedex[p.id]) return false;
      if (shinyOnly && !pokedex[p.id]?.shinyUnlocked) return false;
      return true;
    });
  }, [range, q, type, capturedOnly, shinyOnly, pokedex]);

  if (!hasOnboarded) return null;

  return (
    <div className="h-full w-full overflow-y-auto bg-background pb-nav safe-x">
      {/* Hero stats strip */}
      <div className="bg-poke-hero px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <h1 className="font-pixel text-base text-poke-dark">Pokédex</h1>
        <div className="mt-3 flex items-end gap-4">
          <div>
            <div className="font-pixel text-2xl text-primary">{captured}</div>
            <div className="font-pixel text-[9px] uppercase text-poke-dark/60">/ {total}</div>
          </div>
          <div className="flex items-end gap-1 text-yellow-500">
            <Sparkles className="h-4 w-4" />
            <span className="font-pixel text-lg">{shinies}</span>
          </div>
          <div className="ml-auto font-pixel text-[10px] text-poke-dark/70">{pct}%</div>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-poke-dark/15">
          <div
            className="h-full bg-gradient-to-r from-poke-yellow to-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Sticky filters */}
      <div className="sticky top-0 z-20 border-b border-border bg-card/95 px-5 py-2 backdrop-blur">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name..."
            className="h-8 pl-9 text-xs"
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={gen}
            onChange={(e) => setGen(Number(e.target.value))}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            {GEN_RANGES.map((g) => (
              <option key={g.gen} value={g.gen}>Gen {g.gen}</option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as "all" | PokeType)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          >
            <option value="all">All Types</option>
            {ALL_TYPES.map((t) => (
              <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
            ))}
          </select>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-[10px] font-pixel uppercase">
              Caught
              <Switch checked={capturedOnly} onCheckedChange={setCapturedOnly} />
            </label>
            <label className="flex items-center gap-1.5 text-[10px] font-pixel uppercase">
              Shiny
              <Switch checked={shinyOnly} onCheckedChange={setShinyOnly} />
            </label>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="px-3 pb-8 pt-3">
        <div className="grid grid-cols-3 gap-2 min-[400px]:grid-cols-4">
          {filtered.map((p) => {
            const e = pokedex[p.id];
            const got = !!e;
            return (
              <button
                key={p.id}
                onClick={() => { setDetailId(p.id); setShowShiny(false); }}
                style={{ contentVisibility: "auto", containIntrinsicSize: "96px 96px" } as React.CSSProperties}
                className={`relative flex flex-col items-center rounded-2xl p-2 transition active:scale-95 ${
                  got ? "bg-card shadow-sm" : "bg-muted/30"
                }`}
              >
                <PokemonSprite
                  id={p.id}
                  alt={got ? p.name : "???"}
                  className={`sprite h-14 w-14 ${got ? "" : "sprite-silhouette"}`}
                />
                <div className="mt-1 w-full truncate text-center text-[10px] font-semibold">
                  {got ? p.name : "???"}
                </div>
                {got && e.defeatCount > 1 && (
                  <div className="absolute right-1 top-1 rounded bg-primary px-1 font-pixel text-[8px] text-primary-foreground">
                    ×{e.defeatCount}
                  </div>
                )}
                {e?.shinyUnlocked && (
                  <Sparkles className="absolute left-1 top-1 h-3 w-3 text-yellow-400" />
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 py-8 text-center text-xs text-muted-foreground min-[400px]:col-span-4">
              No matches.
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-xs">
          {detailId !== null && (() => {
            const p = ALL_POKEMON.find((x) => x.id === detailId);
            const entry = pokedex[detailId];
            if (!p) return null;
            const got = !!entry;
            const showS = showShiny && entry?.shinyUnlocked;
            const displayName = got ? p.name : p.name.replace(/[a-zA-Z]/g, "*");
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span>#{String(p.id).padStart(4, "0")} {displayName}</span>
                    {entry?.shinyUnlocked && <Sparkles className="h-4 w-4 text-yellow-400" />}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3">
                  <PokemonSprite
                    id={p.id}
                    shiny={!!showS}
                    alt={displayName}
                    className={`sprite h-32 w-32 ${got ? "" : "sprite-silhouette"}`}
                  />
                  <div className="flex gap-1">
                    {got
                      ? p.types.map((t) => <TypeBadge key={t} type={t} />)
                      : <span className="font-pixel text-[10px] uppercase text-muted-foreground">??? type</span>}
                  </div>
                  {entry ? (
                    <>
                      <div className="text-center text-xs text-muted-foreground">
                        <div>Defeated {entry.defeatCount}×</div>
                        <div>First seen {new Date(entry.firstSeenAt).toLocaleDateString()}</div>
                      </div>
                      <PokedexFlavor pokemonId={p.id} />
                    </>
                  ) : (
                    <div className="text-xs text-muted-foreground">Not yet captured</div>
                  )}
                  {entry?.shinyUnlocked && (
                    <Button size="sm" variant="outline" onClick={() => setShowShiny((v) => !v)}>
                      Toggle {showS ? "Normal" : "Shiny"}
                    </Button>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PokedexFlavor({ pokemonId }: { pokemonId: number }) {
  const [flavor, setFlavor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFlavor(null);
    fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokemonId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const entries = data.flavor_text_entries ?? [];
        const preferredVersions = ["scarlet", "violet", "sword", "shield", "ultra-sun", "sun", "x", "black-2", "platinum"];
        let best: { flavor_text: string } | undefined;
        for (const ver of preferredVersions) {
          best = entries.find((e: { language: { name: string }; version: { name: string } }) => e.language.name === "en" && e.version.name === ver);
          if (best) break;
        }
        if (!best) {
          best = entries.find((e: { language: { name: string } }) => e.language.name === "en");
        }
        if (best) {
          setFlavor(best.flavor_text.replace(/[\n\f]/g, " ").replace(/POKéMON/g, "Pokémon"));
        }
      })
      .catch(() => { /* silent */ })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [pokemonId]);

  if (loading) return null;
  if (!flavor) return null;
  return (
    <div className="rounded-xl bg-muted/50 p-2 text-center text-[11px] italic leading-relaxed text-muted-foreground">
      {flavor}
    </div>
  );
}
