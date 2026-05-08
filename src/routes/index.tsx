import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { searchPokemon, spriteUrl, type PokeEntry } from "@/lib/pokemon-data";
import { TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
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
                onClick={() => {
                  useGameStore.getState().startGuestSession();
                  navigate({ to: "/battle", search: { autostart: 1 } as never });
                }}
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

type Step = "name" | "trainer" | "pokemon";

function TrainerCreate({ onBack }: { onBack: () => void }) {
  const [substep, setSubstep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [trainerSprite, setTrainerSprite] = useState<string>("red");
  const [trainerQuery, setTrainerQuery] = useState("");
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<PokeEntry | null>(null);
  const setOnboarded = useGameStore((s) => s.setOnboarded);
  const navigate = useNavigate();

  const results = useMemo(() => searchPokemon(query, 9), [query]);
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    if (!q) return TRAINER_SPRITES.slice(0, 9);
    return TRAINER_SPRITES.filter((id) => id.toLowerCase().includes(q)).slice(0, 30);
  }, [trainerQuery]);

  function start() {
    if (!name.trim() || !pick) return;
    setOnboarded(name.trim(), pick, trainerSprite);
    navigate({ to: "/battle" });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <button
          onClick={substep === "name" ? onBack : () => setSubstep(substep === "trainer" ? "name" : "trainer")}
          className="text-sm text-poke-dark/60 hover:text-poke-dark"
        >
          ← back
        </button>
        <h2 className="mt-2 font-pixel text-lg text-poke-dark">Create Trainer</h2>
        <div className="mt-2 flex items-center gap-2">
          {(["name", "trainer", "pokemon"] as Step[]).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full ${
                substep === s
                  ? "bg-primary"
                  : i < (["name", "trainer", "pokemon"] as Step[]).indexOf(substep)
                    ? "bg-primary/40"
                    : "bg-poke-dark/15"
              }`}
            />
          ))}
        </div>
      </div>

      {substep === "name" && (
        <div className="flex flex-col gap-4">
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
              autoFocus
            />
          </div>
          <Button
            size="lg"
            disabled={!name.trim()}
            onClick={() => setSubstep("trainer")}
            className="rounded-full bg-primary py-6 font-semibold shadow-pop disabled:opacity-50"
          >
            Next: Choose Avatar
          </Button>
        </div>
      )}

      {substep === "trainer" && (
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-poke-dark/70">
              Pick your trainer avatar
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={trainerQuery}
                onChange={(e) => setTrainerQuery(e.target.value)}
                placeholder="Search trainers..."
                className="rounded-2xl border-2 bg-white/80 pl-10 text-base"
              />
            </div>
          </div>
          <div className="grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
            {trainerResults.map((id) => {
              const selected = trainerSprite === id;
              return (
                <button
                  key={id}
                  onClick={() => setTrainerSprite(id)}
                  className={`flex flex-col items-center rounded-2xl border-2 bg-white/90 p-2 transition ${
                    selected
                      ? "border-primary shadow-pop scale-105"
                      : "border-transparent hover:border-poke-dark/20"
                  }`}
                >
                  <img
                    src={trainerSpriteUrl(id)}
                    alt={id}
                    className="sprite h-20 w-20 object-contain"
                    loading="lazy"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.opacity = "0.3";
                    }}
                  />
                  <span className="mt-1 truncate text-[11px] font-semibold capitalize">{id}</span>
                </button>
              );
            })}
          </div>
          <Button
            size="lg"
            onClick={() => setSubstep("pokemon")}
            className="rounded-full bg-primary py-6 font-semibold shadow-pop"
          >
            Next: Choose Pokémon
          </Button>
        </div>
      )}

      {substep === "pokemon" && (
        <div className="flex flex-col gap-4">
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
            disabled={!pick}
            onClick={start}
            className="rounded-full bg-primary py-6 font-semibold shadow-pop disabled:opacity-50"
          >
            Begin Adventure!
          </Button>
        </div>
      )}
    </div>
  );
}
