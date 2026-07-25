import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
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

        {/* Stat row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-foreground/60">Streak</div>
            <div className="text-lg font-extrabold text-foreground">
              {bestStreak}
            </div>
          </div>
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-foreground/60">Coins</div>
            <div className="text-lg font-extrabold text-foreground">{coins.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-foreground/60">TP ×{tpMult.toFixed(2)}</div>
            <div className="text-lg font-extrabold text-poke-blue">{partnerTp}</div>
          </div>
        </div>
      </div>

      {/* Battle card */}
      <div className="px-5 pt-3">
        <div className="relative overflow-hidden rounded-3xl bg-card p-5 shadow-card">
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
          <Button
            size="lg"
            onClick={onStart}
            disabled={loading && pending === null}
            className="relative mt-4 h-14 w-full rounded-full bg-primary text-base font-bold shadow-pop"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading && pending === null ? "Summoning..." : "Start Battle"}
          </Button>
        </div>
      </div>

      {/* Daily + Weekly row */}
      <div className="grid grid-cols-2 gap-2.5 px-5 pt-3">
        <button
          onClick={handleDaily}
          disabled={dailyDone || loading}
          className={`relative flex h-[96px] items-center gap-1 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.9_0.13_95)] to-[oklch(0.85_0.17_80)] p-3 text-left shadow-card disabled:opacity-80 ${
            dailyDone ? "grayscale" : ""
          } ${pending === "daily" ? "animate-pulse ring-2 ring-[oklch(0.35_0.06_80)]/40" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <div className="whitespace-nowrap font-pixel text-[9px] leading-none text-[oklch(0.35_0.06_80)]">
              DAILY QUEST
            </div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight text-[oklch(0.25_0.05_80)]">
              {dailyDone ? "Done" : "Beat Rotom"}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-[oklch(0.35_0.06_80/0.8)]">
              {dailyDone ? `Next in ${dailyClock}` : "Rewards await"}
            </p>
          </div>
          <PokemonSprite id={479} alt="Rotom" className="sprite -mr-1 h-[52px] w-[52px] shrink-0" />
        </button>

        <button
          onClick={handleWeekly}
          disabled={loading || weeklyFinished}
          className={`relative flex h-[96px] items-center gap-1 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.16_250)] to-[oklch(0.5_0.18_270)] p-3 text-left text-white shadow-card disabled:opacity-80 ${
            weeklyFinished ? "grayscale" : ""
          } ${pending === "weekly" ? "animate-pulse ring-2 ring-white/60" : ""}`}
        >
          <div className="min-w-0 flex-1">
            <div className="whitespace-nowrap font-pixel text-[9px] leading-none text-white/85">
              WEEKLY LEAGUE
            </div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight">
              {weeklyLeader ? `Gym: ${weeklyLeader.name}` : "Loading..."}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/85">
              {weeklyFinished
                ? `Next in ${weeklyTimeLeft}`
                : weeklyLeague?.status === "in_progress"
                  ? "Resume your run"
                  : `Badges ${gymBadges.length}/${GYM_LEADERS.length}`}
            </p>
          </div>
          {weeklyLeader && (
            <PokemonSprite
              id={weeklyLeader.signaturePokemonId}
              alt={weeklyLeader.name}
              className="sprite -mr-1 h-[52px] w-[52px] shrink-0"
            />
          )}
        </button>
      </div>

      {/* Mega Raid event card (moved here from the Battle Arena tab). Hidden
          while still loading; grayed once confirmed no raid is active. */}
      {mega !== null && (
        <div className="px-5 pt-2.5">
          {mega === "none" ? (
            <div className="flex w-full items-center gap-3 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.16_250)] to-[oklch(0.5_0.18_270)] p-3.5 text-white opacity-80 grayscale shadow-card">
              <div className="min-w-0 flex-1">
                <div className="font-pixel text-[9px] leading-none text-white/85">MEGA RAID</div>
                <h3 className="mt-1.5 text-base font-extrabold leading-tight">No Raid Active</h3>
                <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/85">
                  Check back soon
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={onStartMega}
              disabled={mega.disabled}
              className={`relative flex w-full items-center gap-3 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.16_250)] to-[oklch(0.5_0.18_270)] p-3.5 text-left text-white shadow-card disabled:opacity-80 ${
                mega.disabled ? "grayscale" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-pixel text-[9px] leading-none text-white/85">MEGA RAID</div>
                <h3 className="mt-1.5 text-base font-extrabold leading-tight">{mega.name}</h3>
                <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/85">
                  {mega.reason === "cleared"
                    ? `Cleared! Ends in ${formatEndsIn(Date.parse(mega.endsAt) - now)}`
                    : mega.reason === "exhausted"
                      ? `Out of attempts · Ends in ${formatEndsIn(Date.parse(mega.endsAt) - now)}`
                      : `Ends in ${formatEndsIn(Date.parse(mega.endsAt) - now)}`}
                </p>
              </div>
              <PokemonSprite
                id={mega.megaId}
                alt={mega.name}
                className="sprite -mr-1 h-[52px] w-[52px] shrink-0"
              />
            </button>
          )}
        </div>
      )}

      <div className="px-5 pt-2.5">
        <button
          onClick={() => navigate({ to: "/whos-that-pokemon" })}
          disabled={whosThatOnCooldown}
          className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.2_25)] to-[oklch(0.5_0.2_25)] px-3.5 py-2.5 text-left text-white shadow-card disabled:opacity-80 ${whosThatOnCooldown ? "grayscale" : ""}`}
        >
          <div
            className="absolute inset-0 opacity-25"
            style={{
              background:
                "repeating-conic-gradient(from 0deg at 16% 50%, rgba(255,255,255,0.18) 0deg 4deg, transparent 4deg 10deg)",
            }}
          />
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center">
            <PokemonSprite
              id={25}
              alt=""
              className="h-6 w-6 [filter:brightness(0)_invert(1)] [image-rendering:pixelated]"
            />
            <span className="absolute -right-1 -top-1 font-pixel text-[10px] text-poke-yellow drop-shadow">
              ?
            </span>
          </div>
          <div className="relative flex min-w-0 flex-1 items-baseline gap-2">
            <h3 className="truncate text-sm font-extrabold leading-tight">Who's That Pokémon?</h3>
            <span className="shrink-0 font-pixel text-[9px] leading-none text-white/85">
              {whosThatLabel}
            </span>
          </div>
          <span className="relative shrink-0 text-base text-white/80">›</span>
        </button>
      </div>
    </div>
  );
}
