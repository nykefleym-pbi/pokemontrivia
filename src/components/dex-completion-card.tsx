import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Eye, Sparkles } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { MiniPokeball, PokeballSpinner } from "@/components/game-ui";
import { COIN_ICON, LOCK_ICON, REWARD_ICON } from "@/lib/app-icons";
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

function MilestoneGlyph({ icon, size = 30 }: { icon: DexRewardIcon; size?: number }) {
  if (icon === "poke") return <PokeballSpinner size={size} variant="poke" />;
  if (icon === "master") return <PokeballSpinner size={size} variant="master" />;
  const src = icon === "coins" ? COIN_ICON : REWARD_ICON.premium;
  return <AppIcon src={src} className="h-full w-full" style={{ width: size, height: size }} />;
}

function Milestone({
  milestone,
  state,
  size = 30,
}: {
  milestone: DexMilestone;
  state: DexMilestoneState;
  size?: number;
}) {
  const reward = DEX_MILESTONE_REWARDS[milestone];
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <div
        className={`relative flex items-center justify-center rounded-full bg-white shadow-card ring-2 ${
          state === "claimed"
            ? "ring-hp-good"
            : state === "claimable"
              ? "ring-poke-yellow"
              : "ring-black/5"
        }`}
        style={{ width: size + 12, height: size + 12 }}
      >
        {/* A locked rung shows the padlock over a dimmed glyph rather than
            hiding what it pays — the ladder is the reason to keep filling the
            generation, so it has to be legible from the first percent. */}
        <div className={state === "locked" ? "opacity-35" : ""}>
          <MilestoneGlyph icon={reward.icon} size={size} />
        </div>
        {state === "locked" && (
          <AppIcon src={LOCK_ICON} className="absolute h-3.5 w-3.5 opacity-80" />
        )}
        {state === "claimed" && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-hp-good ring-2 ring-card">
            <Check className="h-2.5 w-2.5 text-white" strokeWidth={4} />
          </span>
        )}
      </div>
      <span
        className={`font-pixel text-[7px] leading-none ${
          state === "locked" ? "text-foreground/35" : "text-foreground/70"
        }`}
      >
        {milestone}%
      </span>
    </div>
  );
}

function StatTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-center rounded-xl bg-white/70 py-1.5">
      <div className="flex items-center gap-1">
        {icon}
        <span className={`text-[17px] font-extrabold leading-none tabular-nums ${tone}`}>
          {value}
        </span>
      </div>
      <span className="mt-1 font-pixel text-[7px] uppercase leading-none text-foreground/50">
        {label}
      </span>
    </div>
  );
}

/**
 * Per-generation completion, its four reward rungs, and a Claim button — with
 * the caught/seen/shiny/total counts on the back, turned to every few seconds.
 *
 * Reactive to the Pokedex's generation filter: switching to Johto retitles this
 * "Johto Completion" and repoints every number and every rung at that
 * generation's ladder. That is why `gen` is a prop rather than internal state.
 *
 * The auto-flip pauses whenever a rung is claimable. A Claim button that turns
 * away from the thumb reaching for it is worse than a stats face nobody sees,
 * and the pause resolves itself the moment the reward is taken.
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

  const onClaim = () => {
    if (claimable === null) return;
    const res = claimDexReward(gen, claimable, useGameStore.getState());
    if (!res) return;
    playSfx("claim_reward");
    toast.success(`${region} ${claimable}% complete`, {
      description: res.text,
      duration: 4000,
    });
  };

  const hold = () => {
    holdUntil.current = Date.now() + HOLD_AFTER_TAP_MS;
  };

  return (
    <div className="flip-card h-[132px] w-full">
      <div className="flip-card-inner" data-flipped={flipped}>
        {/* Front — completion and the reward ladder. */}
        <div className="flip-face">
          <button
            type="button"
            onClick={() => {
              hold();
              setFlipped(true);
            }}
            aria-label={`${region} completion — show caught, seen and shiny counts`}
            className="press-card flex h-full w-full flex-col justify-between rounded-2xl border-2 border-white bg-gradient-to-br from-primary/12 to-card px-3 py-2 text-left shadow-card"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-[13px] font-extrabold leading-tight">
                  {region} Completion
                </div>
                <div className="text-[20px] font-extrabold leading-tight tabular-nums text-primary">
                  {pct}%
                </div>
              </div>
              {/* The Claim button is a real button nested in the flip button, so
                  it must stop the tap from also turning the card over. */}
              <span
                role="button"
                tabIndex={0}
                aria-disabled={claimable === null}
                onClick={(e) => {
                  e.stopPropagation();
                  hold();
                  onClaim();
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  hold();
                  onClaim();
                }}
                className={`press shrink-0 rounded-full px-4 py-1.5 text-xs font-extrabold shadow-card ${
                  claimable !== null
                    ? "bg-poke-yellow text-poke-dark"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                Claim
              </span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-poke-dark/12">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-500"
                style={{ width: `${Math.min(100, stats.pct * 100)}%` }}
              />
            </div>

            <div className="flex items-end justify-between gap-1">
              {DEX_MILESTONES.map((m) => (
                <Milestone
                  key={m}
                  milestone={m}
                  state={dexMilestoneState(m, stats, gen, claimedList)}
                />
              ))}
            </div>
          </button>
        </div>

        {/* Back — the counts. */}
        <div className="flip-face flip-face-back">
          <button
            type="button"
            onClick={() => {
              hold();
              setFlipped(false);
            }}
            aria-label={`${region} counts — show completion rewards`}
            // `justify-center gap-3`, not `justify-between` like the front: the
            // back has two children to the front's four, and spreading them to
            // the edges left a dead band across the middle of the card.
            className="press-card flex h-full w-full flex-col justify-center gap-3 rounded-2xl border-2 border-white bg-gradient-to-br from-primary/12 to-card px-3 py-2 text-left shadow-card"
          >
            <div className="truncate text-[13px] font-extrabold leading-tight">{region} Dex</div>
            <div className="grid grid-cols-4 gap-1.5">
              <StatTile
                label="Caught"
                value={stats.caught}
                tone="text-hp-good"
                icon={<MiniPokeball className="h-3 w-3" />}
              />
              <StatTile
                label="Seen"
                value={stats.seen}
                tone="text-foreground/70"
                icon={<Eye className="h-3 w-3 text-foreground/40" />}
              />
              <StatTile
                label="Shiny"
                value={stats.shiny}
                tone="text-poke-yellow"
                icon={<Sparkles className="h-3 w-3 text-poke-yellow" />}
              />
              <StatTile label="Total" value={stats.total} tone="text-foreground" />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
