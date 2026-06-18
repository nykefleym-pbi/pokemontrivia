import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PokemonSprite } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import { playSfx, playCry } from "@/lib/audio";
import type { PokeEntry } from "@/lib/pokemon-data";
import { useGameStore } from "@/lib/store";
import { trainerSpriteUrl, rankForLevel } from "@/lib/game-data";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";

interface Props {
  from: PokeEntry;
  to: PokeEntry;
  onComplete: () => void;
}

type Phase = "intro" | "glow" | "morph" | "reveal" | "done";

export function EvolutionScreen({ from, to, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");
  const [shareOpen, setShareOpen] = useState(false);
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const level = useGameStore((s) => s.level);
  const stats = useGameStore((s) => s.stats);

  const shareData: ShareData = {
    type: "evolution",
    trainerName: trainerName || "Trainer",
    trainerSpriteUrl: trainerSpriteUrl(trainerSprite),
    fromPokemonId: from.id,
    fromName: from.name,
    toPokemonId: to.id,
    toName: to.name,
    toShiny: false,
    level,
    rank: rankForLevel(level),
    statBattles: stats.battles,
    statWins: stats.wins,
    statLosses: stats.losses,
    statBestStreak: stats.bestStreak,
    statCorrect: stats.correct,
    statAnswered: stats.answered,
    statTotalAnswerTime: stats.totalAnswerTime,
    dateISO: new Date().toISOString().slice(0, 10),
  };

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(
      setTimeout(() => {
        setPhase("glow");
        // ascending arpeggio
        playSfx("evolution_glow");
        timers.push(setTimeout(() => playSfx("evolution_glow"), 200));
        timers.push(setTimeout(() => playSfx("evolution_glow"), 400));
        timers.push(setTimeout(() => playSfx("evolution_glow"), 600));
      }, 1000),
    );
    timers.push(setTimeout(() => setPhase("morph"), 2000));
    timers.push(
      setTimeout(() => {
        setPhase("reveal");
        playSfx("evolution_complete");
        playCry(to.id);
      }, 4500),
    );
    timers.push(setTimeout(() => setPhase("done"), 5500));
    return () => timers.forEach(clearTimeout);
  }, [to.id]);

  const showFrom = phase === "intro" || phase === "glow";
  const isMorphing = phase === "morph";
  const showTo = phase === "reveal" || phase === "done";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center px-6"
      style={{
        background:
          "radial-gradient(circle at center, var(--color-poke-blue) 0%, var(--color-poke-dark) 75%)",
      }}
    >
      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center"
          >
            <div className="font-pixel-xs uppercase tracking-wide text-poke-yellow/80">
              Evolution
            </div>
            <div className="mt-1 font-display-md text-poke-yellow">
              What? <span className="italic">{from.name} is evolving!</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative mt-8 flex h-48 w-48 items-center justify-center">
        {(phase === "glow" || isMorphing) && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.8, 1.5, 1.0], opacity: [0.3, 1, 0.7] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-gradient-to-br from-white via-poke-yellow to-poke-yellow blur-3xl"
          />
        )}

        {showFrom && (
          <PokemonSprite
            id={from.id}
            alt={from.name}
            className="sprite relative h-40 w-40"
          />
        )}
        {isMorphing && <MorphAnimation fromId={from.id} toId={to.id} />}
        {showTo && (
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 120 }}
            className="relative"
          >
            <div className="absolute inset-0 -m-4 rounded-full bg-poke-yellow/50 blur-2xl" />
            <PokemonSprite id={to.id} alt={to.name} className="sprite relative h-40 w-40" />
          </motion.div>
        )}
      </div>

      {phase === "done" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 w-full max-w-xs rounded-3xl bg-card p-5 text-center shadow-pop"
        >
          <div className="inline-flex rounded-full bg-poke-yellow/40 px-2.5 py-0.5 font-pixel-xs uppercase text-foreground">
            Evolution Complete
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Your {from.name} evolved into
          </div>
          <div className="mt-1 font-display-lg text-primary">{to.name}!</div>
          <Button
            size="lg"
            onClick={onComplete}
            className="mt-5 h-12 w-full rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
          >
            Continue
          </Button>
        </motion.div>
      )}
    </div>
  );
}

function MorphAnimation({ fromId, toId }: { fromId: number; toId: number }) {
  const [showFrom, setShowFrom] = useState(true);
  useEffect(() => {
    const interval = setInterval(() => setShowFrom((v) => !v), 250);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="relative h-40 w-40">
      <PokemonSprite
        id={showFrom ? fromId : toId}
        alt="evolving"
        className="sprite-evolve-silhouette absolute inset-0 h-full w-full"
      />
    </div>
  );
}
