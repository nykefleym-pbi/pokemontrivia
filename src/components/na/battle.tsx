import * as React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Info, Sparkles, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NaTypeChip } from "@/components/na/type-chip";
import { NaGlossIcon } from "@/components/na/gloss-icon";
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
export type Trim = { x: number; y: number; w: number; h: number };
type Trimmed = { trim: Trim; img: HTMLImageElement };
const TRIM_CACHE = new Map<string, Trimmed>();

/** The visible box of a sprite (its pixels with any alpha), so it stands on its pad like the design's trimmed art. */
function useTrim(src: string): Trimmed | null {
  const [trim, setTrim] = useState<Trimmed | null>(() => TRIM_CACHE.get(src) ?? null);
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
      TRIM_CACHE.set(src, { trim: t, img });
      if (live) setTrim({ trim: t, img });
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
  centerY,
  className,
  style,
  spriteRef,
  onReady,
  children,
}: {
  id: number;
  shiny?: boolean;
  back?: boolean;
  k: number;
  cx: number;
  feetY: number;
  /** Centre the visible sprite on this y instead of standing it on feetY (a hovering boss). */
  centerY?: number;
  className?: string;
  style?: React.CSSProperties;
  /** The box the effects move (lunge, knock-back, white flash). */
  spriteRef?: (el: HTMLDivElement | null) => void;
  /** The loaded image and its visible box, for the effects' body mask. */
  onReady?: (img: HTMLImageElement, trim: Trim) => void;
  children?: React.ReactNode;
}) {
  const [src, setSrc] = useState(() => spriteUrl(id, shiny, back));
  useEffect(() => setSrc(spriteUrl(id, shiny, back)), [id, shiny, back]);
  const tr = useTrim(src);
  useEffect(() => {
    if (tr) onReady?.(tr.img, tr.trim);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tr]);
  if (!tr) return null;
  const t = tr.trim;
  return (
    <div
      ref={spriteRef}
      className={cn("absolute", className)}
      style={{ left: cx - (t.w * k) / 2, top: centerY != null ? centerY - (t.h * k) / 2 : feetY - t.h * k, width: t.w * k, height: t.h * k, ...style }}
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
  padsIn = true,
  stageRef,
  night = false,
  children,
}: {
  /** 3.1 / 3.7: plain night under the field instead of the extended art (no question panel covers it). */
  night?: boolean;
  mode?: FieldMode;
  /** The question panel's height, measured by the screen. */
  panelHeight: number;
  /** 3.1: the platforms rise in after the trainer intro. */
  padsIn?: boolean;
  /** The 390 x 504 stage, which the effects shake. */
  stageRef?: React.Ref<HTMLDivElement>;
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
      style={night ? undefined : { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "top center" }}
    >
      <div
        ref={stageRef}
        className="absolute top-0"
        style={{ left: "50%", width: 390, height: 504, transform: `translateX(-50%) scale(${s})`, transformOrigin: "top center" }}
      >
        <img src={bg} alt="" className="absolute inset-0 h-[504px] w-[390px] max-w-none [image-rendering:pixelated]" draggable={false} />
        {/* BG/Arena vignette */}
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(180deg, rgb(7 10 26 / 0.8) 0%, rgb(7 10 26 / 0) 30%, rgb(7 10 26 / 0) 62%, rgb(7 10 26 / 0.92) 100%)" }}
        />
        {[
          { src: `/battle/field/pad-enemy-${mode}.png`, box: { left: 210, top: 190, width: 152, height: 58 } },
          { src: `/battle/field/pad-player-${mode}.png`, box: { left: 0, top: 388, width: 208, height: 72 } },
        ].map((p) => (
          <img
            key={p.src}
            src={p.src}
            alt=""
            draggable={false}
            className="absolute max-w-none transition-[translate,opacity] duration-[450ms] ease-out [image-rendering:pixelated]"
            style={{ ...p.box, translate: padsIn ? "0 0" : "0 36px", opacity: padsIn ? 1 : 0 }}
          />
        ))}
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
              className={cn(answerTileClass(st), "transition-transform active:translate-y-[3px] disabled:cursor-default")}
            >
              <NaAnswerFace index={i} text={opt} state={st} />
            </button>
          );
        })}
      </div>
      {banner}
    </div>
  );
}

/** Figma "Answer" tile box, for a button (above) or a read-only row (4.3 review). */
export const answerTileClass = (st: AnswerState) =>
  cn("flex min-h-14 w-full items-center gap-3 rounded-2xl py-2 pl-2.5 pr-3.5 text-left", TILE_CLS[st]);

/** The inside of a Figma "Answer": key letter, text and the state's label. */
export function NaAnswerFace({ index, text, state: st }: { index: number; text: string; state: AnswerState }) {
  return (
    <>
      <span className={cn("na-answer-key", KEY_CLS[st])}>{String.fromCharCode(65 + index)}</span>
      <span
        className={cn(
          "na-headline min-w-0 flex-1 break-words",
          st === "correct" ? "text-[#05261a]" : st === "dimmed" || st === "struck" ? "text-text-muted" : "text-foreground",
        )}
      >
        {text}
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
    </>
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

// ------------------------------------------------------------------ effects
/** One of the two effect layers (behind and in front of the sprites): 195 x 232 art px over the 390 x 464 stage. */
export const FxCanvas = React.forwardRef<HTMLCanvasElement>(function FxCanvas(_, ref) {
  return (
    <canvas
      ref={ref}
      width={195}
      height={232}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-[464px] w-[390px] [image-rendering:pixelated]"
    />
  );
});


// ------------------------------------------------------------------ 3.1 trainer intro
/** The opponent alone in the middle of the field (inside the stage, 3 pt per pixel), on its shadow. */
export function NaIntroTrainer({ art, leaving }: { art: string; leaving: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-0 transition-[translate,opacity] duration-500 ease-in"
      style={{ translate: leaving ? "130px 0" : "0 0", opacity: leaving ? 0 : 1 }}
    >
      <div className="absolute rounded-[50%] bg-night-deep/35" style={{ left: 140, top: 404, width: 110, height: 18 }} />
      {art && (
        <img
          src={art}
          alt=""
          draggable={false}
          className="absolute max-w-none [image-rendering:pixelated]"
          style={{ left: 75, top: 186, width: 240, height: 240 }}
        />
      )}
    </div>
  );
}

/** "PICNICKER JANINE wants to battle!", the round pill and TAP TO SKIP (screen coordinates). */
export function NaIntroText({ name, round, rounds, leaving }: { name: string; round: number; rounds: number; leaving: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 transition-opacity duration-300" style={{ opacity: leaving ? 0 : 1 }}>
      <div className="absolute left-4 top-[488px] flex w-[358px] flex-col items-center gap-2.5">
        <span className="na-display-l self-stretch text-center uppercase text-foreground">{name}</span>
        <span className="na-title self-stretch text-center text-text-secondary">wants to battle!</span>
        <span className="flex items-center gap-2.5 rounded-full bg-white/[0.12] px-3.5 py-1.5">
          <span className="na-label uppercase text-reward-gold">
            Round {round} of {rounds}
          </span>
          <NaGlossIcon kind="pokeball" size={16} />
          <span className="na-label uppercase text-text-secondary">1 Pokémon</span>
        </span>
      </div>
      <span className="na-label absolute inset-x-0 bottom-[64px] text-center uppercase text-text-muted">Tap to skip</span>
    </div>
  );
}

// ------------------------------------------------------------------ 3.7 the catch
/** GOTCHA!, the new Pokédex entry and the region's progress, under the field (Figma 3.7 "Content"). */
export function NaCatchPanel({
  name,
  isNew,
  region,
  caught,
  total,
  onContinue,
  wordmark,
}: {
  name: string;
  isNew: boolean;
  region: string;
  caught: number;
  total: number;
  onContinue: () => void;
  wordmark: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onContinue}
      data-testid="catch-continue"
      className="absolute inset-x-0 top-[470px] bottom-[34px] flex flex-col items-center gap-2.5 px-5 pb-6 pt-2 text-center"
    >
      {wordmark}
      <span className="na-display-m self-stretch text-foreground">You caught {name}!</span>
      <span className="flex items-center gap-2">
        {isNew && <span className="na-fill-gold na-label rounded-md px-[7px] py-0.5 uppercase text-on-gold">New</span>}
        <span className="na-body-strong text-foreground">Added to your Pokédex</span>
      </span>
      <span className="flex w-[260px] flex-col items-center gap-1.5">
        <span className="na-caption self-stretch text-text-secondary">
          {region}: {caught} of {total} caught
        </span>
        <span className="relative h-2 self-stretch overflow-hidden rounded bg-night-deep">
          <span className="na-fill-gold absolute inset-y-0 left-0 rounded" style={{ width: `max(4px, ${(caught / Math.max(1, total)) * 100}%)` }} />
        </span>
      </span>
      <span className="flex-1" />
      <span className="na-label self-stretch uppercase text-text-muted">Tap to continue</span>
    </button>
  );
}
// ------------------------------------------------------------------ 1.3 / 1.4 Professor Oak's hints
/** Figma "Coach bubble": Professor Oak as on the overworld, and one line in a white bubble with a pointer. */
export function NaCoachBubble({
  text,
  pointer,
  width,
  style,
}: {
  text: string;
  pointer: "down" | "up";
  /** The text box width (Figma: 290 for the answers hint, 236 by default). */
  width?: number;
  style?: React.CSSProperties;
}) {
  const tip = (
    <span className="flex h-2.5 pl-7" aria-hidden>
      <svg width="18" height="10" viewBox="0 0 18 10" className={pointer === "up" ? "rotate-180" : ""}>
        <path d="M0 0h18L9 10z" fill="#f4f6ff" />
      </svg>
    </span>
  );
  return (
    <div role="status" className="pointer-events-none absolute z-30 flex items-end gap-2" style={style}>
      <img src="/battle/oak-overworld.png" alt="Professor Oak" draggable={false} className="h-[62px] w-[39px] max-w-none shrink-0 [image-rendering:pixelated]" />
      <span className="flex flex-col items-start">
        {pointer === "up" && tip}
        <span
          className="na-body-strong rounded-2xl bg-[#f4f6ff] px-3.5 py-2.5 text-[#0b1026]"
          style={{ width: (width ?? 236) + 28, boxShadow: "0 10px 28px rgb(0 0 0 / 0.4), inset 0 1px 0 rgb(255 255 255 / 0.08)" }}
        >
          {text}
        </span>
        {pointer === "down" && tip}
      </span>
    </div>
  );
}