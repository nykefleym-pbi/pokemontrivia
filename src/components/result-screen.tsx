import { useEffect, type ReactNode } from "react";
import { motion, type TargetAndTransition } from "framer-motion";
import { Share2 } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { PokemonSprite, SpriteBurst } from "@/components/game-ui";
import { MissedReview } from "@/components/MissedReview";
import { Button } from "@/components/ui/button";
import { COIN_ICON, RESULT_ICON, REWARD_ICON, TP_ICON } from "@/lib/app-icons";
import { useGameStore } from "@/lib/store";
import {
  PLATFORM_SURFACE,
  RESULT_ART,
  SPRITE_FOOT_PAD,
  trimmedArtStyles,
  type ArtPadding,
} from "@/lib/result-art";

/** A square outcome wordmark shown at the height of its lettering. */
function OutcomeWordmark({ src, alt, pad }: { src: string; alt: string; pad: ArtPadding }) {
  const s = trimmedArtStyles(pad);
  return (
    <div className="relative w-full max-w-[300px]" style={s.wrapper}>
      <img
        src={encodeURI(src)}
        alt={alt}
        draggable={false}
        className="absolute left-0 top-0 w-full select-none"
        style={s.image}
      />
    </div>
  );
}

/**
 * The partner standing on its platform — the screen's focal point.
 *
 * Both layers are absolutely placed inside a box whose height is only the
 * platform's VISIBLE height, so the square art's transparent padding does not
 * push the rewards card down the screen. The sprite is anchored by where its
 * feet should land rather than by its own bottom edge; see SPRITE_FOOT_PAD.
 */
function PartnerStage({
  partnerId,
  partnerName,
  won,
  animate,
}: {
  partnerId: number;
  partnerName: string;
  won: boolean;
  animate: TargetAndTransition;
}) {
  const art = won ? RESULT_ART.platformWin : RESULT_ART.platformLose;
  const surface = won ? PLATFORM_SURFACE.win : PLATFORM_SURFACE.lose;
  const src = won ? RESULT_ICON.platformWin : RESULT_ICON.platformLose;

  // Everything is derived from one width so the two layers cannot drift apart.
  const platformW = PLATFORM_W;
  const spriteW = SPRITE_W;
  const visibleH = platformW * (1 - art.top - art.bottom);
  // Distance from the box's bottom edge up to the surface line.
  const surfaceFromBottom = platformW * (1 - art.bottom - surface);
  // The sprite's own bottom edge sits below the surface by its empty band, so
  // the visible feet land ON the line rather than above it.
  const spriteBottom = surfaceFromBottom - spriteW * SPRITE_FOOT_PAD;

  // Centre of the visible creature, measured from the box's bottom edge: the
  // sprite's own middle sits above its empty foot band, not at its box centre.
  const glowCentre = spriteBottom + spriteW * (0.5 + SPRITE_FOOT_PAD / 2);
  // Smaller and much fainter on a loss: the defeat sprite is drawn at 80%
  // opacity, so a bright burst behind it shines straight THROUGH the creature
  // and the rays read as painted on top of it.
  const glowSize = spriteW * (won ? 1.3 : 1.1);

  return (
    <div
      className="relative mx-auto"
      style={{ width: platformW, height: Math.max(visibleH, spriteW * 0.72 + visibleH * 0.5) }}
    >
      {/* Sunburst behind the partner — the same `SpriteBurst` the Shop puts
          behind a discounted item, so the two read as one effect rather than
          two attempts at "glow". Gold for a win, violet for a loss.

          It sits under the platform as well as the sprite, so the light spills
          onto the pad instead of stopping at its edge, and it is centred on the
          visible CREATURE rather than on its sprite box. */}
      <div
        aria-hidden
        // `-z-10` keeps the rays UNDER every word on the screen. The nearest
        // stacking context is the header block's `relative z-10`, and a
        // negative z there paints below that block's in-flow content — the
        // wordmark and the "X/Y correct" line — while the platform and sprite,
        // being positioned, still sit on top of it. Without this the burst
        // washed straight across the subtitle.
        className="pointer-events-none absolute left-1/2 -z-10 -translate-x-1/2"
        style={{ width: glowSize, height: glowSize, bottom: glowCentre - glowSize / 2 }}
      >
        <SpriteBurst tint={won ? "rgba(255,214,120,0.6)" : "rgba(150,125,205,0.13)"} />
      </div>
      <img
        src={encodeURI(src)}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute left-0 w-full select-none"
        style={{ bottom: -platformW * art.bottom }}
      />
      <motion.div
        animate={animate}
        transition={{ duration: won ? 1.4 : 2, repeat: Infinity }}
        className="absolute left-1/2 -translate-x-1/2"
        style={{ bottom: spriteBottom, width: spriteW, height: spriteW }}
      >
        <PokemonSprite
          id={partnerId}
          alt={partnerName}
          className={`sprite h-full w-full ${won ? "" : "opacity-80 grayscale"}`}
        />
      </motion.div>
    </div>
  );
}

/** The partner is the highlight of this screen, so both are large. */
const PLATFORM_W = 248;
const SPRITE_W = 176;

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

function FallingBits({ won }: { won: boolean }) {
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
  // Both outcomes are full-screen takeovers, so the bottom nav has no business
  // floating over them. Claimed HERE rather than left to whichever screen
  // rendered us — solo, Elite, Weekly and Mega all reach this component, and
  // only some of them hold the flag.
  //
  // The cleanup restores the PREVIOUS value instead of clearing it: on "Next
  // Battle" this unmounts while the battle screen stays mounted and still wants
  // the nav hidden, and a hard `false` would flash it back over the question.
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    const prev = useGameStore.getState().battleScreenActive;
    setBattleScreenActive(true);
    return () => setBattleScreenActive(prev);
  }, [setBattleScreenActive]);

  if (won) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex h-full w-full flex-col overflow-y-auto bg-victory px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.25rem)]"
      >
        <FallingBits won />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* The artwork carries "BATTLE WON" and "VICTORY!" itself, so it
              replaces the eyebrow AND the heading rather than sitting above
              them. The alt text is what a screen reader gets instead. */}
          <OutcomeWordmark
            src={RESULT_ICON.victory}
            alt="Battle won — Victory!"
            pad={RESULT_ART.victory}
          />
          <p className="mt-2 text-sm text-foreground/70">
            {opponentName} defeated · {correctCount}/{totalQuestions} correct
          </p>

          <div className="mt-1">
            <PartnerStage
              partnerId={partnerId}
              partnerName={partnerName}
              won
              animate={{ y: [0, -8, 0] }}
            />
          </div>
        </div>

        <div className="relative z-10 mx-auto mt-6 w-full max-w-sm rounded-2xl border-2 border-white bg-card p-4 shadow-card">
          {xpEarned > 0 && (
            <Row
              icon={REWARD_ICON.xp}
              label="XP earned"
              value={`+${xpEarned}`}
              valueClass="text-primary"
            />
          )}
          {coinsEarned > 0 && (
            <Row
              icon={COIN_ICON}
              label="Coins earned"
              value={`+${coinsEarned}`}
              valueClass="text-poke-yellow"
            />
          )}
          <Row
            icon={TP_ICON}
            label={`${partnerName} TP`}
            value={`+${tpEarned}`}
            valueClass="text-poke-blue"
          />
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

        <div className="relative z-10 mx-auto mt-auto w-full max-w-sm space-y-2 pt-8">
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
      <FallingBits won={false} />

      <div className="relative z-10 flex flex-col items-center text-center">
        {/* Carries "BATTLE LOST" and "SO CLOSE!" itself — see the victory
            header for why this replaces both lines rather than joining them. */}
        <OutcomeWordmark
          src={RESULT_ICON.defeat}
          alt="Battle lost — So close!"
          pad={RESULT_ART.defeat}
        />
        <p className="mt-2 text-sm text-white/60">
          {opponentName} wins · {correctCount}/{totalQuestions} correct
        </p>

        <div className="mt-1">
          <PartnerStage
            partnerId={partnerId}
            partnerName={partnerName}
            won={false}
            animate={{ rotate: [0, -3, 3, 0] }}
          />
        </div>
      </div>

      {/* `relative z-10` for the same reason as the blocks above: the falling
          layer is positioned, so without it the ash paints over this card. */}
      <div className="relative z-10">
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
      </div>

      <div className="relative z-10 mx-auto mt-auto w-full max-w-sm space-y-2 pt-8">
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
  icon,
  label,
  value,
  valueClass,
}: {
  /** Currency art for this reward. Speed bonus has none, so its gutter stays
   *  empty rather than borrowing another reward's glyph — the labels still
   *  line up down the column. */
  icon?: string;
  label: ReactNode;
  value: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5 text-sm">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center">
        {icon && <AppIcon src={icon} className="h-full w-full" />}
      </div>
      <div className="min-w-0 flex-1 font-semibold text-foreground">{label}</div>
      <div className={`font-display-md ${valueClass ?? "text-foreground"}`}>{value}</div>
    </div>
  );
}
