import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Info, Sparkles, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NaTypeChip } from "@/components/na/type-chip";
import { cn } from "@/lib/utils";
import type { PokeType } from "@/lib/pokemon-data";

/**
 * The battle screen from Figma 3.2 / 3.3 / 3.5, on its own coordinates: a
 * 390 x 504 pixel battlefield (dev/assets/out/bg-*-ext), the opponent at 2 pt
 * per pixel standing on its pad (feet at 286, 215), your partner from behind
 * at 3 pt (feet at 104, 420), the glass HP cards at (12, 56) and (178, 262),
 * the combo meter under the opponent's card. The question panel overlaps the
 * field from 436 down.
 */

export type FieldMode = "morning" | "evening" | "gym" | "elite" | "raid";

/** Each type's move, as named in the design (dev/assets/out/manifest.json "moves"). */
export const MOVE_BY_TYPE: Record<string, string> = {
  normal: "Tackle", fire: "Flamethrower", water: "Water Gun", electric: "Thunderbolt", grass: "Razor Leaf",
  ice: "Icy Wind", fighting: "Karate Chop", poison: "Sludge Bomb", ground: "Earth Power", flying: "Gust",
  psychic: "Psybeam", bug: "X-Scissor", rock: "Rock Slide", ghost: "Shadow Ball", dragon: "Dragon Breath",
  dark: "Crunch", steel: "Flash Cannon", fairy: "Dazzling Gleam",
};

// ------------------------------------------------------------------ sprites
type Trim = { x: number; y: number; w: number; h: number };
const TRIM_CACHE = new Map<string, Trim>();

/** The visible box of a sprite (its pixels with any alpha), so it stands on its pad like the design's trimmed art. */
function useTrim(src: string): Trim | null {
  const [trim, setTrim] = useState<Trim | null>(() => TRIM_CACHE.get(src) ?? null);
  useEffect(() => {
    if (TRIM_CACHE.has(src)) return setTrim(TRIM_CACHE.get(src)!);
    let live = true;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      let t: Trim = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
      try {
        const c = document.createElement("canvas");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
        for (let y = 0; y < c.height; y++)
          for (let x = 0; x < c.width; x++)
            if (d[(y * c.width + x) * 4 + 3] > 8) {
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
        if (x1 >= 0) t = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      } catch {
        /* a tainted canvas: fall back to the whole image */
      }
      TRIM_CACHE.set(src, t);
      if (live) setTrim(t);
    };
    img.src = src;
    return () => {
      live = false;
    };
  }, [src]);
  return trim;
}

function spriteUrl(id: number, shiny: boolean, back: boolean) {
  return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${back ? "back/" : ""}${shiny ? "shiny/" : ""}${id}.png`;
}

/** A Pokémon on the field: k pt per sprite pixel, centred on cx with its feet at feetY. */
export function FieldSprite({
  id,
  shiny = false,
  back = false,
  k,
  cx,
  feetY,
  className,
  children,
}: {
  id: number;
  shiny?: boolean;
  back?: boolean;
  k: number;
  cx: number;
  feetY: number;
  className?: string;
  children?: React.ReactNode;
}) {
  const [src, setSrc] = useState(() => spriteUrl(id, shiny, back));
  useEffect(() => setSrc(spriteUrl(id, shiny, back)), [id, shiny, back]);
  const t = useTrim(src);
  if (!t) return null;
  return (
    <div
      className={cn("absolute", className)}
      style={{ left: cx - (t.w * k) / 2, top: feetY - t.h * k, width: t.w * k, height: t.h * k }}
    >
      <img
        src={src}
        alt=""
        draggable={false}
        crossOrigin="anonymous"
        onError={() => setSrc(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${shiny ? "shiny/" : ""}${id}.png`)}
        className="pointer-events-none absolute max-w-none select-none [image-rendering:pixelated]"
        style={{ left: -t.x * k, top: -t.y * k, width: 96 * k, height: 96 * k }}
      />
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ the field
/**
 * The 390 x 504 stage, scaled to the width and to the room above the question
 * panel (so a short phone shrinks the field instead of hiding your partner).
 */
export function NaBattleField({
  mode = "morning",
  panelHeight,
  children,
}: {
  mode?: FieldMode;
  /** The question panel's height, measured by the screen. */
  panelHeight: number;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 390, h: 844 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth || 390, h: el.clientHeight || 844 }));
    ro.observe(el);
    setBox({ w: el.clientWidth || 390, h: el.clientHeight || 844 });
    return () => ro.disconnect();
  }, []);
  // Figma: the field (464 tall to its lower edge) meets the panel 28 above the panel's top.
  const s = Math.min(box.w / 390, Math.max(0.5, (box.h - panelHeight + 28) / 464));
  const bg = `/battle/field/bg-${mode}.png`;
  return (
    <div
      ref={ref}
      className="absolute inset-0 overflow-hidden bg-night-deep"
      style={{ backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "top center" }}
    >
      <div
        className="absolute top-0"
        style={{ left: "50%", width: 390, height: 504, transform: `translateX(-50%) scale(${s})`, transformOrigin: "top center" }}
      >
        <img src={bg} alt="" className="absolute inset-0 h-[504px] w-[390px] max-w-none [image-rendering:pixelated]" draggable={false} />
        {/* BG/Arena vignette */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgb(7 10 26 / 0.8) 0%, rgb(7 10 26 / 0) 30%, rgb(7 10 26 / 0) 62%, rgb(7 10 26 / 0.92) 100%)" }}
        />
        <img src={`/battle/field/pad-enemy-${mode}.png`} alt="" draggable={false} className="absolute max-w-none [image-rendering:pixelated]" style={{ left: 210, top: 190, width: 152, height: 58 }} />
        <img src={`/battle/field/pad-player-${mode}.png`} alt="" draggable={false} className="absolute max-w-none [image-rendering:pixelated]" style={{ left: 0, top: 388, width: 208, height: 72 }} />
        {children}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ HP card
/** Figma "HP card": glass, 200 wide; trainer, name + HP, types, bar with a lagging ghost, ability. */
export function NaHpCard({
  side,
  trainer,
  name,
  hp,
  maxHp,
  types,
  abilityName,
  abilityDescription,
  pulse,
  danger,
  testId,
  style,
}: {
  side: "enemy" | "player";
  trainer?: string | null;
  name: string;
  hp: number;
  maxHp: number;
  types: PokeType[];
  abilityName?: string | null;
  abilityDescription?: string | null;
  /** The ability just worked: green rim and its effect ("+2 HP"). */
  pulse?: string | null;
  /** Type disadvantage: a red rim (it was the old card's border too). */
  danger?: boolean;
  testId?: string;
  style?: React.CSSProperties;
}) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  // The ghost segment trails the live bar and drains over 400 ms.
  const [ghost, setGhost] = useState(pct);
  useEffect(() => {
    if (pct >= ghost) return setGhost(pct);
    const t = setTimeout(() => setGhost(pct), 400);
    return () => clearTimeout(t);
  }, [pct, ghost]);
  return (
    <div
      className={cn(
        "absolute flex w-[200px] flex-col gap-1.5 rounded-2xl border bg-night-deep/60 px-3 pb-3 pt-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_12px_32px_rgb(0_0_0/0.35)] backdrop-blur-xl",
        danger ? "border-danger" : "border-white/[0.16]",
      )}
      style={style}
    >
      {side === "enemy" && trainer && <span className="na-caption truncate text-text-secondary">{trainer}</span>}
      <div className="flex items-center justify-between gap-2">
        <span className="na-headline truncate text-foreground">{name}</span>
        <span className="na-number-m shrink-0 text-foreground" data-testid={testId && `${testId}-hp`}>
          {Math.round(hp)}
        </span>
      </div>
      <div className="flex gap-1.5">
        {types.map((t) => (
          <NaTypeChip key={t} type={t} />
        ))}
      </div>
      <div className="relative h-2.5 w-full overflow-hidden rounded-[5px] bg-night-base">
        <div className="absolute inset-y-0 left-0 rounded-[5px] bg-[rgb(244_246_255/0.55)] transition-[width] duration-300" style={{ width: `${ghost}%` }} />
        <div
          className={`absolute inset-y-0 left-0 rounded-[5px] transition-[width] duration-200 ${pct > 50 ? "na-hp-healthy" : pct > 20 ? "na-hp-warn" : "na-hp-low"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {abilityName && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex max-w-full items-center gap-[5px] self-start rounded-full border bg-white/[0.12] py-1 pl-1.5 pr-2 press",
                pulse != null ? "border-success na-glow-success" : "border-white/[0.22]",
              )}
            >
              <Sparkles className="h-4 w-4 shrink-0 text-reward-gold" />
              <span className="na-label truncate uppercase text-foreground">{abilityName}</span>
              {pulse ? <span className="na-label shrink-0 text-success">{pulse}</span> : <Info className="h-3.5 w-3.5 shrink-0 text-text-secondary" />}
            </button>
          </PopoverTrigger>
          <PopoverContent
            align={side === "player" ? "end" : "start"}
            className="w-56 rounded-2xl border border-reward-gold/60 bg-night-raised p-3 text-foreground"
          >
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-reward-gold" />
              <span className="na-headline">{abilityName}</span>
            </div>
            {abilityDescription && <p className="na-body mt-1 text-text-secondary">{abilityDescription}</p>}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ combo + damage
/** Figma "Combo meter": ×1.2 / 2 IN A ROW / five pips, under the opponent's card. */
export function NaCombo({ count, multiplier, style }: { count: number; multiplier: number; style?: React.CSSProperties }) {
  return (
    <div
      className="na-glow-gold absolute flex flex-col items-center gap-0.5 rounded-[18px] border-[1.5px] border-reward-gold/70 bg-night-deep/65 px-3.5 py-2"
      style={style}
    >
      <span className="na-display-m text-reward-gold">×{multiplier.toFixed(1)}</span>
      <span className="na-label uppercase text-text-secondary">{count} in a row</span>
      <span className="flex gap-1">
        {[0, 1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-[7px] w-[7px] rounded-full ${i < Math.min(5, count) ? "bg-reward-gold" : "bg-white/20"}`} />
        ))}
      </span>
    </div>
  );
}

/** Figma "Damage number": white numerals, a dark outline, and a callout pill when it is special. */
export function NaDamage({ value, caption, tone, style }: { value: string; caption?: string | null; tone?: "gold" | "brand" | "glass"; style?: React.CSSProperties }) {
  return (
    <div className="pointer-events-none absolute z-30 flex animate-float-up flex-col items-center gap-1" style={style}>
      <span
        className="na-display-l text-foreground"
        style={{ WebkitTextStroke: "4px #070a1a", paintOrder: "stroke fill", textShadow: "0 2px 0 rgb(0 0 0 / 0.45)" }}
      >
        {value}
      </span>
      {caption && (
        <span
          className={`na-label rounded-full px-2.5 py-1 uppercase ${
            tone === "brand" ? "na-fill-brand text-foreground" : tone === "glass" ? "bg-night-deep/80 text-foreground" : "na-fill-gold text-on-gold"
          }`}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ question panel
export type AnswerState = "default" | "correct" | "wrong" | "reveal" | "dimmed" | "struck";

const KEY_CLS: Record<AnswerState, string> = {
  default: "bg-white/10 text-text-secondary",
  struck: "bg-white/10 text-text-muted",
  dimmed: "bg-white/10 text-text-muted",
  correct: "bg-[rgb(5_38_26/0.14)] text-[#05261a]",
  wrong: "bg-danger text-night-base",
  reveal: "bg-success text-[#05261a]",
};
const TILE_CLS: Record<AnswerState, string> = {
  default: "bg-night-card border border-white/10 shadow-[0_4px_0_#04060f,inset_0_1px_0_rgb(255_255_255/0.1)]",
  struck: "bg-night-card border border-white/10 opacity-50 line-through",
  dimmed: "bg-night-card border border-white/10 opacity-50 shadow-[0_4px_0_#04060f]",
  correct: "na-answer-correct",
  wrong: "na-answer-wrong",
  reveal: "na-answer-reveal shadow-[0_4px_0_#04060f]",
};

/** Figma "Timer chip": a ring and the seconds. */
export function NaTimerChip({ seconds, max }: { seconds: number; max: number }) {
  const f = Math.max(0, Math.min(1, seconds / Math.max(1, max)));
  const C = 2 * Math.PI * 8.5;
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-white/10 py-1 pl-1.5 pr-3">
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <circle cx="11" cy="11" r="8.5" stroke="#FFFFFF" strokeOpacity="0.18" strokeWidth="3" />
        <circle
          cx="11"
          cy="11"
          r="8.5"
          stroke={f > 0.25 ? "#FFC83D" : "#FF5C8A"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${C * f} ${C}`}
          transform="rotate(-90 11 11)"
        />
      </svg>
      <span className="na-number-m text-foreground">{Math.ceil(seconds)}</span>
      <span className="na-label text-text-secondary">s</span>
    </span>
  );
}

/** Figma "Question panel": header (timer, category, bag, Q#), the question, four answer tiles. */
export function NaQuestionPanel({
  seconds,
  maxSeconds,
  category,
  progress,
  bag,
  question,
  options,
  states,
  disabled,
  onAnswer,
  banner,
  panelRef,
}: {
  seconds: number;
  maxSeconds: number;
  category: string;
  progress: string;
  bag?: React.ReactNode;
  question: string;
  options: string[];
  states: AnswerState[];
  disabled: (i: number) => boolean;
  onAnswer: (i: number) => void;
  banner?: React.ReactNode;
  panelRef?: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={panelRef}
      className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2 rounded-t-[28px] bg-night-raised px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[26px] shadow-[0_-10px_28px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.08)]"
    >
      <div className="flex items-center gap-2 pb-4">
        <NaTimerChip seconds={seconds} max={maxSeconds} />
        <span className="na-label rounded-full bg-white/10 px-3 py-1.5 uppercase text-text-secondary">{category}</span>
        <span className="flex-1" />
        {bag}
        <span className="na-number-m text-text-secondary">{progress}</span>
      </div>
      <p className="na-title text-foreground">{question}</p>
      <div className="flex flex-col gap-2">
        {options.map((opt, i) => {
          const st = states[i];
          return (
            <button
              key={i}
              type="button"
              data-testid={`option-${i}`}
              disabled={disabled(i)}
              onClick={() => onAnswer(i)}
              className={cn(
                "flex min-h-14 w-full items-center gap-3 rounded-2xl py-2 pl-2.5 pr-3.5 text-left transition-transform active:translate-y-[3px] disabled:cursor-default",
                TILE_CLS[st],
              )}
            >
              <span className={cn("na-answer-key", KEY_CLS[st])}>{String.fromCharCode(65 + i)}</span>
              <span
                className={cn(
                  "na-headline min-w-0 flex-1 break-words",
                  st === "correct" ? "text-[#05261a]" : st === "dimmed" || st === "struck" ? "text-text-muted" : "text-foreground",
                )}
              >
                {opt}
              </span>
              {st === "correct" && (
                <span className="na-label flex shrink-0 items-center gap-1 uppercase text-[#05261a]">
                  <Check className="h-[18px] w-[18px]" strokeWidth={2.5} /> Correct
                </span>
              )}
              {st === "wrong" && (
                <span className="na-label flex shrink-0 items-center gap-1 uppercase text-danger">
                  <X className="h-[18px] w-[18px]" strokeWidth={2.5} /> Not quite
                </span>
              )}
              {st === "reveal" && (
                <span className="na-label flex shrink-0 items-center gap-1 uppercase text-success">
                  <Check className="h-[18px] w-[18px]" strokeWidth={2.5} /> Answer
                </span>
              )}
            </button>
          );
        })}
      </div>
      {banner}
    </div>
  );
}

/** Figma "Feedback banner": the result and the right answer, at the foot of the panel; nothing to tap. */
export function NaFeedbackBanner({ ok, title, sub }: { ok: boolean; title: string; sub: string }) {
  return (
    <div
      role="status"
      className={cn(
        "absolute inset-x-0 bottom-0 z-30 flex items-center gap-3 rounded-t-[22px] border-t-2 px-[18px] pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3.5 shadow-[0_10px_28px_rgb(0_0_0/0.4)]",
        ok ? "border-success" : "border-danger",
      )}
      // night/raised with the result colour at 16% on top (Figma: two fills)
      style={{ background: `linear-gradient(${ok ? "rgb(46 229 157 / 0.16)" : "rgb(255 92 138 / 0.16)"}, ${ok ? "rgb(46 229 157 / 0.16)" : "rgb(255 92 138 / 0.16)"}), #141a3f` }}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ok ? "bg-success" : "bg-danger"}`}>
        {ok ? <Check className="h-[22px] w-[22px] text-night-base" strokeWidth={3} /> : <X className="h-[22px] w-[22px] text-night-base" strokeWidth={3} />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`na-display-s ${ok ? "text-success" : "text-danger"}`}>{title}</span>
        <span className="na-body-strong text-foreground">{sub}</span>
      </span>
    </div>
  );
}
