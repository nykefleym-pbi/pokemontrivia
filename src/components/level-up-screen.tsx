import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { playSfx } from "@/lib/audio";
import { ITEMS, trainerSpriteUrl, rankForLevel } from "@/lib/game-data";
import { ItemIcon, SpriteBurst } from "@/components/game-ui";
import { FallingBits } from "@/components/falling-bits";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON, COIN_ICON, RESULT_ICON } from "@/lib/app-icons";
import { RESULT_ART, trimmedArtStyles } from "@/lib/result-art";
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
          "radial-gradient(circle at 50% 34%, oklch(0.42 0.09 265) 0%, oklch(0.24 0.06 265) 52%, oklch(0.16 0.04 265) 100%)",
      }}
      onClick={skipToEnd}
    >
      <FallingBits won />

      <AnimatePresence>
        {step >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 flex w-full flex-col items-center text-center"
          >
            <LevelUpWordmark />

            {/* The burst is a positioned sibling of the sprite, so it needs an
                explicit negative z to sit BEHIND it — positioned elements paint
                above non-positioned in-flow content otherwise. */}
            <div className="relative mt-4 flex h-36 w-36 items-center justify-center">
              <div className="absolute inset-0 -z-10">
                <SpriteBurst tint="rgba(255,206,94,0.5)" />
              </div>
              <img
                src={trainerSpriteUrl(trainerSprite)}
                alt={trainerName}
                className="sprite relative h-28 w-28 object-contain drop-shadow-2xl"
              />
            </div>

            <div className="mt-2 font-display-lg text-white">{trainerName}</div>

            <div className="mt-3 flex items-center justify-center gap-3">
              <LevelShield level={rewards.fromLevel} />
              <motion.span
                aria-hidden
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="-mb-2 text-4xl font-black leading-none tracking-tighter text-poke-yellow drop-shadow-[0_2px_0_rgba(0,0,0,0.35)]"
              >
                ›››
              </motion.span>
              <LevelShield level={rewards.toLevel} highlight />
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
            className="relative z-10 mt-4 rounded-full bg-poke-dark px-4 py-2 text-center shadow-pop"
          >
            <div className="flex items-center justify-center gap-1.5 font-pixel-xs uppercase tracking-wide text-poke-yellow">
              <AppIcon src={UI_ICON.badges} className="h-4 w-4" />
              New Rank Unlocked
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
            className="relative z-10 mt-6 w-full max-w-xs rounded-3xl border-2 border-white bg-card p-4 shadow-pop"
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
                    // `def` always resolves for a real granted id; the null arm
                    // is just belt-and-braces for an unknown one (the row's
                    // label already names the item).
                    icon={def ? <ItemIcon item={def} className="h-7 w-7" /> : null}
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
            className="relative z-10 mt-6 w-full max-w-xs"
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

/**
 * The "LEVEL UP!" art, drawn at its visible height.
 *
 * Same wrapper/negative-margin pair as the result screen's outcome wordmarks —
 * see `trimmedArtStyles`, which explains why the negative margin cannot go
 * straight on the <img>. The old pixel eyebrow stays as the `onError` arm so a
 * missing or 404ing file degrades to text rather than to a broken image.
 */
function LevelUpWordmark() {
  const [failed, setFailed] = useState(false);
  const s = trimmedArtStyles(RESULT_ART.levelUp);
  if (failed) {
    return (
      <div className="font-pixel-xs uppercase tracking-[0.3em] text-poke-yellow">Level Up!</div>
    );
  }
  return (
    <div className="relative w-full max-w-[280px]" style={s.wrapper}>
      <img
        src={encodeURI(RESULT_ICON.levelUp)}
        alt="Level up!"
        draggable={false}
        onError={() => setFailed(true)}
        className="absolute left-0 top-0 w-full select-none"
        style={s.image}
      />
    </div>
  );
}

/**
 * One level number on a convex pentagon plaque — flat top, straight sides, a
 * point at the bottom.
 *
 * Two nested clipped boxes rather than a border: `clip-path` cuts a border off
 * with the rest of the box, so the only way to get an outline on a non-
 * rectangular shape is to clip a slightly larger coloured box behind a slightly
 * smaller filled one. `inset-[3px]` is that outline's thickness.
 *
 * `highlight` is the level you just reached — gold and raised; the other is the
 * level you left, in muted slate so the pair reads as before → after.
 */
function LevelShield({ level, highlight = false }: { level: number; highlight?: boolean }) {
  const clip = "polygon(0% 0%, 100% 0%, 100% 66%, 50% 100%, 0% 66%)";
  return (
    <motion.div
      initial={highlight ? { scale: 0.6, opacity: 0 } : false}
      animate={highlight ? { scale: 1, opacity: 1 } : undefined}
      transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.25 }}
      className={`relative ${highlight ? "h-[4.75rem] w-[4.25rem]" : "h-16 w-14"}`}
    >
      <div
        className={`absolute inset-0 ${highlight ? "bg-poke-yellow" : "bg-white/35"}`}
        style={{ clipPath: clip }}
      />
      <div
        className={`absolute inset-[3px] flex flex-col items-center justify-start pt-1.5 ${
          highlight ? "bg-primary" : "bg-poke-dark/80"
        }`}
        style={{ clipPath: clip }}
      >
        <span
          className={`font-pixel-xs uppercase leading-none ${
            highlight ? "text-white/80" : "text-white/50"
          }`}
        >
          Lv
        </span>
        <span
          className={`font-display-lg leading-none ${
            highlight ? "text-white" : "text-white/70"
          } ${level >= 100 ? "text-[1.25rem]" : ""}`}
        >
          {level}
        </span>
      </div>
    </motion.div>
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
