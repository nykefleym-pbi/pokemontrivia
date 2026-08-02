import { Fragment, useState } from "react";
import { ChevronLeft, ChevronRight, Ruler, Star, Volume2, Weight } from "lucide-react";
import { MiniPokeball, PokemonSprite } from "@/components/game-ui";
import { TypeChip } from "@/components/type-chip";
import { RESULT_ICON } from "@/lib/app-icons";
import { ALL_POKEMON, type PokeEntry } from "@/lib/pokemon-data";
import { dexBackdropSrc } from "@/lib/dex-backdrop";
import { PLATFORM_SURFACE, RESULT_ART } from "@/lib/result-art";
import { useSpriteFootPad } from "@/lib/sprite-foot";
import { useSpeciesDetail } from "@/lib/species-detail";

/** `len * k` as a CSS expression — the widths here are `min()`, not numbers. */
const scale = (len: string, k: number) => `calc(${len} * ${k})`;

/**
 * The orb the sprite stands inside.
 *
 * Viewport-relative so it grows with the phone, capped so it cannot take the
 * whole hero on a tablet-width window. The name column is whatever is left, and
 * it is the half that can afford to be narrow — a long name wraps, an orb that
 * shrinks makes the sprite unreadable.
 */
const ORB = "min(52vw, 230px)";

/**
 * The species' sprite standing on the platform, wrapped in a glowing orb.
 *
 * The platform and sprite arithmetic is the result screen's — same art, same
 * measured constants — rather than a second set of eyeballed offsets: the
 * sprite is anchored by where its FEET land (`useSpriteFootPad` measures the
 * empty band under each species' own art) and the platform by its opaque
 * region, because both files are squares with transparent padding.
 *
 * The orb tints itself from the type colour the hero is already using, so it
 * needs no per-type asset. The owner's type/legendary backdrops land later and
 * will sit behind this, not replace it.
 */
function SpriteOrb({
  id,
  name,
  shiny,
  caught,
  typeVar,
}: {
  id: number;
  name: string;
  shiny: boolean;
  caught: boolean;
  typeVar: string;
}) {
  const [platformFailed, setPlatformFailed] = useState(false);
  const footPad = useSpriteFootPad(id);
  const art = RESULT_ART.platformWin;

  // Everything below is a fraction of the orb, so the parts cannot drift apart
  // when the orb resizes.
  // Narrower than the orb: at full width the platform's rim cuts straight
  // across the circle's edge instead of sitting inside it.
  const stageW = scale(ORB, 0.86);
  // Deliberately large — the owner asked for the sprite enlarged to the
  // reference, where the creature fills most of the orb. Kept just under the
  // platform's width so it reads as standing ON the disc rather than as a
  // second layer the same size as it.
  const spriteW = scale(ORB, 0.72);
  const stageBottom = scale(ORB, 0.11);
  // Distance from the platform box's bottom edge up to the surface line. Not
  // the middle of the disc: it is drawn in three-quarter view, so the top face
  // is an ellipse in the upper part of the shape.
  const surfaceFromBottom = scale(stageW, 1 - art.bottom - PLATFORM_SURFACE.win);

  return (
    <div className="relative shrink-0" style={{ width: ORB, height: ORB }}>
      {/* The orb itself: a lit sphere in the type's colour. Three stacked
          layers rather than one gradient — a bright core, a rim, and a soft
          outer bloom — because a single radial gradient reads as a flat disc
          at this size. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 42%, color-mix(in oklab, ${typeVar} 55%, #fff) 0%, color-mix(in oklab, ${typeVar} 72%, #000) 58%, color-mix(in oklab, ${typeVar} 55%, #000) 100%)`,
          boxShadow: `inset 0 0 ${scale(ORB, 0.12)} rgba(255,255,255,0.35), 0 0 ${scale(ORB, 0.14)} color-mix(in oklab, ${typeVar} 60%, transparent)`,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full border-2"
        style={{ borderColor: `color-mix(in oklab, ${typeVar} 45%, #fff)`, opacity: 0.55 }}
      />

      {/* The stage: platform art with the sprite standing on its surface. Its
          box height is only the platform's VISIBLE height so the square file's
          transparent padding does not shift the sprite. */}
      <div
        className="absolute left-1/2 -translate-x-1/2"
        style={{
          width: stageW,
          height: scale(stageW, 1 - art.top - art.bottom),
          bottom: stageBottom,
        }}
      >
        {platformFailed ? (
          // Without something under it the sprite hangs in mid-air, which is
          // the complaint this artwork exists to fix.
          <div
            aria-hidden
            className="absolute left-1/2 -translate-x-1/2 rounded-[50%] bg-black/25 blur-[2px]"
            style={{
              width: scale(stageW, 0.6),
              height: scale(stageW, 0.16),
              bottom: `calc(${surfaceFromBottom} - ${scale(stageW, 0.08)})`,
            }}
          />
        ) : (
          <img
            src={encodeURI(RESULT_ICON.platformWin)}
            alt=""
            aria-hidden
            draggable={false}
            onError={() => setPlatformFailed(true)}
            className="pointer-events-none absolute left-0 w-full select-none"
            style={{ bottom: scale(stageW, -art.bottom) }}
          />
        )}
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            width: spriteW,
            height: spriteW,
            bottom: `calc(${surfaceFromBottom} - ${scale(spriteW, footPad)})`,
          }}
        >
          <PokemonSprite
            id={id}
            shiny={shiny}
            alt={name}
            className={`sprite h-full w-full ${caught ? "" : "sprite-silhouette"} ${
              shiny ? "drop-shadow-[0_0_12px_rgba(245,197,24,0.8)]" : ""
            }`}
          />
        </div>
      </div>
    </div>
  );
}

/** One measured fact in the hero — art, the number, then what it is. */
function StatRow({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/20 text-white">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display-md leading-none text-white">{value}</span>
        <span className="block font-pixel text-[7px] uppercase tracking-[0.15em] text-white/60">
          {label}
        </span>
      </span>
    </div>
  );
}

/** A titled white card — the shape every block below the hero uses. */
function DexCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        {/* A Pokéball, not the Pokédex book: the ball is this app's mark and it
            already heads the evolution card, so one glyph carries both. */}
        <MiniPokeball className="h-5 w-5" />
        <span className="font-pixel text-[11px] uppercase tracking-[0.12em] text-primary">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

export interface DexDetailProps {
  species: PokeEntry;
  /** False when this species has never been caught — sprite and name are hidden. */
  caught: boolean;
  shinyUnlocked: boolean;
  showShiny: boolean;
  onToggleShiny: () => void;
  onPlayCry: () => void;
  onSelect: (id: number) => void;
  onClose: () => void;
  /** Whether any species in the evolution line has been caught. */
  isCaught: (id: number) => boolean;
  /** The flavour text block — fetched by the route, rendered here. */
  entry: React.ReactNode;
}

/**
 * The Pokédex detail screen.
 *
 * Built to the owner's reference. Three things it deliberately does NOT show,
 * all owner rulings: the evolution line carries no level requirements (this
 * game evolves on battles won, so a mainline level would be a lie), and the
 * abilities row carries neither the hidden ability nor the catch rate — both
 * are competitive-play facts this game never reads.
 *
 * The Pokédex entry appears ONCE, in the white card. The reference prints it
 * twice, once as a strip over the artwork and again below; the second copy is
 * the one with room to breathe, so the strip is gone and its Play cry button
 * moved into the card.
 *
 * A component rather than JSX inside the route because it can then be rendered
 * against a fixed species to be looked at, which is how the layout was checked.
 */
export function DexDetail({
  species: p,
  caught,
  shinyUnlocked,
  showShiny,
  onToggleShiny,
  onPlayCry,
  onSelect,
  onClose,
  isCaught,
  entry,
}: DexDetailProps) {
  const detail = useSpeciesDetail(p.id);
  const primaryType = p.types[0];
  const typeVar = `var(--type-${primaryType})`;
  const backdrop = dexBackdropSrc(p.id, primaryType);
  const displayName = caught ? p.name : "???";
  const columns = buildEvolutionTree(p);
  const hasEvolution = !(columns.length <= 1 && (columns[0]?.length ?? 0) <= 1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-poke-cream">
      <div
        className="screen-x screen-top relative shrink-0 overflow-hidden rounded-b-[2rem] pb-6"
        style={{
          background: `linear-gradient(160deg, ${typeVar} 0%, color-mix(in oklab, ${typeVar} 62%, #000) 100%)`,
        }}
      >
        {/* Habitat artwork over the type gradient rather than instead of it: a
            species with no art of its own paints the gradient exactly as
            before. See lib/dex-backdrop.ts for the two-tier lookup. */}
        {backdrop && (
          <>
            <img
              src={backdrop}
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
            />
            {/* The name, number and chips are white on whatever the artwork
                happens to be. This scrim keeps them legible over a bright sky. */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.2) 45%, rgba(0,0,0,0.1) 100%)",
              }}
            />
          </>
        )}

        <div className="relative flex items-center justify-between">
          <button
            onClick={onClose}
            className="press flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/25 px-3 py-1.5 font-pixel text-[11px] tabular-nums text-white backdrop-blur">
            #{String(p.id).padStart(4, "0")}
            <MiniPokeball className="h-4 w-4" />
          </span>
        </div>

        <div className="relative mt-3 flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div>
              {/* Fluid rather than a fixed 2rem: the column beside the orb is
                  about 160px on a small phone, and "Bulbasaur" set at 2rem
                  wraps mid-word there. This holds the reference's size on a
                  normal phone and gives longer names somewhere to go. */}
              <h2
                className="font-display-xl break-words leading-[0.95] text-white drop-shadow-sm"
                style={{ fontSize: "clamp(1.25rem, 6.5vw, 1.875rem)" }}
              >
                {displayName}
              </h2>
              {/* "Seed Pokémon". Reserved even while the fetch is in flight so
                  the type chips do not jump down when it lands. */}
              <p className="mt-1 min-h-[1.125rem] text-[13px] font-semibold leading-tight text-white/75">
                {caught ? (detail.genus ?? "") : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              {p.types.map((t) => (
                <TypeChip key={t} type={t} selected size="sm" />
              ))}
            </div>
            <div className="mt-1 flex flex-col gap-2">
              <StatRow
                icon={<Ruler className="h-4 w-4" />}
                value={detail.heightM != null ? `${detail.heightM.toFixed(1)} m` : "—"}
                label="Height"
              />
              <StatRow
                icon={<Weight className="h-4 w-4" />}
                value={detail.weightKg != null ? `${detail.weightKg.toFixed(1)} kg` : "—"}
                label="Weight"
              />
            </div>
          </div>

          <div className="relative shrink-0">
            <SpriteOrb
              id={p.id}
              name={displayName}
              shiny={showShiny && shinyUnlocked}
              caught={caught}
              typeVar={typeVar}
            />
            {shinyUnlocked && (
              <button
                onClick={onToggleShiny}
                aria-pressed={showShiny}
                aria-label={showShiny ? "Show normal colours" : "Show shiny colours"}
                className={`press absolute -right-1 top-1 flex h-10 w-10 items-center justify-center rounded-full border-2 backdrop-blur ${
                  showShiny
                    ? "border-white bg-poke-yellow text-poke-dark"
                    : "border-white/40 bg-black/30 text-poke-yellow"
                }`}
              >
                <Star className="h-5 w-5" fill="currentColor" />
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="screen-x screen-bottom flex-1 space-y-4 pt-4">
        <DexCard title="Pokédex Entry">
          {caught ? (
            entry
          ) : (
            <p className="text-sm italic leading-relaxed text-foreground/55">
              Catch this Pokémon to read its Pokédex entry.
            </p>
          )}
          {caught && detail.abilities.length > 0 && (
            <div className="mt-4 border-t border-border/60 pt-3">
              {/* The card's own heading is the app's red; this sub-label takes
                  the species' type colour, as the reference does — it reads as
                  a detail OF this Pokémon rather than a second section. */}
              <div
                className="font-pixel text-[8px] uppercase tracking-[0.15em]"
                style={{ color: `color-mix(in oklab, ${typeVar} 78%, #000)` }}
              >
                {detail.abilities.length > 1 ? "Abilities" : "Ability"}
              </div>
              <div className="mt-1 text-sm font-bold text-foreground">
                {detail.abilities.join(" · ")}
              </div>
            </div>
          )}
          {/* Tinted to the species' type, which is what makes the reference's
              button green on a Grass page. A fixed colour would be right for
              exactly one of the eighteen types. */}
          <button
            onClick={onPlayCry}
            className="press mt-4 inline-flex items-center gap-2 rounded-full border-2 border-white px-4 py-2 text-sm font-bold text-white shadow-card"
            style={{
              background: `linear-gradient(180deg, ${typeVar} 0%, color-mix(in oklab, ${typeVar} 72%, #000) 100%)`,
            }}
          >
            <Volume2 className="h-4 w-4" /> Play cry
          </button>
        </DexCard>

        <DexCard title="Evolution Line">
          {!hasEvolution ? (
            <p className="text-center text-xs text-foreground/55">This Pokémon doesn't evolve.</p>
          ) : (
            <div className="flex items-stretch gap-1 overflow-x-auto">
              {columns.map((col, ci) => (
                <Fragment key={ci}>
                  {ci > 0 && (
                    <div className="flex items-center">
                      <ChevronRight className="h-4 w-4 shrink-0 text-foreground/35" />
                    </div>
                  )}
                  <div
                    className={col.length > 3 ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1"}
                  >
                    {col.map((stage) => (
                      <EvolutionStage
                        key={stage.id}
                        stage={stage}
                        current={stage.id === p.id}
                        caught={isCaught(stage.id)}
                        onSelect={onSelect}
                      />
                    ))}
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </DexCard>
      </div>
    </div>
  );
}

/**
 * One rung of the evolution line: sprite, name, typing. No level — this game
 * evolves a partner on battles won, so a mainline level requirement would be a
 * number the player can never act on (owner ruling).
 *
 * `caught` here is the CALLER's knowledge of the stage, passed in rather than
 * read from the store, so this component stays renderable in isolation.
 */
function EvolutionStage({
  stage,
  current,
  caught,
  onSelect,
}: {
  stage: PokeEntry;
  current: boolean;
  caught: boolean;
  onSelect: (id: number) => void;
}) {
  // 84px, not wider: three rungs plus two arrows have to fit the card without
  // the row turning into a scroller, and a three-stage line is the common case.
  return (
    <button
      onClick={() => onSelect(stage.id)}
      className={`press flex w-[84px] shrink-0 flex-col items-center gap-1 rounded-2xl border-2 p-1 ${
        current ? "border-hp-good/60 bg-hp-good/10" : "border-transparent active:bg-muted/50"
      }`}
    >
      <PokemonSprite
        id={stage.id}
        alt={caught ? stage.name : "???"}
        className={`sprite h-14 w-14 ${caught ? "" : "sprite-silhouette"}`}
      />
      <span className="w-full truncate text-center text-[11px] font-bold text-foreground">
        {caught ? stage.name : "???"}
      </span>
      <span className="flex w-full flex-wrap justify-center gap-0.5">
        {stage.types.map((t) => (
          <TypeChip key={t} type={t} selected size="sm" icon={false} />
        ))}
      </span>
    </button>
  );
}

/**
 * Every species in this line, grouped into columns by evolution depth.
 *
 * Walks back to the root first, so opening Venusaur shows the whole family
 * rather than a single rung, and handles branching lines (Eevee) by keeping a
 * column as a list. `visited` guards the cycles that a couple of PokéAPI
 * entries genuinely contain.
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
