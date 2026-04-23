import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { searchPokemon, spriteUrl, type PokeEntry } from "@/lib/pokemon-data";
import { PokeballSpinner, TypeBadge } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/")({
  component: SplashPage,
});

function SplashPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const [step, setStep] = useState<"splash" | "create">("splash");

  useEffect(() => {
    if (hasOnboarded) {
      navigate({ to: "/battle" });
    }
  }, [hasOnboarded, navigate]);

  if (hasOnboarded) return null;

  return (
    <div className="bg-poke-hero relative min-h-screen overflow-hidden">
      {/* decorative pokeballs */}
      <div className="pointer-events-none absolute -right-10 -top-10 opacity-30">
        <PokeballSpinner size={140} />
      </div>
      <div className="pointer-events-none absolute -bottom-12 -left-10 opacity-20">
        <PokeballSpinner size={180} />
      </div>

      <AnimatePresence mode="wait">
        {step === "splash" ? (
          <motion.div
            key="splash"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center"
          >
            <PokeballSpinner size={120} />
            <h1 className="mt-8 font-pixel text-2xl leading-relaxed text-poke-dark">
              POKéMON<br />TRIVIA<br />BATTLE
            </h1>
            <p className="mt-5 max-w-xs text-sm text-poke-dark/70">
              Battle gym leaders & champions with your knowledge. Earn XP, level up, collect items.
            </p>
            <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
              <Button
                size="lg"
                className="rounded-full bg-primary py-6 font-semibold shadow-pop hover:scale-105"
                onClick={() => setStep("create")}
              >
                New Trainer
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-full border-2 py-6 font-semibold"
                onClick={() => setStep("create")}
              >
                Guest Mode
              </Button>
            </div>
            <p className="mt-8 font-pixel text-[9px] text-poke-dark/50">v1.0 · GEN I</p>
          </motion.div>
        ) : (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative min-h-screen px-6 pb-20 pt-[calc(env(safe-area-inset-top)+2rem)]"
          >
            <TrainerCreate onBack={() => setStep("splash")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TrainerCreate({ onBack }: { onBack: () => void }) {
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<PokeEntry | null>(null);
  const setOnboarded = useGameStore((s) => s.setOnboarded);
  const navigate = useNavigate();

  const results = useMemo(() => searchPokemon(query, 9), [query]);

  const canStart = name.trim().length > 0 && pick !== null;

  function start() {
    if (!canStart || !pick) return;
    setOnboarded(name.trim(), pick);
    navigate({ to: "/battle" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button onClick={onBack} className="text-sm text-poke-dark/60 hover:text-poke-dark">
          ← back
        </button>
        <h2 className="mt-2 font-pixel text-lg text-poke-dark">Create Trainer</h2>
        <p className="text-sm text-poke-dark/70">Pick your name and starter Pokémon.</p>
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-poke-dark/70">
          Trainer name
        </label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Ash"
          maxLength={16}
          className="rounded-2xl border-2 bg-white/80 text-base"
        />
      </div>

      <div>
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-poke-dark/70">
          Choose your Pokémon
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Gen I..."
            className="rounded-2xl border-2 bg-white/80 pl-10 text-base"
          />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          {results.map((p) => {
            const selected = pick?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setPick(p)}
                className={`flex flex-col items-center rounded-2xl border-2 bg-white/90 p-2 transition ${
                  selected
                    ? "border-primary shadow-pop scale-105"
                    : "border-transparent hover:border-poke-dark/20"
                }`}
              >
                <img
                  src={spriteUrl(p.id)}
                  alt={p.name}
                  className="sprite h-16 w-16"
                  loading="lazy"
                />
                <span className="mt-1 truncate text-[11px] font-semibold">{p.name}</span>
                <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                  {p.types.map((t) => (
                    <TypeBadge key={t} type={t} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        size="lg"
        disabled={!canStart}
        onClick={start}
        className="mt-2 rounded-full bg-primary py-6 font-semibold shadow-pop disabled:opacity-50"
      >
        Begin Adventure!
      </Button>
    </div>
  );
}
