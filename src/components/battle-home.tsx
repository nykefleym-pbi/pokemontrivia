import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Sparkles } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { PokeballSpinner, PokemonSprite, type DailyMark } from "@/components/game-ui";
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
 * `active:scale-[0.97]` is the press. It needs `transition-transform` on the
 * same element and NOT `transition-all`, which would also animate the gradient
 * and make the press feel laggy on a mid-range phone.
 */
const MODE_CARD =
  "relative overflow-hidden rounded-[18px] border-2 border-white/70 shadow-card " +
  "transition-transform duration-100 active:scale-[0.97] disabled:active:scale-100";

/**
 * The diagonal light streak that crosses each mode card.
 *
 * Decorative and non-interactive. It is a skewed translucent bar rather than a
 * `linear-gradient` background so it can sit ABOVE the card's own gradient
 * without the two blending into mud, and so a card that already paints a
 * rayburst (Who's That) can keep both.
 */
function CardSheen({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute -inset-y-8 -left-1/4 w-1/2 -rotate-[24deg] bg-gradient-to-r from-transparent via-white/25 to-transparent ${className}`}
    />
  );
}

/**
 * One cell of the merged stat strip: art on top of a lucide fallback, a big
 * value, and a quiet sub-line.
 *
 * The image starts hidden and is revealed by its own `onLoad`. That ordering
 * matters — `STREAK_ICON` is owner-supplied art that may not exist yet, and
 * revealing on load (rather than hiding on error) means a 404 never flashes a
 * broken-image glyph before the fallback takes over.
 */
function StatCell({
  icon,
  fallback,
  label,
  value,
  sub,
  valueClass = "text-foreground",
}: {
  icon: string;
  fallback: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center px-1 py-2">
      <div className="font-pixel-xs leading-none text-foreground/55">{label}</div>
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          {!loaded && fallback}
          <img
            src={icon}
            alt=""
            aria-hidden
            onLoad={() => setLoaded(true)}
            className={`absolute inset-0 h-5 w-5 object-contain ${loaded ? "" : "opacity-0"}`}
          />
        </span>
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
  const [pending, setPending] = useState<null | "daily" | "weekly">(null);
  useEffect(() => {
    if (!loading) setPending(null);
  }, [loading]);
  const handleDaily = () => {
    setPending("daily");
    onStartDaily();
  };
  const handleWeekly = () => {
    setPending("weekly");
    onStartWeekly();
  };
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
            fallback={<Flame className="h-5 w-5 text-primary" />}
            label="STREAK"
            value={String(winStreak)}
            sub={bestStreak > 0 ? `Best: ${bestStreak}` : undefined}
            valueClass="text-primary"
          />
          <StatCell
            icon={COIN_ICON}
            fallback={<span className="text-sm">◎</span>}
            label="COINS"
            value={coins.toLocaleString()}
          />
          <StatCell
            icon={TP_ICON}
            fallback={<Sparkles className="h-5 w-5 text-poke-blue" />}
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
            <PokeballSpinner size={56} spinning={loading && pending === null} />
            <div className="min-w-0 flex-1">
              <h3 className="font-display-md text-foreground">
                {loading && pending === null ? "Summoning..." : "Up for a battle?"}
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
            size="lg"
            onClick={onStart}
            disabled={loading && pending === null}
            className="relative mt-4 h-14 w-full rounded-full border-2 border-white bg-primary text-base font-bold shadow-pop transition-transform duration-100 active:scale-[0.97]"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading && pending === null ? "Summoning..." : "Start Battle"}
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
          onClick={handleDaily}
          disabled={dailyDone || loading}
          className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.93_0.12_95)] to-[oklch(0.8_0.17_72)] p-2.5 text-left disabled:opacity-80 ${
            dailyDone ? "grayscale" : ""
          } ${pending === "daily" ? "animate-pulse ring-2 ring-[oklch(0.35_0.06_80)]/40" : ""}`}
        >
          <CardSheen />
          <div className="relative font-pixel text-[8px] leading-none text-[oklch(0.35_0.06_80)]">
            DAILY QUEST
          </div>
          <h3 className="relative mt-1 text-[13px] font-extrabold leading-tight text-[oklch(0.22_0.05_80)]">
            {dailyDone ? "Done" : "Beat Rotom"}
          </h3>
          <PokemonSprite
            id={479}
            alt="Rotom"
            className="sprite pointer-events-none absolute bottom-5 left-1/2 h-[62px] w-[62px] -translate-x-1/2 drop-shadow-md"
          />
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
          onClick={handleWeekly}
          disabled={loading || weeklyFinished}
          className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.68_0.16_248)] to-[oklch(0.44_0.18_272)] p-2.5 text-left text-white disabled:opacity-80 ${
            weeklyFinished ? "grayscale" : ""
          } ${pending === "weekly" ? "animate-pulse ring-2 ring-white/60" : ""}`}
        >
          <CardSheen />
          <div className="relative font-pixel text-[8px] leading-none text-white/85">
            WEEKLY LEAGUE
          </div>
          <h3 className="relative mt-1 truncate text-[13px] font-extrabold leading-tight">
            {weeklyLeader ? weeklyLeader.name : "Loading..."}
          </h3>
          {weeklyLeader && (
            <PokemonSprite
              id={weeklyLeader.signaturePokemonId}
              alt={weeklyLeader.name}
              className="sprite pointer-events-none absolute bottom-5 left-1/2 h-[62px] w-[62px] -translate-x-1/2 drop-shadow-md"
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
            onClick={onStartMega}
            disabled={mega.disabled}
            className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.6_0.19_305)] to-[oklch(0.36_0.16_300)] p-2.5 text-left text-white disabled:opacity-80 ${
              mega.disabled ? "grayscale" : ""
            }`}
          >
            <CardSheen />
            <div className="relative font-pixel text-[8px] leading-none text-white/85">
              MEGA RAID
            </div>
            <h3 className="relative mt-1 truncate text-[13px] font-extrabold leading-tight">
              {mega.name}
            </h3>
            <PokemonSprite
              id={mega.megaId}
              alt={mega.name}
              className="sprite pointer-events-none absolute bottom-5 left-1/2 h-[62px] w-[62px] -translate-x-1/2 drop-shadow-md"
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
            className={`${MODE_CARD} flex h-[124px] flex-col bg-gradient-to-b from-[oklch(0.6_0.19_305)] to-[oklch(0.36_0.16_300)] p-2.5 text-left text-white opacity-70 grayscale`}
          >
            <div className="font-pixel text-[8px] leading-none text-white/85">MEGA RAID</div>
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
          onClick={() => navigate({ to: "/whos-that-pokemon" })}
          disabled={whosThatOnCooldown}
          className={`${MODE_CARD} flex w-full items-center gap-3 bg-gradient-to-b from-[oklch(0.64_0.2_25)] to-[oklch(0.45_0.19_25)] py-2.5 pl-3 pr-3 text-left text-white disabled:opacity-80 ${whosThatOnCooldown ? "grayscale" : ""}`}
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
              behind it is the "who's that" read; the `?` rides its shoulder. */}
          <div className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center">
            <div className="absolute h-16 w-16 rounded-full bg-poke-yellow/30 blur-[8px]" />
            <PokemonSprite
              id={25}
              alt=""
              className="relative h-[68px] w-[68px] [filter:brightness(0)] [image-rendering:pixelated]"
            />
            <span className="absolute -right-0.5 -top-0.5 font-pixel text-xs text-poke-yellow drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              ?
            </span>
          </div>
          {/* The title wraps rather than truncates. At 390px the one-line
              version lost its last word to an ellipsis once the CTA claimed
              its width, and "Who's That Pokém…" is a worse read than two
              short lines. */}
          <div className="relative min-w-0 flex-1">
            <h3 className="text-[13px] font-extrabold leading-[1.15]">
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
