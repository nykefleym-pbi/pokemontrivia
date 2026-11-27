import { motion } from "framer-motion";
import { NaButton } from "@/components/na/button";
import { NaDayDots, NaWordmark } from "@/components/na/celebration";
import { NaRewardIcon } from "@/components/na/reward-icon";

/**
 * Figma 4.2 "Streak safe (first win of the day)": an ember catches, the flame
 * flares, the number rolls up to today's streak and an ember flies into
 * today's dot. Shown once a day, after the first win.
 * shortcut: no Streak Freeze pill or frozen days — the day streak has no freeze yet.
 */
export function StreakSafe({
  days,
  week,
  today,
  onContinue,
}: {
  days: number;
  /** Monday first: a battle won that day. */
  week: boolean[];
  /** 0 = Monday. */
  today: number;
  onContinue: () => void;
}) {
  return (
    <div className="na-bg-night fixed inset-0 z-[60] flex flex-col items-center gap-3.5 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+40px)]">
      <div className="relative h-[200px] w-[240px] shrink-0">
        <motion.div
          className="absolute left-[35px] top-[10px]"
          style={{ filter: "drop-shadow(0 0 24px rgb(255 138 31 / 0.6))" }}
          initial={{ scale: 0.25, opacity: 0.6 }}
          animate={{ scale: [0.25, 1.12, 1], opacity: 1 }}
          transition={{ duration: 0.55, times: [0, 0.7, 1] }}
        >
          <NaRewardIcon kind="Streak" size={170} />
        </motion.div>
      </div>
      {/* The number rolls from yesterday's count to today's. Display XL at 120 on a 52 line, as in Figma. */}
      <div className="relative h-[52px] w-full overflow-visible text-center" style={{ fontFamily: "var(--font-lilita)", fontSize: 120, lineHeight: "52px" }}>
        <motion.span
          aria-hidden
          className="absolute inset-0 grid place-items-center text-text-muted"
          initial={{ y: 0, opacity: 0.6 }}
          animate={{ y: -40, opacity: 0 }}
          transition={{ delay: 0.4, duration: 0.25 }}
        >
          {Math.max(0, days - 1)}
        </motion.span>
        <motion.span
          className="absolute inset-0 grid place-content-center place-items-center"
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.3 }}
        >
          <span className="grid" style={{ lineHeight: "120px" }}>
            <span aria-hidden className="[grid-area:1/1]" style={{ color: "#070a1a", WebkitTextStroke: "12px #070a1a" }}>
              {days}
            </span>
            <span
              className="[grid-area:1/1]"
              style={{ background: "linear-gradient(180deg,#ffc15a 0%,#ff6a1f 100%)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}
            >
              {days}
            </span>
          </span>
        </motion.span>
      </div>
      <span className="na-display-m text-center uppercase text-text-secondary">Day streak</span>
      <NaWordmark kind="streak">STREAK SAFE!</NaWordmark>
      <NaDayDots week={week} today={today} />
      <div className="min-h-2 flex-1" />
      <NaButton block onClick={onContinue}>
        Let&apos;s go!
      </NaButton>
    </div>
  );
}
