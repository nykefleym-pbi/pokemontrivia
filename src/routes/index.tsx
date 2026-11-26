import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Check, Sparkles } from "lucide-react";
import { useGameStore } from "@/lib/store";
import {
  STARTING_PARTNERS,
  getEvolutionTargets,
  type PokeEntry,
} from "@/lib/pokemon-data";
import { matchesPartnerSearch } from "@/lib/partner-filter";
import { getAbilityById, rollAbilityId } from "@/lib/abilities";
import { PokemonSprite } from "@/components/game-ui";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON } from "@/lib/app-icons";
import { NaButton } from "@/components/na/button";
import { NaTypeChip } from "@/components/na/type-chip";
import { setPendingReferral } from "@/lib/pending-referral";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/")({
  head: () => pageHead("/"),
  component: SplashPage,
  validateSearch: (s: Record<string, unknown>): { ref?: string } =>
    typeof s.ref === "string" ? { ref: s.ref } : {},
});

/*
 * The first session, as the Figma flow "First session" draws it:
 *   1.1 Landing (Play now) -> 1.2 Pick a partner -> the first battle, as a guest
 *   -> 1.5 first win -> 1.6 save a trainer name (SaveProgressSheet).
 * Play first, name later (decision 5, option 1). An invite link skips the
 * landing and keeps its code until the name is saved (flow "Invite link").
 */
function SplashPage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const { ref: refCode } = Route.useSearch();
  const [step, setStep] = useState<"landing" | "partner">(refCode ? "partner" : "landing");
  // Set when the partner picker starts the first battle itself. Without it the
  // redirect below — which fires the moment the guest session marks the player
  // onboarded — replaced that navigation with Home (autostart=0), so "Let's go"
  // (and the old "Play as Guest") landed on the hub instead of in a battle.
  const startingBattle = useRef(false);

  useEffect(() => {
    if (refCode) setPendingReferral(refCode);
  }, [refCode]);

  useEffect(() => {
    if (hasOnboarded && !startingBattle.current) {
      navigate({ to: "/battle", search: { autostart: 0 } as never });
    }
  }, [hasOnboarded, navigate]);

  if (hasOnboarded) return null;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden">
      <AnimatePresence mode="wait">
        {step === "landing" ? (
          <motion.div
            key="landing"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="h-full w-full"
          >
            <Landing onPlay={() => setStep("partner")} />
          </motion.div>
        ) : (
          <motion.div
            key="partner"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="h-full w-full"
          >
            <PartnerPicker
              referred={Boolean(refCode)}
              onStart={() => {
                startingBattle.current = true;
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** 1.1 Landing: see it, then play. */
function Landing({ onPlay }: { onPlay: () => void }) {
  return (
    <div className="flex h-full w-full flex-col items-center gap-3.5 overflow-y-auto px-5 pb-6 screen-top screen-bottom">
      <h1 className="shrink-0">
        <AppIcon src={UI_ICON.appLogo} alt="Pokémon Trivia Battle" className="w-[230px]" eager />
      </h1>
      {/* The battle clip: a question, a right answer, a hit, the combo, a miss
          and a knockout, then the logo. Muted and looping; the poster is its
          first frame, so a phone that blocks autoplay still shows a battle. */}
      <div className="na-glow-gold relative aspect-[7/6] max-h-[38vh] w-full max-w-[350px] shrink-0 overflow-hidden rounded-3xl border-[1.5px] border-reward-gold/60">
        <video
          className="h-full w-full object-cover"
          src="/onboarding/battle-preview.mp4"
          poster="/onboarding/battle-preview-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="A battle: answer right to attack, combos hit harder, and a knockout wins"
        />
      </div>
      <p className="na-title w-[250px] text-center text-foreground">
        Prove your Pokémon knowledge in battle!
      </p>
      <p className="na-body text-center text-text-secondary">
        Answer trivia, defeat trainers, catch Pokémon, and build your team!
      </p>
      <div className="flex-1" />
      <NaButton block onClick={onPlay}>
        Play now
      </NaButton>
      <p className="na-caption text-center text-text-muted">No sign-up required!</p>
    </div>
  );
}

/** The three great first picks (1.2): the Kanto starters, in dex order. */
const FIRST_PICK_IDS = [1, 4, 7];

/** "Grows into Ivysaur, then Venusaur" (Figma 1.2); branches read "A or B". */
function evolutionLine(p: PokeEntry): string {
  const stages: string[] = [];
  let cur: PokeEntry | undefined = p;
  for (let i = 0; i < 3 && cur; i++) {
    const next = getEvolutionTargets(cur);
    if (next.length === 0) break;
    stages.push(next.map((n) => n.name).join(" or "));
    cur = next.length === 1 ? next[0] : undefined;
  }
  if (stages.length === 0) return "Fully grown: ready to battle!";
  return `Grows into ${stages.join(", then ")}`;
}

/** "gets back 2 HP…": the ability's own line, read on from its name. */
const afterColon = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** 1.2 Pick a partner. */
function PartnerPicker({ referred, onStart }: { referred: boolean; onStart: () => void }) {
  const navigate = useNavigate();
  const firstPicks = useMemo(
    () =>
      FIRST_PICK_IDS.map((id) => STARTING_PARTNERS.find((p) => p.id === id)).filter(
        (p): p is PokeEntry => Boolean(p),
      ),
    [],
  );
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState<PokeEntry | null>(firstPicks[0] ?? null);
  // Rolled once per selection, so the ability shown is the one the partner gets.
  const abilityId = useMemo(() => (pick ? rollAbilityId(pick.types) : null), [pick]);
  const ability = getAbilityById(abilityId);

  const list = useMemo(
    () =>
      query.trim()
        ? STARTING_PARTNERS.filter((p) => matchesPartnerSearch(p, query)).slice(0, 9)
        : firstPicks,
    [query, firstPicks],
  );

  function choose() {
    if (!pick) return;
    onStart();
    useGameStore.getState().startGuestSession(pick, abilityId ?? undefined);
    track("onboard_play_first", { starter: pick.name, referred });
    navigate({ to: "/battle", search: { autostart: 1 } as never });
  }

  return (
    <div className="flex h-full w-full flex-col px-4 pb-4 screen-top screen-bottom">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pt-3">
        <h1 className="na-display-m text-foreground">Choose your partner</h1>
        <p className="na-body text-text-secondary">
          Your adventure starts here! Battle trainers and help your Pokémon evolve.
        </p>
        {!query.trim() && <p className="na-label text-text-secondary">Great first picks</p>}

        {list.map((p) => {
          const on = pick?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setPick(p)}
              aria-pressed={on}
              className={`flex w-full flex-col gap-2.5 rounded-[20px] bg-white/[0.08] p-3.5 text-left transition-[border-color,box-shadow] ${
                on ? "na-glow-brand border-[2.5px] border-primary" : "border border-white/[0.12]"
              }`}
            >
              <div className="flex w-full items-center gap-3">
                {/* PokéAPI sprites carry wide transparent margins; Figma uses the
                    sprite cropped to the Pokémon, so scale it to fill the 80pt tile. */}
                <div className="flex h-20 w-20 shrink-0 items-center justify-center">
                  <PokemonSprite id={p.id} alt={p.name} className="sprite h-[76px] w-[76px] scale-[1.6]" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="na-display-s truncate text-foreground">{p.name}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {p.types.map((t) => (
                      <NaTypeChip key={t} type={t} />
                    ))}
                  </div>
                </div>
                {on && (
                  <span className="na-fill-brand flex h-7 w-7 shrink-0 items-center justify-center rounded-[14px]">
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  </span>
                )}
              </div>
              {on && (
                <>
                  <span className="na-caption text-text-secondary">{evolutionLine(p)}</span>
                  {ability && (
                    <span className="flex items-start gap-1.5">
                      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                      <span className="na-caption text-foreground">
                        {ability.name}: {afterColon(ability.description)}
                      </span>
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
        {list.length === 0 && (
          <p className="na-body py-4 text-center text-text-secondary">
            No partners match that search.
          </p>
        )}

        <label className="flex h-12 w-full shrink-0 items-center gap-2.5 rounded-[14px] border border-white/[0.12] bg-white/[0.08] px-3.5">
          <Search className="h-5 w-5 shrink-0 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find your Pokémon…"
            aria-label="Find your Pokémon"
            className="na-body w-full bg-transparent text-foreground outline-none placeholder:text-text-muted"
          />
        </label>
      </div>

      <NaButton block className="mt-4 shrink-0" disabled={!pick} onClick={choose}>
        {pick ? `Let's go, ${pick.name}!` : "Choose a partner"}
      </NaButton>
    </div>
  );
}
