import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, X, ArrowRight, Volume2 } from "lucide-react";
import { Fragment } from "react";
import { playCry } from "@/lib/audio";
import { useGameStore } from "@/lib/store";
import { ALL_POKEMON, type PokeType } from "@/lib/pokemon-data";
import { Input } from "@/components/ui/input";
import { TypeBadge, PokemonSprite } from "@/components/game-ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  const trainerName = useGameStore((s) => s.trainerName);
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

  const ringCirc = 2 * Math.PI * 26;

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      {/* Hero */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <p className="font-pixel-xs text-primary">POKÉDEX</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="font-display-xl text-poke-dark">Pokédex</h1>
          <div className="relative h-16 w-16 shrink-0">
            <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
              <circle cx="32" cy="32" r="26" fill="none" stroke="oklch(0.22 0.04 260 / 0.12)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r="26" fill="none"
                stroke="var(--color-primary)" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={ringCirc}
                strokeDashoffset={ringCirc * (1 - pct / 100)}
                style={{ transition: "stroke-dashoffset 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-sm font-extrabold text-poke-dark">{pct}%</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <div className="flex flex-1 items-baseline gap-1.5 rounded-2xl bg-card px-3 py-2 shadow-card">
            <span className="text-lg font-extrabold text-poke-dark">{captured}</span>
            <span className="text-xs text-poke-dark/60">/ {total} caught</span>
          </div>
          <div className="flex items-center gap-1 rounded-2xl bg-card px-3 py-2 shadow-card">
            <Sparkles className="h-4 w-4 text-poke-yellow" />
            <span className="text-lg font-extrabold text-poke-dark">{shinies}</span>
            <span className="text-xs text-poke-dark/60">shiny</span>
          </div>
        </div>
      </div>

      {/* Sticky filters */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/95 px-5 py-3 backdrop-blur">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name…"
            className="h-11 rounded-full border-0 bg-card pl-11 text-sm shadow-card"
          />
        </div>
        <div className="mt-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {GEN_RANGES.map((g) => {
            const active = g.gen === gen;
            return (
              <button
                key={g.gen}
                onClick={() => setGen(g.gen)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  active ? "bg-primary text-primary-foreground shadow-card" : "bg-card text-poke-dark/70 shadow-card"
                }`}
              >
                Gen {g.gen}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize shadow-card transition ${
                  type === "all" ? "bg-card text-poke-dark/70" : "bg-primary text-primary-foreground"
                }`}
              >
                {type === "all" ? "+ Type" : type}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 rounded-2xl p-2" align="start">
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setType("all")}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    type === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-poke-dark/70"
                  }`}
                >
                  All
                </button>
                {ALL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold capitalize text-white"
                    style={{ background: `var(--color-type-${t})`, opacity: type === t ? 1 : 0.7 }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <ToggleChip active={capturedOnly} onToggle={() => setCapturedOnly((v) => !v)} label="Caught" />
          <ToggleChip active={shinyOnly} onToggle={() => setShinyOnly((v) => !v)} label="Shiny" />
          {(type !== "all" || capturedOnly || shinyOnly) && (
            <button
              onClick={() => { setType("all"); setCapturedOnly(false); setShinyOnly(false); }}
              className="ml-auto flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="px-3 pb-8 pt-3">
        <div className="grid grid-cols-3 gap-2.5 min-[400px]:grid-cols-4">
          {filtered.map((p) => {
            const e = pokedex[p.id];
            const got = !!e;
            const primaryType = p.types[0];
            return (
              <button
                key={p.id}
                onClick={() => { setDetailId(p.id); setShowShiny(false); }}
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "112px 112px",
                  ...(got
                    ? { backgroundImage: `linear-gradient(135deg, color-mix(in oklab, var(--color-type-${primaryType}) 18%, transparent), var(--color-card))` }
                    : {}),
                } as React.CSSProperties}
                className={`relative flex flex-col items-center rounded-2xl p-2 transition active:scale-95 ${
                  got ? "shadow-card" : "bg-muted/40"
                }`}
              >
                <PokemonSprite
                  id={p.id}
                  alt={got ? p.name : "???"}
                  className={`sprite h-16 w-16 ${got ? "" : "sprite-silhouette"}`}
                />
                <div className="mt-1 w-full truncate text-center text-[11px] font-bold text-poke-dark">
                  {got ? p.name : "???"}
                </div>
                {got && (
                  <div className="font-pixel-xs text-poke-dark/60">{primaryType}</div>
                )}
                {got && e.defeatCount > 1 && (
                  <div className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shadow-sm">
                    ×{e.defeatCount}
                  </div>
                )}
                {e?.shinyUnlocked && (
                  <div className="absolute left-1 top-1 rounded-full bg-poke-yellow p-0.5 shadow-sm">
                    <Sparkles className="h-2.5 w-2.5 text-poke-dark" />
                  </div>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 py-10 text-center text-xs text-muted-foreground min-[400px]:col-span-4">
              No matches.
            </div>
          )}
        </div>
      </div>

      <Dialog open={detailId !== null} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-w-sm rounded-3xl">
          {detailId !== null && (() => {
            const p = ALL_POKEMON.find((x) => x.id === detailId);
            const entry = pokedex[detailId];
            if (!p) return null;
            const got = !!entry;
            const showS = showShiny && entry?.shinyUnlocked;
            const displayName = got ? p.name : "???";
            const primaryType = p.types[0];
            const columns = buildEvolutionTree(p);
            const hasEvolution = !(columns.length <= 1 && (columns[0]?.length ?? 0) <= 1);
            return (
              <>
                <DialogHeader>
                  <p className="font-pixel-xs text-poke-dark/50">
                    #{String(p.id).padStart(4, "0")}
                  </p>
                  <DialogTitle className="flex items-center gap-2 font-display-lg text-poke-dark">
                    <span>{displayName}</span>
                    {entry?.shinyUnlocked && <Sparkles className="h-4 w-4 text-poke-yellow" />}
                  </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col items-center gap-3">
                  <div
                    className="flex h-44 w-44 items-center justify-center rounded-full"
                    style={{
                      background: `radial-gradient(circle at 50% 55%, color-mix(in oklab, var(--color-type-${primaryType}) 28%, transparent) 0%, transparent 70%)`,
                    }}
                  >
                    <PokemonSprite
                      id={p.id}
                      shiny={!!showS}
                      alt={displayName}
                      className={`sprite h-40 w-40 ${got ? "" : "sprite-silhouette"}`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {p.types.map((t) => <TypeBadge key={t} type={t} />)}
                    <button
                      onClick={() => playCry(p.id)}
                      className="flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[11px] font-bold text-poke-dark/80 shadow-card active:scale-95"
                      aria-label="Play cry"
                    >
                      <Volume2 className="h-3 w-3" /> Cry
                    </button>
                  </div>
                  {entry && (
                    <div className="grid w-full grid-cols-3 gap-2">
                      <Stat label="Defeated" value={`×${entry.defeatCount}`} />
                      <Stat label="First seen" value={new Date(entry.firstSeenAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })} />
                      <Stat label="Shiny" value={entry.shinyUnlocked ? "✓" : "—"} />
                    </div>
                  )}
                  <div className="w-full">
                    <div className="font-pixel-xs mb-1 text-poke-dark/50">POKÉDEX ENTRY</div>
                    {got ? (
                      <PokedexFlavor pokemonId={p.id} />
                    ) : (
                      <div className="rounded-2xl bg-muted/50 p-3 text-center text-[12px] italic text-poke-dark/60">
                        Catch this Pokémon to read its Pokédex entry.
                      </div>
                    )}
                  </div>
                  <div className="w-full">
                    <div className="font-pixel-xs mb-1 text-poke-dark/50">EVOLUTION</div>
                    {!hasEvolution ? (
                      <div className="rounded-2xl bg-muted/40 p-3 text-center text-xs text-poke-dark/60">
                        This Pokémon doesn't evolve.
                      </div>
                    ) : (
                      <div className="flex items-start gap-1 overflow-x-auto rounded-2xl bg-muted/30 p-2">
                        {columns.map((col, ci) => (
                          <Fragment key={ci}>
                            {ci > 0 && (
                              <div className="flex h-20 items-center pt-1">
                                <ArrowRight className="h-4 w-4 text-poke-dark/40" />
                              </div>
                            )}
                            <div
                              className={
                                col.length > 4
                                  ? "grid grid-cols-2 gap-1"
                                  : "flex flex-col gap-1"
                              }
                            >
                              {col.map((stage) => {
                                const stageCaught = !!pokedex[stage.id];
                                const isCurrent = stage.id === p.id;
                                return (
                                  <button
                                    key={stage.id}
                                    onClick={() => setDetailId(stage.id)}
                                    className={`flex w-20 flex-col items-center rounded-2xl p-1.5 transition ${
                                      isCurrent ? "bg-primary/10 ring-2 ring-primary/40" : "hover:bg-muted/50"
                                    }`}
                                  >
                                    <PokemonSprite
                                      id={stage.id}
                                      alt={stageCaught ? stage.name : "???"}
                                      className={`sprite h-12 w-12 ${stageCaught ? "" : "sprite-silhouette"}`}
                                    />
                                    <div className="mt-0.5 w-full truncate text-center text-[10px] font-bold text-poke-dark">
                                      {stageCaught ? stage.name : "???"}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </Fragment>
                        ))}
                      </div>
                    )}
                  </div>
                  {entry?.shinyUnlocked && (
                    <Button
                      onClick={() => setShowShiny((v) => !v)}
                      className="h-11 w-full rounded-full bg-primary text-sm font-bold"
                    >
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

function ToggleChip({ active, onToggle, label }: { active: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      aria-pressed={active}
      onClick={onToggle}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold shadow-card transition ${
        active ? "bg-primary text-primary-foreground" : "bg-card text-poke-dark/70"
      }`}
    >
      {label}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
      <div className="font-pixel-xs text-poke-dark/50">{label}</div>
      <div className="mt-0.5 text-sm font-extrabold text-poke-dark">{value}</div>
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
    <div className="w-full rounded-2xl bg-poke-yellow/15 p-3 text-center text-[12px] italic leading-relaxed text-poke-dark/80">
      {flavor}
    </div>
  );
}

function buildEvolutionTree(p: import("@/lib/pokemon-data").PokeEntry): import("@/lib/pokemon-data").PokeEntry[][] {
  const byId = (id: number) => ALL_POKEMON.find((x) => x.id === id);
  let root = p;
  const seen = new Set<number>();
  while (root.evolvesFromId != null && !seen.has(root.evolvesFromId)) {
    seen.add(root.id);
    const prev = byId(root.evolvesFromId);
    if (!prev) break;
    root = prev;
  }
  const columns: import("@/lib/pokemon-data").PokeEntry[][] = [];
  let frontier = [root];
  const visited = new Set<number>();
  while (frontier.length > 0) {
    const col = frontier.filter((e) => e && !visited.has(e.id));
    if (col.length === 0) break;
    col.forEach((e) => visited.add(e.id));
    columns.push(col);
    const next: import("@/lib/pokemon-data").PokeEntry[] = [];
    for (const node of col) {
      for (const cid of node.evolvesToIds) {
        const child = byId(cid);
        if (child && !visited.has(child.id)) next.push(child);
      }
    }
    frontier = next;
  }
  return columns;
}
