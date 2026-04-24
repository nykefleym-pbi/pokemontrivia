import * as React from "react";
import { motion } from "framer-motion";
import type { PokeType } from "@/lib/pokemon-data";

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
};

export function TypeBadge({ type }: { type: PokeType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-pixel text-[9px] uppercase tracking-wide text-white shadow-sm ${typeColorMap[type]}`}
    >
      {type}
    </span>
  );
}

export function HpBar({ hp, max = 100, label }: { hp: number; max?: number; label?: string }) {
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
}

export function XpBar({ xp, need }: { xp: number; need: number }) {
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
}

export function PokeballSpinner({ size = 64 }: { size?: number }) {
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
}

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
