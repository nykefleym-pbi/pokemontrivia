import * as React from "react";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { cn } from "@/lib/utils";

/**
 * Night Arena celebration pieces, from the Figma components of the same names:
 * Wordmark (VICTORY!, LEVEL UP!, GOTCHA!, SO CLOSE!, STREAK SAFE!), the thunder
 * hero of 4.1, Reward tile, Catch card and the glass row.
 */

const WM_KINDS = {
  victory: { fill: "linear-gradient(180deg,#ffe38a 0%,#ffc83d 50%,#f0a800 100%)", glow: "#ffc83d", spark: "#ffc83d" },
  levelup: { fill: "linear-gradient(180deg,#8db0ff 0%,#4c7dff 100%)", glow: "#5b8cff", spark: "#5b8cff" },
  caught: { fill: "linear-gradient(180deg,#7bf7c4 0%,#2ee59d 50%,#14bf7b 100%)", glow: "#2ee59d", spark: "#2ee59d" },
  soclose: { fill: "linear-gradient(180deg,#ff7a85 0%,#ff3b4e 45%,#e3233b 100%)", glow: "#ff3b4e", spark: "#ff7a85" },
  streak: { fill: "linear-gradient(180deg,#ffc15a 0%,#ff6a1f 100%)", glow: "#ff8a1f", spark: "#ff8a1f" },
} as const;
export type WordmarkKind = keyof typeof WM_KINDS;

/** Lilita One, gradient fill, a 6px night outline, a drop and a glow; sparkles either side. */
export function NaWordmark({
  kind,
  children,
  size = 48,
  className,
}: {
  kind: WordmarkKind;
  children: React.ReactNode;
  size?: number;
  className?: string;
}) {
  const k = WM_KINDS[kind];
  return (
    <div
      className={cn("flex items-center justify-center gap-2.5 py-2", className)}
      style={{ filter: `drop-shadow(0 4px 0 rgb(0 0 0 / 0.55)) drop-shadow(0 0 26px ${k.glow}80)` }}
    >
      <span style={{ color: k.spark }}><NaIcon name="sparkle" size={size * 0.54} /></span>
      {/* Figma strokes OUTSIDE the letters. A text-stroke is centred and, under
          background-clip:text, paints over the fill and thins every letter, so
          the outline is a copy behind (twice the width) and the fill sits on top. */}
      <span
        className="grid whitespace-nowrap"
        style={{ fontFamily: "var(--font-lilita)", fontSize: size, lineHeight: `${Math.round(size * 1.08)}px` }}
      >
        <span aria-hidden className="[grid-area:1/1]" style={{ color: "#070a1a", WebkitTextStroke: `${Math.max(6, size / 4)}px #070a1a` }}>
          {children}
        </span>
        <span
          className="[grid-area:1/1]"
          style={{ background: k.fill, WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
        >
          {children}
        </span>
      </span>
      <span style={{ color: k.spark }}><NaIcon name="sparkle" size={size * 0.42} /></span>
    </div>
  );
}

/**
 * Figma 4.4 level badge (plugin levelBadge): one side per level — a circle for
 * Levels 1 and 2, then triangle, square, pentagon… White rim, orange inner rim,
 * gold face set 2.2 low, a lighter raised centre and a gloss up-left.
 */
export function NaLevelBadge({ level, size }: { level: number; size: number }) {
  const shape = (r: number, props: React.SVGProps<SVGElement>) => {
    if (level < 3) return <circle cx={50} cy={50} r={r} {...(props as React.SVGProps<SVGCircleElement>)} />;
    const a0 = -Math.PI / 2 + (level === 4 ? Math.PI / 4 : 0);
    const pts = Array.from({ length: level }, (_, i) => {
      const a = a0 + (i * 2 * Math.PI) / level;
      return `${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
    return <polygon points={pts} {...(props as React.SVGProps<SVGPolygonElement>)} />;
  };
  const tri = level === 3;
  const id = React.useId().replace(/:/g, "");
  const fsz = Math.round(size * (tri ? 0.26 : 0.38));
  const sw = Math.max(1, size / 60);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-label={`Level ${level}`}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        aria-hidden
        className="absolute inset-0 overflow-visible"
        style={{ filter: `drop-shadow(0 0 ${Math.round(size * 0.07)}px rgb(255 255 255 / 0.55)) drop-shadow(0 ${Math.round(size * 0.04)}px ${Math.round(size * 0.03)}px rgb(10 15 38 / 0.35))` }}
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFD84D" />
            <stop offset="1" stopColor="#F5A000" />
          </linearGradient>
          <linearGradient id={`c${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#FFEC9A" />
            <stop offset="1" stopColor="#FFC21F" />
          </linearGradient>
        </defs>
        {shape(44, { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidth: 5, strokeLinejoin: "round" })}
        {shape(40, { fill: "#E07F00", stroke: "#E07F00", strokeWidth: 2, strokeLinejoin: "round" })}
        <g transform="translate(0 2.2)">{shape(37, { fill: `url(#g${id})`, strokeLinejoin: "round" })}</g>
        <g transform="translate(0 2.2)">
          {shape(tri ? 23 : 28, { fill: `url(#c${id})`, stroke: "#FFE27A", strokeWidth: 1.5, strokeLinejoin: "round" })}
        </g>
        <ellipse
          cx={tri ? 46 : 38}
          cy={tri ? 46 : 30}
          rx={tri ? 7 : 12}
          ry={tri ? 3 : 5}
          transform={`rotate(-28 ${tri ? 46 : 38} ${tri ? 46 : 30})`}
          fill="#FFFFFF"
          fillOpacity={0.7}
        />
      </svg>
      <span
        className="absolute inset-x-0 grid place-items-center"
        style={{
          top: (2.2 * size) / 100,
          bottom: 0,
          fontFamily: "var(--font-lilita)",
          fontSize: fsz,
          lineHeight: `${Math.round(fsz * 1.1)}px`,
          filter: `drop-shadow(0 ${Math.max(1, Math.round(size / 50))}px ${Math.max(1, Math.round(size / 80))}px rgb(153 77 0 / 0.45))`,
        }}
      >
        <span aria-hidden className="[grid-area:1/1]" style={{ color: "#d98000", WebkitTextStroke: `${sw * 2}px #d98000` }}>
          {level}
        </span>
        <span className="[grid-area:1/1] text-white">{level}</span>
      </span>
    </div>
  );
}

/** Confetti falling from the top of a w x h area (plugin confetti()): kit colours, fewer and fainter lower down. */
export function NaConfetti({ w, h, n = 40, delay = 0 }: { w: number; h: number; n?: number; delay?: number }) {
  const pieces = React.useMemo(() => {
    const cols = ["#FFC83D", "#FF3B4E", "#5B8CFF", "#2EE59D", "#F4F6FF"];
    let r = 11;
    const rnd = () => {
      r = (r * 9301 + 49297) % 233280;
      return r / 233280;
    };
    return Array.from({ length: n }, (_, i) => {
      const y = Math.pow(rnd(), 1.6) * h;
      const pw = 5 + rnd() * 4;
      const ph = 9 + rnd() * 5;
      const x = rnd() * (w - 12);
      const rot = rnd() * 180 - 90;
      return { x, y, pw, ph, rot, c: cols[i % cols.length], o: 1 - (y / h) * 0.6 };
    });
  }, [w, h, n]);
  return (
    <div aria-hidden className="pointer-events-none absolute left-0 top-0 overflow-hidden" style={{ width: w, height: h }}>
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-[1.5px]"
          style={{ left: p.x, top: p.y, width: p.pw, height: p.ph, background: p.c }}
          initial={{ y: -p.y - 30, opacity: 0, rotate: p.rot - 120 }}
          animate={{ y: 0, opacity: p.o, rotate: p.rot }}
          transition={{ delay: delay + (i % 12) * 0.03, duration: 0.9 + (p.y / h) * 0.7, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

const WEEK_DAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Figma "Day dot" × 7, Monday first: Done (flame fill), Today (flame ring), Future. Today's dot pops when done. */
export function NaDayDots({ week, today, popDelay = 0.8 }: { week: boolean[]; today: number; popDelay?: number }) {
  return (
    <div className="flex gap-1.5" aria-label={`${week.filter(Boolean).length} days this week`}>
      {WEEK_DAYS.map((d, i) => {
        const done = week[i];
        const isToday = i === today;
        return (
          <div key={i} className="flex w-10 flex-col items-center gap-1">
            <motion.span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full",
                done ? "na-fill-flame shadow-[0_0_18px_rgb(255_138_31/0.55)]" : isToday ? "border-[2.5px] border-[#ff8a1f] bg-night-deep" : "bg-white/10",
              )}
              initial={isToday && done ? { scale: 0.4 } : false}
              animate={isToday && done ? { scale: [0.4, 1.2, 1] } : undefined}
              transition={{ delay: popDelay, duration: 0.35 }}
            >
              {(done || isToday) && (
                <NaIcon name={done ? "flame-filled" : "flame"} line size={18} className={done ? "text-white" : "text-[#ff8a1f]"} />
              )}
            </motion.span>
            <span className={cn("na-label", isToday ? "text-foreground" : "text-text-secondary")}>{d}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Figma "Daily mark": one Poké Ball per Daily Quest question, in the reward-icon style. */
export type DailyMarkState = "right" | "wrong" | "timeout" | "now" | "empty";
export function NaDailyMarks({ marks }: { marks: DailyMarkState[] }) {
  return (
    <div className="flex gap-1" aria-label={`${marks.filter((m) => m === "right").length} right so far`}>
      {marks.map((m, i) => (
        <span key={i} className="relative h-8 w-8 shrink-0">
          {m === "empty" || m === "now" ? (
            <span
              className={cn(
                "absolute left-[2.5px] top-[2.5px] h-[27px] w-[27px] rounded-full border-2",
                m === "now" ? "border-reward-gold bg-reward-gold/[0.12]" : "border-dashed border-white/30",
              )}
            />
          ) : (
            <svg viewBox="0 0 32 32" className="h-8 w-8" style={{ opacity: m === "timeout" ? 0.55 : 1 }} aria-hidden>
              <circle cx="16" cy="16" r="13.5" fill={m === "right" ? "#F4F6FF" : "#8E98CF"} />
              <path d="M2.5 16a13.5 13.5 0 0 1 27 0z" fill={m === "right" ? "#FF3B4E" : "#4B5590"} />
              <path d="M2.5 16h27" stroke="#0B1026" strokeWidth="3" />
              <circle cx="16" cy="16" r="13.5" stroke="#0B1026" strokeWidth="3" fill="none" />
              <circle cx="16" cy="16" r="4.5" fill={m === "right" ? "#FFFFFF" : "#8E98CF"} stroke="#0B1026" strokeWidth="3" />
              <path d="M8 9.5a9 9 0 0 1 5-3.5" stroke="#FFFFFF" strokeOpacity=".75" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            </svg>
          )}
          {(m === "wrong" || m === "timeout") && (
            <span className={cn("absolute left-[18px] top-[18px] flex h-4 w-4 items-center justify-center rounded-full", m === "wrong" ? "bg-danger" : "bg-night-card")}>
              {m === "wrong" ? <NaIcon name="x" size={10} className="text-foreground" /> : <NaIcon name="clock" size={10} className="text-foreground" />}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

/** The gold bolt from the Figma "Thunder" hero (64 x 96 viewBox). */
export function NaBolt({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 64 96" className={className} style={style} aria-hidden>
      <path d="M38 3 6 54h22l-8 39 38-56H35l12-34z" fill="#FFC83D" stroke="#3A2400" strokeWidth="5" strokeLinejoin="round" />
      <path d="M33 12 15 47h11" stroke="#FFF3B0" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Star({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5L2.6 9.3l6.5-.9z" fill="#FFC83D" stroke="#3A2400" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * 4.1 / 1.5 hero: the thunder strike, VICTORY! slamming in, then three stars.
 * No sunburst (owner rule). Reduced motion is handled app-wide by the root's
 * MotionConfig, which drops these transforms for players who ask for less.
 */
export function VictoryHero({ title = "VICTORY!" }: { title?: string }) {
  const sparks: Array<[string, number, number, number]> = [
    ["left-[40px] top-[22px]", 26, -24, 0.15],
    ["right-[40px] top-[14px]", 30, 20, 0.2],
    ["left-[18px] top-[92px]", 20, -40, 0.25],
    ["right-[22px] top-[96px]", 22, 34, 0.3],
  ];
  return (
    <div className="relative h-[150px] w-full max-w-[358px] shrink-0">
      <motion.div
        className="absolute left-1/2 top-[-14px] -translate-x-1/2"
        initial={{ opacity: 0, y: -60, scaleY: 1.4 }}
        animate={{ opacity: 1, y: 0, scaleY: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        style={{ filter: "drop-shadow(0 0 10px rgb(255 209 64 / 0.85))" }}
      >
        <NaBolt style={{ width: 72, height: 108 }} />
      </motion.div>
      {sparks.map(([pos, h, rot, d], i) => (
        <motion.div
          key={i}
          className={`absolute ${pos}`}
          initial={{ opacity: 0, scale: 0.4 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: d, duration: 0.25 }}
        >
          <NaBolt style={{ width: h * 0.66, height: h, transform: `rotate(${rot}deg)` }} />
        </motion.div>
      ))}
      <motion.div
        className="absolute inset-x-0 top-[44px]"
        initial={{ scale: 1.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, type: "spring", stiffness: 420, damping: 16 }}
      >
        <NaWordmark kind="victory">{title}</NaWordmark>
      </motion.div>
      <div className="absolute inset-x-0 top-[116px] flex items-end justify-center gap-1.5" aria-label="Three stars">
        {[26, 34, 26].map((s, i) => (
          <motion.span
            key={i}
            initial={{ scale: 0, rotate: -40 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.55 + i * 0.12, type: "spring", stiffness: 500, damping: 14 }}
          >
            <Star size={s} />
          </motion.span>
        ))}
      </div>
    </div>
  );
}

const TILE = {
  xp: { bg: "#9B7BFF", fg: "#9B7BFF" }, // reward/xp
  gold: { bg: "#FFC83D", fg: "#FFC83D" },
  success: { bg: "#2EE59D", fg: "#2EE59D" },
  info: { bg: "#5B8CFF", fg: "#5B8CFF" },
} as const;

/** Reward tile (Duolingo lesson-complete): a coloured header and a night body. */
export function NaRewardTile({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: keyof typeof TILE;
}) {
  const t = TILE[tone];
  return (
    <div className="flex w-[108px] flex-col items-center rounded-2xl p-0.5" style={{ background: t.bg }}>
      <div className="na-label uppercase py-[5px] text-[#0b1026]">{label}</div>
      <div className="flex w-full flex-col items-center gap-1 rounded-[14px] bg-night-raised px-2 py-2.5">
        <span className="flex h-[30px] items-center justify-center" style={{ color: t.fg }}>
          {icon}
        </span>
        <span className="na-number-l" style={{ color: t.fg }}>
          {value}
        </span>
      </div>
    </div>
  );
}

/** Catch card: gold-rimmed, glowing; the sprite in a 72 box (4.1). The very
 *  first catch gets its moment: a 200 sprite breaking out of that box (1.5).
 *  `sprite` is a render prop given the sprite's size in px. */
export function NaCatchCard({
  sprite,
  title,
  sub,
  isNew,
  big,
}: {
  sprite: (size: number) => React.ReactNode;
  title: string;
  sub: string;
  isNew?: boolean;
  big?: boolean;
}) {
  return (
    <div className="na-glow-gold flex w-full items-center gap-3 rounded-[18px] border-[1.5px] border-reward-gold bg-night-deep/60 p-3">
      <div className={cn("flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-visible rounded-2xl", !big && "bg-white/[0.08]")}>
        {sprite(big ? 200 : 68)}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1">
        {isNew && <span className="na-fill-gold na-label uppercase rounded-md px-[5px] py-px text-on-gold">New</span>}
        <span className="na-headline text-foreground">{title}</span>
        <span className="na-caption text-text-secondary">{sub}</span>
      </div>
    </div>
  );
}

/** Glass row: lead art, a title and a line, and a trailing action. */
export function NaGlassRow({
  lead,
  title,
  sub,
  trailing,
  tone,
  onClick,
}: {
  lead: React.ReactNode;
  title: string;
  sub?: string;
  trailing?: React.ReactNode;
  tone?: "gold" | "danger";
  onClick?: () => void;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-[18px] bg-white/[0.08] p-3 text-left",
        tone === "gold" ? "border-[1.5px] border-reward-gold" : tone === "danger" ? "border-[1.5px] border-danger" : "border border-white/[0.12]",
      )}
    >
      <span className="flex shrink-0 items-center justify-center">{lead}</span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="na-headline text-foreground">{title}</span>
        {sub && <span className="na-caption text-text-secondary">{sub}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </Tag>
  );
}
