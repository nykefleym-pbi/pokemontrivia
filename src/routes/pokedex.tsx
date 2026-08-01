import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { Search, Sparkles, X, ArrowRight, Volume2, ChevronLeft, Star, Eye } from "lucide-react";
import { Fragment } from "react";
import { playCry, playSfx } from "@/lib/audio";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { EggHatch } from "@/components/mega/EggHatch";
import { ALL_POKEMON, type PokeType } from "@/lib/pokemon-data";
import { Input } from "@/components/ui/input";
import { PokemonSprite, TypeBadge } from "@/components/game-ui";
import { dexStatus, isCaught } from "@/lib/pokedex";
import { typeRowFontSize, DEX_CARD_WIDTH, DEX_CARD_PAD_PX } from "@/lib/type-row-fit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { pokeApiUrls } from "@/lib/api/pokeapi";

export const Route = createFileRoute("/pokedex")({
  component: PokedexPage,
});

const ALL_TYPES: PokeType[] = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
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

/** The caught marker: a 14px Pokeball. `PokeballSpinner`'s 3px border swamps
 *  the shape below ~24px, so this is drawn at size rather than scaled down. */
function MiniPokeball() {
  return (
    <svg viewBox="0 0 32 32" className="h-3.5 w-3.5 shrink-0" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#fff" stroke="#1b1d2b" strokeWidth="3" />
      <path d="M2 16 a14 14 0 0 1 28 0 Z" fill="#ee4b3c" stroke="#1b1d2b" strokeWidth="3" />
      <rect x="2" y="14" width="28" height="4" fill="#1b1d2b" />
      <circle cx="16" cy="16" r="4.5" fill="#fff" stroke="#1b1d2b" strokeWidth="3" />
    </svg>
  );
}

function PokedexPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const pokedex = useGameStore((s) => s.pokedex);
  const partnerId = useGameStore((s) => s.pokemon?.id ?? null);
  const trainerName = useGameStore((s) => s.trainerName);
  const navigate = useNavigate();
  const [gen, setGen] = useState(1);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<"all" | PokeType>("all");
  const [capturedOnly, setCapturedOnly] = useState(false);
  const [shinyOnly, setShinyOnly] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [showShiny, setShowShiny] = useState(false);

  // Play the cry the moment a Pokémon is opened (owner ruling 2026-07-26).
  // Keyed on `detailId`, so it fires exactly once per selection — reopening the
  // same Pokémon plays it again, staying on it does not, and any further replay
  // is the "Play cry" button's job.
  useEffect(() => {
    if (detailId != null) playCry(detailId);
  }, [detailId]);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  const range = GEN_RANGES.find((g) => g.gen === gen)!;
  const regionTotal = range.to - range.from + 1;
  // The ring counts CAUGHT, not registered: a seen-only entry is progress
  // toward the number, not the number itself.
  const regionCaught = ALL_POKEMON.filter(
    (p) => p.id >= range.from && p.id <= range.to && isCaught(pokedex[p.id]),
  ).length;
  const regionPct = regionTotal > 0 ? regionCaught / regionTotal : 0;

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    return ALL_POKEMON.filter((p) => {
      if (p.id < range.from || p.id > range.to) return false;
      if (q && !p.name.toLowerCase().startsWith(q)) return false;
      if (type !== "all" && !p.types.includes(type)) return false;
      // `isCaught`, not merely "has an entry" — seen-only entries exist now and
      // must not satisfy a Caught filter.
      if (capturedOnly && !isCaught(pokedex[p.id])) return false;
      if (shinyOnly && !pokedex[p.id]?.shinyUnlocked) return false;
      return true;
    });
  }, [range, q, type, capturedOnly, shinyOnly, pokedex]);

  if (!hydrated || !hasOnboarded) return null;

  const ringCirc = 2 * Math.PI * 26;

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      {/* Hero */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            {trainerName && (
              <p className="truncate font-pixel-xs uppercase text-primary">{trainerName}'s</p>
            )}
            <h1 className="font-display-xl text-foreground">Pokédex</h1>
          </div>

          <div className="flex items-center gap-3">
            <EggHatch />
            <div className="relative h-16 w-16 shrink-0">
              <svg viewBox="0 0 64 64" className="absolute inset-0 h-full w-full -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="oklch(0.22 0.04 260 / 0.12)"
                  strokeWidth="6"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeDasharray={ringCirc}
                  strokeDashoffset={ringCirc * (1 - regionPct)}
                  style={{ transition: "stroke-dashoffset 0.5s ease" }}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                <span className="text-base font-extrabold text-foreground">{regionCaught}</span>
                <span className="text-[10px] text-foreground/55">/ {regionTotal}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`press shrink-0 rounded-full px-3 py-1.5 text-xs font-bold capitalize shadow-card ${
                  type === "all"
                    ? "bg-card text-foreground/70"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {type === "all" ? "+ Type" : type}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 rounded-2xl bg-card p-2" align="start">
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setType("all")}
                  className={`press rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    type === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground/70"
                  }`}
                >
                  All
                </button>
                {ALL_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setType(t)}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold capitalize text-white press"
                    style={{ background: `var(--type-${t})`, opacity: type === t ? 1 : 0.7 }}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <ToggleChip
            active={capturedOnly}
            onToggle={() => setCapturedOnly((v) => !v)}
            label="Caught"
          />
          <ToggleChip active={shinyOnly} onToggle={() => setShinyOnly((v) => !v)} label="Shiny" />
          {(type !== "all" || capturedOnly || shinyOnly) && (
            <button
              onClick={() => {
                setType("all");
                setCapturedOnly(false);
                setShinyOnly(false);
              }}
              className="ml-auto flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-muted-foreground press"
            >
              <X className="h-3 w-3" /> Clear
            </button>
          )}
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
        {/* Generation is a popover chip now, matching "+ Type". As a horizontal
            scroll strip it was a nine-item row that had to be swiped to reach
            Gen 7-9, and it read as a second navigation bar under the search
            field rather than as one more filter. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Popover>
            <PopoverTrigger asChild>
              <button className="press shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-card">
                Gen {gen}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 rounded-2xl bg-card p-2" align="start">
              <div className="flex flex-wrap gap-1">
                {GEN_RANGES.map((g) => (
                  <button
                    key={g.gen}
                    onClick={() => setGen(g.gen)}
                    className={`press rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      g.gen === gen
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground/70"
                    }`}
                  >
                    Gen {g.gen}
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Grid — three per row.
          Four columns left the sprite at 64px, small enough that a Pokedex
          entry read as a list item rather than as a card of a creature. Three
          buys ~40% more width per cell, which is what pays for the 88px sprite,
          both type chips and a status line. */}
      <div className="px-3 pb-8 pt-3">
        <div className="grid grid-cols-3 gap-2.5">
          {filtered.map((p) => {
            const e = pokedex[p.id];
            const status = dexStatus(e);
            const got = status !== null;
            const caught = status === "caught";
            const shiny = !!e?.shinyUnlocked;
            const isPartner = partnerId === p.id;
            return (
              <button
                key={p.id}
                onClick={() => {
                  setDetailId(p.id);
                  // Open in shiny form when the shiny is unlocked.
                  setShowShiny(shiny);
                }}
                style={
                  {
                    contentVisibility: "auto",
                    containIntrinsicSize: "150px 150px",
                    ...(shiny
                      ? {
                          backgroundImage:
                            "linear-gradient(135deg, color-mix(in oklab, var(--color-poke-yellow) 35%, var(--color-card)), var(--color-card))",
                        }
                      : caught
                        ? {
                            backgroundImage: `linear-gradient(135deg, color-mix(in oklab, var(--type-${p.types[0]}) 18%, transparent), var(--color-card))`,
                          }
                        : {}),
                  } as React.CSSProperties
                }
                className={`press relative flex flex-col items-center rounded-2xl border-2 px-2 pb-2.5 pt-2 shadow-card ${
                  shiny
                    ? "border-poke-yellow"
                    : caught
                      ? "border-white"
                      : got
                        ? "border-white bg-card"
                        : "border-white/70 bg-muted/40"
                }`}
              >
                {/* Dex number and the partner star share the top row rather than
                    being absolutely positioned, so neither can crowd the other
                    or ride the card's rounded corner.
                    
                    `px-1` on top of the card's own `px-2` is the safe inset. A
                    16px radius means the corner has already curved away by the
                    time you are 4-5px in, so anything sitting flush against the
                    padding box visually collides with the arc even though the
                    boxes do not overlap. */}
                <div className="flex w-full items-center justify-between gap-1 px-1">
                  <span className="text-[10px] font-bold tabular-nums text-foreground/45">
                    #{String(p.id).padStart(3, "0")}
                  </span>
                  <Star
                    className={`h-3.5 w-3.5 shrink-0 ${
                      isPartner ? "fill-poke-yellow text-poke-yellow" : "text-foreground/20"
                    }`}
                    aria-label={isPartner ? "Your partner" : undefined}
                  />
                </div>

                <PokemonSprite
                  id={p.id}
                  shiny={shiny}
                  alt={got ? p.name : "???"}
                  className={`sprite h-[88px] w-[88px] ${got ? "" : "sprite-silhouette"}`}
                />

                <div className="mt-0.5 w-full truncate text-center text-[14px] font-extrabold leading-tight text-foreground">
                  {got ? p.name : "???"}
                </div>

                {/* Both types on ONE line, always. `flex-wrap` put a dual-type
                    Pokemon's second badge on its own row, which made those cards
                    a line taller than the rest and broke the grid's rhythm. The
                    badges shrink to fit instead, the same trick the combat panel
                    uses — see `typeRowFontSize`. */}
                <div className="mt-1 flex w-full flex-nowrap items-center justify-center gap-1">
                  {got ? (
                    p.types.map((t) => (
                      <TypeBadge
                        key={t}
                        type={t}
                        size="sm"
                        fontSize={typeRowFontSize(p.types, DEX_CARD_WIDTH, DEX_CARD_PAD_PX)}
                      />
                    ))
                  ) : (
                    <span className="font-pixel-xs text-foreground/35">???</span>
                  )}
                </div>

                <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide">
                  {caught ? (
                    <>
                      <MiniPokeball />
                      <span className="text-hp-good">Caught</span>
                    </>
                  ) : got ? (
                    <>
                      <Eye className="h-3 w-3 text-foreground/40" />
                      <span className="text-foreground/45">Seen</span>
                    </>
                  ) : (
                    <span className="text-foreground/30">Unknown</span>
                  )}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-3 py-10 text-center text-xs text-muted-foreground">
              No matches.
            </div>
          )}
        </div>
      </div>

      {detailId !== null &&
        (() => {
          const p = ALL_POKEMON.find((x) => x.id === detailId);
          if (!p) return null;
          const entry = pokedex[detailId];
          const got = !!entry;
          const showS = showShiny && entry?.shinyUnlocked;
          const displayName = got ? p.name : "???";
          const primaryType = p.types[0];
          const columns = buildEvolutionTree(p);
          const hasEvolution = !(columns.length <= 1 && (columns[0]?.length ?? 0) <= 1);
          return (
            <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-poke-cream">
              <div
                className="relative shrink-0 px-5 pb-10 pt-[calc(env(safe-area-inset-top)+1rem)]"
                style={{
                  background: `linear-gradient(160deg, var(--type-${primaryType}) 0%, color-mix(in oklab, var(--type-${primaryType}) 62%, #000) 100%)`,
                }}
              >
                <div className="flex items-center justify-between">
                  <button
                    onClick={() => setDetailId(null)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 text-white backdrop-blur press"
                    aria-label="Back"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="font-pixel-xs text-white/90">
                    #{String(p.id).padStart(4, "0")}
                  </span>
                </div>
                <h2 className="mt-4 font-display-xl text-white drop-shadow-sm">{displayName}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {p.types.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-white/25 px-3 py-1 font-pixel-xs uppercase text-white backdrop-blur"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-center">
                  <div className="flex h-56 w-56 items-center justify-center rounded-full bg-white/10">
                    <PokemonSprite
                      id={p.id}
                      shiny={!!showS}
                      alt={displayName}
                      className={`sprite h-44 w-44 ${got ? "" : "sprite-silhouette"}`}
                    />
                  </div>
                </div>
              </div>
              <div className="flex-1 space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5">
                <div className="rounded-3xl bg-card p-5 shadow-card">
                  <div className="font-pixel-xs mb-2 text-primary">POKÉDEX ENTRY</div>
                  {got ? (
                    <PokedexFlavor pokemonId={p.id} />
                  ) : (
                    <p className="text-sm italic leading-relaxed text-foreground/55">
                      Catch this Pokémon to read its Pokédex entry.
                    </p>
                  )}
                  <button
                    onClick={() => playCry(p.id)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-primary/30 px-4 py-2 text-sm font-bold text-primary press"
                  >
                    <Volume2 className="h-4 w-4" /> Play cry
                  </button>
                  {entry?.shinyUnlocked && (
                    <button
                      onClick={() =>
                        setShowShiny((v) => {
                          if (!v) playSfx("shiny");
                          return !v;
                        })
                      }
                      className="ml-2 mt-4 inline-flex items-center gap-2 rounded-full border border-poke-yellow/50 px-4 py-2 text-sm font-bold text-foreground press"
                    >
                      <Sparkles className="h-4 w-4 text-poke-yellow" /> {showS ? "Normal" : "Shiny"}
                    </button>
                  )}
                </div>
                <div className="rounded-3xl bg-card p-5 shadow-card">
                  <div className="font-pixel-xs mb-3 text-primary">EVOLUTION LINE</div>
                  {!hasEvolution ? (
                    <p className="text-center text-xs text-foreground/55">
                      This Pokémon doesn't evolve.
                    </p>
                  ) : (
                    <div className="flex items-start gap-1 overflow-x-auto">
                      {columns.map((col, ci) => (
                        <Fragment key={ci}>
                          {ci > 0 && (
                            <div className="flex h-[72px] items-center px-0.5">
                              <ArrowRight className="h-4 w-4 text-foreground/40" />
                            </div>
                          )}
                          <div
                            className={
                              col.length > 4 ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1"
                            }
                          >
                            {col.map((stage) => {
                              const stageCaught = !!pokedex[stage.id];
                              return (
                                <button
                                  key={stage.id}
                                  onClick={() => {
                                    setDetailId(stage.id);
                                    setShowShiny(false);
                                  }}
                                  className="press flex w-[72px] shrink-0 flex-col items-center rounded-2xl p-1.5 active:bg-muted/50"
                                >
                                  <PokemonSprite
                                    id={stage.id}
                                    alt={stageCaught ? stage.name : "???"}
                                    className={`sprite h-11 w-11 ${stageCaught ? "" : "sprite-silhouette"}`}
                                  />
                                  <span className="mt-0.5 w-full truncate text-center text-[10px] font-bold text-foreground">
                                    {stageCaught ? stage.name : "???"}
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </Fragment>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}

function ToggleChip({
  active,
  onToggle,
  label,
}: {
  active: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      aria-pressed={active}
      onClick={onToggle}
      className={`press shrink-0 rounded-full px-3 py-1.5 text-xs font-bold shadow-card ${
        active ? "bg-primary text-primary-foreground" : "bg-card text-foreground/70"
      }`}
    >
      {label}
    </button>
  );
}

function PokedexFlavor({ pokemonId }: { pokemonId: number }) {
  const [flavor, setFlavor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFlavor(null);
    fetch(pokeApiUrls.species(pokemonId))
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const entries = data.flavor_text_entries ?? [];
        const preferredVersions = [
          "scarlet",
          "violet",
          "sword",
          "shield",
          "ultra-sun",
          "sun",
          "x",
          "black-2",
          "platinum",
        ];
        let best: { flavor_text: string } | undefined;
        for (const ver of preferredVersions) {
          best = entries.find(
            (e: { language: { name: string }; version: { name: string } }) =>
              e.language.name === "en" && e.version.name === ver,
          );
          if (best) break;
        }
        if (!best) {
          best = entries.find((e: { language: { name: string } }) => e.language.name === "en");
        }
        if (best) {
          setFlavor(best.flavor_text.replace(/[\n\f]/g, " ").replace(/POKéMON/g, "Pokémon"));
        }
      })
      .catch(() => {
        /* silent */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pokemonId]);

  if (loading) return null;
  if (!flavor) return null;
  return <p className="text-sm italic leading-relaxed text-foreground/75">{flavor}</p>;
}

function buildEvolutionTree(
  p: import("@/lib/pokemon-data").PokeEntry,
): import("@/lib/pokemon-data").PokeEntry[][] {
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
