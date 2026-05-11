import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Trophy, Crown } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { AppHeader, XpBar, PokeballSpinner } from "@/components/game-ui";
import { rankForLevel, xpProgressInLevel, difficultyForLevel } from "@/lib/game-data";
import { spriteUrl } from "@/lib/pokemon-data";
import { trainerSpriteUrl } from "@/lib/game-data";
import { BattleScreen, type Trivia } from "@/components/battle-screen";
import { Toaster } from "@/components/ui/sonner";
import { nextPendingElite, type EliteMember } from "@/lib/elite-four";

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
  const [phase, setPhase] = useState<"home" | "loading" | "fighting" | "daily" | "elite">("home");
  const [questions, setQuestions] = useState<Trivia[]>([]);
  const [eliteOpponent, setEliteOpponent] = useState<EliteMember | null>(null);
  const [battleKey, setBattleKey] = useState(0);
  const autoStartedRef = useRef(false);
  const dailyResult = useGameStore((s) => s.dailyResult);
  const today = new Date().toISOString().slice(0, 10);
  const dailyDone = dailyResult?.date === today;

  const pendingElite = nextPendingElite(peakLevel, defeatedElites);

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
          seenSamples: seenQuestions.slice(-40),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited. Please wait a moment."); setPhase("home"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted. Add credits in Settings."); setPhase("home"); return; }
      const data = (await resp.json()) as { questions: Trivia[] };
      if (!data.questions || data.questions.length === 0) {
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
          seenSamples: seenQuestions.slice(-40),
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

  function exitBattle() {
    setPhase("home");
    setQuestions([]);
    setEliteOpponent(null);
    setBattleKey((k) => k + 1);
  }

  return (
    <>
      <Toaster position="top-center" />
      {phase === "fighting" ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} />
      ) : phase === "elite" && eliteOpponent ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="elite" eliteMember={eliteOpponent} />
      ) : phase === "daily" ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="daily" />
      ) : (
        <BattleHome
          onStart={startBattle}
          onStartDaily={startDaily}
          onStartElite={startElite}
          loading={phase === "loading"}
          dailyDone={dailyDone}
          dailyResult={dailyDone ? dailyResult : null}
          pendingElite={pendingElite}
        />
      )}
    </>
  );
}

function BattleHome({
  onStart,
  onStartDaily,
  onStartElite,
  loading,
  dailyDone,
  dailyResult,
  pendingElite,
}: {
  onStart: () => void;
  onStartDaily: () => void;
  onStartElite: () => void;
  loading: boolean;
  dailyDone: boolean;
  dailyResult: { correct: number; total: number; timeMs: number; pattern: string; date: string } | null;
  pendingElite: EliteMember | null;
}) {
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const stats = useGameStore((s) => s.stats);

  if (!pokemon) return null;

  const rank = rankForLevel(level);
  const xpProg = xpProgressInLevel(xp);

  return (
    <div className="bg-poke-hero min-h-screen">
      <AppHeader gradient>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <img
              src={trainerSpriteUrl(trainerSprite)}
              alt={trainerSprite}
              className="sprite h-12 w-12 object-contain"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
              }}
            />
            <div>
              <p className="font-pixel text-[10px] uppercase text-poke-dark/60">Trainer</p>
              <h1 className="font-pixel text-base text-poke-dark">{trainerName}</h1>
            </div>
          </div>
          <div className="rounded-full bg-poke-dark px-3 py-1 font-pixel text-[10px] text-poke-yellow">
            LV {level}
          </div>
        </div>
      </AppHeader>

      <div className="px-5 pt-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-3xl bg-card p-5 shadow-card"
        >
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 -m-2 rounded-full bg-gradient-to-br from-poke-yellow/40 to-primary/30 blur-xl" />
              <img
                src={spriteUrl(pokemon.id)}
                alt={pokemon.name}
                className="sprite relative h-28 w-28"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-pixel text-[10px] uppercase text-muted-foreground">{rank}</p>
              <h2 className="truncate text-xl font-bold">{pokemon.name}</h2>
              <p className="text-xs text-muted-foreground">Your starter — ready to battle</p>
              <div className="mt-2">
                <XpBar xp={xpProg.current} need={xpProg.need} />
              </div>
            </div>
          </div>
        </motion.div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <StatPill label="Battles" value={stats.battles} />
          <StatPill label="Wins" value={stats.wins} />
          <StatPill label="Streak" value={stats.bestStreak} />
        </div>

        {/* Elite Four challenge */}
        {pendingElite && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 overflow-hidden rounded-3xl border-2 border-poke-yellow bg-gradient-to-br from-poke-dark to-poke-dark/80 p-4 shadow-pop"
          >
            <div className="flex items-center gap-2 font-pixel text-[10px] text-poke-yellow">
              <Crown className="h-3 w-3" /> {pendingElite.title.toUpperCase()} CHALLENGE
            </div>
            <div className="mt-2 flex items-center gap-3">
              <img
                src={pendingElite.trainerSpriteUrl}
                alt={pendingElite.name}
                className="sprite h-16 w-16 object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
              />
              <div className="min-w-0 flex-1">
                <div className="font-pixel text-sm text-poke-yellow">{pendingElite.name}</div>
                <div className="text-[11px] text-poke-yellow/80">
                  {pendingElite.region} · {pendingElite.type.toUpperCase()} specialist
                </div>
                <div className="mt-1 line-clamp-2 text-[11px] italic text-poke-yellow/70">
                  "{pendingElite.quote}"
                </div>
              </div>
            </div>
            <Button
              size="sm"
              onClick={onStartElite}
              disabled={loading}
              className="mt-3 w-full rounded-full bg-poke-yellow text-poke-dark font-pixel text-[10px] hover:bg-poke-yellow/90"
            >
              <Crown className="mr-1 h-3 w-3" /> Challenge {pendingElite.name}
            </Button>
            <p className="mt-2 text-center text-[10px] text-poke-yellow/60">
              Regular battles locked until victory.
            </p>
          </motion.div>
        )}

        {/* Daily Challenge */}
        <div className="mt-4 rounded-3xl border-2 border-poke-yellow bg-card p-4 shadow-card">
          <div className="font-pixel text-[11px] text-poke-dark">🔥 TODAY'S CHALLENGE</div>
          {dailyDone && dailyResult ? (
            <>
              <div className="mt-2 text-sm">
                Score: <span className="font-pixel text-primary">{dailyResult.correct}/{dailyResult.total}</span> · {Math.round(dailyResult.timeMs / 1000)}s
              </div>
              <div className="mt-1 font-pixel text-base tracking-widest">{dailyResult.pattern}</div>
              <Button
                size="sm"
                variant="outline"
                className="mt-3 w-full rounded-full"
                onClick={async () => {
                  const text = `Pokémon Trivia · ${dailyResult.date}\n${dailyResult.correct}/${dailyResult.total} · ${Math.round(dailyResult.timeMs / 1000)}s\n${dailyResult.pattern}\nplay → poketrivia.app`;
                  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
                  if (nav.share) { try { await nav.share({ text }); return; } catch { /* fall */ } }
                  try { await navigator.clipboard.writeText(text); toast.success("Copied!"); } catch { toast.error("Couldn't copy."); }
                }}
              >
                Share Result
              </Button>
            </>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">10 hard questions. Same for everyone today.</p>
              <Button size="sm" className="mt-3 w-full rounded-full bg-poke-dark text-poke-yellow font-pixel text-[10px]" onClick={onStartDaily} disabled={loading}>
                Start Daily
              </Button>
            </>
          )}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 flex flex-col items-center rounded-3xl bg-card p-6 shadow-card"
        >
          <PokeballSpinner size={80} />
          <h3 className="mt-4 font-pixel text-sm text-foreground">
            {loading ? "Preparing battle..." : pendingElite ? "Elite blocks your path!" : "Ready to battle?"}
          </h3>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {loading
              ? "Loading trivia questions..."
              : pendingElite
                ? `Defeat ${pendingElite.name} to continue your journey.`
                : "A wild trainer is searching for an opponent..."}
          </p>
          <Button
            size="lg"
            onClick={onStart}
            disabled={loading || !!pendingElite}
            className="mt-5 w-full rounded-full bg-primary py-6 font-semibold shadow-pop hover:scale-[1.02] disabled:opacity-50"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? "Preparing..." : pendingElite ? "Locked — Elite Challenge" : "Find a Battle"}
          </Button>
        </motion.div>

        <div className="mt-6 rounded-2xl border-2 border-dashed border-border p-4 text-xs text-muted-foreground">
          <div className="mb-1 flex items-center gap-2 font-pixel text-[10px] uppercase text-foreground">
            <Trophy className="h-3 w-3" /> Tip
          </div>
          Use type advantage! When your Pokémon is super-effective vs the enemy, every correct
          answer deals double damage.
        </div>
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card px-3 py-2 text-center shadow-sm">
      <div className="font-pixel text-base text-primary">{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}
