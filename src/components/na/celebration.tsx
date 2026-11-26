import * as React from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
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
      <Sparkles aria-hidden className="shrink-0" style={{ color: k.spark, width: size * 0.54, height: size * 0.54 }} />
      <span
        className="whitespace-nowrap"
        style={{
          fontFamily: "var(--font-lilita)",
          fontSize: size,
          lineHeight: `${Math.round(size * 1.08)}px`,
          background: k.fill,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          WebkitTextStroke: `${Math.max(3, size / 8)}px #070a1a`,
          paintOrder: "stroke fill",
        }}
      >
        {children}
      </span>
      <Sparkles aria-hidden className="shrink-0" style={{ color: k.spark, width: size * 0.42, height: size * 0.42 }} />
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

/** Catch card: gold-rimmed, glowing; a new Pokédex entry gets its moment, the
 *  sprite breaking out past the card's left edge as in Figma 1.5 / 4.1. */
export function NaCatchCard({
  sprite,
  title,
  sub,
  isNew,
}: {
  sprite: React.ReactNode;
  title: string;
  sub: string;
  isNew?: boolean;
}) {
  return (
    <div className="na-glow-gold flex w-full items-center gap-3 rounded-[18px] border-[1.5px] border-reward-gold bg-night-deep/60 py-3 pl-0 pr-3">
      <div className="-ml-2 flex h-[84px] w-[96px] shrink-0 items-center justify-center overflow-visible">{sprite}</div>
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
