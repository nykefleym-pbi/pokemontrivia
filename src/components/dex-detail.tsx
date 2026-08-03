import { Fragment, useState } from "react";
import { ChevronLeft, ChevronRight, Ruler, Star, Volume2, Weight } from "lucide-react";
import { MiniPokeball, PokemonSprite } from "@/components/game-ui";
import { TypeChip, TypeIcon } from "@/components/type-chip";
import { RESULT_ICON } from "@/lib/app-icons";
import { ALL_POKEMON, type PokeEntry, type PokeType } from "@/lib/pokemon-data";
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
 * whole hero on a tablet-width window.
 *
 * 46vw rather than 52 because the column beside it has to hold the widest dual
 * typing in the roster — ELECTRIC + FLYING — on ONE row. At 52vw that pair had
 * about 128px to live in and needed 144, so both chips shortened to "ELEC..." /
 * "FL...". The orb loses 30px; a label that cannot be read loses more.
 */
const ORB = "min(46vw, 215px)";

/**
 * How much of the circle the glass dome shows, measured from its top.
 *
 * This is the snow-globe line, and it is the number the whole stage is built
 * around rather than a consequence of the platform's position: the glass is a
 * circle cut flat where the grass begins, and the platform is then placed so
 * its SURFACE lands exactly on that cut. Measured off the reference, where the
 * dome's interior stops at the grass about four-fifths of the way down.
 *
 * Driving it this way round matters. The other way — clipping the dome to
 * wherever the platform happened to sit — makes the globe's shape a side
 * effect of two art-padding constants, so re-tuning the platform silently
 * changes how much of a sphere the glass is.
 */
const DOME_CUT = 0.79;

/**
 * The species' sprite standing on the platform under a glass dome.
 *
 * A snow globe, not a sphere: the glass is cut flat at the grass line and the
 * platform sits in the cut, with a soft elliptical bloom wrapping its base the
 * way the reference's does. A full circle put the platform's stone rim inside a
 * bubble, which reads as a marble rather than as something standing on ground.
 *
 * The platform and sprite arithmetic is the result screen's — same art, same
 * measured constants — rather than a second set of eyeballed offsets: the
 * sprite is anchored by where its FEET land (`useSpriteFootPad` measures the
 * empty band under each species' own art) and the platform by its opaque
 * region, because both files are squares with transparent padding.
 *
 * The dome tints itself from the type colour the hero is already using, so it
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
  // Wide enough that the grass covers the dome's chord where the two meet.
  // Platform.webp is 97.7% opaque across (measured), so the visible disc is
  // very nearly this wide, and the circle's chord at DOME_CUT is about 0.82 of
  // the orb — any narrower and bare glass edges stick out past the grass.
  const stageW = scale(ORB, 0.9);
  // Deliberately large — the owner asked for the sprite enlarged to the
  // reference, where the creature fills most of the dome. Kept just under the
  // platform's width so it reads as standing ON the disc rather than as a
  // second layer the same size as it.
  const spriteW = scale(ORB, 0.72);
  // Distance from the platform box's bottom edge up to the surface line. Not
  // the middle of the disc: it is drawn in three-quarter view, so the top face
  // is an ellipse in the upper part of the shape.
  const surfaceFromBottom = scale(stageW, 1 - art.bottom - PLATFORM_SURFACE.win);
  // The platform is placed so its surface meets the dome's cut. Usually a small
  // negative number — the stone rim hangs just below the glass, as it does in
  // the reference.
  const stageBottom = `calc(${scale(ORB, 1 - DOME_CUT)} - ${surfaceFromBottom})`;

  return (
    <div className="relative shrink-0" style={{ width: ORB, height: ORB }}>
      {/* The glass dome. The circle is full size but the wrapper only reaches
          the grass line, so it is cut flat there — including its rim, which is
          what makes the arc read as a globe sitting on the ground rather than
          as a ball with a disc inside it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
        style={{ height: scale(ORB, DOME_CUT) }}
      >
        <div
          className="absolute inset-x-0 top-0 rounded-full"
          style={{
            height: ORB,
            background: `radial-gradient(circle at 50% 42%, color-mix(in oklab, ${typeVar} 55%, #fff) 0%, color-mix(in oklab, ${typeVar} 72%, #000) 58%, color-mix(in oklab, ${typeVar} 55%, #000) 100%)`,
            boxShadow: `inset 0 0 ${scale(ORB, 0.12)} rgba(255,255,255,0.35)`,
          }}
        />
        <div
          className="absolute inset-x-0 top-0 rounded-full border-2"
          style={{
            height: ORB,
            borderColor: `color-mix(in oklab, ${typeVar} 45%, #fff)`,
            opacity: 0.55,
          }}
        />
        {/* The neon core, as in the reference: a bright bloom of the type's own
            colour sitting BEHIND the sprite, so the creature is lit from within
            the globe rather than pasted onto a tinted disc. Two stops — a hot
            near-white centre and a saturated halo — because a single stop reads
            as a wash rather than as a light source. */}
        <div
          className="absolute left-1/2 -translate-x-1/2 rounded-full blur-xl"
          style={{
            width: scale(ORB, 0.72),
            height: scale(ORB, 0.72),
            top: scale(ORB, 0.16),
            background: `radial-gradient(circle, color-mix(in oklab, ${typeVar} 25%, #fff) 0%, color-mix(in oklab, ${typeVar} 85%, #fff) 45%, transparent 72%)`,
            opacity: 0.75,
          }}
        />

        {/* Falling shines — the snow in the snow globe.

            Clipped to the CIRCLE, not to this wrapper. The wrapper is a
            rectangle, so a mote placed near its top-left corner lands outside
            the glass entirely — which is what put a row of stray glowing dots
            along the top of the globe. This inner clipper is the circle itself,
            so a mote is only ever visible where there is glass to be behind. */}
        <div
          className="absolute inset-x-0 top-0 overflow-hidden rounded-full"
          style={{ height: ORB }}
        >
          <DomeShines />
        </div>

        {/* The specular highlight. Without one the dome is a tinted disc; this
            single soft patch off-centre is what makes it read as curved glass
            with something behind it. Above the shines so the glass stays in
            front of what is falling inside it. */}
        <div
          className="absolute rounded-[50%] blur-md"
          style={{
            left: "14%",
            top: "10%",
            width: "34%",
            height: "22%",
            background: "rgba(255,255,255,0.4)",
          }}
        />
      </div>

      {/* The bloom where the glass meets the ground. In the reference the
          dome's outline does not stop dead at the grass — it fades into a soft
          ellipse hugging the platform's base, which is what ties the glass to
          the ground instead of leaving it hovering over a separate disc.
          Deliberately faint and heavily blurred: at any real strength it stops
          reading as light and becomes a stray oval drawn behind the art. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%] blur-[6px]"
        style={{
          width: scale(ORB, 0.98),
          height: scale(ORB, 0.24),
          bottom: scale(ORB, -0.06),
          boxShadow: `0 0 ${scale(ORB, 0.06)} ${scale(ORB, 0.01)} color-mix(in oklab, ${typeVar} 55%, #fff)`,
          opacity: 0.3,
        }}
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

/**
 * The snow in the snow globe.
 *
 * Fixed, hand-placed motes rather than `Math.random()` at render: a random
 * layout is a new layout on every re-render, so the snow would teleport
 * whenever the species data landed or the shiny toggle flipped. These are also
 * deliberately uneven in size, speed and delay — evenly spaced motes falling at
 * one rate read as a loading bar, not as something drifting.
 *
 * The whole set is inside the dome's `overflow-hidden` wrapper, so a mote that
 * has fallen past the grass line is clipped rather than escaping onto the page.
 * `.dome-shine` is switched off under reduce-motion (see styles.css), which
 * leaves the motes sitting still — still decorative, no movement.
 */
const SHINES = [
  { x: 12, top: 2, size: 3, fall: 6.5, delay: 0, drift: 10 },
  { x: 27, top: 18, size: 2, fall: 8.5, delay: 1.1, drift: -8 },
  { x: 38, top: 6, size: 4, fall: 5.5, delay: 2.6, drift: 7 },
  { x: 50, top: 30, size: 2, fall: 9, delay: 0.6, drift: -11 },
  { x: 61, top: 10, size: 3, fall: 7, delay: 3.4, drift: 9 },
  { x: 72, top: 24, size: 2, fall: 8, delay: 1.8, drift: -7 },
  { x: 83, top: 4, size: 4, fall: 6, delay: 4.2, drift: 8 },
  { x: 20, top: 40, size: 2, fall: 9.5, delay: 2.2, drift: -9 },
  { x: 55, top: 14, size: 3, fall: 7.5, delay: 5, drift: 6 },
  { x: 90, top: 34, size: 2, fall: 8.8, delay: 3, drift: -6 },
  { x: 33, top: 48, size: 3, fall: 7.2, delay: 0.3, drift: 8 },
  { x: 67, top: 44, size: 2, fall: 9.2, delay: 4.6, drift: -10 },
] as const;

function DomeShines() {
  return (
    <>
      {SHINES.map((s, i) => (
        <span
          key={i}
          className="dome-shine absolute rounded-full bg-white"
          style={
            {
              left: `${s.x}%`,
              // Staggered start heights as well as delays: with every mote
              // starting at the very top, the globe is empty for the first few
              // seconds and then suddenly snows.
              top: `${s.top}%`,
              // Each mote's own distance — from where it starts down to the
              // grass — rather than one shared length. With a shared one a mote
              // starting halfway down spends most of its animation below the
              // cut, clipped and invisible, so the lower half of the globe
              // looked emptier than the top.
              "--drop": `calc(${scale(ORB, DOME_CUT)} - ${scale(ORB, s.top / 100)})`,
              width: s.size,
              height: s.size,
              boxShadow: `0 0 ${s.size * 2}px ${s.size / 2}px rgba(255,255,255,0.9)`,
              "--fall": `${s.fall}s`,
              "--delay": `${s.delay}s`,
              "--drift": `${s.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </>
  );
}

/**
 * A Pokéball drawn as an OUTLINE, for use as a background watermark.
 *
 * `MiniPokeball` is the solid red-and-white ball — correct as a mark next to a
 * heading, wrong at 40% of the hero's height and 6% opacity, where its filled
 * halves turn into a pale blob. This is the same shape as line work, so it
 * survives being faded almost to nothing.
 */
function PokeballWatermark({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} style={style} aria-hidden>
      <circle cx="32" cy="32" r="28" stroke="currentColor" strokeWidth="4" />
      <path d="M4 32h20M40 32h20" stroke="currentColor" strokeWidth="4" />
      <circle cx="32" cy="32" r="8" stroke="currentColor" strokeWidth="4" />
    </svg>
  );
}

/**
 * The hero's background pattern: drifting Pokéballs and the species' own type
 * glyph, as in the reference.
 *
 * Everything here is `currentColor` at a few percent so it works over both the
 * plain type gradient AND a habitat photo — a fixed tint that read as texture
 * on one would read as smudges on the other. Deliberately asymmetric and partly
 * cropped by the hero's edges: a neat grid of them would read as a UI element
 * rather than as depth.
 */
function HeroPattern({ type }: { type: PokeType }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden text-white">
      {PARTICLES.map((p, i) =>
        p.ball ? (
          <PokeballWatermark key={i} className="hero-particle absolute" style={particleStyle(p)} />
        ) : (
          <TypeIcon
            key={i}
            type={type}
            className="hero-particle absolute"
            style={particleStyle(p)}
          />
        ),
      )}
    </div>
  );
}

/**
 * The hero's scatter of Pokéballs and type glyphs.
 *
 * Sized as PARTICLES, not as decoration at scale: the first pass drew them at
 * 96–144px, which put a Pokéball the size of the sprite behind the name and
 * read as a broken background image rather than as texture. These are 18–34px,
 * small enough to sit behind type without competing with it and large enough
 * that the shape is still legible as a Pokéball.
 *
 * Each drifts on its own loop — its own distance, rotation, duration and delay
 * — so the set wanders rather than pulsing in unison. The travel is deliberately
 * generous (roughly 20-30px and up to 55 degrees, over 12-20s): at the previous
 * 6-11px the motion was technically there and read as completely static.
 * Hand-placed rather than
 * generated, for the same reason the snow is: a random layout would reshuffle
 * itself on every re-render, and `Math.random()` in a component body would give
 * SSR and hydration two different answers.
 */
const PARTICLES = [
  { x: 4, y: 12, size: 22, opacity: 0.1, ball: true, dx: 26, dy: 20, rot: 40, dur: 13, delay: 0 },
  {
    x: 34,
    y: 4,
    size: 16,
    opacity: 0.09,
    ball: false,
    dx: -22,
    dy: 24,
    rot: -55,
    dur: 16,
    delay: 2,
  },
  {
    x: 52,
    y: 15,
    size: 26,
    opacity: 0.07,
    ball: true,
    dx: 20,
    dy: -18,
    rot: 32,
    dur: 14,
    delay: 4,
  },
  { x: 88, y: 8, size: 18, opacity: 0.1, ball: false, dx: -28, dy: 15, rot: 48, dur: 18, delay: 1 },
  {
    x: 17,
    y: 34,
    size: 18,
    opacity: 0.08,
    ball: false,
    dx: 24,
    dy: 22,
    rot: -38,
    dur: 15,
    delay: 5,
  },
  {
    x: 43,
    y: 40,
    size: 30,
    opacity: 0.06,
    ball: true,
    dx: -18,
    dy: -25,
    rot: 26,
    dur: 20,
    delay: 3,
  },
  {
    x: 94,
    y: 30,
    size: 24,
    opacity: 0.08,
    ball: true,
    dx: 22,
    dy: 18,
    rot: -44,
    dur: 12,
    delay: 7,
  },
  {
    x: 7,
    y: 55,
    size: 28,
    opacity: 0.07,
    ball: true,
    dx: -25,
    dy: 20,
    rot: 35,
    dur: 17,
    delay: 1.5,
  },
  {
    x: 30,
    y: 62,
    size: 20,
    opacity: 0.09,
    ball: false,
    dx: 30,
    dy: -20,
    rot: -30,
    dur: 14,
    delay: 6,
  },
  {
    x: 66,
    y: 70,
    size: 16,
    opacity: 0.08,
    ball: false,
    dx: -20,
    dy: 28,
    rot: 52,
    dur: 19,
    delay: 3.5,
  },
  {
    x: 20,
    y: 84,
    size: 24,
    opacity: 0.07,
    ball: true,
    dx: 18,
    dy: -22,
    rot: -42,
    dur: 15,
    delay: 8,
  },
  {
    x: 48,
    y: 90,
    size: 18,
    opacity: 0.09,
    ball: false,
    dx: -26,
    dy: 17,
    rot: 28,
    dur: 16,
    delay: 6.5,
  },
  {
    x: 80,
    y: 88,
    size: 26,
    opacity: 0.06,
    ball: true,
    dx: 24,
    dy: 26,
    rot: -36,
    dur: 13,
    delay: 9,
  },
] as const;

function particleStyle(p: (typeof PARTICLES)[number]): React.CSSProperties {
  return {
    left: `${p.x}%`,
    top: `${p.y}%`,
    width: p.size,
    height: p.size,
    opacity: p.opacity,
    "--dx": `${p.dx}px`,
    "--dy": `${p.dy}px`,
    "--rot": `${p.rot}deg`,
    "--dur": `${p.dur}s`,
    "--delay": `${p.delay}s`,
  } as React.CSSProperties;
}

/**
 * One measured fact in the hero — art, the number, then what it is.
 *
 * The reference's hierarchy: the VALUE is the largest thing in the row, the
 * label sits under it small and letterspaced, and the glyph is loose art rather
 * than something in a chip. An earlier pass boxed the icon, which gave the row
 * three competing weights instead of one clear one.
 */
function StatRow({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="shrink-0 text-white drop-shadow-sm">{icon}</span>
      <span className="min-w-0">
        <span className="block font-display-md leading-none text-white">{value}</span>
        <span className="mt-1 block font-pixel text-[7px] uppercase tracking-[0.18em] text-white/55">
          {label}
        </span>
      </span>
    </div>
  );
}

/**
 * The Pokédex entry, in each of the four states it can actually be in.
 *
 * The state this exists for is the middle one. The previous version rendered
 * `null` both while the fetch was in flight AND when it came back with nothing,
 * so a slow network left the card's body empty with no way to tell "loading"
 * from "gave up" — the card just looked broken. A skeleton says wait; a
 * sentence says it failed.
 */
function DexEntryText({
  caught,
  status,
  flavor,
}: {
  caught: boolean;
  status: "loading" | "ready" | "error";
  flavor: string | null;
}) {
  if (!caught) {
    return (
      <p className="text-sm italic leading-relaxed text-foreground/55">
        Catch this Pokémon to read its Pokédex entry.
      </p>
    );
  }
  if (status === "loading") {
    return (
      <div className="space-y-2" aria-hidden>
        <div className="h-3.5 w-full animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-[92%] animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-[64%] animate-pulse rounded bg-muted" />
      </div>
    );
  }
  // Two different nothings, and they need different sentences. A failed request
  // is worth retrying; a species PokéAPI simply has no English entry for is not,
  // and telling someone to reopen would send them round a loop that can never
  // succeed.
  if (status === "error") {
    return (
      <p className="text-sm italic leading-relaxed text-foreground/55">
        Couldn't load this Pokédex entry. Reopen to try again.
      </p>
    );
  }
  if (!flavor) {
    return (
      <p className="text-sm italic leading-relaxed text-foreground/55">
        No Pokédex entry has been recorded for this Pokémon.
      </p>
    );
  }
  return <p className="text-sm italic leading-relaxed text-foreground/75">{flavor}</p>;
}

/** A titled white card — the shape every block below the hero uses. */
function DexCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    // p-3, not p-4: the evolution row is the widest thing on this screen and
    // the eight pixels are the difference between three stages fitting and the
    // last one being clipped on a 390px phone.
    <div className="rounded-3xl bg-card p-3 shadow-card">
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
 * Every fact on this screen — the entry, the genus, height, weight and the
 * abilities — comes from PokéAPI through the single `useSpeciesDetail` call
 * below. The entry used to be a `ReactNode` prop the route filled with its own
 * fetching component, which meant a SECOND request for the same
 * /pokemon-species document and a second, silent failure mode.
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

        {/* Drifting Pokéballs and the species' type glyph. Above the backdrop
            and its scrim, below every piece of content. */}
        <HeroPattern type={primaryType} />

        <div className="relative flex items-center justify-between">
          <button
            onClick={onClose}
            className="press flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white backdrop-blur"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="rounded-full border border-white/25 bg-black/25 px-3.5 py-1.5 font-pixel text-[11px] tabular-nums text-white backdrop-blur">
            #{String(p.id).padStart(4, "0")}
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
              {/* "Seed Pokémon" — the reference's second tier: noticeably
                  smaller than the name but larger and lighter than the stat
                  labels, so it reads as a subtitle rather than as a caption.
                  Height reserved even while the fetch is in flight so the type
                  chips do not jump down when it lands. */}
              <p className="mt-1.5 min-h-[1.25rem] text-[15px] font-medium leading-tight text-white/80">
                {caught ? (detail.genus ?? "") : ""}
              </p>
            </div>
            {/* One row, guaranteed. The column beside the orb is about 124px
                on a small phone, which is roughly what two chips need — so
                `flex-wrap` was landing on two lines there. `flex-nowrap` with
                `min-w-0` chips keeps them on one row and shortens a label in
                the worst case instead. */}
            <div className="flex w-full flex-nowrap items-center gap-1">
              {p.types.map((t) => (
                <span key={t} className="flex min-w-0">
                  <TypeChip type={t} selected size="sm" />
                </span>
              ))}
            </div>
            <div className="mt-1 flex flex-col gap-2">
              <StatRow
                icon={<Ruler className="h-5 w-5" strokeWidth={2.5} />}
                value={detail.heightM != null ? `${detail.heightM.toFixed(1)} m` : "—"}
                label="Height"
              />
              <StatRow
                icon={<Weight className="h-5 w-5" strokeWidth={2.5} />}
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
          <DexEntryText caught={caught} status={detail.status} flavor={detail.flavor} />
          {/* The ability and Play cry share one row, the facts on the left and
              the action on the right — the arrangement the reference uses for
              its entry strip. The row always renders, because the button is not
              conditional on the ability having arrived (or existing at all);
              only the left half is. */}
          <div className="mt-4 flex items-end justify-between gap-3 border-t border-border/60 pt-3">
            <div className="min-w-0">
              {caught && detail.abilities.length > 0 && (
                <>
                  {/* The card's own heading is the app's red; this sub-label
                      takes the species' type colour, as the reference does — it
                      reads as a detail OF this Pokémon rather than as a second
                      section. */}
                  <div
                    className="font-pixel text-[8px] uppercase tracking-[0.15em]"
                    style={{ color: `color-mix(in oklab, ${typeVar} 78%, #000)` }}
                  >
                    {detail.abilities.length > 1 ? "Abilities" : "Ability"}
                  </div>
                  <div className="mt-1.5 truncate text-sm font-bold text-foreground">
                    {detail.abilities.join(" · ")}
                  </div>
                </>
              )}
            </div>
            {/* Tinted to the species' type, which is what makes the reference's
                button green on a Grass page. A fixed colour would be right for
                exactly one of the eighteen types. */}
            {/* The white rim needs something OUTSIDE it to be visible: the card
                behind this button is also white, so a plain `border-white` was
                there all along and read as no border at all. The extra hairline
                ring in the species' own colour is what separates the two. */}
            <button
              onClick={onPlayCry}
              className="press inline-flex shrink-0 items-center gap-2 rounded-full border-2 border-white px-4 py-2 text-sm font-bold text-white"
              style={{
                background: `linear-gradient(180deg, ${typeVar} 0%, color-mix(in oklab, ${typeVar} 72%, #000) 100%)`,
                boxShadow: `0 0 0 1.5px color-mix(in oklab, ${typeVar} 45%, transparent), var(--shadow-card)`,
              }}
            >
              <Volume2 className="h-4 w-4" /> Play cry
            </button>
          </div>
        </DexCard>

        <DexCard title="Evolution Line">
          {!hasEvolution ? (
            <p className="text-center text-xs text-foreground/55">This Pokémon doesn't evolve.</p>
          ) : (
            <div className="flex items-stretch gap-0.5 overflow-x-auto">
              {columns.map((col, ci) => (
                <Fragment key={ci}>
                  {ci > 0 && (
                    <div className="flex items-center">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-foreground/35" />
                    </div>
                  )}
                  {/* THIS is the row's flex item, not the rung — the rungs sit
                      inside it in a column. Sizing the rung itself was applying
                      flex-basis to the vertical axis, which is why three
                      attempts at a rung width all left the last stage clipped. */}
                  <div
                    className={`min-w-0 shrink grow basis-[72px] ${
                      col.length > 3 ? "grid grid-cols-2 gap-1" : "flex flex-col gap-1"
                    }`}
                  >
                    {col.map((stage) => (
                      <EvolutionStage
                        key={stage.id}
                        stage={stage}
                        current={stage.id === p.id}
                        caught={isCaught(stage.id)}
                        typeVar={typeVar}
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
  typeVar,
  onSelect,
}: {
  stage: PokeEntry;
  current: boolean;
  caught: boolean;
  /** The OPEN species' type colour, so the highlight matches the page. */
  typeVar: string;
  onSelect: (id: number) => void;
}) {
  // Full width of whatever share the column above hands it. The sizing lives on
  // that column, not here — see the comment at its declaration.
  //
  // `min-w-0` matters as much as the width: without it the button's automatic
  // min-content floor lets a wide pair of type chips push it past its own
  // `w-[92px]`, which is what made the row overflow in the first place.
  //
  // The "you are here" ring takes the page's type colour rather than a fixed
  // green. Green is right on the reference because the reference is a Grass
  // page; on Charizard it read as an unrelated highlight sitting in an orange
  // screen.
  return (
    <button
      onClick={() => onSelect(stage.id)}
      style={
        current
          ? {
              borderColor: `color-mix(in oklab, ${typeVar} 55%, transparent)`,
              background: `color-mix(in oklab, ${typeVar} 10%, transparent)`,
            }
          : undefined
      }
      className={`press flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl border-2 p-0.5 ${
        current ? "" : "border-transparent active:bg-muted/50"
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
      {/* One row, never two. `flex-nowrap` plus `flex-1 min-w-0` on each chip
          makes the pair split the rung's width evenly, so a long dual typing
          (Electric/Flying) stays on one line rather than wrapping and making
          this rung taller than its neighbours. Natural widths, not `flex-1`:
          forcing equal halves truncated the longer of the two to "POI...". */}
      {/* `min-w-0` here as well as on the button. A flex item's default
          min-width is min-content, so without it this row's natural width — two
          chips at full label width — becomes a floor the rung cannot shrink
          past, and the rung ignores its own flex-basis and sizes to content.
          That is what kept the third stage clipped through three attempts at
          picking a fixed rung width. */}
      <span className="flex w-full min-w-0 flex-nowrap justify-center gap-px">
        {stage.types.map((t) => (
          <TypeChip key={t} type={t} selected size="xs" icon={false} />
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
