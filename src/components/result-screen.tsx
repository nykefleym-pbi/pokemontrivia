import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, type TargetAndTransition } from "framer-motion";
import { Share2 } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { PokemonSprite, SpriteBurst } from "@/components/game-ui";
import { FallingBits } from "@/components/falling-bits";
import { MISSED_REVIEW_MAX, MissedReview } from "@/components/MissedReview";
import { Button } from "@/components/ui/button";
import { COIN_ICON, RESULT_ICON, REWARD_ICON, TP_ICON } from "@/lib/app-icons";
import { useSpriteFootPad } from "@/lib/sprite-foot";
import { useGameStore } from "@/lib/store";
import { PLATFORM_SURFACE, RESULT_ART, trimmedArtStyles, type ArtPadding } from "@/lib/result-art";

/**
 * A square outcome wordmark shown at the height of its lettering — with the
 * text it replaced kept as a fallback.
 *
 * The fallback is not belt-and-braces. This art carries the ONLY title on the
 * screen, so an image that does not arrive leaves a blank band where the
 * heading should be and the result reads as half-rendered (owner report
 * 2026-08-01, on the Elite Four win). Whatever the cause on the day — a cold
 * cache, a service worker mid-update, a flaky connection — a screen with no
 * title is not an acceptable outcome, so failure falls back to the eyebrow and
 * heading this replaced.
 */
function OutcomeWordmark({
  src,
  alt,
  pad,
  eyebrow,
  heading,
  eyebrowClass,
  headingClass,
}: {
  src: string;
  alt: string;
  pad: ArtPadding;
  eyebrow: string;
  heading: string;
  eyebrowClass: string;
  headingClass: string;
}) {
  const [failed, setFailed] = useState(false);
  const s = trimmedArtStyles(pad);
  if (failed) {
    return (
      <>
        <div className={`font-pixel-xs uppercase tracking-[0.25em] ${eyebrowClass}`}>{eyebrow}</div>
        <h1 className={`mt-2 font-display-xl ${headingClass}`}>{heading}</h1>
      </>
    );
  }
  return (
    <div className="relative w-full max-w-[300px]" style={s.wrapper}>
      <img
        src={encodeURI(src)}
        alt={alt}
        draggable={false}
        onError={() => setFailed(true)}
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
  const [platformFailed, setPlatformFailed] = useState(false);
  // Measured off this species' own sprite rather than assumed — see
  // lib/sprite-foot.ts for why a shared constant could never land them all.
  const footPad = useSpriteFootPad(partnerId);

  // Everything is derived from one width so the two layers cannot drift apart.
  const platformW = PLATFORM_W;
  const spriteW = SPRITE_W;
  const visibleH = platformW * (1 - art.top - art.bottom);
  // Distance from the box's bottom edge up to the surface line.
  const surfaceFromBottom = platformW * (1 - art.bottom - surface);
  // The sprite's own bottom edge sits below the surface by its empty band, so
  // the visible feet land ON the line rather than above it.
  const spriteBottom = surfaceFromBottom - spriteW * footPad;

  // Centre of the visible creature, measured from the box's bottom edge: the
  // sprite's own middle sits above its empty foot band, not at its box centre.
  const glowCentre = spriteBottom + spriteW * (0.5 + footPad / 2);
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
      {platformFailed ? (
        // Same reasoning as the wordmark's fallback: without SOMETHING under
        // the partner it hangs in mid-air, which is the exact complaint this
        // artwork was added to fix. This is the drawn disc the art replaced.
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-[50%]"
          style={{
            width: platformW * 0.62,
            height: platformW * 0.18,
            bottom: surfaceFromBottom - platformW * 0.09,
            background: won
              ? "radial-gradient(ellipse at 50% 35%, oklch(0.88 0.16 145) 0%, oklch(0.72 0.18 145) 55%, oklch(0.55 0.16 150) 100%)"
              : "oklch(0 0 0 / 0.4)",
            filter: won ? undefined : "blur(2px)",
          }}
        />
      ) : (
        <img
          src={encodeURI(src)}
          alt=""
          aria-hidden
          draggable={false}
          onError={() => setPlatformFailed(true)}
          className="pointer-events-none absolute left-0 w-full select-none"
          style={{ bottom: -platformW * art.bottom }}
        />
      )}
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
 * Trims the missed-answers list until the buttons under it fit on screen.
 *
 * Owner ruling 2026-08-01: the buttons win. A long review pushed "Back home"
 * against the bottom edge, and a way off the screen matters more than the fifth
 * thing you got wrong — the rows dropped are still counted in "and N more".
 *
 * Shrink-only, one row per pass, floored at zero, so it converges in at most
 * MISSED_REVIEW_MAX renders and can never oscillate between two counts that
 * both "fit". The reset is keyed on the things that change how much room there
 * is — a new set of answers, and a resize or rotation — rather than running
 * continuously, so it settles and then stays settled.
 *
 * `useLayoutEffect` so the trimming happens before paint; on the server there
 * is no layout to measure and it degrades to the full list.
 */
const useIsoLayoutEffect = typeof document === "undefined" ? useEffect : useLayoutEffect;

function useFitMissedCount(missedCount: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [maxItems, setMaxItems] = useState(MISSED_REVIEW_MAX);

  const reset = useCallback(() => setMaxItems(MISSED_REVIEW_MAX), []);
  useIsoLayoutEffect(reset, [missedCount, reset]);
  useEffect(() => {
    window.addEventListener("resize", reset);
    window.addEventListener("orientationchange", reset);
    return () => {
      window.removeEventListener("resize", reset);
      window.removeEventListener("orientationchange", reset);
    };
  }, [reset]);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || maxItems <= 0) return;
    // +1 absorbs sub-pixel rounding, which would otherwise read as a permanent
    // overflow and strip the list to nothing on a screen it already fits.
    if (el.scrollHeight > el.clientHeight + 1) setMaxItems((n) => n - 1);
  });

  return { ref, maxItems };
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
  // ONE claim, ONE release. `setBattleScreenActive` is a claim counter, not a
  // setter (see lib/store.ts), so the argument says "claim" or "release" and
  // never carries a value: releasing with the previous value — which is what
  // this did — meant a cleanup running while an outer surface still held the
  // nav CLAIMED IT A SECOND TIME, and the count never came back to zero. The
  // nav then stayed gone for the rest of the session, which is the bug the
  // counter was supposed to make impossible.
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive]);

  // Hooks cannot live inside the defeat branch below, so this runs for both
  // outcomes; on a win nothing is attached to the ref and it does nothing.
  const fit = useFitMissedCount(missed.length);

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
            eyebrow="★ Battle Won ★"
            heading="Victory!"
            eyebrowClass="text-primary"
            headingClass="text-foreground"
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

        {/* `pb-*` on the block, not only on the scroll container. A flex column
          that scrolls does NOT reliably honour its own padding-bottom past the
          overflow point, so with a long missed-answers list the last button
          ran off the bottom of the screen (owner report 2026-08-01). Spacing
          the last child from the inside always survives. */}
        <div className="relative z-10 mx-auto mt-auto w-full max-w-sm space-y-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-8">
          {/* Next Battle starts the next one on the spot when the caller gives us
              a way to (owner request 2026-07-26 — keep the player battling
              instead of dropping them on the hub). Modes with nothing to start
              again — the daily and the weekly league are one attempt each — set
              hideRematch, because falling back to onRebattle() left a button
              labelled "Next Battle" that quietly just left the battle. */}
          {!hideRematch && (
            <Button
              size="action"
              onClick={() => (onRematch ? onRematch() : onRebattle())}
              className="w-full bg-primary text-primary-foreground shadow-pop"
            >
              Next Battle
            </Button>
          )}
          {canShare && onShare && (
            <Button
              size="action"
              variant="outline"
              onClick={onShare}
              className="w-full border-2 border-foreground/15 bg-card text-foreground hover:bg-card/80"
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
            size="action"
            variant="outline"
            onClick={onBackHome}
            className="w-full border-2 border-foreground/15 bg-card text-foreground hover:bg-card/80"
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
      ref={fit.ref}
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
          eyebrow="Battle Lost"
          heading="So close!"
          eyebrowClass="text-poke-blue/80"
          headingClass="text-white"
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
          maxItems={fit.maxItems}
          footer={
            <p className="text-xs text-white/70">
              Consolation: <span className="font-bold text-poke-yellow">+{xpEarned} XP</span>
              {" · "}
              {streakKept ? "streak kept" : "streak reset"}
            </p>
          }
        />
      </div>

      {/* `pb-*` on the block, not only on the scroll container. A flex column
          that scrolls does NOT reliably honour its own padding-bottom past the
          overflow point, so with a long missed-answers list the last button
          ran off the bottom of the screen (owner report 2026-08-01). Spacing
          the last child from the inside always survives. */}
      <div className="relative z-10 mx-auto mt-auto w-full max-w-sm space-y-2 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-8">
        {!hideRematch && (
          <Button
            size="action"
            onClick={() => (onRematch ? onRematch() : onRebattle())}
            className="w-full bg-primary text-primary-foreground shadow-pop"
          >
            Rematch
          </Button>
        )}
        <Button
          size="action"
          variant="outline"
          onClick={onBackHome}
          className="w-full border-2 border-white/20 bg-white/[0.04] text-white hover:bg-white/10"
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
