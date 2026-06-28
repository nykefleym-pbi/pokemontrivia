import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronLeft, Check } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { STARTING_PARTNERS, type PokeEntry } from "@/lib/pokemon-data";
import { getAbility } from "@/lib/abilities";
import { TypeBadge, PokemonSprite } from "@/components/game-ui";
import { TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
import { trainerQuote } from "@/lib/trainer-quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import pokemonLogo from "@/assets/pokemon-logo.png.asset.json";
import {
  bootstrapSocial,
  isTrainerNameAvailable,
  claimTrainerName,
  syncProfile,
} from "@/lib/social";
import { validateTrainerName, claimErrorMessage, TRAINER_NAME_MAX } from "@/lib/trainer-name";

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
              <h1 className="mt-1 text-[2.625rem] font-black leading-none tracking-tight text-foreground">
                Trivia Battle
              </h1>
              <p className="mt-4 max-w-[17rem] text-[15px] leading-relaxed text-foreground/65">
                Battle trainers with your knowledge. Earn XP, climb leagues, fill your Pokédex.
              </p>

              <SpriteFloatRow />
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
                className="h-[58px] w-full rounded-full border-2 border-poke-dark/10 bg-card text-[17px] font-bold text-foreground active:scale-95"
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
            className="relative h-full w-full"
            style={{
              background:
                "radial-gradient(circle at 15% 12%, oklch(0.9 0.13 95 / 0.55) 0%, transparent 42%), radial-gradient(circle at 88% 90%, oklch(0.62 0.22 25 / 0.16) 0%, transparent 48%), linear-gradient(168deg, oklch(0.975 0.025 95) 0%, oklch(0.93 0.05 230) 100%)",
            }}
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
    <motion.div
      className="relative h-[108px] w-[108px] overflow-hidden rounded-full border-[5px] border-poke-dark"
      animate={{ rotate: [0, 0, 360, 360] }}
      transition={{
        duration: 6,
        times: [0, 0.4, 0.7, 1],
        ease: "easeInOut",
        repeat: Infinity,
      }}
    >
      <div className="absolute inset-x-0 top-0 h-1/2 bg-primary" />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-white" />
      <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 bg-poke-dark" />
      <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[5px] border-poke-dark bg-white" />
    </motion.div>
  );
}

function SpriteFloatRow() {
  const bubbles = useMemo(
    () =>
      [1, 4, 7, 25].map((id, i) => ({
        id,
        baseY: i % 2 === 1 ? -12 : 0,
        amp: 6 + Math.random() * 8,
        drift: (Math.random() * 2 - 1) * 3,
        duration: 2.4 + Math.random() * 1.6,
        delay: Math.random() * 1.2,
      })),
    [],
  );
  return (
    <div className="mt-7 flex items-center justify-center gap-3.5">
      {bubbles.map((b) => (
        <motion.div
          key={b.id}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-card shadow-card"
          animate={{
            y: [b.baseY, b.baseY - b.amp, b.baseY + b.amp * 0.4, b.baseY],
            x: [0, b.drift, -b.drift, 0],
          }}
          transition={{
            duration: b.duration,
            delay: b.delay,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "mirror",
          }}
        >
          <PokemonSprite id={b.id} className="sprite h-[54px] w-[54px]" />
        </motion.div>
      ))}
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

function TrainerCreate({ onBack }: { onBack: () => void }) {
  const [substep, setSubstep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [trainerSprite, setTrainerSprite] = useState<string>("red");
  const [query, setQuery] = useState("");
  const [trainerQuery, setTrainerQuery] = useState("");
  const [pick, setPick] = useState<PokeEntry | null>(null);
  const [brokenTrainerIds, setBrokenTrainerIds] = useState<Set<string>>(new Set());
  const setOnboarded = useGameStore((s) => s.setOnboarded);
  const navigate = useNavigate();

  // Trainer-name claim flow state
  const [nameAvail, setNameAvail] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [nameMsg, setNameMsg] = useState<string>("");
  const [claimedName, setClaimedName] = useState<string>("");
  const [claiming, setClaiming] = useState(false);

  // Kick off the social bootstrap as soon as the create flow opens so the
  // anonymous session + empty profile row exist by the time we try to claim.
  useEffect(() => {
    void bootstrapSocial();
  }, []);

  // Debounced availability check as the user types.
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      setNameAvail("idle");
      setNameMsg("");
      return;
    }
    const v = validateTrainerName(name);
    if (!v.ok) {
      setNameAvail("invalid");
      setNameMsg(claimErrorMessage(v.error));
      return;
    }
    if (claimedName && v.name.toLowerCase() === claimedName.toLowerCase()) {
      setNameAvail("available");
      setNameMsg("Name available");
      return;
    }
    setNameAvail("checking");
    setNameMsg("Checking…");
    const t = window.setTimeout(async () => {
      const ok = await isTrainerNameAvailable(v.name);
      // Stale-response guard: only commit if the input hasn't changed.
      if (name.trim() !== v.name) return;
      if (ok) {
        setNameAvail("available");
        setNameMsg("Name available");
      } else {
        setNameAvail("taken");
        setNameMsg(claimErrorMessage("taken"));
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [name, claimedName]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STARTING_PARTNERS.filter((p) => (q ? p.name.toLowerCase().startsWith(q) : true)).slice(
      0,
      24,
    );
  }, [query]);

  const trainerResults = useMemo(() => {
    const all = TRAINER_SPRITES.filter((t) => !brokenTrainerIds.has(t.id))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
    const q = trainerQuery.trim().toLowerCase();
    if (!q) return all.slice(0, 9);
    return all.filter((t) => t.name.toLowerCase().startsWith(q));
  }, [brokenTrainerIds, trainerQuery]);

  const stepIndex = STEPS.indexOf(substep);

  async function handleNameNext() {
    const v = validateTrainerName(name);
    if (!v.ok) {
      setNameAvail("invalid");
      setNameMsg(claimErrorMessage(v.error));
      return;
    }
    // Re-claim if the name changed since the last successful claim.
    if (claimedName.toLowerCase() !== v.name.toLowerCase()) {
      setClaiming(true);
      try {
        // Make sure the profile row exists before attempting to claim.
        await bootstrapSocial();
        const res = await claimTrainerName(v.name);
        if (!res.ok) {
          if (res.error === "taken") setNameAvail("taken");
          else if (res.error === "length" || res.error === "chars") setNameAvail("invalid");
          else setNameAvail("idle");
          setNameMsg(claimErrorMessage(res.error));
          return;
        }
        setClaimedName(v.name);
        setNameAvail("available");
        setNameMsg("Name reserved ✓");
      } finally {
        setClaiming(false);
      }
    }
    setSubstep("trainer");
  }

  function start() {
    if (!claimedName || !pick) return;
    setOnboarded(claimedName, pick, trainerSprite);
    useGameStore.getState().setNameReconciled(true);
    void syncProfile();
    navigate({ to: "/battle" });
  }

  function goBack() {
    if (substep === "name") onBack();
    else setSubstep(STEPS[stepIndex - 1]);
  }

  const selectedTrainer = TRAINER_SPRITES.find((t) => t.id === trainerSprite);

  return (
    <div className="flex h-full w-full flex-col px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={goBack}
          aria-label="Back"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-pop active:scale-95"
        >
          <ChevronLeft className="h-5 w-5 text-foreground" />
        </button>
        <span className="font-pixel text-xs uppercase tracking-wider text-foreground/70">
          Step {stepIndex + 1}/3
        </span>
      </div>

      {/* Progress segments */}
      <div className="mt-[18px] flex items-center gap-1.5">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-[6px] flex-1 rounded-full ${
              i <= stepIndex ? "bg-primary" : "bg-poke-dark/15"
            } ${i < stepIndex ? "opacity-60" : ""}`}
          />
        ))}
      </div>

      {/* Body */}
      <div className="mt-5 flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
        {substep === "name" && (
          <div className="flex flex-1 flex-col">
            <h2 className="text-center text-[30px] font-extrabold leading-tight tracking-tight text-foreground">
              What should we call you?
            </h2>

            <div className="mt-[18px] flex flex-col items-center">
              <img
                src={trainerSpriteUrl("oak")}
                alt="Professor Oak"
                className="sprite h-[132px] w-[132px] object-contain"
              />
              <div className="relative -mt-1.5 w-full rounded-2xl bg-card px-[18px] py-3.5 text-center shadow-card">
                <div className="absolute left-1/2 top-[-7px] h-3.5 w-3.5 -translate-x-1/2 rotate-45 bg-card" />
                <div className="relative font-pixel text-[10px] uppercase tracking-wider text-primary">
                  Prof. Oak
                </div>
                <p className="relative mt-1.5 text-sm leading-snug text-foreground/80">
                  Welcome, challenger! Every great trainer's story starts with a name.
                </p>
              </div>
            </div>

            <div className="mt-[18px]">
              <label className="mb-2 block font-pixel text-[10px] uppercase tracking-wider text-foreground/55">
                Trainer name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ash"
                maxLength={TRAINER_NAME_MAX}
                className="h-[54px] rounded-full border-[2.5px] border-primary bg-card px-5 text-[17px] font-bold"
                autoFocus
              />
              <p
                className={`mt-2 text-xs ${
                  nameAvail === "available"
                    ? "text-green-600"
                    : nameAvail === "taken" || nameAvail === "invalid"
                      ? "text-red-600"
                      : "text-foreground/55"
                }`}
              >
                {nameMsg || "3–16 characters · letters, numbers, spaces, _ and -"}
              </p>
            </div>

            <div className="mt-auto px-1 pb-2 pt-6">
              <Button
                size="lg"
                disabled={
                  claiming ||
                  nameAvail === "checking" ||
                  nameAvail === "taken" ||
                  nameAvail === "invalid" ||
                  !name.trim()
                }
                onClick={() => void handleNameNext()}
                className="h-[58px] w-full rounded-full bg-primary text-[17px] font-bold shadow-pop active:scale-95 disabled:opacity-50"
              >
                {claiming ? "Reserving…" : "Next: Choose Avatar"}
              </Button>
            </div>
          </div>
        )}

        {substep === "trainer" && (
          <div className="flex flex-1 flex-col">
            <h2 className="text-[30px] font-extrabold leading-tight tracking-tight text-foreground">
              Pick your avatar
            </h2>
            <p className="mt-1.5 text-sm text-foreground/60">Tap a trainer to read their story.</p>

            <div className="relative mt-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
              <Input
                value={trainerQuery}
                onChange={(e) => setTrainerQuery(e.target.value)}
                placeholder="Search trainers..."
                className="h-12 rounded-full border-0 bg-card pl-11 text-sm shadow-pop"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {trainerResults.map((t) => {
                const selected = trainerSprite === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTrainerSprite(t.id)}
                    className={`relative flex flex-col items-center gap-1 rounded-[20px] bg-card px-1.5 py-2.5 shadow-pop transition ${
                      selected ? "border-[2.5px] border-primary" : "border-2 border-transparent"
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-primary text-white shadow">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    )}
                    <img
                      src={trainerSpriteUrl(t.id)}
                      alt={t.name}
                      className="sprite h-16 w-16 object-contain"
                      loading="lazy"
                      onError={() =>
                        setBrokenTrainerIds((s) => {
                          const n = new Set(s);
                          n.add(t.id);
                          return n;
                        })
                      }
                    />
                    <span className="truncate text-[13px] font-bold capitalize text-foreground">
                      {t.name}
                    </span>
                  </button>
                );
              })}
              {trainerResults.length === 0 && (
                <div className="col-span-3 py-4 text-center text-sm text-foreground/60">
                  No trainers match &ldquo;{trainerQuery}&rdquo;.
                </div>
              )}
            </div>

            {selectedTrainer && (
              <div className="mt-3.5 flex items-center gap-3.5 rounded-[20px] border-[1.5px] border-primary/25 bg-primary/[0.07] p-3.5">
                <img
                  src={trainerSpriteUrl(selectedTrainer.id)}
                  alt={selectedTrainer.name}
                  className="sprite h-[58px] w-[58px] shrink-0 object-contain"
                />
                <div className="min-w-0">
                  <div className="font-pixel text-[10px] uppercase tracking-wider text-primary">
                    {selectedTrainer.name}
                  </div>
                  <p className="mt-1.5 text-sm italic leading-snug text-foreground/80">
                    {trainerQuote(selectedTrainer.id, selectedTrainer.name)}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-auto px-1 pb-2 pt-6">
              <Button
                size="lg"
                onClick={() => setSubstep("pokemon")}
                className="h-[58px] w-full rounded-full bg-primary text-[17px] font-bold shadow-pop active:scale-95"
              >
                Next: Choose Pokémon
              </Button>
            </div>
          </div>
        )}

        {substep === "pokemon" && (
          <div className="flex flex-1 flex-col">
            <h2 className="text-3xl font-extrabold leading-tight text-foreground">
              Choose your partner
            </h2>
            <p className="mt-1 text-sm text-foreground/60">
              Your partner's type grants a battle ability.
            </p>

            <div className="relative mt-4">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/50" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search..."
                className="h-12 rounded-full border-0 bg-card pl-11 text-sm shadow-pop"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {results.slice(0, 6).map((p) => {
                const selected = pick?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPick(p)}
                    className={`relative flex flex-col items-center rounded-2xl border-2 bg-card p-3 shadow-card transition ${
                      selected ? "border-primary" : "border-transparent"
                    }`}
                  >
                    {selected && (
                      <span className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-white shadow">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                    )}
                    <PokemonSprite id={p.id} alt={p.name} className="sprite h-[76px] w-[76px]" />
                    <span className="mt-1 truncate text-xs font-bold text-foreground">
                      {p.name}
                    </span>
                    <div className="mt-1">
                      <TypeBadge type={p.types[0]} size="sm" />
                    </div>
                  </button>
                );
              })}
            </div>

            {pick &&
              (() => {
                const ability = getAbility(pick.types);
                return (
                  <div className="mt-5 flex items-center gap-3 rounded-2xl bg-primary/10 p-3">
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white shadow ${TYPE_BG[ability.type] ?? "bg-primary"}`}
                    >
                      <span className="text-lg">●</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-foreground">{ability.name}</div>
                      <p className="text-xs leading-snug text-foreground/70">
                        {ability.description}
                      </p>
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
