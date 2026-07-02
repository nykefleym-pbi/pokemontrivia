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
import { findGymLeader } from "@/lib/gym-leaders";

export function BattleHome({
  onStart,
  onStartDaily,
  onStartWeekly,
  loading,
  dailyDone,
  dailyResult: _dailyResult,
}: {
  onStart: () => void;
  onStartDaily: () => void;
  onStartWeekly: () => void;
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
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const whosThatOnCooldown = Math.floor(nowTick / 3_600_000) === whosThatHourKey;
  const whosThatMsLeft = 3_600_000 - (nowTick % 3_600_000);
  const whosThatClock = `${String(Math.floor(whosThatMsLeft / 60000)).padStart(2, "0")}:${String(Math.floor((whosThatMsLeft % 60000) / 1000)).padStart(2, "0")}`;
  const _nd = new Date(nowTick);
  const msToNextDay =
    Date.UTC(_nd.getUTCFullYear(), _nd.getUTCMonth(), _nd.getUTCDate() + 1) - nowTick;
  const dailyClock = `${Math.floor(msToNextDay / 3_600_000)}h ${String(Math.floor((msToNextDay % 3_600_000) / 60_000)).padStart(2, "0")}m`;
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const coins = useGameStore((s) => s.coins);
  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const bestStreak = useGameStore((s) => s.stats.bestStreak);
  const weekRange = getWeekRangeUtc();

  const weeklyLeader = weeklyLeague ? findGymLeader(weeklyLeague.gymLeaderId) : null;
  const weeklyFinished = weeklyLeague?.status === "won" || weeklyLeague?.status === "lost";

  const [weeklyTimeLeft, setWeeklyTimeLeft] = useState("");
  useEffect(() => {
    if (!weeklyFinished) return;
    const tick = () => {
      const ms = weekRange.nextStart - Date.now();
      if (ms <= 0) {
        setWeeklyTimeLeft("Refreshing...");
        return;
      }
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
      setWeeklyTimeLeft(`${days}d ${hours}h ${minutes}m`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [weekRange.nextStart, weeklyFinished]);

  if (!pokemon) return null;

  const rank = rankForLevel(level);
  const xpProg = xpProgressInLevel(xp);
  const partnerTp = trainingPoints[pokemon.id] ?? 0;
  const tpMult = getTpMultiplier(partnerTp);
  const xpPct = Math.min(100, (xpProg.current / xpProg.need) * 100);

  // Avatar with progress ring (GO-style)
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
        {/* Static full ring — XP progress lives in the bar next to the name. */}
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
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-poke-dark px-2 py-[2px] font-pixel text-[7px] leading-none text-poke-yellow shadow-sm">
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
              {bestStreak} <span className="text-base">🔥</span>
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
                20 questions · difficulty scales with your level
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
            {loading && pending === null ? "Summoning..." : "Find Match"}
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
            <div className="whitespace-nowrap font-pixel text-[7px] leading-none text-[oklch(0.35_0.06_80)]">
              DAILY QUEST
            </div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight text-[oklch(0.25_0.05_80)]">
              {dailyDone ? "Done" : "Beat Rotom"}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-[oklch(0.35_0.06_80/0.8)]">
              {dailyDone ? `Next in ${dailyClock}` : "Tap to begin"}
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
            <div className="whitespace-nowrap font-pixel text-[7px] leading-none text-white/85">
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
                  : "Tap to begin"}
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

      <div className="px-5 pt-2.5">
        <button
          onClick={() => navigate({ to: "/whos-that-pokemon" })}
          disabled={whosThatOnCooldown}
          className={`relative flex w-full items-center gap-3 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.2_25)] to-[oklch(0.5_0.2_25)] px-4 py-3.5 text-left text-white shadow-card disabled:opacity-80 ${whosThatOnCooldown ? "grayscale" : ""}`}
        >
          <div
            className="absolute inset-0 opacity-25"
            style={{
              background:
                "repeating-conic-gradient(from 0deg at 16% 50%, rgba(255,255,255,0.18) 0deg 4deg, transparent 4deg 10deg)",
            }}
          />
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <PokemonSprite
              id={25}
              alt=""
              className="h-9 w-9 [filter:brightness(0)_invert(1)] [image-rendering:pixelated]"
            />
            <span className="absolute -right-0.5 -top-1 font-pixel text-base text-poke-yellow drop-shadow">
              ?
            </span>
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="font-pixel text-[7px] leading-none text-white/85">HOURLY MINI-GAME</div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight">Who's That Pokémon?</h3>
            <p className="mt-0.5 font-pixel text-[8px] leading-none text-white/85">
              {whosThatOnCooldown ? `NEXT IN ${whosThatClock}` : "TAP TO BEGIN"}
            </p>
          </div>
          <span className="relative shrink-0 text-lg text-white/80">›</span>
        </button>
      </div>
    </div>
  );
}
