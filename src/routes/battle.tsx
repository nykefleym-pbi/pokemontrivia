import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Trophy } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { AppHeader, XpBar, PokeballSpinner } from "@/components/game-ui";
import { rankForLevel, xpProgressInLevel, difficultyForLevel } from "@/lib/game-data";
import { spriteUrl } from "@/lib/pokemon-data";
import { trainerSpriteUrl } from "@/lib/game-data";
import { BattleScreen, type Trivia } from "@/components/battle-screen";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/battle")({
  component: BattlePage,
});

function BattlePage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const level = useGameStore((s) => s.level);
  const seenHashes = useGameStore((s) => s.seenQuestionHashes);
  const seenQuestions = useGameStore((s) => s.seenQuestions);
  const markQuestionsSeen = useGameStore((s) => s.markQuestionsSeen);
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"home" | "loading" | "fighting">("home");
  const [questions, setQuestions] = useState<Trivia[]>([]);
  const [battleKey, setBattleKey] = useState(0);

  useEffect(() => {
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  if (!hasOnboarded) return null;

  async function startBattle() {
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
      if (resp.status === 429) {
        toast.error("Rate limited. Please wait a moment.");
        setPhase("home");
        return;
      }
      if (resp.status === 402) {
        toast.error("AI credits exhausted. Add credits in Settings.");
        setPhase("home");
        return;
      }
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

  function exitBattle() {
    setPhase("home");
    setQuestions([]);
    setBattleKey((k) => k + 1);
  }

  return (
    <>
      <Toaster position="top-center" />
      {phase === "fighting" ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} />
      ) : (
        <BattleHome onStart={startBattle} loading={phase === "loading"} />
      )}
    </>
  );
}

function BattleHome({ onStart, loading }: { onStart: () => void; loading: boolean }) {
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

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6 flex flex-col items-center rounded-3xl bg-card p-6 shadow-card"
        >
          <PokeballSpinner size={80} />
          <h3 className="mt-4 font-pixel text-sm text-foreground">
            {loading ? "Preparing battle..." : "Ready to battle?"}
          </h3>
          <p className="mt-1 text-center text-sm text-muted-foreground">
            {loading
              ? "Loading 20 unique trivia questions..."
              : "A wild trainer is searching for an opponent..."}
          </p>
          <Button
            size="lg"
            onClick={onStart}
            disabled={loading}
            className="mt-5 w-full rounded-full bg-primary py-6 font-semibold shadow-pop hover:scale-[1.02] disabled:opacity-60"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading ? "Preparing..." : "Find a Battle"}
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
