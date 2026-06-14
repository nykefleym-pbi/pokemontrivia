import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { STARTING_PARTNERS, type PokeEntry } from "@/lib/pokemon-data";
import { getAbility } from "@/lib/abilities";
import { PokeballSpinner, TypeBadge, PokemonSprite } from "@/components/game-ui";
import { TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
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
    <div className="bg-poke-hero relative flex h-full w-full flex-col overflow-hidden safe-x">
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
            className="relative flex h-full w-full flex-col items-center justify-between overflow-y-auto px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] text-center"
          >
            <div className="flex w-full flex-col items-center">
              <PokeballSpinner size={110} spinning />
              <img
                src={pokemonLogo.url}
                alt="Pokémon"
                className="mt-6 h-auto w-48 select-none"
                draggable={false}
              />
              <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-poke-dark">
                Trivia Battle
              </h1>
              <p className="mt-3 max-w-xs text-sm text-poke-dark/70">
                Battle trainers with your knowledge. Earn XP, climb leagues, fill your Pokédex.
              </p>

              <div className="mt-7 flex items-center justify-center gap-3">
                {[1, 4, 7, 25].map((id, i) => (
                  <motion.div
                    key={id}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-pop ring-1 ring-poke-dark/10"
                    animate={{ y: [0, -10, 0] }}
                    transition={{
                      duration: 1.6,
                      repeat: Infinity,
                      ease: "easeInOut",
                      delay: i * 0.4,
                    }}
                  >
                    <PokemonSprite id={id} className="sprite h-12 w-12" />
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
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
                className="rounded-full border-2 bg-white py-6 font-semibold"
                onClick={() => {
                  useGameStore.getState().startGuestSession();
                  navigate({ to: "/battle", search: { autostart: 1 } as never });
                }}
              >
                Play as Guest
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="create"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative h-full w-full overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-[calc(env(safe-area-inset-top)+2rem)]"
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
  const [brokenTrainerIds, setBrokenTrainerIds] = useState<Set<string>>(new Set());
  const setOnboarded = useGameStore((s) => s.setOnboarded);
  const navigate = useNavigate();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STARTING_PARTNERS
      .filter((p) => (q ? p.name.toLowerCase().startsWith(q) : true))
      .slice(0, 24);
  }, [query]);
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    const pool = TRAINER_SPRITES.filter((t) => !brokenTrainerIds.has(t.id));
    if (!q) return pool.slice(0, 30);
    return pool.filter((t) => t.name.toLowerCase().startsWith(q)).slice(0, 60);
  }, [trainerQuery, brokenTrainerIds]);

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
            {trainerResults.map((t) => {
              const selected = trainerSprite === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTrainerSprite(t.id)}
                  className={`flex flex-col items-center rounded-2xl border-2 bg-white/90 p-2 transition ${
                    selected
                      ? "border-primary shadow-pop scale-105"
                      : "border-transparent hover:border-poke-dark/20"
                  }`}
                >
                  <img
                    src={trainerSpriteUrl(t.id)}
                    alt={t.name}
                    className="sprite h-20 w-20 object-contain"
                    loading="lazy"
                    onError={() =>
                      setBrokenTrainerIds((s) => { const n = new Set(s); n.add(t.id); return n; })
                    }
                  />
                  <span className="mt-1 truncate text-[11px] font-semibold capitalize">{t.name}</span>
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

            <div className="mt-4 grid max-h-[55vh] grid-cols-3 gap-2 overflow-y-auto pr-1">
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
                    <PokemonSprite
                      id={p.id}
                      alt={p.name}
                      className="sprite h-16 w-16"
                    />
                    <span className="mt-1 truncate text-[11px] font-semibold">{p.name}</span>
                    <div className="mt-1 flex flex-wrap justify-center gap-0.5">
                      {p.types.map((t) => (
                        <TypeBadge key={t} type={t} size="sm" />
                      ))}
                    </div>
                    <div className="font-pixel text-[8px] text-primary">⚡ {getAbility(p.types).name}</div>
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
            Start Adventure
          </Button>
        </div>
      )}
    </div>
  );
}
