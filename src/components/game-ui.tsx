import * as React from "react";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Backpack, Info } from "lucide-react";
import { spriteFallbacks, type PokeType } from "@/lib/pokemon-data";
import type { ItemDef, ItemId, StatusKind } from "@/lib/game-data";
import { STATUS_META, ITEMS } from "@/lib/game-data";
import { legendaryCategory, isMascotTier } from "@/lib/legendary-data";
import type { Trivia } from "@/lib/trivia-core";
import { TimerRing } from "@/components/timer-ring";
import { typeRowFontSize, COMBAT_PANEL_WIDTH } from "@/lib/type-row-fit";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIES, CATEGORY_OF, BAG_SHORT_DESC } from "@/lib/item-categories";
import { ITEM_CATEGORY_ICON } from "@/lib/app-icons";

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
export function ItemIcon({ item, className }: { item: ItemDef; className: string }) {
  // Tracked with the item id so switching items restarts the ladder instead of
  // inheriting the previous item's failures.
  const [failure, setFailure] = useState<{ id: string; stage: 1 | 2 }>({ id: "", stage: 1 });
  const stage = failure.id === item.id ? failure.stage : 0;
  const categoryArt = categoryArtFor(item);

  // Out of fallbacks — an empty slot beats a broken-image icon.
  if (stage === 2 || (stage === 1 && !categoryArt)) return null;

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
      onError={() =>
        setFailure({ id: item.id, stage: stage === 0 && categoryArt ? 1 : 2 })
      }
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
              –
            </span>
          )}
        </div>
      ))}
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
  statuses,
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
  statuses: Array<{ kind: StatusKind }>;
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
      className="shrink-0 rounded-2xl bg-card px-3 py-2 backdrop-blur shadow-card"
    >
      <div className={`flex flex-col ${alignCls}`}>
        <div className="w-full truncate text-sm font-bold leading-tight">{pokemonName}</div>

        {/* One line, always: the badges shrink to fit rather than wrapping or
            spilling out of the fixed-width card. See `typeRowFontSize`. */}
        <div className={`mt-1 flex w-full flex-nowrap gap-0.5 ${justifyCls}`}>
          {types.map((t) => (
            <TypeBadge key={t} type={t} size="sm" fontSize={typeRowFontSize(types, COMBAT_PANEL_WIDTH)} />
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
        {(abilityName || immune || disadvantaged || statuses.length > 0) && (
          <div className={`mt-1 flex w-full flex-wrap gap-0.5 ${justifyCls}`}>
            {abilityName && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex max-w-full items-center gap-0.5 rounded-xl bg-primary/10 px-1.5 py-[1px] font-pixel-xs text-primary press"
                  >
                    <span className="min-w-0 truncate text-left">{abilityName}</span>
                    <Info className="mt-[1px] h-2.5 w-2.5 shrink-0 opacity-70" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align={align === "right" ? "end" : "start"} className="w-56 text-xs">
                  <div className="font-bold text-primary">{abilityName}</div>
                  {abilityDescription && (
                    <p className="mt-1 leading-snug text-muted-foreground">{abilityDescription}</p>
                  )}
                </PopoverContent>
              </Popover>
            )}
            {immune && (
              <span className="rounded-full bg-hp-good/20 px-1.5 py-[1px] font-pixel-xs text-hp-good">
                IMMUNE
              </span>
            )}
            {disadvantaged && !immune && (
              <span className="rounded-full bg-destructive/20 px-1.5 py-[1px] font-pixel-xs text-destructive">
                WEAK
              </span>
            )}
            {statuses.map((s) => (
              <span
                key={s.kind}
                className={`rounded-full px-1.5 py-[1px] font-pixel-xs ${s.kind === "confused" ? "bg-poke-yellow/30 text-foreground" : "bg-purple-500/20 text-purple-700"}`}
              >
                {STATUS_META[s.kind].emoji}
              </span>
            ))}
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
                <span className="min-w-0 flex-1 truncate">{opt}</span>
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
                                className="flex items-center gap-3.5 rounded-[20px] bg-card px-4 py-3 text-left shadow-card transition press-lg disabled:opacity-40"
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
