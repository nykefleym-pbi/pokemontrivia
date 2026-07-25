import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { playSfx } from "@/lib/audio";
import { ITEMS, trainerSpriteUrl, rankForLevel } from "@/lib/game-data";
import { ItemIcon } from "@/components/game-ui";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON, COIN_ICON } from "@/lib/app-icons";
import { useGameStore } from "@/lib/store";
import type { LevelUpRewards } from "@/lib/level-rewards";

interface Props {
  rewards: LevelUpRewards;
  onContinue: () => void;
}

/**
 * Full-screen "you leveled up" celebration — Level belongs to the TRAINER
 * (not the partner Pokémon, which owns Training Points instead), so this
 * shows the trainer sprite, not a PokemonSprite. Shown once the player
 * returns to the battle hub after earning the level-up (see WORKLIST /
 * battle.tsx: gated on `phase === "home"` so Rematch chains never get
 * interrupted — only leaving to the hub triggers it).
 */
export function LevelUpScreen({ rewards, onContinue }: Props) {
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const spannedMultiple = rewards.toLevel - rewards.fromLevel > 1;
  const oldRank = rankForLevel(rewards.fromLevel);
  const newRank = rankForLevel(rewards.toLevel);
  const rankedUp = newRank !== oldRank;

  const [step, setStep] = useState(0);
  useEffect(() => {
    playSfx("level");
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStep(1), 300)); // trainer + level number
    timers.push(
      setTimeout(
        () => {
          setStep(2); // rank-up banner (if any)
          if (rankedUp) playSfx("claim_reward");
        },
        rankedUp ? 900 : 600,
      ),
    );
    timers.push(
      setTimeout(
        () => {
          setStep(3); // rewards
          playSfx("reward");
        },
        rankedUp ? 1500 : 1000,
      ),
    );
    timers.push(setTimeout(() => setStep(4), (rankedUp ? 1500 : 1000) + 500)); // continue button
    return () => timers.forEach(clearTimeout);
  }, [rankedUp]);

  // Tap anywhere to skip straight to the final state.
  function skipToEnd() {
    setStep(4);
  }

  return (
    <div
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-y-auto px-6 py-10"
      style={{
        background:
          "radial-gradient(circle at center, var(--color-poke-yellow) 0%, var(--color-poke-dark) 78%)",
      }}
      onClick={skipToEnd}
    >
      <AnimatePresence>
        {step >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center"
          >
            <div className="font-pixel-xs uppercase tracking-[0.3em] text-poke-dark/70">
              Level Up!
            </div>

            <div className="relative mt-4 flex h-32 w-32 items-center justify-center">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 1.1, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-white/40 blur-2xl"
              />
              <img
                src={trainerSpriteUrl(trainerSprite)}
                alt={trainerName}
                className="sprite relative h-28 w-28 object-contain drop-shadow-2xl"
              />
            </div>

            <div className="mt-3 font-display-lg text-poke-dark">{trainerName}</div>
            <div className="mt-1 font-display-xl text-poke-dark">
              {spannedMultiple
                ? `Lv ${rewards.fromLevel} → Lv ${rewards.toLevel}`
                : `Lv ${rewards.toLevel}`}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step >= 2 && rankedUp && (
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 200 }}
            className="mt-4 rounded-full bg-poke-dark px-4 py-2 text-center shadow-pop"
          >
            <div className="font-pixel-xs uppercase tracking-wide text-poke-yellow">
              🎖 New Rank Unlocked
            </div>
            <div className="font-display-md text-white">{newRank}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step >= 3 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-6 w-full max-w-xs rounded-3xl bg-card p-4 shadow-pop"
          >
            <div className="font-pixel-xs uppercase text-foreground/50">Rewards</div>
            <div className="mt-2 space-y-2">
              {rewards.coins > 0 && (
                <RewardRow
                  index={0}
                  icon={<AppIcon src={COIN_ICON} className="h-7 w-7" />}
                  label={`+${rewards.coins} Coins`}
                />
              )}
              {rewards.items.map((it, i) => {
                const def = ITEMS.find((x) => x.id === it.id);
                return (
                  <RewardRow
                    key={it.id}
                    index={i + 1}
                    icon={
                      def ? (
                        <ItemIcon item={def} className="h-7 w-7" />
                      ) : (
                        <span className="text-xl">{it.emoji}</span>
                      )
                    }
                    label={`+${it.qty} ${it.name}`}
                  />
                );
              })}
              {rewards.eggs > 0 && (
                <RewardRow
                  index={rewards.items.length + 1}
                  icon={<AppIcon src={UI_ICON.pokeEgg} className="h-7 w-7" />}
                  label={`+${rewards.eggs} Poké Egg${rewards.eggs > 1 ? "s" : ""}`}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step >= 4 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 w-full max-w-xs"
          >
            <Button
              size="lg"
              onClick={(e) => {
                e.stopPropagation();
                onContinue();
              }}
              className="h-14 w-full rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
            >
              Continue
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RewardRow({ index, icon, label }: { index: number; icon: ReactNode; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.15 }}
      className="flex items-center gap-2.5 rounded-2xl bg-poke-yellow/15 px-3 py-2"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center">{icon}</div>
      <span className="text-sm font-bold text-foreground">{label}</span>
    </motion.div>
  );
}
