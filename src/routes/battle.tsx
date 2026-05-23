import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Crown, Flame, Swords } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AppHeader, XpBar, PokeballSpinner, PokeballPattern, PokemonSprite, type DailyMark } from "@/components/game-ui";
import { rankForLevel, xpProgressInLevel, difficultyForLevel, getTpMultiplier } from "@/lib/game-data";

import { trainerSpriteUrl } from "@/lib/game-data";
import { BattleScreen, type Trivia } from "@/components/battle-screen";
import { Toaster } from "@/components/ui/sonner";
import { nextPendingElite, type EliteMember } from "@/lib/elite-four";
import { findGymLeader, type GymLeader } from "@/lib/gym-leaders";
import { WeeklyLeagueCard, WeeklyLeagueResultCard } from "@/components/weekly-league-card";
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
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} />
      ) : phase === "elite" && eliteOpponent ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="elite" eliteMember={eliteOpponent} />
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
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const [tab, setTab] = useState<"battle" | "daily">("battle");
  const weekRange = getWeekRangeUtc();

  if (!pokemon) return null;

  const rank = rankForLevel(level);
  const xpProg = xpProgressInLevel(xp);
  const partnerTp = trainingPoints[pokemon.id] ?? 0;
  const tpMult = getTpMultiplier(partnerTp);

  return (
    <div className="bg-poke-hero h-full w-full overflow-y-auto pb-nav safe-x">

      <AppHeader gradient>
        {/* Hero strip: trainer + xp/rank + partner */}
        <div className="flex items-center gap-3">
          <img
            src={trainerSpriteUrl(trainerSprite)}
            alt={trainerSprite}
            className="sprite h-14 w-14 shrink-0 object-contain"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
            }}
          />
          <div className="min-w-0 flex-1">
            <p className="font-pixel text-[9px] uppercase text-poke-dark/60">{rank}</p>
            <h1 className="truncate font-pixel text-sm text-poke-dark">{trainerName}</h1>
            <div className="mt-1.5">
              <XpBar xp={xpProg.current} need={xpProg.need} />
            </div>
          </div>
          <div className="relative shrink-0 text-center">
            <div className="absolute inset-0 -m-1 rounded-full bg-gradient-to-br from-poke-yellow/40 to-primary/30 blur-xl" />
            <PokemonSprite
              id={pokemon.id}
              alt={pokemon.name}
              className="sprite relative h-20 w-20"
            />
          </div>
        </div>
        {/* Stat row — Level, XP, TP prominently shown */}
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-card/40 px-2 py-1 text-center">
            <div className="font-pixel text-[8px] uppercase text-poke-dark/60">Level</div>
            <div className="font-pixel text-sm text-poke-dark">{level}</div>
          </div>
          <div className="rounded-xl bg-card/40 px-2 py-1 text-center">
            <div className="font-pixel text-[8px] uppercase text-poke-dark/60">XP</div>
            <div className="font-pixel text-sm text-poke-dark">{xp}</div>
          </div>
          <div className="rounded-xl bg-card/40 px-2 py-1 text-center">
            <div className="font-pixel text-[8px] uppercase text-poke-dark/60">TP · ×{tpMult.toFixed(2)}</div>
            <div className="font-pixel text-sm text-primary">{partnerTp}</div>
          </div>
        </div>
      </AppHeader>

      <div className="px-5 pt-4">
        {/* Segmented action card */}
        <div className="rounded-3xl bg-card p-4 shadow-card">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
            <button
              onClick={() => setTab("battle")}
              className={`flex items-center justify-center gap-1.5 rounded-full py-2 font-pixel text-[10px] transition ${
                tab === "battle" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Swords className="h-3 w-3" /> BATTLE
            </button>
            <button
              onClick={() => setTab("daily")}
              className={`flex items-center justify-center gap-1.5 rounded-full py-2 font-pixel text-[10px] transition ${
                tab === "daily" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <Flame className="h-3 w-3" /> DAILY {dailyDone && <span className="text-primary">✓</span>}
            </button>
          </div>

          {tab === "battle" ? (
            <div className="flex flex-col items-center text-center">
              <PokeballSpinner size={72} spinning={loading} />
              <h3 className="mt-3 font-pixel text-sm text-foreground">
                {loading ? "Setting up the battle..." : "Up for a battle?"}
              </h3>
              {loading && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Hang on, summoning a challenger...
                </p>
              )}
              <Button
                size="lg"
                onClick={onStart}
                disabled={loading}
                className="mt-4 w-full rounded-full bg-primary py-6 font-semibold shadow-pop disabled:opacity-60"
              >
                <Sparkles className="mr-2 h-4 w-4" /> {loading ? "Summoning..." : "Find Match"}
              </Button>
              <p className="mt-2 text-[10px] text-muted-foreground">Difficulty scales with your level.</p>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center">
              {!dailyDone && <PokeballSpinner size={56} spinning={loading} />}
              <h3 className={`font-pixel text-sm text-foreground ${!dailyDone ? "mt-3" : ""}`}>🔥 DAILY CHALLENGE</h3>
              {dailyDone && dailyResult ? (
                <>
                  <div className="mt-2 text-sm">
                    Score:{" "}
                    <span className="font-pixel text-primary">
                      {dailyResult.correct}/{dailyResult.total}
                    </span>{" "}
                    · {Math.round(dailyResult.timeMs / 1000)}s
                  </div>
                  <div className="mt-2 flex justify-center">
                    <PokeballPattern marks={dailyResult.pattern} />
                  </div>
                  <p className="mt-3 text-[10px] text-muted-foreground">Come back tomorrow for a new challenge.</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-xs text-muted-foreground">Same 10 hard questions for everyone today. One try only!</p>
                  <Button
                    size="lg"
                    className="mt-4 w-full rounded-full bg-poke-dark py-6 font-pixel text-[11px] text-poke-yellow"
                    onClick={onStartDaily}
                    disabled={loading}
                  >
                    <Flame className="mr-2 h-4 w-4" /> Take the Challenge
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Weekly League */}
        {weeklyLeague && (
          <div className="mt-4">
            {weeklyLeague.status === "won" || weeklyLeague.status === "lost" ? (
              <WeeklyLeagueResultCard weeklyLeague={weeklyLeague} nextWeekStart={weekRange.end} />
            ) : (
              <WeeklyLeagueCard
                weeklyLeague={weeklyLeague}
                onStart={onStartWeekly}
                resumeMode={weeklyLeague.status === "in_progress"}
                loading={loading}
              />
            )}
          </div>
        )}
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
  const [showInfo, setShowInfo] = useState(false);
  return (
    <div className="bg-elite-arena relative h-full w-full overflow-y-auto px-5 pb-nav pt-[calc(env(safe-area-inset-top)+1.5rem)] safe-x">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-poke-dark/40 via-transparent to-poke-dark/60" />
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex items-center justify-center gap-2 font-pixel text-[10px] tracking-widest text-poke-yellow"
      >
        <Crown className="h-3 w-3" /> ELITE FOUR CHALLENGE
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mx-auto mt-6 flex max-w-xs flex-col items-center text-center"
      >
        <div className="relative flex items-end justify-center gap-2">
          <div className="absolute inset-0 -m-4 rounded-full bg-poke-yellow/20 blur-2xl" />
          <img
            src={elite.trainerSpriteUrl}
            alt={elite.name}
            crossOrigin="anonymous"
            className="sprite relative h-40 w-40 object-contain drop-shadow-2xl"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <PokemonSprite id={elite.signaturePokemonId} alt={elite.signaturePokemonName} className="sprite relative h-28 w-28 object-contain drop-shadow-2xl" />
        </div>
        <p className="mt-3 font-pixel text-[10px] text-poke-yellow/80">{elite.title.toUpperCase()}</p>
        <h1 className="mt-1 font-pixel text-2xl text-poke-yellow">{elite.name}</h1>
        <p className="mt-1 text-xs text-poke-yellow/70">
          {elite.region} · {elite.type.toUpperCase()} specialist
        </p>
        <p className="mt-4 text-sm italic leading-relaxed text-poke-yellow/85">
          "{elite.quote}"
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="relative mx-auto mt-8 flex max-w-xs flex-col gap-3"
      >
        {loading ? (
          <Skeleton className="h-14 w-full rounded-full" />
        ) : (
          <Button
            size="lg"
            onClick={onStart}
            className="w-full rounded-full bg-poke-yellow py-6 font-pixel text-[11px] text-poke-dark shadow-pop hover:bg-poke-yellow/90"
          >
            <Crown className="mr-2 h-4 w-4" /> Challenge {elite.name}
          </Button>
        )}
        <button
          onClick={() => setShowInfo((v) => !v)}
          className="text-center font-pixel text-[10px] text-poke-yellow/70 underline-offset-4 hover:underline"
        >
          {showInfo ? "Hide info" : "More info"}
        </button>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="rounded-2xl bg-poke-dark/60 p-3 text-xs text-poke-yellow/80"
          >
            <p>200 HP boss battle. Themed trivia favors {elite.type.toUpperCase()}-type Pokémon. Victory unlocks rare rewards and the next region. Regular battles are locked until you win.</p>
          </motion.div>
        )}
        <p className="text-center font-pixel text-[9px] text-poke-yellow/50">
          Regular battles locked until victory.
        </p>
      </motion.div>
    </div>
  );
}
