import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, ChevronRight, Eye, Gift, Sparkles } from "lucide-react";
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
 * One rung of the reward strip: a circular art badge with its threshold under
 * it, in one of three states.
 *
 * Sized off the viewport rather than fixed, because the whole strip has to sit
 * beside the completion pill AND the Claim button on one row — the reference
 * design is a desktop-width bar and a 320px phone has about a quarter of that
 * to spend.
 */
function Milestone({ milestone, state }: { milestone: DexMilestone; state: DexMilestoneState }) {
  const reward = DEX_MILESTONE_REWARDS[milestone];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={`relative flex h-[clamp(20px,6.6vw,28px)] w-[clamp(20px,6.6vw,28px)] items-center justify-center rounded-full bg-white shadow-card ring-2 ${
          state === "claimed"
            ? "ring-hp-good"
            : state === "claimable"
              ? "ring-poke-yellow"
              : "ring-black/5"
        }`}
      >
        {/* A locked rung shows the padlock OVER a dimmed glyph rather than
            hiding what it pays — the ladder is the reason to keep filling the
            generation, so it has to be legible from the first percent. */}
        <AppIcon
          src={REWARD_ART[reward.icon]}
          className={`h-[78%] w-[78%] ${state === "locked" ? "opacity-30" : ""}`}
        />
        {state === "locked" && <AppIcon src={LOCK_ICON} className="absolute h-3 w-3 opacity-90" />}
        {state === "claimed" && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-hp-good ring-2 ring-card">
            <Check className="h-2 w-2 text-white" strokeWidth={4} />
          </span>
        )}
      </div>
      <span
        className={`text-[8px] font-bold leading-none tabular-nums ${
          state === "locked" ? "text-foreground/35" : "text-foreground/70"
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
 * Per-generation completion, its four reward rungs, and a Claim button — with
 * the caught/seen/shiny/total counts on the back, turned to every few seconds.
 *
 * Laid out as the owner's reference bar: a tinted completion pill on the left,
 * a captioned reward strip with chevrons in the middle, the Claim button on the
 * right, all on ONE row. The reference is a ~1400px desktop bar and this has
 * ~334px to work with, so every piece is sized in viewport units and the pill's
 * label truncates rather than wrapping — the row structure is what carries the
 * design, and it is what breaks first if anything is allowed to grow.
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

  const faceCls =
    "press-card flex h-full w-full items-center gap-1.5 rounded-2xl border-2 border-white bg-card p-2 text-left shadow-card";

  return (
    <div className="flip-card h-[86px] w-full">
      <div className="flip-card-inner" data-flipped={flipped}>
        {/* Front — completion pill, reward strip, Claim. */}
        <div className="flip-face">
          <button
            type="button"
            onClick={() => {
              hold();
              setFlipped(true);
            }}
            aria-label={`${region} completion — show caught, seen and shiny counts`}
            className={faceCls}
          >
            {/* Completion pill. */}
            <div className="flex min-w-0 flex-1 items-center gap-1 rounded-xl bg-gradient-to-br from-primary to-primary/75 px-1.5 py-1.5">
              {/* The pill's avatar is the first thing to go on a narrow phone:
                  below 360px the row cannot afford both it and an untruncated
                  "<Region> Completion". */}
              <MiniPokeball className="hidden h-4 w-4 shrink-0 min-[360px]:block" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[7px] font-bold uppercase leading-none tracking-wide text-white/80">
                  {region} Completion
                </div>
                <div className="mt-0.5 text-[15px] font-extrabold leading-none tabular-nums text-white">
                  {pct}%
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/25">
                  <div
                    className="h-full rounded-full bg-white transition-[width] duration-500"
                    style={{ width: `${Math.min(100, stats.pct * 100)}%` }}
                  />
                </div>
              </div>
            </div>

            {/* Reward strip. */}
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <span className="text-[7px] font-bold leading-none text-foreground/50">
                Rewards for completion
              </span>
              <div className="flex items-center gap-0.5">
                {DEX_MILESTONES.map((m, i) => (
                  <div key={m} className="flex items-center gap-0.5">
                    {i > 0 && <ChevronRight className="h-2 w-2 shrink-0 text-foreground/25" />}
                    <Milestone
                      milestone={m}
                      state={dexMilestoneState(m, stats, gen, claimedList)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Claim. A real button nested inside the flip button, so its tap
                must not also turn the card over. */}
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
              className={`press flex shrink-0 items-center gap-0.5 rounded-xl px-2 py-2 text-[11px] font-extrabold ${
                claimable !== null
                  ? "bg-poke-yellow text-poke-dark shadow-card"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Gift className="h-3 w-3 shrink-0" />
              Claim
            </span>
          </button>
        </div>

        {/* Back — the counts, icons only. */}
        <div className="flip-face flip-face-back">
          <button
            type="button"
            onClick={() => {
              hold();
              setFlipped(false);
            }}
            aria-label={`${region} counts — show completion rewards`}
            className={faceCls}
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
