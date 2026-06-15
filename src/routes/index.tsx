import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronLeft, Check } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { STARTING_PARTNERS, type PokeEntry } from "@/lib/pokemon-data";
import { getAbility } from "@/lib/abilities";
import { PokeballSpinner, TypeBadge, PokemonSprite } from "@/components/game-ui";
import { TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import pokemonLogo from "@/assets/pokemon-logo.png.asset.json";

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
    <div className="relative flex h-full w-full flex-col overflow-hidden safe-x">
      <AnimatePresence mode="wait">
        {step === "splash" ? (
          <motion.div
            key="splash"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="relative flex h-full w-full flex-col items-center overflow-hidden"
            style={{
              background:
                "radial-gradient(circle at 15% 12%, oklch(0.9 0.13 95 / 0.55) 0%, transparent 42%), radial-gradient(circle at 88% 90%, oklch(0.62 0.22 25 / 0.16) 0%, transparent 48%), linear-gradient(168deg, oklch(0.975 0.025 95) 0%, oklch(0.93 0.05 230) 100%)",
            }}
          >
            {/* decorative ring outlines */}
            <div className="pointer-events-none absolute -right-[120px] -top-20 h-80 w-80 rounded-full border-[26px] border-poke-dark/5" />
            <div className="pointer-events-none absolute right-3 top-[54px] h-[52px] w-[52px] rounded-full border-[12px] border-poke-dark/5" />
            <div className="pointer-events-none absolute -left-[90px] bottom-[90px] h-60 w-60 rounded-full border-[22px] border-poke-dark/5" />

            {/* hero block */}
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-7 pt-[calc(env(safe-area-inset-top)+2rem)] text-center">
              <PokeballEmblem />
              <img
                src={pokemonLogo.url}
                alt="Pokémon"
                className="mt-6 h-auto w-[168px] select-none"
                draggable={false}
              />
              <h1 className="mt-1 text-[2.625rem] font-black leading-none tracking-tight text-poke-dark">
                Trivia Battle
              </h1>
              <p className="mt-4 max-w-[17rem] text-[15px] leading-relaxed text-poke-dark/65">
                Battle trainers with your knowledge. Earn XP, climb leagues, fill your Pokédex.
              </p>

              <SpriteFloatRow />
            </div>
            </div>

            {/* buttons */}
            <div className="relative z-10 flex w-full flex-col gap-3 px-7 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-7">
              <Button
                size="lg"
                className="h-[58px] w-full rounded-full bg-primary text-[17px] font-bold text-primary-foreground shadow-pop active:scale-95"
                onClick={() => setStep("create")}
              >
                New Trainer
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-[58px] w-full rounded-full border-2 border-poke-dark/10 bg-card text-[17px] font-bold text-poke-dark active:scale-95"
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
            className="bg-poke-hero relative h-full w-full"
          >
            <TrainerCreate onBack={() => setStep("splash")} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PokeballEmblem() {
  return (
    <div className="relative h-[108px] w-[108px] overflow-hidden rounded-full border-[5px] border-poke-dark">
      <div className="absolute inset-x-0 top-0 h-1/2 bg-primary" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white" />
      <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 bg-poke-dark" />
      <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-poke-dark bg-white" />
    </div>
  );
}

type Step = "name" | "trainer" | "pokemon";
const STEPS: Step[] = ["name", "trainer", "pokemon"];

const TYPE_BG: Record<string, string> = {
  fire: "bg-orange-500",
  water: "bg-blue-500",
  grass: "bg-green-500",
  electric: "bg-yellow-400",
  normal: "bg-stone-400",
  ghost: "bg-purple-600",
  poison: "bg-fuchsia-600",
  psychic: "bg-pink-500",
  bug: "bg-lime-500",
  rock: "bg-yellow-700",
  ground: "bg-amber-600",
  fairy: "bg-pink-400",
  fighting: "bg-red-700",
  flying: "bg-sky-400",
  ice: "bg-cyan-400",
  dragon: "bg-indigo-600",
  dark: "bg-zinc-700",
  steel: "bg-slate-400",
};

const TRAINER_BLURBS: Record<string, { town: string; blurb: string }> = {
  red: { town: "Pallet Town", blurb: "The silent legend of Mt. Silver. Lets results do the talking." },
  lyra: { town: "New Bark Town", blurb: "A cheerful explorer with an eye for rare Pokémon." },
  ethan: { town: "New Bark Town", blurb: "Earnest and quick on his feet — a natural rival." },
  may: { town: "Littleroot Town", blurb: "Coordinator at heart, fierce in battle." },
  brendan: { town: "Littleroot Town", blurb: "A field researcher who battles with style." },
  dawn: { town: "Twinleaf Town", blurb: "Determined and graceful — always finds a way." },
};

function TrainerCreate({ onBack }: { onBack: () => void }) {
  const [substep, setSubstep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [trainerSprite, setTrainerSprite] = useState<string>("red");
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

  const trainerResults = useMemo(
    () => TRAINER_SPRITES.filter((t) => !brokenTrainerIds.has(t.id)).slice(0, 30),
    [brokenTrainerIds],
  );

  const stepIndex = STEPS.indexOf(substep);

  function start() {
    if (!name.trim() || !pick) return;
    setOnboarded(name.trim(), pick, trainerSprite);
    navigate({ to: "/battle" });
  }

  function goBack() {
    if (substep === "name") onBack();
    else setSubstep(STEPS[stepIndex - 1]);
  }

  const selectedTrainer = TRAINER_SPRITES.find((t) => t.id === trainerSprite);
  const trainerInfo =
    TRAINER_BLURBS[trainerSprite] ?? {
      town: "Unknown Town",
      blurb: `${selectedTrainer?.name ?? "This trainer"} is ready for the next battle.`,
    };

  return (
    <div className="flex h-full w-full flex-col px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-pop active:scale-95"
        >
          <ChevronLeft className="h-5 w-5 text-poke-dark" />
        </button>
        <span className="font-pixel text-xs uppercase tracking-wider text-poke-dark/70">
          Step {stepIndex + 1}/3
        </span>
      </div>

      {/* Progress segments */}
      <div className="mt-4 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full ${
              i <= stepIndex ? "bg-primary" : "bg-poke-dark/15"
            } ${i < stepIndex ? "opacity-60" : ""}`}
          />
        ))}
      </div>

      {/* Body */}
      <div className="mt-5 flex flex-1 flex-col overflow-y-auto">
        {substep === "name" && (
          <div className="flex flex-1 flex-col">
            <h2 className="text-center text-3xl font-extrabold leading-tight text-poke-dark">
              What should we call you?
            </h2>

            <div className="mt-6 flex flex-col items-center">
              <img
                src={trainerSpriteUrl(trainerSprite)}
                alt="trainer"
                className="sprite h-24 w-24 object-contain"
              />
              <div className="mt-3 w-full rounded-2xl bg-white p-4 text-center shadow-pop">
                <div className="font-pixel text-[11px] uppercase tracking-wider text-primary">
                  Prof. Oak
                </div>
                <p className="mt-1 text-sm text-poke-dark/80">
                  Welcome, challenger! Every great trainer's story starts with a name.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <label className="mb-2 block font-pixel text-[11px] uppercase tracking-wider text-poke-dark/70">
                Trainer name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ash"
                maxLength={16}
                className="h-14 rounded-full border-2 border-primary bg-white px-5 text-base font-semibold"
                autoFocus
              />
              <p className="mt-2 text-xs text-poke-dark/60">
                Max 16 characters · shown to opponents
              </p>
            </div>

            <div className="mt-auto pt-6">
              <Button
                size="lg"
                disabled={!name.trim()}
                onClick={() => setSubstep("trainer")}
                className="h-14 w-full rounded-full bg-primary text-base font-semibold shadow-pop active:scale-95 disabled:opacity-50"
              >
                Next: Choose Avatar
              </Button>
            </div>
          </div>
        )}

        {substep === "trainer" && (
          <div className="flex flex-1 flex-col">
            <h2 className="text-3xl font-extrabold leading-tight text-poke-dark">Pick your avatar</h2>
            <p className="mt-1 text-sm text-poke-dark/60">Tap a trainer to read their story.</p>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {trainerResults.slice(0, 6).map((t) => {
                const selected = trainerSprite === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTrainerSprite(t.id)}
                    className={`relative flex flex-col items-center rounded-2xl border-2 bg-white p-3 shadow-pop transition ${
                      selected ? "border-primary" : "border-transparent"
                    }`}
                  >
                    {selected && (
                      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    <img
                      src={trainerSpriteUrl(t.id)}
                      alt={t.name}
                      className="sprite h-16 w-16 object-contain"
                      loading="lazy"
                      onError={() =>
                        setBrokenTrainerIds((s) => { const n = new Set(s); n.add(t.id); return n; })
                      }
                    />
                    <span className="mt-1 truncate text-xs font-bold capitalize text-poke-dark">{t.name}</span>
                  </button>
                );
              })}
            </div>

            {selectedTrainer && (
              <div className="mt-5 flex gap-3 rounded-2xl bg-primary/10 p-3">
                <img
                  src={trainerSpriteUrl(selectedTrainer.id)}
                  alt={selectedTrainer.name}
                  className="sprite h-14 w-14 shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <div className="font-pixel text-[11px] uppercase tracking-wider text-primary">
                    {selectedTrainer.name} · {trainerInfo.town}
                  </div>
                  <p className="mt-1 text-sm italic leading-snug text-poke-dark/80">
                    &ldquo;{trainerInfo.blurb}&rdquo;
                  </p>
                </div>
              </div>
            )}

            <div className="mt-auto pt-6">
              <Button
                size="lg"
                onClick={() => setSubstep("pokemon")}
                className="h-14 w-full rounded-full bg-primary text-base font-semibold shadow-pop active:scale-95"
              >
                Next: Choose Pokémon
              </Button>
            </div>
          </div>
        )}

        {substep === "pokemon" && (
          <div className="flex flex-1 flex-col">
            <h2 className="text-3xl font-extrabold leading-tight text-poke-dark">Choose your partner</h2>
            <p className="mt-1 text-sm text-poke-dark/60">Your partner's type grants a battle ability.</p>

            <div className="relative mt-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-poke-dark/50" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="h-12 rounded-full border-0 bg-white pl-11 text-sm shadow-pop"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {results.slice(0, 6).map((p) => {
                const selected = pick?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPick(p)}
                    className={`relative flex flex-col items-center rounded-2xl border-2 bg-white p-3 shadow-pop transition ${
                      selected ? "border-primary" : "border-transparent"
                    }`}
                  >
                    {selected && (
                      <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    <PokemonSprite id={p.id} alt={p.name} className="sprite h-14 w-14" />
                    <span className="mt-1 truncate text-xs font-bold text-poke-dark">{p.name}</span>
                    <div className="mt-1">
                      <TypeBadge type={p.types[0]} size="sm" />
                    </div>
                  </button>
                );
              })}
            </div>

            {pick && (() => {
              const ability = getAbility(pick.types);
              return (
                <div className="mt-5 flex items-center gap-3 rounded-2xl bg-primary/10 p-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow ${TYPE_BG[ability.type] ?? "bg-primary"}`}>
                    <span className="text-lg">●</span>
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-poke-dark">{ability.name} ability</div>
                    <p className="text-xs leading-snug text-poke-dark/70">{ability.description}</p>
                  </div>
                </div>
              );
            })()}

            <div className="mt-auto pt-6">
              <Button
                size="lg"
                disabled={!pick}
                onClick={start}
                className="h-14 w-full rounded-full bg-primary text-base font-semibold shadow-pop active:scale-95 disabled:opacity-50"
              >
                Start Adventure
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
