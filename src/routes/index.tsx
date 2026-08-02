import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ChevronLeft } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { STARTING_PARTNERS, type PokeEntry } from "@/lib/pokemon-data";
import { matchesPartnerSearch } from "@/lib/partner-filter";
import { toast } from "sonner";
import { getAbilityById, rollAbilityId } from "@/lib/abilities";
import { TypeBadge, PokeballSpinner, PokemonSprite } from "@/components/game-ui";
import { TRAINER_SPRITES, trainerSpriteUrl } from "@/lib/game-data";
import { trainerQuote } from "@/lib/trainer-quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  bootstrapSocial,
  isTrainerNameAvailable,
  claimTrainerName,
  claimReferral,
  syncProfile,
} from "@/lib/social";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON } from "@/lib/app-icons";
import { rollReferralReward } from "@/lib/referral-rewards";
import { validateTrainerName, claimErrorMessage, TRAINER_NAME_MAX } from "@/lib/trainer-name";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  component: SplashPage,
  validateSearch: (s: Record<string, unknown>): { ref?: string } =>
    typeof s.ref === "string" ? { ref: s.ref } : {},
});

function SplashPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const { ref: refCode } = Route.useSearch();
  // Arriving via a referral link — jump straight into trainer creation
  // instead of making them pick "New Trainer" vs "Play as Guest" first,
  // since only creating a named trainer earns the referral reward and the
  // whole point of the link is "come play," not "consider your options."
  const [step, setStep] = useState<"splash" | "create">(refCode ? "create" : "splash");

  useEffect(() => {
    if (hasOnboarded) {
      navigate({ to: "/battle", search: { autostart: 0 } as never });
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
            {/* Backdrop Pokéballs. These were plain ring outlines, which read as
                generic circles on a screen whose whole job is to say what game
                this is. Same component and the same low opacity that Home's
                "Up for a battle?" card already uses for its backdrop ball, so
                the two screens share one decorative language. */}
            <div className="pointer-events-none absolute -right-[120px] -top-20 opacity-[0.07]">
              <PokeballSpinner size={320} />
            </div>
            <div className="pointer-events-none absolute right-3 top-[54px] opacity-[0.07]">
              <PokeballSpinner size={52} />
            </div>
            <div className="pointer-events-none absolute -left-[90px] bottom-[90px] opacity-[0.07]">
              <PokeballSpinner size={240} />
            </div>

            {/* hero block */}
            <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-7 pt-[calc(env(safe-area-inset-top)+2rem)] text-center">
              <h1 className="mt-6">
                <AppIcon
                  src={UI_ICON.appLogo}
                  alt="Pokémon Trivia Battle"
                  className="w-[224px]"
                  eager
                />
              </h1>
              <p className="mt-4 max-w-[17rem] text-[15px] leading-relaxed text-foreground/65">
                Battle trainers with your knowledge. Earn XP, climb leagues, fill your Pokédex.
              </p>

              <SpriteFloatRow />
            </div>

            {/* buttons */}
            <div className="relative z-10 flex w-full flex-col gap-3 px-7 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-7">
              <Button
                size="action"
                className="w-full border-2 border-white bg-primary text-primary-foreground shadow-card press"
                onClick={() => setStep("create")}
              >
                New Trainer
              </Button>
              <Button
                size="action"
                variant="outline"
                className="w-full border-2 border-white bg-card text-foreground shadow-card press"
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
            <TrainerCreate onBack={() => setStep("splash")} refCode={refCode} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
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

/**
 * The primary CTA on all three onboarding steps.
 *
 * `shadow-pop` is a red drop glow (`--shadow-pop` is oklch red at 45% alpha).
 * On a red button it reads as a halo bleeding outwards rather than as
 * elevation, and every surface in this flow was wearing it — the avatar tiles
 * and the search fields too — which is what made all three screens look washed
 * pink. A white rim gives the same raised read against the cream gradient
 * without tinting what is behind it, and matches the rim Home's Start Battle
 * already uses.
 */
const ONBOARD_CTA = "w-full border-2 border-white bg-primary shadow-card press disabled:opacity-50";

function TrainerCreate({ onBack, refCode }: { onBack: () => void; refCode?: string }) {
  const [substep, setSubstep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [trainerSprite, setTrainerSprite] = useState<string>("red");
  const [query, setQuery] = useState("");
  const [trainerQuery, setTrainerQuery] = useState("");
  const [pick, setPick] = useState<PokeEntry | null>(null);
  // Rolled once per selection (not re-rolled on every render) so the ability
  // previewed here is the exact one `setOnboarded` grants below — no showing
  // three "possible" abilities and then silently handing out a different one.
  const previewAbilityId = useMemo(() => (pick ? rollAbilityId(pick.types) : null), [pick]);
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

  const results = useMemo(
    () => STARTING_PARTNERS.filter((p) => matchesPartnerSearch(p, query)).slice(0, 24),
    [query],
  );

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
          // Hard-block only on legitimate name rejections.
          if (res.error === "taken") {
            setNameAvail("taken");
            setNameMsg(claimErrorMessage(res.error));
            return;
          }
          if (res.error === "length" || res.error === "chars") {
            setNameAvail("invalid");
            setNameMsg(claimErrorMessage(res.error));
            return;
          }
          // Backend unreachable (e.g. "network"): don't block play. Reserve the
          // name locally and let reconcileTrainerName retry once it's back.
          setClaimedName(v.name);
          setNameAvail("available");
          setNameMsg("Name reserved (will sync when online)");
          setSubstep("trainer");
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
    setOnboarded(claimedName, pick, trainerSprite, previewAbilityId ?? undefined);
    useGameStore.getState().setNameReconciled(true);
    track("onboard_complete", { starter: pick.name, referred: Boolean(refCode) });
    const rolled = getAbilityById(useGameStore.getState().abilityId);
    if (rolled) toast.success(`${pick.name} has the ${rolled.name} ability!`);
    void syncProfile().then(async () => {
      if (!refCode) return;
      const res = await claimReferral(refCode);
      if (res.ok) {
        const reward = rollReferralReward();
        useGameStore.getState().addCoins(reward.coins);
        useGameStore.getState().grantPokeEgg(reward.eggs);
        for (const it of reward.items) useGameStore.getState().grantItem(it.id, it.qty);
        toast.success(
          `Referral bonus! +${reward.coins} coins, +${reward.eggs} Poké Egg, +${reward.items.length} items!`,
        );
      }
    });
    navigate({ to: "/battle", search: { autostart: 0 } as never });
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
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card shadow-card press"
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
                // 3px, not 2.5px. A fractional border width on a `rounded-full`
                // box makes the browser round each side independently, and the
                // seam shows up as a notch chipped out of the pill's left cap
                // where the two arc halves meet. Whole pixels, no chip.
                className="h-[54px] rounded-full border-[3px] border-primary bg-card px-5 text-[17px] font-bold"
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
                size="action"
                disabled={
                  claiming ||
                  nameAvail === "checking" ||
                  nameAvail === "taken" ||
                  nameAvail === "invalid" ||
                  !name.trim()
                }
                onClick={() => void handleNameNext()}
                className={ONBOARD_CTA}
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
                className="h-12 rounded-full border-0 bg-card pl-11 text-sm shadow-card"
              />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {trainerResults.map((t) => {
                const selected = trainerSprite === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTrainerSprite(t.id)}
                    className={`press relative flex flex-col items-center gap-1 rounded-[20px] border-[3px] bg-card px-1.5 py-2.5 shadow-card ${
                      selected ? "border-primary" : "border-transparent"
                    }`}
                  >
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
              <div className="mt-3.5 flex items-center gap-3.5 rounded-[20px] border-2 border-primary/25 bg-primary/[0.07] p-3.5">
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
              <Button size="action" onClick={() => setSubstep("pokemon")} className={ONBOARD_CTA}>
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
                placeholder="Search by name or type..."
                className="h-12 rounded-full border-0 bg-card pl-11 text-sm shadow-card"
              />
            </div>

            {/* No type-chip row. Typing a type into the box above already
                filters by it (`matchesPartnerSearch` matches names AND types),
                so the chips were a second control for something the search box
                does — and they cost the row of height that was pushing Start
                Adventure below the fold. Profile's partner picker keeps them;
                it has the room. */}

            {/* 9 rather than the old 6: with a type searched, two rows made a
                well-stocked type look nearly empty.

                Cards are deliberately short. At a 76px sprite plus a name plus
                a type badge, three rows plus the ability panel ran past the
                bottom of a 390×844 screen and buried the only button that
                finishes onboarding. */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {results.slice(0, 9).map((p) => {
                const selected = pick?.id === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPick(p)}
                    className={`press relative flex flex-col items-center rounded-2xl border-2 bg-card px-2 py-1.5 shadow-card ${
                      selected ? "border-primary" : "border-transparent"
                    }`}
                  >
                    <PokemonSprite id={p.id} alt={p.name} className="sprite h-[54px] w-[54px]" />
                    <span className="max-w-full truncate text-[11px] font-bold text-foreground">
                      {p.name}
                    </span>
                    <div className="mt-0.5">
                      <TypeBadge type={p.types[0]} size="sm" />
                    </div>
                  </button>
                );
              })}
              {results.length === 0 && (
                <div className="col-span-3 py-4 text-center text-sm text-foreground/60">
                  No partners match that search.
                </div>
              )}
            </div>

            {/* The ability the pick would roll. Only the "Its ability" caption
                is gone — the panel itself is the payoff for choosing this
                partner over another, and it fills the gap that shortening the
                cards opened above the button. The badge replaces a plain
                coloured dot so the type is named, and takes its colour from
                game-ui's shared map instead of a second copy of it. */}
            {pick &&
              (() => {
                const ability = getAbilityById(previewAbilityId);
                if (!ability) return null;
                return (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl bg-primary/10 p-3">
                    <TypeBadge type={ability.type} size="sm" />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-foreground">{ability.name}</div>
                      <p className="text-xs leading-snug text-foreground/70">
                        {ability.description}
                      </p>
                    </div>
                  </div>
                );
              })()}

            <div className="mt-auto pt-5">
              <Button size="action" disabled={!pick} onClick={start} className={ONBOARD_CTA}>
                Start Adventure
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
