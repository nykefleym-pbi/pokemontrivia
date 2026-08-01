import { motion } from "framer-motion";

/**
 * Confetti for a win, drifting ash for a loss.
 *
 * `fixed`, not `absolute`, and that is the fix rather than a preference. The
 * result screens are `overflow-y-auto` scroll containers, so an absolutely
 * positioned child starting above the top edge is CLIPPED until it drifts into
 * view — and one that falls past the bottom lengthens the scrollable area,
 * putting a scrollbar on a screen that has nothing more to read. Taking the
 * layer out of the scroll box fixes both: it covers the viewport, clips itself,
 * and contributes no scroll height.
 *
 * Reduced motion is handled by `<MotionConfig reducedMotion>` at the root,
 * which stills the fall; the pieces then simply do not appear, since their
 * opacity starts at 0.
 */
const CONFETTI = [
  { cls: "h-3 w-2 rounded-[1px] bg-primary", l: 6 },
  { cls: "h-2 w-2 rounded-full bg-poke-yellow", l: 17 },
  { cls: "h-2.5 w-2.5 rounded-[1px] bg-poke-blue", l: 28 },
  { cls: "h-3 w-2 rounded-[1px] bg-hp-good", l: 39 },
  { cls: "h-2 w-2 rounded-full bg-poke-yellow", l: 50 },
  { cls: "h-2.5 w-1.5 rounded-[1px] bg-primary", l: 61 },
  { cls: "h-2.5 w-2.5 rounded-[1px] bg-destructive", l: 72 },
  { cls: "h-2 w-2 rounded-full bg-poke-blue", l: 83 },
  { cls: "h-3 w-2 rounded-[1px] bg-poke-yellow", l: 94 },
  { cls: "h-2 w-2 rounded-full bg-hp-good", l: 11 },
  { cls: "h-2.5 w-1.5 rounded-[1px] bg-hp-good", l: 45 },
  { cls: "h-2 w-2 rounded-[1px] bg-primary", l: 67 },
  { cls: "h-2 w-2 rounded-full bg-poke-yellow", l: 89 },
  { cls: "h-3 w-2 rounded-[1px] bg-poke-blue", l: 33 },
  { cls: "h-2 w-2 rounded-full bg-primary", l: 2 },
  { cls: "h-2.5 w-1.5 rounded-[1px] bg-poke-yellow", l: 23 },
  { cls: "h-2 w-2 rounded-full bg-destructive", l: 55 },
  { cls: "h-3 w-2 rounded-[1px] bg-hp-good", l: 78 },
  { cls: "h-2 w-2 rounded-[1px] bg-poke-blue", l: 97 },
  { cls: "h-2.5 w-2.5 rounded-full bg-poke-yellow", l: 38 },
  { cls: "h-2 w-1.5 rounded-[1px] bg-primary", l: 84 },
  { cls: "h-2 w-2 rounded-full bg-hp-good", l: 63 },
] as const;

/** Thin cold streaks and specks — rain and ash rather than paper. */
const GLOOM = [
  { cls: "h-6 w-px rounded-full bg-white/25", l: 8 },
  { cls: "h-1.5 w-1.5 rounded-full bg-poke-blue/40", l: 19 },
  { cls: "h-8 w-px rounded-full bg-white/15", l: 27 },
  { cls: "h-1 w-1 rounded-full bg-white/30", l: 36 },
  { cls: "h-5 w-px rounded-full bg-poke-blue/35", l: 47 },
  { cls: "h-1.5 w-1.5 rounded-full bg-white/20", l: 58 },
  { cls: "h-7 w-px rounded-full bg-white/20", l: 66 },
  { cls: "h-1 w-1 rounded-full bg-poke-blue/45", l: 74 },
  { cls: "h-6 w-px rounded-full bg-white/15", l: 85 },
  { cls: "h-1.5 w-1.5 rounded-full bg-white/25", l: 93 },
  { cls: "h-5 w-px rounded-full bg-white/20", l: 41 },
  { cls: "h-1 w-1 rounded-full bg-poke-blue/40", l: 15 },
  { cls: "h-7 w-px rounded-full bg-white/18", l: 53 },
  { cls: "h-1 w-1 rounded-full bg-white/25", l: 62 },
  { cls: "h-6 w-px rounded-full bg-poke-blue/30", l: 79 },
  { cls: "h-1.5 w-1.5 rounded-full bg-white/20", l: 31 },
  { cls: "h-5 w-px rounded-full bg-white/22", l: 97 },
  { cls: "h-1 w-1 rounded-full bg-poke-blue/35", l: 3 },
] as const;

export function FallingBits({ won }: { won: boolean }) {
  const bits = won ? CONFETTI : GLOOM;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {bits.map((d, i) => (
        <motion.span
          key={i}
          className={`absolute ${d.cls}`}
          style={{ left: `${d.l}%`, top: "-6%" }}
          initial={{ y: 0, opacity: 0 }}
          animate={{
            y: ["0vh", "112vh"],
            // Confetti tumbles and swings; ash falls almost straight, with the
            // barest drift. Same machinery, different physics.
            x: won ? [0, i % 2 === 0 ? 24 : -24, 0] : [0, i % 2 === 0 ? 7 : -7, 0],
            rotate: won ? [0, 360] : [0, 0],
            opacity: won ? [0, 1, 1, 0.85, 0] : [0, 0.9, 0.9, 0.5, 0],
          }}
          transition={{
            duration: won ? 3.4 + (i % 4) * 0.6 : 5.5 + (i % 5) * 0.9,
            repeat: Infinity,
            delay: (i % 7) * (won ? 0.45 : 0.8),
            ease: won ? "easeIn" : "linear",
          }}
        />
      ))}
    </div>
  );
}
