import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PokemonSprite } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { playSfx, playCry } from "@/lib/audio";
import type { PokeEntry } from "@/lib/pokemon-data";

interface Props {
  from: PokeEntry;
  to: PokeEntry;
  onComplete: () => void;
}

type Phase = "intro" | "glow" | "morph" | "reveal" | "done";

export function EvolutionScreen({ from, to, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("intro");

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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-poke-dark/95 px-6 backdrop-blur">
      <AnimatePresence mode="wait">
        {phase === "intro" && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-center font-pixel text-base text-poke-yellow"
          >
            What? {from.name} is evolving!
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative mt-8 flex h-48 w-48 items-center justify-center">
        {/* Glow halo */}
        {(phase === "glow" || isMorphing) && (
          <motion.div
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: [0.8, 1.4, 1.0], opacity: [0.3, 0.95, 0.6] }}
            transition={{ duration: 2.5, repeat: Infinity }}
            className="absolute inset-0 rounded-full bg-gradient-to-br from-poke-yellow via-white to-primary blur-2xl"
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
            <div className="absolute inset-0 -m-4 rounded-full bg-poke-yellow/40 blur-xl" />
            <PokemonSprite id={to.id} alt={to.name} className="sprite relative h-40 w-40" />
          </motion.div>
        )}
      </div>

      {phase === "done" && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 w-full max-w-xs rounded-3xl bg-card/95 p-5 text-center shadow-pop"
        >
          <div className="font-pixel text-sm text-poke-dark">Congratulations!</div>
          <div className="mt-2 text-sm text-muted-foreground">
            Your {from.name} evolved into
          </div>
          <div className="mt-1 font-pixel text-lg text-primary">{to.name}!</div>
          <Button
            size="lg"
            onClick={onComplete}
            className="mt-5 w-full rounded-full bg-primary py-5 font-semibold shadow-pop"
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
        className="sprite-silhouette absolute inset-0 h-full w-full"
      />
    </div>
  );
}
