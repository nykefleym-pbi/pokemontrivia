import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { rankForLevel, trainerSpriteUrl } from "@/lib/game-data";
import { FittedTrainer } from "@/components/na/battle";

/**
 * Figma 15.1 / 15.1b: the face-off before a live battle. A comic split: your
 * red half below, theirs above (dark and empty while the search runs, blue
 * once someone is found), torn apart on a slant with the VS badge on the tear.
 * The same face-off is the 3-second beat before a Nearby Battle and a Training
 * Bot battle. Purely presentational: callers own queues, matches and timers.
 *
 * Laid out on the design's 390 x 844 grid, scaled to fit; the backdrop
 * (public/versus/vs-*.png, the plugin's scene/versus.js rendered without the
 * sample faces) covers the whole screen.
 */

export interface VersusTrainer {
  name: string;
  /** Trainer sprite id; resolved here so callers pass what the store holds. */
  spriteId: string;
  /** Overrides the sprite outright when set (the Training Bot's artwork). */
  avatarUrl?: string | null;
  level?: number | null;
  /** Elo, shown as "RATING 1,234" when the trainer has one. */
  rating?: number | null;
  /** A themed backdrop from before the 15.1 redesign; no longer drawn (the split is the backdrop). */
  backdrop?: string | null;
}

export interface VersusScreenProps {
  me: VersusTrainer;
  /** Null while matchmaking is still looking: the top half stays dark and empty. */
  opponent: VersusTrainer | null;
  /** "Finding an opponent…", "Battle starting…". */
  status: string;
  /** Optional second line: the elapsed timer, or the countdown. */
  detail?: string;
  /** Cancel / fallback buttons, at the foot. */
  actions?: ReactNode;
  /** No longer drawn (see VersusTrainer.backdrop); kept so callers need not change. */
  backdrop?: string | null;
  /** False when this face-off continues one already on screen, so nothing re-animates. */
  entrance?: boolean;
  /** Tapping anywhere skips ahead (the pre-battle beat). */
  onSkip?: () => void;
}

/** The plugin's vsBadge(): a jagged black burst with a red rim and a slanted white VS (our own drawing). */
const VS_BADGE = (() => {
  let s = 11;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280);
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < 26; i++) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 13 + (rnd() - 0.5) * 0.12;
    const rad = i % 2 ? 40 + rnd() * 8 : 56 + rnd() * 30;
    pts.push([Math.cos(ang) * rad, Math.sin(ang) * rad * 0.74]);
  }
  const poly = (grow: number) =>
    pts.map(([x, y]) => { const l = Math.hypot(x, y); return `${(85 + (x * (l + grow)) / l).toFixed(1)},${(65 + (y * (l + grow)) / l).toFixed(1)}`; }).join(" ");
  const V = [[-4, -8], [24, 0], [32, 38], [46, 0], [66, -6], [38, 62], [24, 62]];
  const S = [[118, -6], [110, 12], [82, 12], [80, 14], [80, 22], [82, 24], [100, 24], [110, 32], [110, 52], [98, 62], [56, 66], [66, 50], [90, 50], [92, 48], [92, 40], [90, 38], [72, 38], [62, 30], [62, 10], [74, 0]];
  const k = 0.82, ox = 85 - 0.5 * k * (122 + 62 * 0.34) + 4 * k, oy = 65 - 29 * k;
  const pt = (p: number[], dx: number, dy: number) => `${(ox + k * (p[0] + (62 - p[1]) * 0.34) + dx).toFixed(1)},${(oy + k * p[1] + dy).toFixed(1)}`;
  const pg = (L: number[][], dx: number, dy: number) => L.map((p) => pt(p, dx, dy)).join(" ");
  return { rim: poly(4), burst: poly(0), letters: [V, S].map((L) => ({ base: pg(L, 0, 0), face: pg(L, -1.5, -2) })) };
})();

function VsBadge() {
  return (
    <svg width={170} height={130} viewBox="0 0 170 130" className="absolute" style={{ left: 110, top: 357 }} aria-label="VS">
      <polygon points={VS_BADGE.rim} fill="#FF2D55" />
      <polygon points={VS_BADGE.burst} fill="#09060F" />
      {VS_BADGE.letters.map((l, i) => (
        <polygon key={`o${i}`} points={l.base} fill="#09060F" stroke="#09060F" strokeWidth={10} strokeLinejoin="miter" />
      ))}
      {VS_BADGE.letters.map((l, i) => (
        <polygon key={`b${i}`} points={l.base} fill="#B9BCCC" />
      ))}
      {VS_BADGE.letters.map((l, i) => (
        <polygon key={`f${i}`} points={l.face} fill="#FFFFFF" />
      ))}
    </svg>
  );
}

/** A comic face-off platform: a black disc with its half's colour as the rim. */
function Platform({ color, w, fx, fy }: { color: string; w: number; fx: number; fy: number }) {
  const h = Math.round(w * 0.27);
  return (
    <svg width={w} height={h + 10} viewBox={`0 0 ${w} ${h + 10}`} className="absolute" style={{ left: Math.round(fx - w / 2), top: Math.round(fy - h / 2) }} aria-hidden>
      <ellipse cx={w / 2} cy={h / 2 + 10} rx={w / 2} ry={h / 2} fill="#09060F" />
      <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} fill={color} />
      <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 5} ry={h / 2 - 4} fill="#09060F" />
    </svg>
  );
}

/** Name, then title, then rating: three stacked lines, largest first. No friend code: this is a stranger. */
function Label({ t, align, style }: { t: VersusTrainer; align: "left" | "right"; style: React.CSSProperties }) {
  const rank = t.level != null ? rankForLevel(t.level) : null;
  return (
    <div className={`absolute flex flex-col gap-0.5 ${align === "left" ? "items-start text-left" : "items-end text-right"}`} style={style}>
      <div className="na-display-s max-w-full truncate text-foreground">{t.name}</div>
      {rank && <div className="na-label uppercase text-text-secondary">{rank}</div>}
      {t.rating != null && <div className="na-label text-reward-gold">RATING {t.rating.toLocaleString("en-US")}</div>}
    </div>
  );
}

/** A trainer on its platform: the repo art fitted to the figure Figma draws (about 0.77 of its box). */
function Trainer({ t, box, fx, fy, color, entrance, from }: { t: VersusTrainer; box: number; fx: number; fy: number; color: string; entrance: boolean; from: number }) {
  // An unknown sprite id resolves to "": draw nothing rather than something broken.
  const src = t.avatarUrl ?? trainerSpriteUrl(t.spriteId) ?? "";
  return (
    <>
      <Platform color={color} w={Math.round(box * 0.8)} fx={fx} fy={fy} />
      {src !== "" && (
        <motion.div className="absolute inset-0" initial={entrance ? { opacity: 0, y: from } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: entrance ? 0.35 : 0 }}>
          <FittedTrainer art={src} alt={t.name} height={Math.round(box * 0.77)} cx={fx} feetY={fy + 3} className="sprite" />
        </motion.div>
      )}
    </>
  );
}

export function VersusScreen({ me, opponent, status, detail, actions, entrance = true, onSkip }: VersusScreenProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => setK(Math.min(el.clientWidth / 390, el.clientHeight / 844) || 1);
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    fit();
    return () => ro.disconnect();
  }, []);
  const found = opponent !== null;
  return (
    <div
      ref={ref}
      className="fixed inset-0 z-[150] overflow-hidden bg-[#05071a]"
      onClick={onSkip}
      role={onSkip ? "button" : undefined}
      tabIndex={onSkip ? 0 : undefined}
      onKeyDown={onSkip ? (e) => (e.key === "Enter" || e.key === " ") && onSkip() : undefined}
    >
      <img src={found ? "/versus/vs-found.png" : "/versus/vs-finding.png"} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      <div className="absolute left-1/2 top-1/2 h-[844px] w-[390px]" style={{ transform: `translate(-50%, -50%) scale(${k})` }}>
        {opponent && (
          <>
            <Label t={opponent} align="left" style={{ left: 24, top: 101, width: 342 }} />
            <Trainer t={opponent} box={170} fx={281} fy={318} color="#5D86FF" entrance={entrance} from={-16} />
          </>
        )}
        <Trainer t={me} box={200} fx={116} fy={706} color="#FF2D55" entrance={entrance} from={16} />
        <Label t={me} align="right" style={{ left: 24, top: 640, width: 342 }} />
        <VsBadge />
        {/* Searching: the status fills their empty half; found: it moves to the foot, under your trainer. */}
        <div className="absolute inset-x-0 flex flex-col items-center gap-0.5 text-center" style={found ? { bottom: 62 } : { top: 230, transform: "translateY(-50%)" }}>
          <div className="na-title text-foreground">{status}</div>
          {detail && <div className="na-caption text-text-secondary">{detail}</div>}
        </div>
        {actions && (
          <div className="absolute inset-x-6 flex flex-col items-center gap-2" style={{ bottom: 50 }} onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
