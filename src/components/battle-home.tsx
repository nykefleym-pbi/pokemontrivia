import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Sparkles } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { BallCycler, PokeballSpinner, PokemonSprite, type DailyMark } from "@/components/game-ui";
import {
  rankForLevel,
  xpProgressInLevel,
  getTpMultiplier,
  trainerSpriteUrl,
  getWeekRangeUtc,
} from "@/lib/game-data";
import { findGymLeader, GYM_LEADERS } from "@/lib/gym-leaders";
import { COIN_ICON, STREAK_ICON, TP_ICON } from "@/lib/app-icons";

/**
 * The shared look of every tappable mode card on Home.
 *
 * One string rather than a wrapper component: these are <button>s with their
 * own gradients, sizes and disabled rules, and the only thing they share is
 * the chrome — a white rim, and a press that bounces. Keeping it as a class
 * string lets each card stay a plain button and compose its own colours.
 *
 * `press-card`, not `press-lg`: these four keep their press even when the mode
 * is unavailable, which a `disabled` button cannot do — a disabled control is
 * inert and never matches `:active`. They carry `aria-disabled` and guard their
 * own onClick instead. See the class note in styles.css.
 *
 * The class carries its own transition, so there is no `transition-*` utility
 * here — one used to be needed and is now the thing that would fight it.
 */
const MODE_CARD =
  "relative overflow-hidden rounded-[18px] border-2 border-white/70 shadow-card press-card";

/**
 * The mode card's hero sprite.
 *
 * Anchored below the title on the right rather than inline with it, so it can
 * be drawn at 80px in a 111px-wide cell instead of shrinking to fit beside
 * text. It used to sit at `-bottom-1 -right-1`, which bled it past two edges
 * and let `overflow-hidden` shave the feet and flank off every sprite — it read
 * as sunk into the corner. Equal 8px insets keep the whole sprite on the card
 * and give the artwork a margin to breathe against the rim.
 *
 * The footer row that shares this space carries `z-10` and wins.
 */
const MODE_SPRITE =
  "sprite animate-wiggle pointer-events-none absolute bottom-2 right-2 h-[80px] w-[80px] drop-shadow-md";

/**
 * The diagonal light streak that crosses each mode card.
 *
 * Decorative and non-interactive. It is a skewed translucent bar rather than a
 * `linear-gradient` background so it can sit ABOVE the card's own gradient
 * without the two blending into mud, and so a card that already paints a
 * rayburst (Who's That) can keep both.
 *
 * Both numbers here were wrong the first time and the streak was effectively
 * invisible. `-left-1/4 w-1/2` puts the band's BRIGHTEST point — the gradient's
 * midpoint — exactly on the card's left edge, so a 111px-wide mode card showed
 * only the band's dim outer half. It now starts inside the card so the peak
 * lands over artwork, and `white/45` rather than `white/25` survives being
 * drawn over a saturated gradient instead of disappearing into it.
 *
 * The blur is what makes it read as light rather than as a painted stripe. The
 * gradient alone still has two locatable edges; softening them leaves only the
 * bright core. It costs nothing to clip — the band is already inset well past
 * the card on both ends, so the blur has bleed to work with instead of fading
 * into a visible seam at the card's rim.
 */
function CardSheen({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute -inset-y-10 left-[8%] w-[42%] -rotate-[20deg] bg-gradient-to-r from-transparent via-white/45 to-transparent blur-[6px] ${className}`}
    />
  );
}

/**
 * The pixel eyebrow on a mode card ("DAILY QUEST", "WEEKLY LEAGUE"…).
 *
 * The size is a `clamp` rather than a Tailwind step because "WEEKLY LEAGUE" has
 * to stay on ONE line in a cell that is a third of the viewport, and at a fixed
 * 8px it does not: Press Start 2P's advance is ~0.975em nominal but quantizes as
 * high as ~1.09em/char at fractional sizes (see the calibration note in
 * `lib/type-row-fit.ts`, which swept this against the real webfont), so 13
 * characters cost up to ~104px inside a ~95px cell. Hence the wrap.
 *
 * 1.65vw is the largest ratio that clears that worst case down to a 360px
 * phone. Deliberately NOT `whitespace-nowrap`: the cards are `overflow-hidden`,
 * so below ~355px — where one legible line is simply not possible — nowrap
 * would silently chop the final letter, and wrapping is the better failure.
 *
 * Note for whoever re-measures: a sandboxed browser with Google Fonts blocked
 * substitutes a narrower monospace and reports ~0.6em/char. That number is not
 * this font.
 */
function ModeEyebrow({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <div
      className={`relative font-pixel leading-none ${className}`}
      style={{ fontSize: "clamp(6px, 1.65vw, 8px)" }}
    >
      {children}
    </div>
  );
}

/**
 * One cell of the merged stat strip: the art, a big value, and a quiet sub-line.
 *
 * Streak and TP used to render a lucide glyph underneath and reveal the image on
 * `onLoad`, because the Streak artwork had not been supplied yet and the
 * fallback stopped a 404 flashing a broken-image icon. Both files exist now, so
 * all three cells load the same way Coin always did — a plain <img>, no
 * placeholder, no load state. The fallback was scaffolding for a missing asset,
 * not a feature.
 */
function StatCell({
  icon,
  label,
  value,
  sub,
  valueClass = "text-foreground",
}: {
  icon: string;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center px-1 py-2">
      <div className="font-pixel-xs leading-none text-foreground/55">{label}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <img src={icon} alt="" aria-hidden className="h-5 w-5 shrink-0 object-contain" />
        <span className={`text-lg font-extrabold leading-none ${valueClass}`}>{value}</span>
      </div>
      <div className="mt-1 h-3 text-[10px] leading-none text-foreground/50">{sub ?? ""}</div>
    </div>
  );
}

/** Home-screen Mega Raid card state. `null` while the event is still loading
 * (render nothing), `"none"` once confirmed there's no active raid (grayed
 * placeholder), or the event details when one is live. */
export type MegaHomeState =
  | null
  | "none"
  | {
      name: string;
      megaId: number;
      endsAt: string;
      disabled: boolean; // cleared or attempts exhausted
      reason: "cleared" | "exhausted" | "active";
    };

/** "Xd Yh" / "Yh Zm" / "Zm" — minute granularity is enough for the raid
 * countdown, which refreshes off the home screen's shared 30s ticker. */
function formatEndsIn(ms: number): string {
  if (ms <= 0) return "ending soon";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export function BattleHome({
  onStart,
  onStartDaily,
  onStartWeekly,
  onStartMega,
  mega,
  loading,
  dailyDone,
  dailyResult: _dailyResult,
}: {
  onStart: () => void;
  onStartDaily: () => void;
  onStartWeekly: () => void;
  onStartMega: () => void;
  mega: MegaHomeState;
  loading: boolean;
  dailyDone: boolean;
  dailyResult: {
    correct: number;
    total: number;
    timeMs: number;
    pattern: DailyMark[];
    date: string;
  } | null;
}) {
  const navigate = useNavigate();
  const whosThatHourKey = useGameStore((s) => s.whosThatHourKey);

  // Single clock driving every countdown on this screen. Ticks every 30s —
  // coarse enough to avoid re-rendering the whole home screen every second —
  // except the Who's That countdown switches to a 1s tick for its final
  // minute so it can show live seconds without a second interval existing.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const msLeftInHour = 3_600_000 - (now % 3_600_000);
    const onCooldown = Math.floor(now / 3_600_000) === whosThatHourKey;
    const fast = onCooldown && msLeftInHour < 60_000;
    const t = setInterval(() => setNow(Date.now()), fast ? 1_000 : 30_000);
    return () => clearInterval(t);
  }, [now, whosThatHourKey]);

  const whosThatOnCooldown = Math.floor(now / 3_600_000) === whosThatHourKey;
  const whosThatMsLeft = 3_600_000 - (now % 3_600_000);
  const whosThatUnderMinute = whosThatMsLeft < 60_000;
  const whosThatClock = `${String(Math.floor(whosThatMsLeft / 60000)).padStart(2, "0")}:${String(Math.floor((whosThatMsLeft % 60000) / 1000)).padStart(2, "0")}`;
  const whosThatLabel = !whosThatOnCooldown
    ? "TAP TO BEGIN"
    : whosThatUnderMinute
      ? whosThatClock
      : `NEXT IN ${Math.ceil(whosThatMsLeft / 60_000)}M`;
  const _nd = new Date(now);
  const msToNextDay = Date.UTC(_nd.getUTCFullYear(), _nd.getUTCMonth(), _nd.getUTCDate() + 1) - now;
  const dailyClock = `${Math.floor(msToNextDay / 3_600_000)}h ${String(Math.floor((msToNextDay % 3_600_000) / 60_000)).padStart(2, "0")}m`;
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const coins = useGameStore((s) => s.coins);
  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const gymBadges = useGameStore((s) => s.gymBadges);
  const bestStreak = useGameStore((s) => s.stats.bestStreak);
  const winStreak = useGameStore((s) => s.arenaStats.currentWinStreak);
  const weekRange = getWeekRangeUtc();

  const weeklyLeader = weeklyLeague ? findGymLeader(weeklyLeague.gymLeaderId) : null;
  const weeklyFinished = weeklyLeague?.status === "won" || weeklyLeague?.status === "lost";

  const weeklyMsLeft = weekRange.nextStart - now;
  const weeklyTimeLeft =
    weeklyMsLeft <= 0
      ? "Refreshing..."
      : `${Math.floor(weeklyMsLeft / 86_400_000)}d ${Math.floor((weeklyMsLeft % 86_400_000) / 3_600_000)}h ${Math.floor((weeklyMsLeft % 3_600_000) / 60_000)}m`;

  if (!pokemon) return null;

  const rank = rankForLevel(level);
  const xpProg = xpProgressInLevel(xp);
  const partnerTp = trainingPoints[pokemon.id] ?? 0;
  const tpMult = getTpMultiplier(partnerTp);
  const xpPct = Math.min(100, (xpProg.current / xpProg.need) * 100);

  // Avatar frame. The ring is intentionally decorative (a GO-style badge
  // frame) — it is NOT an XP gauge; XP progress is shown by the bar next to
  // the trainer name below, which is the only progress indicator here.
  const ring = (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full -rotate-90">
        <circle
          cx="40"
          cy="40"
          r="35"
          fill="none"
          stroke="oklch(0.22 0.04 260 / 0.12)"
          strokeWidth="5"
        />
        {/* Decorative full ring, always drawn solid — not an XP gauge. */}
        <circle cx="40" cy="40" r="35" fill="none" stroke="var(--color-primary)" strokeWidth="5" />
      </svg>
      <div className="absolute inset-[6px] flex items-center justify-center overflow-hidden rounded-full bg-card">
        <img
          src={trainerSpriteUrl(trainerSprite)}
          alt={trainerSprite}
          className="sprite h-14 w-14 object-contain"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
          }}
        />
      </div>
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-poke-dark px-2.5 py-[3px] font-pixel text-[9px] leading-none text-poke-yellow shadow-sm">
        LV {level}
      </div>
    </div>
  );

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      {/* Hero — sits directly on yellow gradient, no white card */}
      <div className="relative px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <div className="flex items-center gap-3">
          {ring}
          <div className="min-w-0 flex-1">
            <p className="font-pixel-xs text-primary">{rank}</p>
            <h1 className="truncate font-display-lg text-foreground">{trainerName}</h1>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-poke-dark/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-poke-yellow to-primary transition-[width] duration-500"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-foreground/60">
              {xpProg.current.toLocaleString()} / {xpProg.need.toLocaleString()} XP to Lv{" "}
              {level + 1}
            </p>
          </div>
          <PokemonSprite
            id={pokemon.id}
            alt={pokemon.name}
            className="sprite h-16 w-16 shrink-0 -mt-2"
          />
        </div>

        {/* Stat strip — one container, three cells, hairline dividers.
            Previously three separate cards, which spent two gaps and two rims
            on separating numbers that belong together. The rank is deliberately
            NOT a fourth cell: it already leads the hero directly above, and
            repeating it here would put the same string on screen twice.

            The TP cell used to read "TP ×1.00" over the value "0" — a
            multiplier in the label and a count in the value, two different
            units in one tile. The multiplier is now the sub-line, where the
            other cells put their context. */}
        <div className="mt-4 flex items-stretch divide-x divide-foreground/10 rounded-2xl border-2 border-white bg-card shadow-card">
          <StatCell
            icon={STREAK_ICON}
            label="STREAK"
            value={String(winStreak)}
            sub={bestStreak > 0 ? `Best: ${bestStreak}` : undefined}
            valueClass="text-primary"
          />
          <StatCell icon={COIN_ICON} label="COINS" value={coins.toLocaleString()} />
          <StatCell
            icon={TP_ICON}
            label="TP"
            value={String(partnerTp)}
            sub={`×${tpMult.toFixed(2)}`}
            valueClass="text-poke-blue"
          />
        </div>
      </div>

      {/* Battle card */}
      <div className="px-5 pt-3">
        <div className="relative overflow-hidden rounded-3xl border-2 border-white bg-card p-5 shadow-card">
          <div className="pointer-events-none absolute -right-8 -bottom-8 opacity-[0.06]">
            <PokeballSpinner size={180} />
          </div>
          <div className="relative flex items-center gap-4">
            {/* Cycles Poke -> Great -> Ultra -> Master, flipping over between
                tiers. While a battle is being fetched it reverts to the plain
                spinning Poke Ball: two different animations on one object at
                once reads as a glitch, and the spin is load-bearing (it is the
                only "working on it" cue this card has). */}
            {loading ? <PokeballSpinner size={56} spinning /> : <BallCycler size={56} />}
            <div className="min-w-0 flex-1">
              <h3 className="font-display-md text-foreground">
                {loading ? "Summoning..." : "Up for a battle?"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Answer 20 questions to earn XP, coins and Training Points for your partner.
              </p>
            </div>
          </div>
          {/* The live win streak sits with the button that puts it at risk. Two
              is where it starts: one win is just a win, two is the first time
              there is something to lose. */}
          {winStreak >= 2 && (
            <div className="relative mt-3 flex items-center gap-2 rounded-2xl bg-primary/10 px-3 py-2">
              <Flame className="h-4 w-4 shrink-0 text-primary" />
              <span className="text-sm font-bold text-foreground">{winStreak} wins in a row</span>
              <span className="ml-auto text-xs text-foreground/60">Don&rsquo;t break it</span>
            </div>
          )}
          <Button
            size="action"
            onClick={onStart}
            disabled={loading}
            className="relative mt-4 w-full border-2 border-white bg-primary shadow-pop press-lg"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? "Summoning..." : "Start Battle"}
          </Button>
        </div>
      </div>

      {/* The three modes, one row.
          Daily and Weekly used to share a 2-up row with Mega Raid on its own
          full-width strip below, which read as two unrelated sections and cost
          a whole extra band of height. Three squarish cells put every mode at
          the same rank and let the row be scanned in one pass.

          Mega keeps its cell even when there is no raid — collapsing it would
          reflow the other two every time the event ends. */}
      <div className="grid grid-cols-3 gap-2 px-5 pt-3">
        <button
          onClick={() => !dailyDone && !loading && onStartDaily()}
          aria-disabled={dailyDone || loading}
          className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.96_0.09_98)] to-[oklch(0.74_0.18_66)] p-2 text-left aria-disabled:opacity-80 ${
            dailyDone ? "grayscale" : ""
          }`}
        >
          <CardSheen />
          <ModeEyebrow className="text-[oklch(0.35_0.06_80)]">DAILY QUEST</ModeEyebrow>
          <h3 className="relative mt-1 text-[13px] font-extrabold leading-tight text-[oklch(0.22_0.05_80)]">
            {dailyDone ? "Done" : "Beat Rotom"}
          </h3>
          <PokemonSprite id={479} alt="Rotom" className={`${MODE_SPRITE} [animation-delay:0s]`} />
          <div className="relative z-10 mt-auto flex items-center gap-1.5">
            {dailyDone ? (
              <span className="text-[10px] font-semibold text-[oklch(0.35_0.06_80/0.85)]">
                Next in {dailyClock}
              </span>
            ) : (
              <>
                <img src={COIN_ICON} alt="" aria-hidden className="h-4 w-4 object-contain" />
                <img src={TP_ICON} alt="" aria-hidden className="h-4 w-4 object-contain" />
                <span className="text-[10px] font-bold text-[oklch(0.3_0.06_80)]">Rewards</span>
              </>
            )}
          </div>
        </button>

        <button
          onClick={() => !loading && !weeklyFinished && onStartWeekly()}
          aria-disabled={loading || weeklyFinished}
          className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.76_0.14_243)] to-[oklch(0.38_0.18_275)] p-2 text-left text-white aria-disabled:opacity-80 ${
            weeklyFinished ? "grayscale" : ""
          }`}
        >
          <CardSheen />
          <ModeEyebrow className="text-white/85">WEEKLY LEAGUE</ModeEyebrow>
          <h3 className="relative mt-1 truncate text-[13px] font-extrabold leading-tight">
            {weeklyLeader ? weeklyLeader.name : "Loading..."}
          </h3>
          {weeklyLeader && (
            <PokemonSprite
              id={weeklyLeader.signaturePokemonId}
              alt={weeklyLeader.name}
              className={`${MODE_SPRITE} [animation-delay:1.7s]`}
            />
          )}
          <div className="relative z-10 mt-auto">
            <div className="text-[10px] font-bold leading-none">
              {weeklyFinished
                ? `Next in ${weeklyTimeLeft}`
                : weeklyLeague?.status === "in_progress"
                  ? "Resume run"
                  : `Badges ${gymBadges.length}/${GYM_LEADERS.length}`}
            </div>
            {/* A bar, not just a fraction: 0 of 42 is a discouraging number to
                read but a legible amount of progress to see fill up. */}
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/25">
              <div
                className="h-full rounded-full bg-poke-yellow"
                style={{ width: `${(gymBadges.length / GYM_LEADERS.length) * 100}%` }}
              />
            </div>
          </div>
        </button>

        {mega !== null && mega !== "none" ? (
          <button
            onClick={() => !mega.disabled && onStartMega()}
            aria-disabled={mega.disabled}
            className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.7_0.17_310)] to-[oklch(0.3_0.15_298)] p-2 text-left text-white aria-disabled:opacity-80 ${
              mega.disabled ? "grayscale" : ""
            }`}
          >
            <CardSheen />
            <ModeEyebrow className="text-white/85">MEGA RAID</ModeEyebrow>
            <h3 className="relative mt-1 truncate text-[13px] font-extrabold leading-tight">
              {mega.name}
            </h3>
            <PokemonSprite
              id={mega.megaId}
              alt={mega.name}
              className={`${MODE_SPRITE} [animation-delay:3.4s]`}
            />
            <div className="relative z-10 mt-auto text-[10px] font-bold leading-tight">
              {mega.reason === "cleared"
                ? "Cleared!"
                : mega.reason === "exhausted"
                  ? "No attempts"
                  : "Ends in"}{" "}
              {formatEndsIn(Date.parse(mega.endsAt) - now)}
            </div>
          </button>
        ) : (
          <div
            className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.7_0.17_310)] to-[oklch(0.3_0.15_298)] p-2 text-left text-white opacity-70 grayscale`}
          >
            <ModeEyebrow className="text-white/85">MEGA RAID</ModeEyebrow>
            <h3 className="mt-1 text-[13px] font-extrabold leading-tight">
              {mega === null ? "Checking..." : "No Raid"}
            </h3>
            <div className="mt-auto text-[10px] font-bold">
              {mega === null ? "" : "Check back soon"}
            </div>
          </div>
        )}
      </div>

      <div className="px-5 pt-2.5">
        <button
          onClick={() => !whosThatOnCooldown && navigate({ to: "/whos-that-pokemon" })}
          aria-disabled={whosThatOnCooldown}
          className={`${MODE_CARD} flex w-full items-center gap-3 bg-gradient-to-b from-[oklch(0.64_0.2_25)] to-[oklch(0.45_0.19_25)] py-2.5 pl-3 pr-3 text-left text-white aria-disabled:opacity-80 ${whosThatOnCooldown ? "grayscale" : ""}`}
        >
          {/* Gold rayburst, kept from the old card — it is what makes this one
              read as the odd one out, which is the point. */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-30"
            style={{
              background:
                "repeating-conic-gradient(from 0deg at 14% 50%, rgba(242,214,78,0.35) 0deg 4deg, transparent 4deg 10deg)",
            }}
          />
          <CardSheen />
          {/* The silhouette is the hook, so it is drawn at card height rather
              than as a 24px icon in a chip. Pure black + the card's own gold
              behind it is the whole "who's that" read — it carried a small `?`
              on its shoulder as well, which only repeated the question mark
              already ending the title two inches to the right. */}
          <div className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center">
            <div className="absolute h-16 w-16 rounded-full bg-poke-yellow/30 blur-[8px]" />
            <PokemonSprite
              id={25}
              alt=""
              className="animate-wiggle relative h-[68px] w-[68px] [filter:brightness(0)] [image-rendering:pixelated] [animation-delay:2.6s]"
            />
          </div>
          {/* Pixel face, matching the eyebrow the other three mode cards use.
              This was the only mode whose name was set in the display font,
              which made the row read as three modes plus one banner ad.

              It wraps rather than truncates. At 390px the one-line version lost
              its last word to an ellipsis once the CTA claimed its width, and
              "Who's That Pokém…" is a worse read than two short lines. */}
          <div className="relative min-w-0 flex-1">
            <h3 className="font-pixel text-[10px] uppercase leading-[1.5]">
              Who&apos;s That Pokémon?
            </h3>
            {whosThatOnCooldown && (
              <p className="mt-0.5 truncate text-[10px] font-semibold leading-tight text-white/85">
                {whosThatLabel}
              </p>
            )}
          </div>
          {/* A button-shaped affordance, not a chevron. The chevron read as
              "list row"; this reads as "the thing to tap". */}
          <span className="relative flex shrink-0 items-center gap-0.5 rounded-full border-2 border-white/70 bg-poke-yellow px-2.5 py-1.5 text-[11px] font-extrabold text-[oklch(0.28_0.06_60)] shadow-sm">
            Play Now
            <span aria-hidden>›</span>
          </span>
        </button>
      </div>
    </div>
  );
}
