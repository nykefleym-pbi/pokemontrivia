import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { motion, type TargetAndTransition } from "framer-motion";
import { RotateCcw, Share2 } from "lucide-react";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { toast } from "sonner";
import { NaButton } from "@/components/na/button";
import { NaSheet } from "@/components/na/sheet";
import { NaCatchCard, NaGlassRow, NaRewardTile, VictoryHero } from "@/components/na/celebration";
import { SaveProgressSheet } from "@/components/save-progress-sheet";
import { enablePushNotifications, getPushSubscriptionState, pushSupported } from "@/lib/push";
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
  //
  // These are CSS expressions rather than numbers now, because the widths are
  // viewport-capped (see PLATFORM_W) and there is no number to multiply until
  // the browser resolves the `min()`. Same arithmetic, handed to `calc`.
  const platformW = PLATFORM_W;
  const spriteW = SPRITE_W;
  const visibleH = scale(platformW, 1 - art.top - art.bottom);
  // Distance from the box's bottom edge up to the surface line.
  const surfaceFromBottom = scale(platformW, 1 - art.bottom - surface);
  // The sprite's own bottom edge sits below the surface by its empty band, so
  // the visible feet land ON the line rather than above it.
  const spriteBottom = `calc(${surfaceFromBottom} - ${scale(spriteW, footPad)})`;

  // Centre of the visible creature, measured from the box's bottom edge: the
  // sprite's own middle sits above its empty foot band, not at its box centre.
  const glowCentre = `calc(${spriteBottom} + ${scale(spriteW, 0.5 + footPad / 2)})`;
  // Smaller and much fainter on a loss: the defeat sprite is drawn at 80%
  // opacity, so a bright burst behind it shines straight THROUGH the creature
  // and the rays read as painted on top of it.
  const glowSize = scale(spriteW, won ? 1.3 : 1.1);

  return (
    <div
      className="relative mx-auto"
      style={{
        width: platformW,
        height: `max(${visibleH}, calc(${scale(spriteW, 0.72)} + ${scale(visibleH, 0.5)}))`,
      }}
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
        style={{
          width: glowSize,
          height: glowSize,
          bottom: `calc(${glowCentre} - ${scale(glowSize, 0.5)})`,
        }}
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
            width: scale(platformW, 0.62),
            height: scale(platformW, 0.18),
            bottom: `calc(${surfaceFromBottom} - ${scale(platformW, 0.09)})`,
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
          style={{ bottom: scale(platformW, -art.bottom) }}
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

/** `len * k` as a CSS expression — the widths below are `min()`, not numbers. */
const scale = (len: string, k: number) => `calc(${len} * ${k})`;

/**
 * The partner is the highlight of this screen, so both are large — but capped
 * against the VIEWPORT as well as in pixels.
 *
 * Everything else here is type and buttons, which do not shrink: on a short
 * phone the stage is the only thing with slack in it. `min()` leaves a 844pt
 * screen exactly as it was (32vh = 270 > 248, so the pixel value wins) and
 * takes ~35px off an iPhone SE, where it is the difference between a small
 * scroll and a long one.
 *
 * `useSpriteFootPad` and PLATFORM_SURFACE are fractions of this width, so both
 * layers follow it down on their own.
 */
const PLATFORM_W = "min(248px, 32vh)";
const SPRITE_W = "min(176px, 22.7vh)";

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
  badgeEarned,
  missed,
  durationMs,
  caught,
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
  /**
   * The Gym Badge this win earned, if any.
   *
   * Weekly League only: it is the whole point of the mode — one attempt a week,
   * and a badge you keep — and it was the one reward the screen never mentioned.
   * The badge was already granted and already visible in Profile; the player
   * just had no moment where they were told.
   */
  badgeEarned?: { name: string; iconUrl: string };
  missed: Array<{ question: string; correctAnswer: string; explanation: string }>;
  /** First question to the end, for the Time tile. */
  durationMs?: number;
  /** The Pokémon this win caught (every win does), for the catch card. */
  caught?: { id: number; name: string; isNew: boolean; shiny: boolean };
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

  // 1.5/1.6: a guest is asked to save a trainer name after every win until they
  // do (owner ruling 2026-11-26); the sheet rises once the rewards have landed.
  const isGuest = useGameStore((s) => s.isGuest);
  // "Your first Pokédex entry!" (1.5): this win's catch is the only one so far.
  const firstCatch = useGameStore((s) => Object.values(s.pokedex).filter((e) => e?.caught).length <= 1);
  const [saveOpen, setSaveOpen] = useState(false);
  useEffect(() => {
    if (!won || !isGuest) return;
    const t = window.setTimeout(() => setSaveOpen(true), 1400);
    return () => window.clearTimeout(t);
  }, [won, isGuest]);
  const [mistakesOpen, setMistakesOpen] = useState(false);

  // 4.1 Tomorrow row: only when reminders can be turned on here and are not yet.
  const [canRemind, setCanRemind] = useState(false);
  useEffect(() => {
    if (!won || !pushSupported()) return;
    let live = true;
    void getPushSubscriptionState().then((s) => live && setCanRemind(!s.subscribed));
    return () => {
      live = false;
    };
  }, [won]);
  async function remindMe() {
    const res = await enablePushNotifications();
    if (res.ok) {
      setCanRemind(false);
      toast.success("You're set — we'll tell you when something's ready.");
    }
  }

  if (won) {
    const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
    const secs = Math.max(0, Math.round((durationMs ?? 0) / 1000));
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
    return (
      // Figma 4.1 Victory (and 1.5 First win): thunder, then the rewards, then
      // what is next. One screen, no level bar: goals live on Home and Profile.
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-4 pt-12 screen-top screen-bottom"
      >
        <VictoryHero />
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="na-body-strong text-text-secondary">
            You beat {opponentName} · {correctCount} of {totalQuestions} right
          </span>
          {missed.length > 0 && (
            <button
              type="button"
              onClick={() => setMistakesOpen(true)}
              className="na-label flex items-center gap-1 rounded-full bg-white/[0.12] px-2.5 py-1 text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5 text-reward-gold" aria-hidden />
              {missed.length} {missed.length === 1 ? "mistake" : "mistakes"}
            </button>
          )}
        </div>

        <div className="flex gap-[9px]">
          <NaRewardTile
            tone="xp"
            label="Total XP"
            value={`+${xpEarned}`}
            icon={<NaRewardIcon kind="XP" size={30} />}
          />
          <NaRewardTile tone="success" label="Accuracy" value={`${accuracy}%`} icon={<NaRewardIcon kind="Accuracy" size={30} />} />
          <NaRewardTile tone="info" label="Time" value={time} icon={<NaRewardIcon kind="Time" size={30} />} />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
          {coinsEarned > 0 && (
            <span className="na-body-strong flex items-center gap-1.5 text-foreground">
              <NaRewardIcon kind="Coin" size={24} /> +{coinsEarned} coins
            </span>
          )}
          {tpEarned > 0 && (
            <span className="na-body-strong flex items-center gap-1.5 text-foreground">
              <NaRewardIcon kind="TP" size={24} /> +{tpEarned} Training Points
            </span>
          )}
          {speedBonus > 0 && (
            <span className="na-body-strong text-success">+{speedBonus} speed bonus</span>
          )}
        </div>

        {badgeEarned && <BadgeRow badge={badgeEarned} />}

        {caught && (
          <NaCatchCard
            sprite={<PokemonSprite id={caught.id} shiny={caught.shiny} alt={caught.name} className="sprite h-[96px] w-[96px] scale-[1.35]" />}
            title={`You caught ${caught.name}!`}
            isNew={caught.isNew}
            sub={caught.isNew ? (firstCatch ? "Your first Pokédex entry!" : "New Pokédex entry!") : `${caught.name} is in your Pokédex.`}
          />
        )}

        {isGuest ? (
          <NaGlassRow
            tone="gold"
            lead={<NaRewardIcon kind="Trophy" size={40} />}
            title="Save your progress"
            sub="Choose a trainer name to keep your Pokémon and progress safe!"
            onClick={() => setSaveOpen(true)}
            trailing={
              <span className="na-btn na-btn-m na-btn-gold pointer-events-none" aria-hidden>
                Save
              </span>
            }
          />
        ) : (
          canRemind && (
            <NaGlassRow
              lead={<NaRewardIcon kind="Gift" size={36} />}
              title="Tomorrow"
              sub="Your next Daily Quest and daily gift are waiting!"
              trailing={
                <NaButton kind="secondary" size="M" onClick={() => void remindMe()}>
                  Remind me
                </NaButton>
              }
            />
          )
        )}

        <div className="min-h-2 flex-1" />
        {/* Next battle starts the next one on the spot when the caller gives us
            a way to (owner request 2026-07-26). One-attempt modes (Daily, the
            Weekly League) set hideRematch rather than a button that only left. */}
        {!hideRematch && (
          <NaButton block onClick={() => (onRematch ? onRematch() : onRebattle())}>
            Next battle
          </NaButton>
        )}
        <div className="flex w-full gap-2.5 pb-1">
          {canShare && onShare && (
            <NaButton kind="secondary" size="M" className="flex-1" onClick={onShare}>
              <Share2 className="h-5 w-5" aria-hidden /> Share
            </NaButton>
          )}
          <NaButton kind={hideRematch ? "primary" : "text"} size={hideRematch ? "L" : "M"} className="flex-1" onClick={onBackHome}>
            Home
          </NaButton>
        </div>

        <SaveProgressSheet open={saveOpen} onOpenChange={setSaveOpen} />
        <NaSheet
          open={mistakesOpen}
          onOpenChange={setMistakesOpen}
          title="Learn from the mistake"
          primary={{ label: "Got it", onClick: () => setMistakesOpen(false) }}
        >
          <MissedReview missed={missed} />
        </NaSheet>
      </motion.div>
    );
  }
  // DEFEAT
  return (
    <motion.div
      ref={fit.ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full w-full flex-col overflow-y-auto bg-defeat screen-x screen-top screen-bottom"
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
      <div className="btn-stack relative z-10 mx-auto mt-auto w-full max-w-sm screen-bottom pt-5">
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

/**
 * The Gym Badge a Weekly League win earns.
 *
 * Deliberately louder than the XP and coin rows around it — bigger art, its own
 * tinted plate, the word BADGE above the name — because it is the only reward
 * on this screen that is permanent and the only one the mode exists for. A row
 * that matched the others would have read as a fourth number.
 *
 * The sprite is a local file (public/badges), so no fallback ladder: if it were
 * to 404 the alt text still names the badge.
 */
function BadgeRow({ badge }: { badge: { name: string; iconUrl: string } }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border-2 border-poke-yellow/60 bg-poke-yellow/15 px-3 py-2">
      <img
        src={encodeURI(badge.iconUrl)}
        alt={badge.name}
        draggable={false}
        className="h-11 w-11 shrink-0 object-contain drop-shadow"
      />
      <div className="min-w-0">
        <div className="font-pixel-xs uppercase tracking-wide text-foreground/60">Badge earned</div>
        <div className="truncate font-display-md leading-tight text-foreground">{badge.name}</div>
      </div>
    </div>
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
