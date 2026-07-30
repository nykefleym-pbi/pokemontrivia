import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { Share2 } from "lucide-react";
import { PokemonSprite } from "@/components/game-ui";
import { MissedReview } from "@/components/MissedReview";
import { Button } from "@/components/ui/button";

export function ResultScreen({
  won,
  opponentName,
  correctCount,
  totalQuestions,
  xpEarned,
  tpEarned,
  coinsEarned,
  speedBonus,
  partnerName,
  partnerId,
  streakKept,
  currentLevel,
  levelProgressPct,
  newTrophies: _newTrophies,
  missed,
  onRebattle,
  onBackHome,
  onRematch,
  hideRematch,
  canShare,
  onShare,
}: {
  won: boolean;
  opponentName: string;
  correctCount: number;
  totalQuestions: number;
  xpEarned: number;
  tpEarned: number;
  coinsEarned: number;
  speedBonus: number;
  partnerName: string;
  partnerId: number;
  streak: number;
  streakKept: boolean;
  currentLevel: number;
  xpIntoLevel: number;
  xpForThisLevel: number;
  levelProgressPct: number;
  newTrophies: Array<{ name: string }>;
  missed: Array<{ question: string; correctAnswer: string; explanation: string }>;
  onRebattle: () => void;
  onBackHome: () => void;
  onRematch?: () => void;
  /** Drop the rematch button entirely, for modes that are one attempt and have
   *  nothing to start again (Weekly League, Daily Quest). Both screens already
   *  carry a "Back home", so removing it strands nobody. */
  hideRematch?: boolean;
  canShare?: boolean;
  onShare?: () => void;
}) {
  if (won) {
    const confetti = [
      { c: "bg-primary", s: "h-3 w-3 rounded-sm", l: "8%" },
      { c: "bg-poke-yellow", s: "h-2 w-2 rounded-full", l: "20%" },
      { c: "bg-poke-blue", s: "h-2.5 w-2.5 rounded-full", l: "32%" },
      { c: "bg-hp-good", s: "h-3 w-3 rounded-sm", l: "44%" },
      { c: "bg-poke-yellow", s: "h-2 w-2 rounded-full", l: "56%" },
      { c: "bg-primary", s: "h-2 w-2 rounded-full", l: "68%" },
      { c: "bg-destructive", s: "h-2.5 w-2.5 rounded-sm", l: "80%" },
      { c: "bg-poke-blue", s: "h-2 w-2 rounded-full", l: "92%" },
      { c: "bg-poke-yellow", s: "h-3 w-3 rounded-sm", l: "14%" },
      { c: "bg-hp-good", s: "h-2 w-2 rounded-full", l: "74%" },
    ];
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-victory px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        {confetti.map((d, i) => (
          <motion.span
            key={i}
            className={`pointer-events-none absolute ${d.s} ${d.c}`}
            style={{ left: d.l, top: "-5%" }}
            initial={{ y: 0, opacity: 0 }}
            animate={{
              y: ["-5%", "115%"],
              x: [0, i % 2 === 0 ? 20 : -20, 0],
              rotate: [0, 360],
              opacity: [0, 1, 1, 0.8, 0],
            }}
            transition={{
              duration: 3.5 + (i % 4) * 0.6,
              repeat: Infinity,
              delay: i * 0.4,
              ease: "easeIn",
            }}
          />
        ))}

        <div className="flex flex-col items-center text-center">
          <div className="font-pixel-xs uppercase tracking-[0.25em] text-primary">
            ★ Battle Won ★
          </div>
          <h1 className="mt-2 font-display-xl text-foreground">Victory!</h1>
          <p className="mt-1 text-sm text-foreground/70">
            {opponentName} defeated · {correctCount}/{totalQuestions} correct
          </p>

          <div className="relative mt-6 flex h-36 w-44 items-end justify-center">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-2 left-1/2 h-10 w-32 -translate-x-1/2 rounded-[50%]"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 35%, oklch(0.88 0.16 145) 0%, oklch(0.72 0.18 145) 55%, oklch(0.55 0.16 150) 100%)",
                boxShadow:
                  "0 8px 14px -6px oklch(0.3 0.1 150 / 0.35), inset 0 1px 0 oklch(1 0 0 / 0.35)",
              }}
            />
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="relative z-10"
            >
              <PokemonSprite id={partnerId} alt={partnerName} className="sprite h-28 w-28" />
            </motion.div>
          </div>
        </div>

        <div className="mx-auto mt-6 w-full max-w-sm rounded-2xl bg-card p-4 shadow-card">
          {xpEarned > 0 && (
            <Row label="XP earned" value={`+${xpEarned}`} valueClass="text-primary" />
          )}
          {coinsEarned > 0 && (
            <Row label="Coins earned" value={`+${coinsEarned}`} valueClass="text-poke-yellow" />
          )}
          <Row label={`${partnerName} TP`} value={`+${tpEarned}`} valueClass="text-poke-blue" />
          {speedBonus > 0 && (
            <Row
              label={
                <>
                  Speed bonus{" "}
                  <span className="font-pixel text-[9px] text-hp-good">UNDER 5S AVG</span>
                </>
              }
              value={`+${speedBonus}`}
              valueClass="text-hp-good"
            />
          )}
          <div className="my-3 border-t border-dashed border-foreground/15" />
          <div className="flex items-center gap-2">
            <span className="font-pixel-xs text-foreground/70">
              Lv {currentLevel} · {Math.round(levelProgressPct)}%
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-foreground/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-poke-yellow via-primary to-destructive transition-[width] duration-700"
                style={{ width: `${levelProgressPct}%` }}
              />
            </div>
            <span className="font-pixel-xs text-foreground/70">Lv {currentLevel + 1}</span>
          </div>
        </div>

        <div className="mx-auto mt-auto w-full max-w-sm space-y-2 pt-8">
          {/* Next Battle starts the next one on the spot when the caller gives us
              a way to (owner request 2026-07-26 — keep the player battling
              instead of dropping them on the hub). Modes with nothing to start
              again — the daily and the weekly league are one attempt each — set
              hideRematch, because falling back to onRebattle() left a button
              labelled "Next Battle" that quietly just left the battle. */}
          {!hideRematch && (
            <Button
              size="lg"
              onClick={() => (onRematch ? onRematch() : onRebattle())}
              className="h-14 w-full rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
            >
              Next Battle
            </Button>
          )}
          {canShare && onShare && (
            <Button
              size="lg"
              variant="outline"
              onClick={onShare}
              className="h-14 w-full rounded-full border-2 border-foreground/15 bg-card font-bold text-foreground hover:bg-card/80"
            >
              <span className="flex items-center gap-2">
                <Share2 className="h-5 w-5" aria-hidden />
                Share result
              </span>
            </Button>
          )}
          {/* The way out, now that the primary button no longer is one. Mirrors
              the defeat screen's own "Back home". */}
          <Button
            size="lg"
            variant="outline"
            onClick={onBackHome}
            className="h-14 w-full rounded-full border-2 border-foreground/15 bg-card font-bold text-foreground hover:bg-card/80"
          >
            Back home
          </Button>
        </div>
      </motion.div>
    );
  }

  // DEFEAT
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full w-full flex-col overflow-y-auto bg-defeat px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
    >
      <div className="flex flex-col items-center text-center">
        <div className="font-pixel-xs uppercase tracking-[0.25em] text-poke-blue/80">
          Battle Lost
        </div>
        <h1 className="mt-2 font-display-xl text-white">So close!</h1>
        <p className="mt-1 text-sm text-white/60">
          {opponentName} wins · {correctCount}/{totalQuestions} correct
        </p>

        <div className="relative mt-6 flex h-32 w-40 items-end justify-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-2 left-1/2 h-8 w-28 -translate-x-1/2 rounded-[50%] bg-black/40 blur-[2px]"
          />
          <motion.div
            animate={{ rotate: [0, -3, 3, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="relative z-10"
          >
            <PokemonSprite
              id={partnerId}
              alt={partnerName}
              className="sprite h-24 w-24 opacity-80 grayscale"
            />
          </motion.div>
        </div>
      </div>

      <MissedReview
        missed={missed}
        footer={
          <p className="text-xs text-white/70">
            Consolation: <span className="font-bold text-poke-yellow">+{xpEarned} XP</span>
            {" · "}
            {streakKept ? "streak kept" : "streak reset"}
          </p>
        }
      />

      <div className="mx-auto mt-auto w-full max-w-sm space-y-2 pt-8">
        {!hideRematch && (
          <Button
            size="lg"
            onClick={() => (onRematch ? onRematch() : onRebattle())}
            className="h-14 w-full rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
          >
            Rematch
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          onClick={onBackHome}
          className="h-14 w-full rounded-full border-2 border-white/20 bg-white/[0.04] font-bold text-white hover:bg-white/10"
        >
          Back home
        </Button>
      </div>
    </motion.div>
  );
}

function Row({
  label,
  value,
  valueClass,
}: {
  label: ReactNode;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <div className="font-semibold text-foreground">{label}</div>
      <div className={`font-display-md ${valueClass ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}
