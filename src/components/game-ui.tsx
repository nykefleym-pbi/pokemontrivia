import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Backpack, Info } from "lucide-react";
import { spriteFallbacks, type PokeType } from "@/lib/pokemon-data";
import type { ItemDef, ItemId, StatusKind } from "@/lib/game-data";
import { ITEMS } from "@/lib/game-data";
import { legendaryCategory, isMascotTier } from "@/lib/legendary-data";
import type { Trivia } from "@/lib/trivia-core";
import { TimerRing } from "@/components/timer-ring";
import { typeRowFontSize, COMBAT_PANEL_WIDTH } from "@/lib/type-row-fit";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIES, CATEGORY_OF, BAG_SHORT_DESC } from "@/lib/item-categories";
import { ITEM_CATEGORY_ICON } from "@/lib/app-icons";
import { BATTLE_PLATFORM } from "@/lib/battle-field";

/** Owner-supplied category art, used when an item's own sprite fails to load:
 * every berry shares one image, the three potions another. Items outside these
 * groups have no fallback art. */
const POTION_IDS: ReadonlySet<string> = new Set(["potion", "superpotion", "maxpotion"]);
function categoryArtFor(item: ItemDef): string | null {
  if (item.isBerry) return ITEM_CATEGORY_ICON.berries;
  if (POTION_IDS.has(item.id)) return ITEM_CATEGORY_ICON.potions;
  return null;
}

/** Item icon, shared by the Shop, in-battle bag and Level Up screen so every
 * surface renders items identically. If the item's own PokeAPI sprite fails to
 * load it falls back to its category art (berries / potions); items with no
 * category art render nothing. */
export function ItemIcon({
  item,
  className,
  fallback = null,
}: {
  item: ItemDef;
  className: string;
  /**
   * What to render once the sprite and the category art have both failed.
   *
   * Defaults to nothing, which is right wherever the item is NAMED next to its
   * icon — an empty slot beats a broken-image glyph. Callers that show the icon
   * ALONE have to pass something, or a 404 leaves the player looking at a
   * reward they cannot identify (see the level-up screen's reward chips).
   */
  fallback?: React.ReactNode;
}) {
  // Tracked with the item id so switching items restarts the ladder instead of
  // inheriting the previous item's failures.
  const [failure, setFailure] = useState<{ id: string; stage: 1 | 2 }>({ id: "", stage: 1 });
  const stage = failure.id === item.id ? failure.stage : 0;
  const categoryArt = categoryArtFor(item);

  if (stage === 2 || (stage === 1 && !categoryArt)) return <>{fallback}</>;

  // Dream World sprites (used by X Accuracy) fill their whole canvas with no
  // padding, unlike the flat in-game item sprites (~2/3 fill) used by every
  // other item — pad them down so all items render at a consistent size.
  const isDreamWorld = stage === 0 && item.iconUrl.includes("/dream-world/");
  return (
    <img
      src={stage === 0 ? item.iconUrl : encodeURI(categoryArt as string)}
      alt={item.name}
      // Only the remote PokeAPI sprite needs CORS (the share-card canvas reads
      // it back); the category art is same-origin.
      crossOrigin={stage === 0 ? "anonymous" : undefined}
      // Category art is smooth high-res webp, so it must not get `.sprite`'s
      // image-rendering: pixelated.
      className={`${stage === 0 ? "sprite" : ""} object-contain ${className}`}
      style={isDreamWorld ? { padding: "16.5%", boxSizing: "border-box" } : undefined}
      onError={() => setFailure({ id: item.id, stage: stage === 0 && categoryArt ? 1 : 2 })}
    />
  );
}

const typeColorMap: Record<PokeType, string> = {
  normal: "bg-type-normal",
  fire: "bg-type-fire",
  water: "bg-type-water",
  electric: "bg-type-electric",
  grass: "bg-type-grass",
  ice: "bg-type-ice",
  fighting: "bg-type-fighting",
  poison: "bg-type-poison",
  ground: "bg-type-ground",
  flying: "bg-type-flying",
  psychic: "bg-type-psychic",
  bug: "bg-type-bug",
  rock: "bg-type-rock",
  ghost: "bg-type-ghost",
  dragon: "bg-type-dragon",
  dark: "bg-poke-dark",
  steel: "bg-muted-foreground",
  fairy: "bg-pink-400",
};

export const TypeBadge = React.memo(function TypeBadge({
  type,
  size = "md",
  fontSize,
}: {
  type: PokeType;
  size?: "sm" | "md";
  /** CSS length overriding the badge's 9px type size — see `typeRowFontSize`.
   *  Callers that must keep a multi-type row on ONE line pass a computed value;
   *  everyone else leaves it undefined and gets the fixed size. */
  fontSize?: string;
}) {
  const sizeCls =
    size === "sm"
      ? `${fontSize ? "px-1" : "px-1.5"} py-[2px] tracking-tight`
      : "px-2.5 py-0.5 tracking-wide";
  return (
    <span
      style={fontSize ? { fontSize } : undefined}
      className={`inline-flex items-center whitespace-nowrap rounded-full font-pixel uppercase text-white shadow-sm ${
        fontSize ? "" : "text-[9px]"
      } ${sizeCls} ${typeColorMap[type]}`}
    >
      {type}
    </span>
  );
});

/** Compact per-question type-effectiveness indicator, shared by every battle
 *  mode (Solo/PvP/Training) so they read identically. Renders nothing on a
 *  neutral matchup — only the notable bands earn a pill. `attackType` is the
 *  single type the attacker rolled this question (see typeMatchup): showing it
 *  is what makes the per-question RNG legible ("why was it 2× that time?"). */
const EFFECT_MULT_LABEL: Record<number, string> = { 0.25: "¼×", 0.5: "½×", 2: "2×", 4: "4×" };
export const EffectivenessPill = React.memo(function EffectivenessPill({
  band,
  attackType,
  multiplier,
  className = "",
}: {
  band: "immune" | "resisted" | "neutral" | "super";
  attackType?: PokeType;
  multiplier?: number;
  className?: string;
}) {
  if (band === "neutral") return null;
  const label =
    band === "super"
      ? "Super effective"
      : band === "resisted"
        ? "Not very effective"
        : "Barely scratched";
  const mult = multiplier != null ? (EFFECT_MULT_LABEL[multiplier] ?? `${multiplier}×`) : "";
  const tone = band === "super" ? "bg-red-500/90" : "bg-slate-600/90";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 font-pixel text-[9px] leading-none text-white ${tone} ${className}`}
    >
      {attackType && (
        <span className={`h-1.5 w-1.5 rounded-full ${typeColorMap[attackType]}`} aria-hidden />
      )}
      {mult && <span>{mult}</span>}
      <span className="normal-case">{label}</span>
    </span>
  );
});

/**
 * Bordered status-frame for a Legendary/Mythical partner card, styled after
 * classic Pokémon summary-screen frames (ornamented corners, no glow). Wraps
 * the whole card (not just the sprite) in a type-colored border. Color comes
 * from the Pokémon's own type(s); Mythicals get a star corner instead of a
 * diamond, and box-art "mascot" Legendaries/Mythicals get an added gold ring.
 * Non-legendary Pokémon render with no frame at all (children passed through).
 */
export function LegendaryFrame({
  pokemonId,
  types,
  children,
  className,
}: {
  pokemonId: number;
  types: PokeType[];
  children: React.ReactNode;
  className?: string;
}) {
  const category = legendaryCategory(pokemonId);
  // Non-legendary partners get no frame, but must still honor a layout
  // className (e.g. spacing) passed by the caller — otherwise the wrapped card
  // loses its margin and butts against the element above it.
  if (!category) return className ? <div className={className}>{children}</div> : <>{children}</>;
  const primary = types[0] ?? "normal";
  const secondary = types[1] ?? primary;
  const mascot = isMascotTier(pokemonId);
  const corner = category === "mythical" ? "✦" : "◆";
  const cornerColor = mascot ? "var(--brand-gold)" : `var(--type-${primary})`;
  return (
    <div
      className={`relative rounded-[28px] p-[3px] ${className ?? ""}`}
      style={{
        background: `linear-gradient(135deg, var(--type-${primary}), var(--type-${secondary}))`,
        boxShadow: mascot ? "0 0 0 2px var(--brand-gold)" : undefined,
      }}
    >
      <div className="rounded-[25px]">{children}</div>
      <span className="absolute -left-1 -top-1 text-sm leading-none" style={{ color: cornerColor }}>
        {corner}
      </span>
      <span
        className="absolute -right-1 -top-1 text-sm leading-none"
        style={{ color: cornerColor }}
      >
        {corner}
      </span>
      <span
        className="absolute -bottom-1 -left-1 text-sm leading-none"
        style={{ color: cornerColor }}
      >
        {corner}
      </span>
      <span
        className="absolute -bottom-1 -right-1 text-sm leading-none"
        style={{ color: cornerColor }}
      >
        {corner}
      </span>
    </div>
  );
}

export const HpBar = React.memo(function HpBar({
  hp,
  max = 100,
  label,
  compact = false,
}: {
  hp: number;
  max?: number;
  label?: string;
  compact?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const color = pct > 50 ? "bg-hp-good" : pct > 20 ? "bg-hp-warn" : "bg-hp-low";
  if (compact) {
    return (
      <div className="flex w-full items-center gap-1.5">
        <div className="h-2 flex-1 overflow-hidden rounded-full border border-poke-dark/70 bg-poke-dark/20">
          <motion.div
            className={`h-full ${color}`}
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: "spring", stiffness: 100, damping: 18 }}
          />
        </div>
        <span className="font-pixel text-[9px] tabular-nums">
          {Math.round(hp)}/{max}
        </span>
      </div>
    );
  }
  return (
    <div className="w-full">
      {label && (
        <div className="mb-1 flex items-center justify-between">
          <span className="font-pixel text-[10px] uppercase">{label}</span>
          <span className="font-pixel text-[10px]">
            {Math.round(hp)}/{max}
          </span>
        </div>
      )}
      <div className="h-3 w-full overflow-hidden rounded-full border-2 border-poke-dark/80 bg-poke-dark/20">
        <motion.div
          className={`h-full ${color}`}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 100, damping: 18 }}
        />
      </div>
    </div>
  );
});

export const XpBar = React.memo(function XpBar({ xp, need }: { xp: number; need: number }) {
  const pct = Math.max(0, Math.min(100, (xp / need) * 100));
  return (
    <div className="w-full">
      <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
        <span>XP</span>
        <span>
          {xp} / {need}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="h-full bg-gradient-to-r from-poke-yellow to-primary"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 80, damping: 20 }}
        />
      </div>
    </div>
  );
});

/**
 * The four ball tiers, in catch-rate order — which is also the order they read
 * as an upgrade, so it is the order `BallCycler` runs them in.
 *
 * Colours are taken from the official designs rather than invented: Great Ball
 * blue with red flank stripes, Ultra Ball black with the yellow "H", Master Ball
 * purple with the pink M between two white bulbs. Each is built from the same
 * half/half/band/button skeleton as the Poké Ball so the flip between any two
 * of them lands on identical geometry — only the top half's livery changes.
 */
export type BallVariant = "poke" | "great" | "ultra" | "master";

const BALL_ORDER: readonly BallVariant[] = ["poke", "great", "ultra", "master"];

const BALL_TOP: Record<BallVariant, string> = {
  poke: "#EE4B3C",
  great: "#2E6FD9",
  ultra: "#2B2F36",
  master: "#6A3FA0",
};

/** The livery painted over the top half. The Poké Ball has none — that is what
 *  makes it the plain one. */
function BallLivery({ variant, size }: { variant: BallVariant; size: number }) {
  if (variant === "great") {
    // Two red flank stripes sweeping up from the band, white-edged, as on the
    // real thing. Rotated outward so they follow the curve rather than sitting
    // flat on it.
    return (
      <>
        <div
          className="absolute left-[3%] top-[2%] h-[46%] w-[17%] -rotate-[20deg] rounded-b-full bg-[#E23B2E] ring-[1.5px] ring-white/80"
          aria-hidden
        />
        <div
          className="absolute right-[3%] top-[2%] h-[46%] w-[17%] rotate-[20deg] rounded-b-full bg-[#E23B2E] ring-[1.5px] ring-white/80"
          aria-hidden
        />
      </>
    );
  }
  if (variant === "ultra") {
    // The yellow "H": two uprights joined by a crossbar.
    return (
      <>
        <div className="absolute left-[13%] top-[6%] h-[42%] w-[14%] bg-[#F5C93B]" aria-hidden />
        <div className="absolute right-[13%] top-[6%] h-[42%] w-[14%] bg-[#F5C93B]" aria-hidden />
        <div className="absolute left-[13%] top-[26%] h-[13%] w-[74%] bg-[#F5C93B]" aria-hidden />
      </>
    );
  }
  if (variant === "master") {
    return (
      <>
        <div
          className="absolute left-[9%] top-[13%] rounded-full bg-white"
          style={{ width: size * 0.21, height: size * 0.21 }}
          aria-hidden
        />
        <div
          className="absolute right-[9%] top-[13%] rounded-full bg-white"
          style={{ width: size * 0.21, height: size * 0.21 }}
          aria-hidden
        />
        <span
          className="absolute left-1/2 top-[7%] -translate-x-1/2 font-black leading-none text-[#E85FA8]"
          style={{ fontSize: size * 0.34 }}
          aria-hidden
        >
          M
        </span>
      </>
    );
  }
  return null;
}

/**
 * A Pokéball at badge size, drawn as one SVG.
 *
 * `PokeballSpinner` is built from stacked divs with a fixed 3px border, which
 * swamps the shape below about 24px — at 14px it reads as a dark blob. This is
 * the same ball drawn at scale instead, for the Pokédex caught marker and the
 * completion card's Caught tile.
 */
export function MiniPokeball({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={`shrink-0 ${className}`} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#fff" stroke="#1b1d2b" strokeWidth="3" />
      <path d="M2 16 a14 14 0 0 1 28 0 Z" fill="#ee4b3c" stroke="#1b1d2b" strokeWidth="3" />
      <rect x="2" y="14" width="28" height="4" fill="#1b1d2b" />
      <circle cx="16" cy="16" r="4.5" fill="#fff" stroke="#1b1d2b" strokeWidth="3" />
    </svg>
  );
}

export const PokeballSpinner = React.memo(function PokeballSpinner({
  size = 64,
  spinning = false,
  variant = "poke",
}: {
  size?: number;
  spinning?: boolean;
  variant?: BallVariant;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-full border-[3px] border-poke-dark ${spinning ? "animate-pokeball" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* Top half — the tier's colour */}
      <div className="absolute inset-x-0 top-0 h-1/2" style={{ background: BALL_TOP[variant] }} />
      <BallLivery variant={variant} size={size} />
      {/* Bottom half — white */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white" />
      {/* Black band */}
      <div className="absolute left-0 right-0 top-1/2 h-[12%] -translate-y-1/2 bg-poke-dark" />
      {/* Center button */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-poke-dark bg-white"
        style={{ width: size * 0.3, height: size * 0.3 }}
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-1 ring-poke-dark/40"
          style={{ width: size * 0.12, height: size * 0.12 }}
        />
      </div>
    </div>
  );
});

/**
 * A ball that flips itself over to the next tier every few seconds.
 *
 * The swap happens at the animation's halfway point, when the disc is edge-on
 * and nothing of either face is visible — that is what sells it as one object
 * turning over rather than two images cross-fading. `HALF_MS` therefore has to
 * stay exactly half of the `ball-flip` duration in styles.css; they are a pair.
 *
 * The chain lives in ONE effect with empty deps, and that is the fix for a real
 * bug rather than a style preference. The first version keyed the effect on
 * `index`, so the moment the tier swapped — halfway through the flip — React
 * tore that effect down and its cleanup cancelled the still-pending timer that
 * resets `flipping`. The class was therefore never removed, and since
 * re-applying a class that is already present does not restart a CSS animation,
 * every flip after the first was invisible: the ball changed tier silently and
 * only a remount (switching back to the Home tab) ever animated again.
 *
 * `alive` guards each step so a component unmounted mid-chain cannot call
 * setState afterwards, and re-arming from the tail rather than running an
 * interval means a backgrounded tab resumes cleanly instead of firing a queued
 * burst of swaps.
 *
 * Reduced motion is handled in CSS: the keyframes are stilled along with every
 * other decorative loop, and the ball simply cuts to the next tier.
 */
const FLIP_EVERY_MS = 3200;
const FLIP_MS = 700;
const HALF_MS = FLIP_MS / 2;

export function BallCycler({ size = 56 }: { size?: number }) {
  const [index, setIndex] = useState(0);
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const after = (ms: number, fn: () => void) => {
      timer = setTimeout(() => {
        if (alive) fn();
      }, ms);
    };
    const cycle = () => {
      after(FLIP_EVERY_MS, () => {
        setFlipping(true);
        // Swap at the halfway point, edge-on, where neither face is visible.
        after(HALF_MS, () => {
          setIndex((i) => (i + 1) % BALL_ORDER.length);
          after(HALF_MS, () => {
            setFlipping(false);
            cycle();
          });
        });
      });
    };
    cycle();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);

  return (
    <div data-testid="ball-cycler" style={{ perspective: size * 6 }}>
      <div className={flipping ? "animate-ball-flip" : undefined}>
        <PokeballSpinner size={size} variant={BALL_ORDER[index]} />
      </div>
    </div>
  );
}

function BurnEffect() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="status-anim-burn absolute bottom-1 text-lg"
          style={{ left: `${28 + i * 20}%`, animationDelay: `${i * 0.18}s` }}
        >
          🔥
        </span>
      ))}
    </>
  );
}

function FreezeEffect() {
  return <div className="status-anim-freeze absolute inset-1 rounded-3xl" />;
}

function ParalysisEffect() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="status-anim-spark absolute text-base"
          style={{
            left: `${18 + i * 26}%`,
            top: `${8 + (i % 2) * 18}%`,
            animationDelay: `${i * 0.23}s`,
          }}
        >
          ⚡
        </span>
      ))}
    </>
  );
}

/**
 * Poison: purple bubbles drifting up off the sprite.
 *
 * The circular "force field" glow this used to sit inside is gone (owner
 * ruling 2026-08-01) — the bubbles ARE the effect now.
 *
 * The sizes, offsets, delays and travel distances are an authored table rather
 * than `Math.random()`, and that is deliberate twice over: random values
 * regenerate on every render, so bubbles would jump to new positions whenever
 * anything else on the battle screen changed state, and a table is something a
 * reviewer can actually look at. They are varied enough to read as random and
 * never line up into a shoal.
 *
 * Badly poisoned gets the same bubbles bigger, more opaque and travelling
 * further, so the two severities are one visual language rather than two.
 */
const POISON_BUBBLES = [
  { size: 5, left: 14, delay: 0, dur: 2.4, rise: 44 },
  { size: 9, left: 30, delay: 0.65, dur: 2.9, rise: 56 },
  { size: 4, left: 45, delay: 1.3, dur: 2.1, rise: 38 },
  { size: 7, left: 58, delay: 0.3, dur: 2.6, rise: 50 },
  { size: 11, left: 72, delay: 1.0, dur: 3.2, rise: 62 },
  { size: 5, left: 86, delay: 1.7, dur: 2.3, rise: 42 },
  { size: 8, left: 22, delay: 2.1, dur: 2.8, rise: 54 },
  { size: 6, left: 64, delay: 1.55, dur: 2.5, rise: 46 },
] as const;

function PoisonEffect({ badly = false }: { badly?: boolean }) {
  // One multiplier per severity rather than a second table.
  const scale = badly ? 1.5 : 1;
  const peak = badly ? 0.95 : 0.7;
  return (
    <>
      {POISON_BUBBLES.map((b, i) => (
        <span
          key={i}
          className="status-anim-bubble pointer-events-none absolute bottom-1 block rounded-full"
          style={
            {
              left: `${b.left}%`,
              width: b.size * scale,
              height: b.size * scale,
              animationDelay: `${b.delay}s`,
              animationDuration: `${b.dur}s`,
              background: badly ? "oklch(0.55 0.22 320)" : "oklch(0.62 0.18 320)",
              boxShadow: badly ? "0 0 6px oklch(0.55 0.22 320 / 0.7)" : undefined,
              "--bubble-rise": `${b.rise * scale}px`,
              "--bubble-peak": String(peak),
            } as React.CSSProperties
          }
        />
      ))}
      {badly &&
        [0, 1].map((i) => (
          <span
            key={`spark-${i}`}
            className="status-anim-toxic-spark absolute text-sm text-fuchsia-400"
            style={{
              right: `${8 + i * 22}%`,
              top: `${12 + i * 14}%`,
              animationDelay: `${i * 0.3}s`,
            }}
          >
            ✦
          </span>
        ))}
    </>
  );
}

function SleepEffect() {
  return (
    <div className="status-anim-sleep absolute -top-1 left-1/2 -translate-x-1/2 text-xl">💤</div>
  );
}

function ConfusionEffect() {
  return (
    <div className="pointer-events-none absolute left-1/2 -top-2 h-16 w-16 -translate-x-1/2">
      {[0, 1].map((i) => (
        <div
          key={i}
          className="status-anim-orbit absolute inset-0"
          style={{ animationDelay: `${i * -1}s` }}
        >
          <span
            className="status-anim-orbit-counter absolute left-1/2 top-0 -translate-x-1/2 text-base"
            style={{ animationDelay: `${i * -1}s` }}
          >
            💫
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Shared status-condition sprite overlay for Solo and Nearby-Battle PvP:
 * flames/frost/sparks/bubbles/zzz/orbiting stars layered directly on the
 * sprite, in addition to (not replacing) the small emoji chip in the combat
 * panel. Confusion is the sole stacking volatile, so it can render alongside
 * one mutually-exclusive major status (burn/freeze/paralysis/poisoned/
 * badly-poisoned/sleep) at the same time. Render as an absolutely-positioned
 * sibling of `PokemonSprite` inside the same `motion.div` wrapper the caller
 * already uses for shake/float-damage.
 */
export function StatusEffectOverlay({
  statuses,
  confused: confusedOverride = false,
}: {
  statuses: Array<{ kind: StatusKind }>;
  /**
   * Client-authoritative confused overlay (Training's "confused after 2 wrong").
   * Confusion is held locally and merged into the displayed statuses, but this
   * prop lets a caller force the confusion visual on either side WITHOUT writing
   * it into the shared/synced status row (so realtime row-sync can't clobber it).
   * Renders on top of any major status already present in `statuses`.
   */
  confused?: boolean;
}) {
  const list = statuses ?? [];
  const major = list.find((s) => s.kind !== "confused")?.kind;
  const confused = confusedOverride || list.some((s) => s.kind === "confused");
  if (!major && !confused) return null;

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-20 overflow-visible">
      {major === "burn" && <BurnEffect />}
      {major === "freeze" && <FreezeEffect />}
      {major === "paralysis" && <ParalysisEffect />}
      {major === "poisoned" && <PoisonEffect />}
      {major === "badly-poisoned" && <PoisonEffect badly />}
      {major === "sleep" && <SleepEffect />}
      {confused && <ConfusionEffect />}
    </div>
  );
}

export function AppHeader({
  children,
  gradient,
}: {
  children?: React.ReactNode;
  gradient?: boolean;
}) {
  return (
    <header
      className={`sticky top-0 z-30 px-5 pb-3 screen-top ${
        gradient ? "bg-poke-hero" : "bg-background/90 backdrop-blur-lg"
      }`}
    >
      {children}
    </header>
  );
}

/**
 * Radiating light behind a product sprite.
 *
 * Two layers on purpose: a conic ray fan for the "burst", and a soft radial
 * glow to keep the rays from cutting hard edges across the artwork. Both are
 * pure CSS so they cost no image weight and inherit no colour of their own —
 * the caller supplies the tint, so the same burst works on a red card and a
 * purple one.
 */
export function SpriteBurst({ tint = "rgba(255,255,255,0.5)" }: { tint?: string }) {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 animate-[spin_18s_linear_infinite] rounded-full"
        style={{
          background: `repeating-conic-gradient(from 0deg, ${tint} 0deg 6deg, transparent 6deg 16deg)`,
          maskImage: "radial-gradient(circle, #000 30%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(circle, #000 30%, transparent 72%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-[18%] rounded-full blur-md"
        style={{ background: tint }}
      />
    </>
  );
}

export const PokemonSprite = React.memo(function PokemonSprite({
  id,
  shiny = false,
  back = false,
  className,
  alt,
}: {
  id: number;
  shiny?: boolean;
  back?: boolean;
  className?: string;
  alt?: string;
}) {
  const sources = useMemo(() => {
    if (back) {
      const variant = shiny ? "shiny/" : "";
      return [
        `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/back/${variant}${id}.png`,
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${variant}${id}.png`,
        `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${variant}${id}.png`,
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`,
      ];
    }
    return spriteFallbacks(id, shiny);
  }, [id, shiny, back]);

  const [idx, setIdx] = useState(0);
  // Reset on id/shiny change
  React.useEffect(() => {
    setIdx(0);
  }, [id, shiny, back]);
  const src = sources[Math.min(idx, sources.length - 1)];

  return (
    <img
      src={src}
      alt={alt ?? `Pokemon ${id}`}
      // `object-contain` FIRST so a caller's own class can still override it.
      // Every caller sizes this with a square box (h-36 w-36, h-full w-full),
      // which silently stretches any source that is not square — and the
      // fallback ladder ends at official-artwork, a different canvas from the
      // 96x96 game sprite. Owner report 2026-08-01: a squeezed battle sprite.
      className={`object-contain ${className ?? ""}`}
      loading="lazy"
      crossOrigin="anonymous"
      onError={() => {
        setIdx((i) => (i < sources.length - 1 ? i + 1 : i));
      }}
    />
  );
});

export type DailyMark = "correct" | "wrong" | "timeout";

const POKEBALL_SPRITE =
  "https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/items/poke-ball.png";

export function PokeballPattern({ marks }: { marks: DailyMark[] }) {
  if (!marks?.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5">
      {marks.map((m, i) => (
        <div
          key={i}
          className={`relative h-7 w-7 ${
            m === "correct" ? "" : m === "wrong" ? "opacity-40 grayscale" : "opacity-30 grayscale"
          }`}
        >
          <img
            src={POKEBALL_SPRITE}
            alt={m}
            crossOrigin="anonymous"
            className="sprite h-full w-full object-contain"
          />
          {m === "wrong" && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-pixel text-[10px] text-destructive">
              ✕
            </span>
          )}
          {m === "timeout" && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-[10px]">
              –
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The arena: the field artwork, the fade into the question card, and the four
 * things that have to be registered against the painting.
 *
 * Everything here is positioned in percentages of `.battle-stage`, which carries
 * the artwork's own aspect ratio (see styles.css). That is what makes the
 * numbers below mean the same thing on a 390x844 phone, a 430x932 one, and a
 * viewport that just lost 90px to the browser's URL bar — a `background-size:
 * cover` on the screen container would re-crop on every one of those and slide
 * the sprites off the platforms they are standing on.
 *
 * The two sprite slots sit ON the painted platforms; each pad's own `sink` (see
 * lib/battle-field.ts) absorbs the transparent padding underneath a PokeAPI
 * sprite, which is what otherwise leaves the creature hovering above its pad
 * rather than standing on it. The two panel slots go in the empty ground the
 * composition leaves either side of the diagonal: the enemy's above and left of
 * its pad, yours across from yours.
 *
 * The player panel's `top-[30%]` is chosen so the card is level with the pad it
 * belongs to (pad centre 34.8%, card ~10% tall), not merely below it — at 40%
 * the two read as unrelated and the card drifted into the question card's
 * shoulder. The enemy panel's `top-[13%]` brings its lower edge down to meet the
 * VS mark painted at ~24-29%, which is what ties the two halves of the diagonal
 * together; at 7% it floated alone against the treeline.
 *
 * Every slot carries `z-10` so it sits above the artwork layer rather than
 * being painted into it.
 */
export function BattleStage({
  enemySprite,
  playerSprite,
  enemyPanel,
  playerPanel,
}: {
  enemySprite: React.ReactNode;
  playerSprite: React.ReactNode;
  enemyPanel: React.ReactNode;
  playerPanel: React.ReactNode;
}) {
  const pad = (p: { cx: number; cy: number; sink: number }) => ({
    left: `${p.cx}%`,
    top: `${p.cy + p.sink}%`,
    transform: "translate(-50%, -100%)",
  });
  return (
    <div className="battle-stage" aria-hidden={false}>
      <div className="absolute left-[4%] right-[48%] top-[13%] z-10 flex justify-start">
        {enemyPanel}
      </div>
      <div className="absolute z-10" style={pad(BATTLE_PLATFORM.enemy)}>
        {enemySprite}
      </div>
      <div className="absolute z-10" style={pad(BATTLE_PLATFORM.player)}>
        {playerSprite}
      </div>
      <div className="absolute left-[46%] right-[4%] top-[30%] z-10 flex justify-end">
        {playerPanel}
      </div>
    </div>
  );
}

/** A combatant's HP bar/type badges/status icons card. Shared by every mode
 *  with an HP-based combat loop (originally battle-screen.tsx's solo battles;
 *  Mega Raid adopts it too) — a `live-pvp-battle-screen.tsx` variant
 *  (`PvpCombatPanel`) currently duplicates this instead of importing it,
 *  since that file is signature-rework's active workspace; unify once that
 *  project reaches a stable checkpoint. */
export function CombatPanel({
  align,
  pokemonName,
  types,
  hp,
  maxHp,
  abilityName,
  abilityDescription,
  immune,
  disadvantaged,
  testId,
}: {
  align: "left" | "right";
  pokemonName: string;
  types: PokeType[];
  hp: number;
  maxHp: number;
  abilityName: string | null;
  /** Tappable Popover body for the ability chip — omit/null to render a plain chip. */
  abilityDescription?: string | null;
  immune: boolean;
  disadvantaged: boolean;
  /** Test-observability hook only — not read by any production code. */
  testId?: string;
}) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const barColor = pct > 50 ? "bg-hp-good" : pct > 20 ? "bg-hp-warn" : "bg-hp-low";
  const alignCls = align === "right" ? "items-end text-right" : "items-start text-left";
  const justifyCls = align === "right" ? "justify-end" : "justify-start";

  return (
    <div
      style={{ width: COMBAT_PANEL_WIDTH }}
      // Type disadvantage is the border, not a chip. A "WEAK" pill sat on the
      // same row as the ability and read as another ability; the whole card
      // turning red says the same thing without competing for the row, and
      // leaves the panel to one job — who this is and how hurt they are.
      className={`shrink-0 rounded-2xl border-2 bg-card px-3 py-2 shadow-card backdrop-blur ${
        disadvantaged && !immune ? "border-destructive" : "border-transparent"
      }`}
    >
      <div className={`flex flex-col ${alignCls}`}>
        {/* Hierarchy: the name is the biggest thing on the card, the type and
            ability chips are supporting detail. They were all within a step of
            each other, so nothing led. */}
        <div className="w-full truncate text-[17px] font-extrabold leading-tight">
          {pokemonName}
        </div>

        {/* One line, always: the badges shrink to fit rather than wrapping or
            spilling out of the fixed-width card. See `typeRowFontSize`. */}
        <div className={`mt-1 flex w-full flex-nowrap gap-0.5 ${justifyCls}`}>
          {types.map((t) => (
            <TypeBadge
              key={t}
              type={t}
              size="sm"
              fontSize={typeRowFontSize(types, COMBAT_PANEL_WIDTH)}
            />
          ))}
        </div>
        <div className="mt-1.5 flex w-full items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-poke-dark/15">
            <motion.div
              className={`h-full ${barColor}`}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 18 }}
            />
          </div>
          <span
            className="text-[11px] font-bold tabular-nums text-foreground"
            data-testid={testId && `${testId}-hp`}
          >
            {Math.round(hp)}
          </span>
        </div>
        {/* Ability only. The IMMUNE/WEAK pills are now the card's border, and
            the status pills are gone entirely: every status already animates on
            the sprite itself (burn flames, freeze, sparks, the confusion
            orbit), so repeating it here as an emoji chip was a second, quieter
            copy of information the player is already watching. */}
        {abilityName && (
          <div className={`mt-1 flex w-full ${justifyCls}`}>
            {abilityName && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="press flex max-w-full items-center gap-0.5 rounded-xl bg-primary/10 px-1.5 py-[1px] font-pixel text-[7px] uppercase leading-none tracking-wide text-primary"
                  >
                    <span className="min-w-0 truncate text-left">{abilityName}</span>
                    <Info className="h-2 w-2 shrink-0 opacity-70" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align={align === "right" ? "end" : "start"}
                  className="w-56 text-xs"
                >
                  <div className="font-bold text-primary">{abilityName}</div>
                  {abilityDescription && (
                    <p className="mt-1 leading-snug text-muted-foreground">{abilityDescription}</p>
                  )}
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The trivia question/answer card: timer pill + category, question text, the
 *  options grid (with correct/wrong/revealed-option styling), and the
 *  post-answer explanation. Shared by every quiz-like mode — battle-screen.tsx
 *  originally, Mega Raid adopts it too. Deliberately excludes anything
 *  battle-specific (HP, items, abilities): those live in `CombatPanel` and the
 *  item-bag UI, which not every mode needs (Daily Quest/Who's That don't) —
 *  callers that DO need an item bag render it via `children`, which renders
 *  inside the same wrapper/animation as the question content (so it re-keys
 *  alongside each question transition, matching prior in-place behavior).
 *
 *  `key={questionIdx}` must be set by the CALLER on this component (not read
 *  from a prop here) — that's what drives the parent `AnimatePresence`'s
 *  enter/exit transition between questions. */
export function QuestionCard({
  trivia,
  phase,
  chosen,
  revealedWrong,
  revealedWrong2,
  revealedCorrect,
  timer,
  maxTime,
  lastElapsedMs,
  onAnswer,
  children,
}: {
  trivia: Trivia;
  phase: "question" | "feedback";
  chosen: number | null;
  revealedWrong: number | null;
  revealedWrong2: number | null;
  revealedCorrect: number | null;
  timer: number;
  maxTime: number;
  lastElapsedMs: number;
  onAnswer: (idx: number) => void;
  children?: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ y: 40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -10, opacity: 0 }}
      className="relative"
    >
      {/* Floating timer pill + category label */}
      <div className="pointer-events-none absolute left-1/2 -top-12 z-10 flex -translate-x-1/2 flex-col items-center">
        <TimerRing timer={timer} maxTime={maxTime} />
        <p className="mt-1.5 font-pixel-xs text-foreground/70">{trivia.category}</p>
      </div>

      <div className="pt-1">
        <p className="text-center text-[clamp(0.95rem,4vw,1.125rem)] font-bold leading-snug">
          {trivia.question}
        </p>
        <div className="mt-3 grid grid-cols-1 gap-2">
          {trivia.options.map((opt, i) => {
            const isCorrect = phase === "feedback" && i === trivia.correct;
            const isWrong = phase === "feedback" && chosen === i && i !== trivia.correct;
            const isRevealed = revealedWrong === i || revealedWrong2 === i;
            const isAnswerRevealed = phase === "question" && revealedCorrect === i;
            return (
              <button
                key={i}
                data-testid={`option-${i}`}
                disabled={phase !== "question" || isRevealed}
                onClick={() => onAnswer(i)}
                className={`flex min-h-[48px] items-center justify-between rounded-2xl border-2 bg-card px-4 py-2.5 text-left text-[clamp(0.875rem,3.6vw,0.95rem)] font-semibold transition press-lg ${
                  isCorrect
                    ? "border-hp-good bg-hp-good/5 text-hp-good"
                    : isWrong
                      ? "border-destructive bg-destructive/5 text-destructive"
                      : isRevealed
                        ? "border-border/60 line-through opacity-50"
                        : isAnswerRevealed
                          ? "border-hp-good bg-hp-good/10 text-hp-good"
                          : "border-border/60 text-foreground hover:border-primary/50"
                } disabled:cursor-not-allowed`}
              >
                <span className="min-w-0 flex-1 break-words">{opt}</span>
                {isCorrect && (
                  <span className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hp-good text-[12px] text-white">
                    ✓
                  </span>
                )}
                {isWrong && (
                  <span className="ml-2 shrink-0 text-[10px] font-bold uppercase tracking-wide text-destructive">
                    Your Pick ×
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {phase === "feedback" && (
          <p className="mt-2 rounded-xl bg-muted p-2 text-[11px] leading-snug text-muted-foreground">
            {trivia.explanation} · {(lastElapsedMs / 1000).toFixed(1)}s
          </p>
        )}
        {children}
      </div>
    </motion.div>
  );
}

/** The in-battle item bag: a Sheet listing every owned item grouped by
 *  category (with auto-trigger/used/disabled state) plus a quick-access row
 *  of up to 3 non-auto items. Shared by every mode with item mechanics —
 *  battle-screen.tsx originally, Mega Raid adopts it too. Not every mode
 *  needs this (Daily Quest/Who's That have no items). */
export function ItemBagSheet({
  bagOpen,
  onBagOpenChange,
  inventory,
  usedThisBattle,
  itemsUsedThisBattleCount,
  maxItemsPerBattle,
  itemCapReached,
  choiceSpecsActive,
  anyItemUsedThisBattle,
  escapeDisabled,
  onUseItem,
}: {
  bagOpen: boolean;
  onBagOpenChange: (open: boolean) => void;
  inventory: Partial<Record<ItemId, number>>;
  usedThisBattle: Partial<Record<ItemId, boolean>>;
  itemsUsedThisBattleCount: number;
  maxItemsPerBattle: number;
  itemCapReached: boolean;
  choiceSpecsActive: boolean;
  anyItemUsedThisBattle: boolean;
  /** True when Escape Rope can't be used this battle (Elite Four/Weekly). */
  escapeDisabled: boolean;
  onUseItem: (id: ItemId) => void;
}) {
  const isManuallyDisabled = (it: ItemDef, isAuto: boolean) => {
    const used = usedThisBattle[it.id] ?? false;
    return (
      isAuto ||
      used ||
      (escapeDisabled && it.id === "escape") ||
      (choiceSpecsActive && it.id !== "choicespecs") ||
      (it.id === "choicespecs" && anyItemUsedThisBattle) ||
      itemCapReached
    );
  };

  return (
    <div className="mt-3 flex items-center justify-center gap-3">
      <Sheet open={bagOpen} onOpenChange={onBagOpenChange}>
        <SheetTrigger asChild>
          <button className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition press">
            <Backpack className="h-6 w-6 text-muted-foreground" />
          </button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="text-center font-display-lg text-foreground">
              Your Bag
            </SheetTitle>
            <div className="text-center text-xs font-semibold text-muted-foreground">
              {itemsUsedThisBattleCount}/{maxItemsPerBattle} items used this battle
            </div>
          </SheetHeader>
          {(() => {
            // Same grouped, owned-only layout as the Shop bag.
            const bagGroups = CATEGORIES.map((cat) => ({
              ...cat,
              items: ITEMS.filter(
                (it) => CATEGORY_OF[it.id] === cat.id && (inventory[it.id] ?? 0) > 0,
              ),
            })).filter((g) => g.items.length > 0);
            return (
              <div className="my-4 max-h-[65vh] overflow-y-auto">
                {bagGroups.length === 0 ? (
                  <div className="rounded-3xl bg-poke-yellow/15 p-6 text-center">
                    <div className="font-display-md text-foreground">Your bag is empty</div>
                    <p className="mt-1 text-xs text-foreground/60">
                      Visit the Shop to stock up on items.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 pb-2">
                    {bagGroups.map((group) => (
                      <div key={group.id}>
                        <div className="mb-2 font-pixel-xs uppercase tracking-wider text-foreground/45">
                          {group.label}
                        </div>
                        <div className="flex flex-col gap-2.5">
                          {group.items.map((it) => {
                            const owned = inventory[it.id] ?? 0;
                            const used = usedThisBattle[it.id] ?? false;
                            const isAuto =
                              it.id === "focusband" ||
                              it.id === "quickclaw" ||
                              it.id === "assaultvest" ||
                              it.id === "revive" ||
                              it.id === "oranberry" ||
                              it.id === "silkscarf" ||
                              it.id === "kingsrock" ||
                              it.id === "leftovers" ||
                              it.id === "metronome";
                            const disabled = isManuallyDisabled(it, isAuto);
                            return (
                              <button
                                key={it.id}
                                disabled={disabled}
                                onClick={() => onUseItem(it.id)}
                                className="flex items-center gap-3.5 rounded-2xl bg-card px-4 py-3 text-left shadow-card transition press-lg disabled:opacity-40"
                              >
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/[0.08]">
                                  <ItemIcon item={it} className="h-9 w-9" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                    {it.name}
                                    <span className="font-pixel text-[9px] text-primary">
                                      ×{owned}
                                    </span>
                                  </div>
                                  <div className="text-[11px] leading-tight text-muted-foreground">
                                    {BAG_SHORT_DESC[it.id] ?? it.desc}
                                  </div>
                                  {isAuto && (
                                    <div className="text-[10px] text-primary">Auto-activates</div>
                                  )}
                                  {used && !isAuto && (
                                    <div className="text-[10px] text-destructive">
                                      Used this battle
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>
      {ITEMS.filter(
        (it) =>
          (inventory[it.id] ?? 0) > 0 &&
          it.id !== "focusband" &&
          it.id !== "quickclaw" &&
          it.id !== "assaultvest",
      )
        .slice(0, 3)
        .map((it) => {
          const owned = inventory[it.id] ?? 0;
          const disabled = isManuallyDisabled(it, false);
          return (
            <button
              key={it.id}
              data-testid={`item-${it.id}`}
              disabled={disabled}
              onClick={() => onUseItem(it.id)}
              className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition press disabled:opacity-40"
            >
              <ItemIcon item={it} className="h-8 w-8" />
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-poke-dark px-1 font-pixel text-[9px] text-white">
                {owned}
              </span>
            </button>
          );
        })}
    </div>
  );
}
