import { Fragment } from "react";
import { ArrowLeft, ChevronRight, Heart, Ruler, Star, Weight } from "lucide-react";
import { FieldSprite, FitSprite } from "@/components/na/battle";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaTypeChip } from "@/components/na/type-chip";
import { generation, GENERATIONS } from "@/lib/dex-rewards";
import { ALL_POKEMON, type PokeEntry } from "@/lib/pokemon-data";
import { useSpeciesDetail } from "@/lib/species-detail";
import { useGameStore } from "@/lib/store";

/** The pixel snow globe (plugin MAN.globe): 224 x 236, the sprite's feet at (112, 166). */
const GLOBE = { w: 224, h: 236, floor: [112, 166] as const };

/**
 * The Pokédex entry, in each state it can be in: not caught, loading, failed,
 * no English entry, or the entry. A failed request says so plainly (6.4 note 5).
 */
function DexEntryText({ caught, status, flavor }: { caught: boolean; status: "loading" | "ready" | "error"; flavor: string | null }) {
  if (!caught) return <p className="na-body text-text-secondary">Catch this Pokémon to read its Pokédex entry.</p>;
  if (status === "loading")
    return (
      <div className="space-y-2" aria-hidden>
        <div className="h-3.5 w-full animate-pulse rounded bg-white/10" />
        <div className="h-3.5 w-[64%] animate-pulse rounded bg-white/10" />
      </div>
    );
  if (status === "error") return <p className="na-body text-text-secondary">Couldn't load this Pokédex entry. Reopen to try again.</p>;
  if (!flavor) return <p className="na-body text-text-secondary">No Pokédex entry has been recorded for this Pokémon.</p>;
  return <p className="na-body text-foreground">{flavor}</p>;
}

export interface DexDetailProps {
  species: PokeEntry;
  /** False when this species has never been caught: sprite and name are hidden. */
  caught: boolean;
  shinyUnlocked: boolean;
  showShiny: boolean;
  onToggleShiny: () => void;
  onPlayCry: () => void;
  onSelect: (id: number) => void;
  onClose: () => void;
  /** Whether a species in the evolution line has been caught. */
  isCaught: (id: number) => boolean;
}

/**
 * Figma 6.4 Pokédex entry: the header bar, the snow globe in pixels on the
 * type's colour, name, genus and types, height / weight / region, your history
 * with it, the entry with abilities and Play cry, and the evolution line.
 * No level requirements and no hidden ability (owner rulings).
 */
export function DexDetail({ species: p, caught, shinyUnlocked, showShiny, onToggleShiny, onPlayCry, onSelect, onClose, isCaught }: DexDetailProps) {
  const detail = useSpeciesDetail(p.id);
  const partnerId = useGameStore((s) => s.pokemon?.id ?? null);
  const entry = useGameStore((s) => s.pokedex[p.id]);
  const typeVar = `var(--type-${p.types[0]})`;
  const name = caught ? p.name : "???";
  const num = `#${String(p.id).padStart(3, "0")}`;
  const columns = buildEvolutionTree(p);
  const hasEvolution = !(columns.length <= 1 && (columns[0]?.length ?? 0) <= 1);
  const region = (GENERATIONS.find((g) => p.id >= g.from && p.id <= g.to) ?? generation(1)).region;
  const gy = 22;

  // Your own history with it (6.4 note 4), from what the app records.
  const met = entry?.firstSeenAt && entry.firstSeenAt > 1e11 ? new Date(entry.firstSeenAt).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : null;
  const beaten = entry?.defeatCount ?? 0;
  const history =
    partnerId === p.id
      ? { title: "Your partner", sub: `${p.name} battles by your side!` }
      : caught
        ? { title: "In your Pokédex", sub: `${met ? `First met on ${met}. ` : ""}Beaten ${beaten} time${beaten === 1 ? "" : "s"}.` }
        : null;

  return (
    <div className="na-bg-night fixed inset-0 z-50 flex flex-col overflow-y-auto pt-[env(safe-area-inset-top)]">
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="na-display-s min-w-0 flex-1 truncate text-foreground">
          {num} {name}
        </h1>
      </div>

      <div className="flex flex-col gap-3.5 px-4 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-1">
        {/* Hero: the snow globe on the type's colour, the sprite between its back and front. */}
        <div
          className="relative h-[264px] w-full shrink-0 overflow-hidden rounded-3xl"
          style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${typeVar} 92%, #000) 0%, color-mix(in oklab, ${typeVar} 45%, #000) 100%)` }}
        >
          <div className="absolute top-0 h-[264px]" style={{ left: `calc(50% - ${GLOBE.w / 2}px)`, width: GLOBE.w }}>
            <img src="/dex/globe-back.png" alt="" className="absolute left-0 [image-rendering:pixelated]" style={{ top: gy, width: GLOBE.w, height: GLOBE.h }} />
            <FieldSprite
              id={p.id}
              shiny={showShiny && shinyUnlocked}
              k={3}
              cx={GLOBE.floor[0]}
              feetY={gy + GLOBE.floor[1]}
              className={caught ? "" : "sprite-silhouette"}
            />
            <img src="/dex/globe-front.png" alt="" className="pointer-events-none absolute left-0 [image-rendering:pixelated]" style={{ top: gy, width: GLOBE.w, height: GLOBE.h }} />
          </div>
          {shinyUnlocked && (
            <button
              type="button"
              onClick={onToggleShiny}
              aria-pressed={showShiny}
              aria-label={showShiny ? "Show normal colours" : "Show shiny colours"}
              className={`absolute right-3.5 top-3.5 flex h-10 w-10 items-center justify-center rounded-full border-2 ${showShiny ? "border-reward-gold bg-reward-gold/30" : "border-white/40 bg-night-deep/35"}`}
            >
              <Star className="h-5 w-5 fill-reward-gold text-reward-gold" />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <h2 className="na-display-l text-foreground">{name}</h2>
          <p className="na-body-strong min-h-[21px] text-text-secondary">{caught ? (detail.genus ?? "") : ""}</p>
          <div className="flex gap-1.5">
            {p.types.map((t) => (
              <NaTypeChip key={t} type={t} />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: <Ruler className="h-[18px] w-[18px]" strokeWidth={2.5} />, value: detail.heightM != null ? `${detail.heightM.toFixed(1)} m` : "—", label: "Height" },
            { icon: <Weight className="h-[18px] w-[18px]" strokeWidth={2.5} />, value: detail.weightKg != null ? `${detail.weightKg.toFixed(1)} kg` : "—", label: "Weight" },
            { icon: <NaGlossIcon kind="map" size={18} />, value: region, label: "Region" },
          ].map((f) => (
            <div key={f.label} className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-white/[0.08] px-3 py-2.5">
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="shrink-0">{f.icon}</span>
                <span className="na-number-l truncate">{f.value}</span>
              </span>
              <span className="na-caption text-text-secondary">{f.label}</span>
            </div>
          ))}
        </div>

        {history && (
          <div className="flex items-center gap-3 rounded-[18px] border border-reward-gold/50 bg-white/[0.08] p-3">
            <Heart className="h-[30px] w-[30px] shrink-0 fill-primary text-primary" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="na-headline text-foreground">{history.title}</span>
              <span className="na-caption text-text-secondary">{history.sub}</span>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.06] p-3.5">
          <span className="na-label uppercase text-text-secondary">Pokédex entry</span>
          <DexEntryText caught={caught} status={detail.status} flavor={detail.flavor} />
          <div className="flex items-end gap-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {caught && detail.abilities.length > 0 && (
                <>
                  <span className="na-label uppercase" style={{ color: typeVar }}>
                    {detail.abilities.length > 1 ? "Abilities" : "Ability"}
                  </span>
                  <span className="na-body-strong truncate text-foreground">{detail.abilities.join(" · ")}</span>
                </>
              )}
            </div>
            {/* In the main type's colour, with a darker lip like the other chunky buttons. */}
            <button
              type="button"
              onClick={onPlayCry}
              className="na-btn na-btn-m na-emboss shrink-0 text-foreground active:translate-y-[3px]"
              style={{
                background: typeVar,
                boxShadow: `0 4px 0 color-mix(in oklab, ${typeVar} 60%, #000), inset 0 1.5px 0 rgb(255 255 255 / 0.35)`,
              }}
            >
              Play cry
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 rounded-2xl bg-white/[0.06] p-3.5">
          <span className="na-label uppercase text-text-secondary">Evolution line</span>
          {!hasEvolution ? (
            <p className="na-body text-text-secondary">This Pokémon doesn't evolve.</p>
          ) : (
            <div className="flex items-center justify-between gap-1">
              {columns.map((col, ci) => (
                <Fragment key={ci}>
                  {ci > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-text-muted" />}
                  <div className={`min-w-0 flex-1 ${col.length > 3 ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1"}`}>
                    {col.map((stage) => (
                      <EvolutionStage key={stage.id} stage={stage} current={stage.id === p.id} caught={isCaught(stage.id)} onSelect={onSelect} />
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** One stage of the line: sprite (??? until caught), name and types; the open one is tinted in its type. */
function EvolutionStage({ stage, current, caught, onSelect }: { stage: PokeEntry; current: boolean; caught: boolean; onSelect: (id: number) => void }) {
  const tv = `var(--type-${stage.types[0]})`;
  return (
    <button
      type="button"
      onClick={() => onSelect(stage.id)}
      className="flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl border px-1.5 py-2"
      style={current ? { borderColor: `color-mix(in oklab, ${tv} 60%, transparent)`, background: `color-mix(in oklab, ${tv} 14%, transparent)` } : { borderColor: "transparent" }}
    >
      <FitSprite id={stage.id} size={56} className={caught ? "" : "[filter:brightness(0)_invert(29%)_sepia(1)_saturate(3)_hue-rotate(190deg)]"} />
      <span className="na-body-strong w-full truncate text-center text-foreground">{caught ? stage.name : "???"}</span>
      <span className="flex min-w-0 flex-wrap justify-center gap-0.5">
        {stage.types.slice(0, 1).map((t) => (
          <NaTypeChip key={t} type={t} />
        ))}
      </span>
    </button>
  );
}

/**
 * Every species in this line, grouped into columns by evolution depth. Walks back
 * to the root first (opening Venusaur shows the whole family) and keeps branching
 * lines (Eevee) as lists; `visited` guards the cycles a few PokéAPI entries contain.
 */
function buildEvolutionTree(p: PokeEntry): PokeEntry[][] {
  const byId = (id: number) => ALL_POKEMON.find((x) => x.id === id);
  let root = p;
  const seen = new Set<number>();
  while (root.evolvesFromId != null && !seen.has(root.evolvesFromId)) {
    seen.add(root.id);
    const prev = byId(root.evolvesFromId);
    if (!prev) break;
    root = prev;
  }
  const columns: PokeEntry[][] = [];
  let frontier = [root];
  const visited = new Set<number>();
  while (frontier.length > 0) {
    const col = frontier.filter((e) => e && !visited.has(e.id));
    if (col.length === 0) break;
    col.forEach((e) => visited.add(e.id));
    columns.push(col);
    const next: PokeEntry[] = [];
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
