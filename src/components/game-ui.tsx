import * as React from "react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { spriteFallbacks, type PokeType } from "@/lib/pokemon-data";

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

export const HpBar = React.memo(function HpBar({ hp, max = 100, label }: { hp: number; max?: number; label?: string }) {
  const pct = Math.max(0, Math.min(100, (hp / max) * 100));
  const color =
    pct > 50 ? "bg-hp-good" : pct > 20 ? "bg-hp-warn" : "bg-hp-low";
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

export const PokeballSpinner = React.memo(function PokeballSpinner({ size = 64 }: { size?: number }) {
  return (
    <div
      className="animate-pokeball relative overflow-hidden rounded-full border-[3px] border-poke-dark shadow-pop"
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

export function AppHeader({ children, gradient }: { children?: React.ReactNode; gradient?: boolean }) {
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

export function PokemonSprite({
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
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${variant}${id}.png`,
        `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`,
      ];
    }
    return spriteFallbacks(id, shiny);
  }, [id, shiny, back]);

  const [idx, setIdx] = useState(0);
  // Reset on id/shiny change
  React.useEffect(() => { setIdx(0); }, [id, shiny, back]);
  const src = sources[Math.min(idx, sources.length - 1)];

  return (
    <img
      src={src}
      alt={alt ?? `Pokemon ${id}`}
      className={className}
      loading="lazy"
      onError={() => {
        setIdx((i) => (i < sources.length - 1 ? i + 1 : i));
      }}
    />
  );
}

export type DailyMark = "correct" | "wrong" | "timeout";

const POKEBALL_SPRITE =
  "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";

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
          <img src={POKEBALL_SPRITE} alt={m} className="sprite h-full w-full object-contain" />
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
