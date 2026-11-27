import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { MiniPokeball } from "@/components/game-ui";
import { NaRewardIcon, type RewardIconKind } from "@/components/na/reward-icon";
import { NaGlossIcon } from "@/components/na/gloss-icon";
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
/** How long a tap holds the card still: turning a card away from a reward someone is reaching for is the one way this can annoy. */
const HOLD_AFTER_TAP_MS = 15000;

const REWARD_KIND: Record<DexRewardIcon, RewardIconKind> = { coins: "Coin", xp: "XP", tp: "TP", chest: "Chest" };

/**
 * One rung of the ladder (Figma 6.1a): a reached reward grows to 38, gets a gold
 * ring and pulses, and tapping it claims it. Locked rungs are dim with a lock;
 * claimed ones get a green check. role="button" on a span because the whole
 * face is the flip button and buttons can't nest.
 */
function Milestone({ milestone, state, onClaim }: { milestone: DexMilestone; state: DexMilestoneState; onClaim: () => void }) {
  const claimable = state === "claimable";
  const claim = (e: React.SyntheticEvent) => {
    if (!claimable) return;
    e.stopPropagation(); // claim without also turning the card over
    onClaim();
  };
  const s = claimable ? 38 : 32;
  return (
    <span className="flex flex-col items-center">
      <span className="flex h-[38px] items-center justify-center">
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
          className={`relative flex items-center justify-center rounded-full ${
            claimable
              ? "press animate-pulse border-[3px] border-reward-gold bg-night-deep/90"
              : `border-2 bg-night-deep/55 ${state === "claimed" ? "border-success" : "border-white/45"}`
          }`}
          style={{ width: s, height: s }}
        >
          <span className={state === "locked" ? "opacity-30" : ""}>
            <NaRewardIcon kind={REWARD_KIND[DEX_MILESTONE_REWARDS[milestone].icon]} size={22} />
          </span>
          {state === "locked" && (
            <span className="absolute bottom-0 right-0">
              <NaGlossIcon kind="lock" size={12} />
            </span>
          )}
          {state === "claimed" && (
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-success">
              <NaIcon name="check" size={8} className="text-white" />
            </span>
          )}
        </span>
      </span>
      <span className={`na-label mt-1.5 tabular-nums ${state === "locked" ? "text-text-secondary" : "text-foreground"}`}>{milestone}%</span>
    </span>
  );
}

/**
 * Figma 6.1a: a region's completion and its four reward rungs on a red card; every
 * few seconds it turns over to the caught, seen, shiny and total counts. It holds
 * still after a tap and while a reward is waiting.
 */
export function DexCompletionCard({ gen }: { gen: number }) {
  const pokedex = useGameStore((s) => s.pokedex);
  const claimed = useGameStore((s) => s.claimedDexRewards);
  const { region } = generation(gen);

  const stats = useMemo(() => dexStats(pokedex, gen), [pokedex, gen]);
  const claimedList = useMemo(() => claimed ?? [], [claimed]);
  const claimable = nextClaimableMilestone(stats, gen, claimedList);

  const [flipped, setFlipped] = useState(false);
  // Refs, not state: the interval reads them and must not restart on every change.
  const holdUntil = useRef(0);
  const claimablePending = useRef(false);
  claimablePending.current = claimable !== null;

  useEffect(() => {
    const id = setInterval(() => {
      if (claimablePending.current || Date.now() < holdUntil.current) return;
      setFlipped((f) => !f);
    }, FLIP_EVERY_MS);
    return () => clearInterval(id);
  }, []);
  useEffect(() => setFlipped(false), [gen]);
  useEffect(() => {
    if (claimable !== null) setFlipped(false);
  }, [claimable]);

  const hold = () => {
    holdUntil.current = Date.now() + HOLD_AFTER_TAP_MS;
  };
  const onClaim = (milestone: DexMilestone) => {
    hold();
    const res = claimDexReward(gen, milestone, useGameStore.getState());
    if (!res) return;
    playSfx("claim_reward");
    toast.success(`${region} ${milestone}% complete`, { description: res.text, duration: 4000 });
  };

  const pct = Math.round(stats.pct * 1000) / 10;
  const turn = () => {
    hold();
    setFlipped((f) => !f);
  };

  return (
    <motion.button
      key={flipped ? "back" : "front"}
      type="button"
      onClick={turn}
      initial={{ rotateX: 90, opacity: 0.4 }}
      animate={{ rotateX: 0, opacity: 1 }}
      transition={{ duration: 0.28 }}
      aria-label={flipped ? `${region} counts. Show completion rewards` : `${region} completion. Show caught, seen and shiny counts`}
      className={
        flipped
          ? "grid w-full grid-cols-4 gap-2 rounded-[22px] bg-[#f4f6ff]/[0.92] p-3"
          : "na-fill-brand flex w-full flex-col gap-3 rounded-[22px] px-4 pb-3 pt-3.5 shadow-[0_4px_0_#a3142c]"
      }
    >
      {flipped ? (
        [
          { label: "Caught", value: stats.caught, icon: <MiniPokeball className="h-[22px] w-[22px]" /> },
          { label: "Seen", value: stats.seen, icon: <NaIcon name="search" size={22} className="text-night-base" /> },
          { label: "Shiny", value: stats.shiny, icon: <NaIcon name="sparkle" size={22} className="text-reward-gold" /> },
          { label: "Total in this region", value: stats.total, icon: <NaIcon name="dex" line size={22} className="text-night-base" /> },
        ].map((c) => (
          <span key={c.label} aria-label={`${c.label}: ${c.value}`} className="flex flex-col items-center gap-1">
            {c.icon}
            <span className="na-number-m text-night-base">{c.value}</span>
          </span>
        ))
      ) : (
        <>
          <span className="na-headline na-emboss text-center text-foreground">
            {region} Completion · {pct}%
          </span>
          {/* The rungs ARE the bar: the track is inset 20 each side and every rung sits on the inset span, so the fill reaches a rung as it unlocks. */}
          <span className="relative block h-16 w-full">
            <span className="absolute inset-x-5 top-[15px] h-2 overflow-hidden rounded bg-night-deep/45">
              <span className="na-fill-gold block h-full rounded transition-[width] duration-500" style={{ width: `${Math.min(100, stats.pct * 100)}%` }} />
            </span>
            {DEX_MILESTONES.map((m) => (
              <span key={m} className="absolute top-0 -translate-x-1/2" style={{ left: `calc(20px + ${m / 100} * (100% - 40px))` }}>
                <Milestone milestone={m} state={dexMilestoneState(m, stats, gen, claimedList)} onClaim={() => onClaim(m)} />
              </span>
            ))}
          </span>
        </>
      )}
    </motion.button>
  );
}
