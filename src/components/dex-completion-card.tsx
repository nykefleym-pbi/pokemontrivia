import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, Eye, Sparkles } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { MiniPokeball } from "@/components/game-ui";
import { COIN_ICON, LOCK_ICON, REWARD_ICON, TP_ICON } from "@/lib/app-icons";
import { playSfx } from "@/lib/audio";
import {
  DEX_MILESTONES,
  DEX_MILESTONE_REWARDS,
  claimDexReward,
  dexMilestoneState,
  dexStats,
  generation,
  nextClaimableMilestone,
  type DexMilestone,
  type DexMilestoneState,
  type DexRewardIcon,
} from "@/lib/dex-rewards";
import { useGameStore } from "@/lib/store";

/** How long a face is shown before the card turns over. */
const FLIP_EVERY_MS = 6000;
/**
 * How long a tap holds the card still.
 *
 * Turning the card away from a button someone is reaching for is the one way
 * this feature can be actively annoying, so any deliberate interaction buys a
 * pause long enough to read the face and act on it.
 */
const HOLD_AFTER_TAP_MS = 15000;

const REWARD_ART: Record<DexRewardIcon, string> = {
  coins: COIN_ICON,
  xp: REWARD_ICON.xp,
  tp: TP_ICON,
  chest: REWARD_ICON.premium,
};

/**
 * One rung of the ladder — and, once it unlocks, the control that claims it.
 *
 * Sized off the viewport rather than fixed: four rungs plus their labels have to
 * fit the width of a 320px phone with room to spare at the ends for the track's
 * inset.
 *
 * There is no separate Claim button any more. A button that is disabled most of
 * the time still costs its width all of the time, and it pointed at a reward
 * that was already on screen; tapping the reward itself says the same thing
 * with nothing added to the row.
 *
 * A claimable rung is the only one that reacts to a tap, so it is the only one
 * that advertises: it grows, glows and pulses. Locked and claimed rungs stay
 * inert on purpose — an affordance nobody can act on is a worse lie than no
 * affordance at all.
 *
 * `role="button"` on a span rather than a real <button>, because this sits
 * inside the card's own flip button and nested buttons are invalid HTML.
 */
function Milestone({
  milestone,
  state,
  onClaim,
}: {
  milestone: DexMilestone;
  state: DexMilestoneState;
  onClaim: () => void;
}) {
  const reward = DEX_MILESTONE_REWARDS[milestone];
  const claimable = state === "claimable";
  const claim = (e: React.SyntheticEvent) => {
    if (!claimable) return;
    // The tap must claim WITHOUT also turning the card over.
    e.stopPropagation();
    onClaim();
  };
  return (
    <div className="flex flex-col items-center gap-0.5">
      {/* Fixed-height slot sized to the LARGEST rung, so the claimable one can
          grow without shunting its own threshold label below the other three. */}
      <span className="flex h-[clamp(26px,8.2vw,34px)] items-center justify-center">
        <span
          role={claimable ? "button" : undefined}
          tabIndex={claimable ? 0 : undefined}
          aria-label={claimable ? `Claim the ${milestone}% reward` : undefined}
          onClick={claim}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            claim(e);
          }}
          className={`relative flex items-center justify-center rounded-full bg-white shadow-card ring-2 ${
            claimable
              ? "press h-[clamp(26px,8.2vw,34px)] w-[clamp(26px,8.2vw,34px)] animate-pulse ring-poke-yellow ring-offset-2 ring-offset-primary"
              : `h-[clamp(22px,7vw,30px)] w-[clamp(22px,7vw,30px)] ${
                  state === "claimed" ? "ring-hp-good" : "ring-white/45"
                }`
          }`}
        >
          {/* A locked rung shows the padlock OVER a dimmed glyph rather than
            hiding what it pays — the ladder is the reason to keep filling the
            generation, so it has to be legible from the first percent. */}
          <AppIcon
            src={REWARD_ART[reward.icon]}
            className={`h-[78%] w-[78%] ${state === "locked" ? "opacity-30" : ""}`}
          />
          {state === "locked" && (
            <AppIcon src={LOCK_ICON} className="absolute h-3 w-3 opacity-90" />
          )}
          {state === "claimed" && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-hp-good ring-2 ring-primary">
              <Check className="h-2 w-2 text-white" strokeWidth={4} />
            </span>
          )}
        </span>
      </span>
      {/* On the red face the threshold is white — the old foreground greys were
          tuned for a card background and vanish against the primary fill. */}
      <span
        className={`text-[8px] font-bold leading-none tabular-nums ${
          state === "locked" ? "text-white/55" : "text-white"
        }`}
      >
        {milestone}%
      </span>
    </div>
  );
}

/** One count on the back face. Icon and number only — no caption. */
function StatTile({
  value,
  tone,
  icon,
  label,
}: {
  value: number;
  tone: string;
  icon: React.ReactNode;
  /** Screen readers only: the icons carry the meaning visually. */
  label: string;
}) {
  return (
    <div
      className="flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-white/70 py-2"
      aria-label={`${label}: ${value}`}
    >
      {icon}
      <span className={`text-[16px] font-extrabold leading-none tabular-nums ${tone}`}>
        {value}
      </span>
    </div>
  );
}

/**
 * Per-generation completion and its four reward rungs, with the
 * caught/seen/shiny/total counts on the back, turned to every few seconds.
 *
 * The front is one red band: a single centred line naming the region and its
 * percentage, over a progress bar whose rungs ARE the rewards. There is no
 * Claim button — an unlocked rung is claimed by tapping it, which is what lets
 * the card be a line and a bar rather than three columns fighting for a phone's
 * width.
 *
 * Reactive to the Pokedex's generation filter: switching to Johto retitles this
 * "Johto Completion" and repoints every number and every rung at that
 * generation's ladder. That is why `gen` is a prop rather than internal state.
 */
export function DexCompletionCard({ gen }: { gen: number }) {
  const pokedex = useGameStore((s) => s.pokedex);
  const claimed = useGameStore((s) => s.claimedDexRewards);
  const { region } = generation(gen);

  const stats = useMemo(() => dexStats(pokedex, gen), [pokedex, gen]);
  const claimedList = useMemo(() => claimed ?? [], [claimed]);
  const claimable = nextClaimableMilestone(stats, gen, claimedList);

  const [flipped, setFlipped] = useState(false);
  // Timestamp until which the auto-flip is suspended by a tap, and whether a
  // rung is currently claimable. Refs, not state: the interval reads them and
  // must not be torn down and rebuilt every time either changes — an interval
  // that restarts on each render never reaches its own delay.
  const holdUntil = useRef(0);
  const claimablePending = useRef(false);
  claimablePending.current = claimable !== null;

  useEffect(() => {
    const id = setInterval(() => {
      // Both guards live INSIDE the tick. Checking "is anything claimable" in a
      // separate effect keyed on `claimable` is not enough: that effect runs
      // once when the value changes and the interval then turns the card over
      // anyway a few seconds later, which is exactly what it was meant to stop.
      if (claimablePending.current) return;
      if (Date.now() < holdUntil.current) return;
      setFlipped((f) => !f);
    }, FLIP_EVERY_MS);
    return () => clearInterval(id);
  }, []);

  // Switching generation resets to the rewards face, so the title, the bar and
  // the visible face all describe the same region on the first frame.
  useEffect(() => {
    setFlipped(false);
  }, [gen]);

  // Turn back at once if a rung becomes claimable while the stats are showing.
  useEffect(() => {
    if (claimable !== null) setFlipped(false);
  }, [claimable]);

  const pct = Math.round(stats.pct * 1000) / 10;

  const onClaim = (milestone: DexMilestone) => {
    hold();
    const res = claimDexReward(gen, milestone, useGameStore.getState());
    if (!res) return;
    playSfx("claim_reward");
    toast.success(`${region} ${milestone}% complete`, {
      description: res.text,
      duration: 4000,
    });
  };

  const hold = () => {
    holdUntil.current = Date.now() + HOLD_AFTER_TAP_MS;
  };

  const faceCls =
    "press-card flex h-full w-full items-center gap-1.5 rounded-2xl border-2 border-white p-2 text-left shadow-card";

  return (
    <div className="flip-card h-[96px] w-full">
      <div className="flip-card-inner" data-flipped={flipped}>
        {/* Front — the whole face is the completion bar. */}
        <div className="flip-face">
          <button
            type="button"
            onClick={() => {
              hold();
              setFlipped(true);
            }}
            aria-label={`${region} completion — show caught, seen and shiny counts`}
            className={`${faceCls} flex-col gap-1.5 bg-gradient-to-br from-primary to-primary/80 px-2.5`}
          >
            {/* Title and percentage on ONE centred line. Stacked they read as
                two facts; side by side they read as the one sentence they are.
                With the Claim button gone there is width to spare for it. */}
            <div className="flex w-full items-center justify-center gap-1.5">
              <MiniPokeball className="h-4 w-4 shrink-0" />
              <span className="truncate text-[9px] font-bold uppercase leading-none tracking-wide text-white/85">
                {region} Completion
              </span>
              <span className="text-[15px] font-extrabold leading-none tabular-nums text-white">
                {pct}%
              </span>
            </div>

            {/* The reward rungs ARE the progress bar.
             *
             * They used to be a separate strip crammed into a middle column
             * beside the pill, which is what made the row feel crowded — three
             * elements each fighting for a third of a phone's width. Laid along
             * the track they cost no extra width at all, and the bar gains a
             * meaning it did not have: the fill physically reaches a rung at
             * the moment that rung unlocks.
             *
             * That only holds because the track is INSET by half a rung at each
             * end and every position is measured across the inset span. Placing
             * a rung at a naive `left: 25%` would put its centre a half-rung to
             * the left of where the fill says 25% is, and the 100% rung would
             * hang off the card entirely. */}
            <div
              className="relative w-full"
              style={{ "--rung": "clamp(22px, 7vw, 30px)" } as React.CSSProperties}
            >
              <div
                className="absolute inset-x-[calc(var(--rung)/2)] h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-black/30"
                style={{ top: "calc(var(--rung) / 2)" }}
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-500"
                  style={{ width: `${Math.min(100, stats.pct * 100)}%` }}
                />
              </div>
              {DEX_MILESTONES.map((m) => (
                <div
                  key={m}
                  className="absolute top-0 -translate-x-1/2"
                  style={{ left: `calc(var(--rung) / 2 + ${m / 100} * (100% - var(--rung)))` }}
                >
                  <Milestone
                    milestone={m}
                    state={dexMilestoneState(m, stats, gen, claimedList)}
                    onClaim={() => onClaim(m)}
                  />
                </div>
              ))}
              {/* Reserves the row's height: the rungs above are absolute and so
                  contribute none of their own. */}
              <div className="h-[calc(var(--rung)+12px)]" aria-hidden />
            </div>
          </button>
        </div>

        {/* Back — the counts, icons only. Deliberately NOT red: it is a
            different kind of information, and the colour change is what makes
            the turn legible at a glance. */}
        <div className="flip-face flip-face-back">
          <button
            type="button"
            onClick={() => {
              hold();
              setFlipped(false);
            }}
            aria-label={`${region} counts — show completion rewards`}
            className={`${faceCls} bg-card`}
          >
            <div className="grid w-full grid-cols-4 gap-1.5">
              <StatTile
                label="Caught"
                value={stats.caught}
                tone="text-hp-good"
                icon={<MiniPokeball className="h-5 w-5" />}
              />
              <StatTile
                label="Seen"
                value={stats.seen}
                tone="text-foreground/70"
                icon={<Eye className="h-5 w-5 text-foreground/45" />}
              />
              <StatTile
                label="Shiny"
                value={stats.shiny}
                tone="text-poke-yellow"
                icon={<Sparkles className="h-5 w-5 text-poke-yellow" />}
              />
              <StatTile
                label="Total in this generation"
                value={stats.total}
                tone="text-foreground"
                icon={<BookOpen className="h-5 w-5 text-primary" />}
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
