import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Crown } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PokeballSpinner, PokemonSprite, type DailyMark } from "@/components/game-ui";
import { rankForLevel, xpProgressInLevel, difficultyForLevel, getTpMultiplier } from "@/lib/game-data";

import { trainerSpriteUrl } from "@/lib/game-data";
import { BattleScreen, type Trivia } from "@/components/battle-screen";
import { Toaster } from "@/components/ui/sonner";
import { nextPendingElite, type EliteMember } from "@/lib/elite-four";
import { findGymLeader, type GymLeader } from "@/lib/gym-leaders";
import { getWeekRangeUtc } from "@/lib/game-data";

export const Route = createFileRoute("/battle")({
  component: BattlePage,
  validateSearch: (s: Record<string, unknown>) => ({
    autostart: s.autostart ? 1 : 0,
    mode: s.mode === "daily" ? "daily" : "battle",
  }),
});

function BattlePage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const level = useGameStore((s) => s.level);
  const peakLevel = useGameStore((s) => s.peakLevel);
  const defeatedElites = useGameStore((s) => s.defeatedElites);
  const seenHashes = useGameStore((s) => s.seenQuestionHashes);
  const seenQuestions = useGameStore((s) => s.seenQuestions);
  const markQuestionsSeen = useGameStore((s) => s.markQuestionsSeen);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [phase, setPhase] = useState<"home" | "loading" | "fighting" | "daily" | "elite" | "weekly">("home");
  const [questions, setQuestions] = useState<Trivia[]>([]);
  const [eliteOpponent, setEliteOpponent] = useState<EliteMember | null>(null);
  const [weeklyOpponent, setWeeklyOpponent] = useState<GymLeader | null>(null);
  const [battleKey, setBattleKey] = useState(0);
  const autoStartedRef = useRef(false);
  const dailyResult = useGameStore((s) => s.dailyResult);
  const today = new Date().toISOString().slice(0, 10);
  const dailyDone = dailyResult?.date === today;

  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const initWeeklyLeague = useGameStore((s) => s.initWeeklyLeague);
  const startWeeklyLeagueAttempt = useGameStore((s) => s.startWeeklyLeagueAttempt);
  const recordWeeklyLeagueResult = useGameStore((s) => s.recordWeeklyLeagueResult);

  const pendingElite = nextPendingElite(peakLevel, defeatedElites);

  useEffect(() => {
    initWeeklyLeague();
  }, [initWeeklyLeague]);

  // On mount: if a weekly battle was left in_progress (app closed mid-fight), count it as loss
  useEffect(() => {
    if (useGameStore.getState().weeklyLeague?.status === "in_progress") {
      recordWeeklyLeagueResult(false);
      toast.error("Previous Weekly League attempt counted as a loss.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  useEffect(() => {
    if (hasOnboarded && search.autostart === 1 && !autoStartedRef.current && phase === "home") {
      autoStartedRef.current = true;
      startBattle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOnboarded, search.autostart, phase]);

  if (!hasOnboarded) return null;

  async function startBattle() {
    if (pendingElite) {
      toast.error(`${pendingElite.name} blocks the way! Defeat them first.`);
      return;
    }
    setPhase("loading");
    try {
      const resp = await fetch("/api/trivia-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty: difficultyForLevel(level),
          seenHashes,
          seenSamples: seenQuestions.slice(-80),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited. Please wait a moment."); setPhase("home"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted. Add credits in Settings."); setPhase("home"); return; }
      const data = (await resp.json()) as { questions: Trivia[] };
      if (!data.questions || data.questions.length < 5) {
        toast.error("Couldn't prepare battle. Try again.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      setQuestions(data.questions);
      setPhase("fighting");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't prepare battle. Try again.");
      setPhase("home");
    }
  }

  async function startElite() {
    if (!pendingElite) return;
    setPhase("loading");
    try {
      const resp = await fetch("/api/trivia-elite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: pendingElite.type,
          memberName: `${pendingElite.title} ${pendingElite.name}`,
          seenHashes,
          seenSamples: seenQuestions.slice(-80),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited."); setPhase("home"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted."); setPhase("home"); return; }
      const data = (await resp.json()) as { questions: Trivia[] };
      if (!data.questions?.length) {
        toast.error("Couldn't prepare Elite battle.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      setEliteOpponent(pendingElite);
      setQuestions(data.questions);
      setPhase("elite");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't prepare Elite battle.");
      setPhase("home");
    }
  }

  async function startDaily() {
    if (dailyDone) return;
    setPhase("loading");
    try {
      const resp = await fetch("/api/daily-challenge");
      const data = (await resp.json()) as { questions: Trivia[] };
      if (!data.questions?.length) {
        toast.error("Daily challenge unavailable. Try again later.");
        setPhase("home");
        return;
      }
      setQuestions(data.questions);
      setPhase("daily");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load daily.");
      setPhase("home");
    }
  }

  async function startWeekly() {
    if (!weeklyLeague) return;
    if (weeklyLeague.status === "won" || weeklyLeague.status === "lost") return;
    const leader = findGymLeader(weeklyLeague.gymLeaderId);
    if (!leader) return;
    setPhase("loading");
    try {
      const resp = await fetch("/api/trivia-elite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: leader.type,
          memberName: `Gym Leader ${leader.name}`,
          count: 20,
          seenHashes,
          seenSamples: seenQuestions.slice(-80),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited."); setPhase("home"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted."); setPhase("home"); return; }
      const data = (await resp.json()) as { questions: Trivia[] };
      if (!data.questions?.length) {
        toast.error("Couldn't prepare Weekly League.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      startWeeklyLeagueAttempt();
      setWeeklyOpponent(leader);
      setQuestions(data.questions);
      setPhase("weekly");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't prepare Weekly League.");
      setPhase("home");
    }
  }

  function exitBattle() {
    setPhase("home");
    setQuestions([]);
    setEliteOpponent(null);
    setWeeklyOpponent(null);
    setBattleKey((k) => k + 1);
    useGameStore.getState().abortBattle();
  }

  return (
    <>
      <Toaster position="top-center" />
      {phase === "fighting" ? (
        <BattleScreen
          key={battleKey}
          questions={questions}
          onExit={exitBattle}
          onRematch={() => { setBattleKey((k) => k + 1); startBattle(); }}
        />
      ) : phase === "elite" && eliteOpponent ? (
        <BattleScreen
          key={battleKey}
          questions={questions}
          onExit={exitBattle}
          onRematch={() => { setBattleKey((k) => k + 1); startElite(); }}
          mode="elite"
          eliteMember={eliteOpponent}
        />
      ) : phase === "weekly" && weeklyOpponent ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="weekly" gymLeader={weeklyOpponent} />
      ) : phase === "daily" ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="daily" />
      ) : pendingElite ? (
        <ElitePendingTakeover
          elite={pendingElite}
          onStart={startElite}
          loading={phase === "loading"}
        />
      ) : (
        <BattleHome
          onStart={startBattle}
          onStartDaily={startDaily}
          onStartWeekly={startWeekly}
          loading={phase === "loading"}
          dailyDone={dailyDone}
          dailyResult={dailyDone ? dailyResult : null}
        />
      )}
    </>
  );
}

function BattleHome({
  onStart,
  onStartDaily,
  onStartWeekly,
  loading,
  dailyDone,
  dailyResult,
}: {
  onStart: () => void;
  onStartDaily: () => void;
  onStartWeekly: () => void;
  loading: boolean;
  dailyDone: boolean;
  dailyResult: { correct: number; total: number; timeMs: number; pattern: DailyMark[]; date: string } | null;
}) {
  const [pending, setPending] = useState<null | "daily" | "weekly">(null);
  useEffect(() => {
    if (!loading) setPending(null);
  }, [loading]);
  const handleDaily = () => { setPending("daily"); onStartDaily(); };
  const handleWeekly = () => { setPending("weekly"); onStartWeekly(); };
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
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
      if (ms <= 0) { setWeeklyTimeLeft("Refreshing..."); return; }
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
        <circle cx="40" cy="40" r="35" fill="none" stroke="oklch(0.22 0.04 260 / 0.12)" strokeWidth="5" />
        <circle
          cx="40" cy="40" r="35" fill="none"
          stroke="var(--color-primary)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 35}
          strokeDashoffset={2 * Math.PI * 35 * (1 - xpPct / 100)}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-[6px] flex items-center justify-center overflow-hidden rounded-full bg-card">
        <img
          src={trainerSpriteUrl(trainerSprite)}
          alt={trainerSprite}
          className="sprite h-14 w-14 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
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
            <h1 className="truncate font-display-lg text-poke-dark">{trainerName}</h1>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-poke-dark/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-poke-yellow to-primary transition-[width] duration-500"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-poke-dark/60">
              {xpProg.current.toLocaleString()} / {xpProg.need.toLocaleString()} XP to Lv {level + 1}
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
            <div className="font-pixel-xs text-poke-dark/60">Streak</div>
            <div className="text-lg font-extrabold text-poke-dark">{bestStreak} <span className="text-base">🔥</span></div>
          </div>
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-poke-dark/60">XP</div>
            <div className="text-lg font-extrabold text-poke-dark">{xp.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-poke-dark/60">TP ×{tpMult.toFixed(2)}</div>
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
            pending === "daily" ? "animate-pulse ring-2 ring-[oklch(0.35_0.06_80)]/40" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="whitespace-nowrap font-pixel text-[7px] leading-none text-[oklch(0.35_0.06_80)]">DAILY QUEST</div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight text-[oklch(0.25_0.05_80)]">
              {dailyDone ? "Done" : "Beat Rotom"}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-[oklch(0.35_0.06_80/0.8)]">
              {dailyDone && dailyResult
                ? `${dailyResult.correct}/${dailyResult.total} · ${Math.round(dailyResult.timeMs / 1000)}s`
                : "10 fast questions"}
            </p>
          </div>
          <PokemonSprite id={479} alt="Rotom" className="sprite -mr-1 h-[52px] w-[52px] shrink-0" />
        </button>

        <button
          onClick={handleWeekly}
          disabled={loading || weeklyFinished}
          className={`relative flex h-[96px] items-center gap-1 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.16_250)] to-[oklch(0.5_0.18_270)] p-3 text-left text-white shadow-card disabled:opacity-80 ${
            pending === "weekly" ? "animate-pulse ring-2 ring-white/60" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="whitespace-nowrap font-pixel text-[7px] leading-none text-white/85">WEEKLY LEAGUE</div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight">
              {weeklyLeader ? `Gym: ${weeklyLeader.name}` : "Loading..."}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/85">
              {weeklyLeague?.status === "won"
                ? "Victory!"
                : weeklyLeague?.status === "lost"
                  ? weeklyTimeLeft
                  : weeklyLeague?.status === "in_progress"
                    ? "Resume your run"
                    : "Resets Monday 00:00 UTC"}
            </p>
          </div>
          {weeklyLeader && (
            <PokemonSprite id={weeklyLeader.signaturePokemonId} alt={weeklyLeader.name} className="sprite -mr-1 h-[52px] w-[52px] shrink-0" />
          )}
        </button>
      </div>
    </div>
  );
}


function ElitePendingTakeover({
  elite,
  onStart,
  loading,
}: {
  elite: EliteMember;
  onStart: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-elite-arena relative flex h-full w-full flex-col overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)] safe-x">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-poke-dark/40 via-transparent to-poke-dark/70" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex items-center justify-center gap-2 font-pixel text-[10px] tracking-[0.3em] text-poke-yellow"
      >
        <Crown className="h-3 w-3" /> ELITE FOUR <Crown className="h-3 w-3" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mx-auto mt-6 flex w-full max-w-xs flex-col items-center text-center"
      >
        <div className="relative flex items-end justify-center gap-2">
          <div className="absolute inset-0 -m-6 rounded-full bg-poke-yellow/15 blur-3xl" />
          <img
            src={elite.trainerSpriteUrl}
            alt={elite.name}
            crossOrigin="anonymous"
            className="sprite relative h-40 w-40 object-contain drop-shadow-2xl"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <PokemonSprite
            id={elite.signaturePokemonId}
            alt={elite.signaturePokemonName}
            className="sprite relative h-28 w-28 object-contain drop-shadow-2xl"
          />
        </div>
        <p className="mt-3 font-pixel text-[10px] tracking-[0.25em] text-poke-yellow/80">
          {elite.title.toUpperCase()}
        </p>
        <h1 className="mt-2 text-5xl font-extrabold leading-none text-poke-yellow drop-shadow">
          {elite.name}
        </h1>
        <p className="mt-3 text-xs text-poke-yellow/70">
          {elite.region} · {elite.type.toUpperCase()} specialist · 200 HP boss
        </p>
        <p className="mt-4 text-sm italic leading-relaxed text-poke-yellow/85">
          "{elite.quote}"
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-poke-yellow/40 bg-poke-dark/50 px-3 py-1 text-[11px] font-semibold text-poke-yellow">
            🏅 Region unlock
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-poke-yellow/40 bg-poke-dark/50 px-3 py-1 text-[11px] font-semibold text-poke-yellow">
            +1,000 XP
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="relative mx-auto mt-auto flex w-full max-w-xs flex-col gap-2 pt-8"
      >
        {loading ? (
          <Skeleton className="h-14 w-full rounded-full" />
        ) : (
          <Button
            size="lg"
            onClick={onStart}
            className="h-14 w-full rounded-full bg-poke-yellow text-base font-bold text-poke-dark shadow-pop hover:bg-poke-yellow/90"
          >
            <Crown className="mr-2 h-5 w-5" /> Challenge {elite.name}
          </Button>
        )}
        <p className="text-center font-pixel text-[9px] tracking-[0.2em] text-poke-yellow/50">
          REGULAR BATTLES LOCKED UNTIL VICTORY
        </p>
      </motion.div>
    </div>
  );
}
