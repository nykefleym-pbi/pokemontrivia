import * as React from "react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { spriteFallbacks, type PokeType } from "@/lib/pokemon-data";
import type { ItemDef, StatusKind } from "@/lib/game-data";
import { legendaryCategory, isMascotTier } from "@/lib/legendary-data";

/** Item icon (PokeAPI sprite via item.iconUrl), falling back to its emoji if the
 * image fails to load. Shared by the Shop, in-battle bag, and Level Up screen
 * so every surface renders items identically. */
export function ItemIcon({ item, className }: { item: ItemDef; className: string }) {
  // Dream World sprites (used by X Accuracy) fill their whole canvas with no
  // padding, unlike the flat in-game item sprites (~2/3 fill) used by every
  // other item — pad them down so all items render at a consistent size.
  const isDreamWorld = item.iconUrl.includes("/dream-world/");
  return (
    <img
      src={item.iconUrl}
      alt={item.name}
      crossOrigin="anonymous"
      className={`sprite object-contain ${className}`}
      style={isDreamWorld ? { padding: "16.5%", boxSizing: "border-box" } : undefined}
      onError={(e) => {
        const el = e.currentTarget as HTMLImageElement;
        el.replaceWith(
          Object.assign(document.createElement("span"), {
            textContent: item.emoji,
            className: "text-3xl",
          }),
        );
      }}
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
}: {
  type: PokeType;
  size?: "sm" | "md";
}) {
  const sizeCls =
    size === "sm"
      ? "px-1.5 py-[1px] text-[7px] tracking-tight"
      : "px-2.5 py-0.5 text-[9px] tracking-wide";
  return (
    <span
      className={`inline-flex items-center rounded-full font-pixel uppercase text-white shadow-sm ${sizeCls} ${typeColorMap[type]}`}
    >
      {type}
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
      <span
        className="absolute -left-1 -top-1 text-sm leading-none"
        style={{ color: cornerColor }}
      >
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
        <span className="font-pixel text-[8px] tabular-nums">
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

export const PokeballSpinner = React.memo(function PokeballSpinner({
  size = 64,
  spinning = false,
}: {
  size?: number;
  spinning?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-full border-[3px] border-poke-dark ${spinning ? "animate-pokeball" : ""}`}
      style={{ width: size, height: size }}
    >
      {/* Top half — red */}
      <div className="absolute inset-x-0 top-0 h-1/2 bg-poke-red" />
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
          style={{ left: `${18 + i * 26}%`, top: `${8 + (i % 2) * 18}%`, animationDelay: `${i * 0.23}s` }}
        >
          ⚡
        </span>
      ))}
    </>
  );
}

function PoisonEffect({ badly = false }: { badly?: boolean }) {
  return (
    <>
      <div className="status-anim-poison-glow absolute inset-2 rounded-full" />
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="status-anim-bubble absolute bottom-2 block h-2 w-2 rounded-full bg-purple-400/70"
          style={{ left: `${12 + i * 22}%`, animationDelay: `${i * 0.5}s` }}
        />
      ))}
      {badly &&
        [0, 1].map((i) => (
          <span
            key={`spark-${i}`}
            className="status-anim-toxic-spark absolute text-sm text-fuchsia-400"
            style={{ right: `${8 + i * 22}%`, top: `${12 + i * 14}%`, animationDelay: `${i * 0.3}s` }}
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
        <div key={i} className="status-anim-orbit absolute inset-0" style={{ animationDelay: `${i * -1}s` }}>
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
      className={`sticky top-0 z-30 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)] ${
        gradient ? "bg-poke-hero" : "bg-background/90 backdrop-blur-lg"
      }`}
    >
      {children}
    </header>
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
      className={className}
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
              ⏱
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
