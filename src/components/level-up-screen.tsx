import { useEffect, useState, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { playSfx } from "@/lib/audio";
import { ITEMS, trainerSpriteUrl, rankForLevel } from "@/lib/game-data";
import { ItemIcon, SpriteBurst } from "@/components/game-ui";
import { FallingBits } from "@/components/falling-bits";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON, COIN_ICON, RESULT_ICON, LEVEL_PLAQUE_ICON } from "@/lib/app-icons";
import { RESULT_ART, LEVEL_PLAQUE, plaqueWidth, trimmedArtStyles } from "@/lib/result-art";
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
      className="fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-y-auto px-6 py-6"
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
            <div className="relative mt-3 flex h-48 w-48 items-center justify-center">
              <div className="absolute inset-0 -z-10">
                <SpriteBurst tint="rgba(255,206,94,0.5)" />
              </div>
              <img
                src={trainerSpriteUrl(trainerSprite)}
                alt={trainerName}
                className="sprite relative h-40 w-40 object-contain drop-shadow-2xl"
              />
            </div>

            <div className="mt-1 font-display-lg text-white">{trainerName}</div>

            {/* Negative gaps, deliberately: each plaque carries its own glow out
                to the edge of its box, so touching boxes read as a comfortable
                gap and a real gap reads as a chasm. */}
            <div className="mt-1 flex items-center justify-center">
              <LevelPlaque kind="from" level={rewards.fromLevel} />
              <motion.img
                aria-hidden
                src={encodeURI(LEVEL_PLAQUE_ICON.arrow)}
                alt=""
                draggable={false}
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="relative z-10 -mx-3 w-[68px] shrink-0 select-none"
              />
              <LevelPlaque kind="to" level={rewards.toLevel} highlight />
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
            className="relative z-10 mt-4 w-full max-w-xs rounded-3xl border-2 border-white bg-card p-4 shadow-pop"
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
            className="relative z-10 mt-4 w-full max-w-xs"
          >
            <Button
              size="lg"
              onClick={(e) => {
                e.stopPropagation();
                onContinue();
              }}
              className="h-14 w-full rounded-full border-2 border-white bg-primary font-bold text-primary-foreground shadow-pop"
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
    <div className="relative w-full max-w-[250px]" style={s.wrapper}>
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

/** The shield BODY's width on screen. Both plaques are sized from this. */
const PLAQUE_BODY = 62;

/**
 * One level number on its supplied shield plaque — silver for the level you
 * left, gold for the one you reached.
 *
 * Sized by `plaqueWidth` rather than by a flat width, because the two files
 * carry differently-sized glows: given the same box the gold shield's body
 * comes out a fifth smaller than the silver one, which reads as the NEW level
 * having shrunk. Sizing each file by its own body keeps them matched, and the
 * highlight's extra 12% is then a deliberate difference rather than an artifact
 * of the artwork.
 *
 * The label is positioned against `centreY`, not centred in the box: a shield
 * tapers to a point, so its lower half is mostly empty and text on the
 * geometric middle sits visibly low.
 */
function LevelPlaque({
  kind,
  level,
  highlight = false,
}: {
  kind: "from" | "to";
  level: number;
  highlight?: boolean;
}) {
  const w = plaqueWidth(kind, PLAQUE_BODY * (highlight ? 1.12 : 1));
  return (
    <motion.div
      initial={highlight ? { scale: 0.6, opacity: 0 } : false}
      animate={highlight ? { scale: 1, opacity: 1 } : undefined}
      transition={{ type: "spring", stiffness: 260, damping: 14, delay: 0.25 }}
      className="relative shrink-0"
      style={{ width: w }}
    >
      <img
        src={encodeURI(LEVEL_PLAQUE_ICON[kind])}
        alt=""
        aria-hidden
        draggable={false}
        className="block w-full select-none"
      />
      <div
        className="absolute inset-x-0 flex -translate-y-1/2 flex-col items-center leading-none"
        style={{ top: `${LEVEL_PLAQUE[kind].centreY * 100}%` }}
      >
        <span
          className={`font-pixel-xs uppercase ${highlight ? "text-white/75" : "text-white/45"}`}
          style={{ fontSize: Math.max(7, Math.round(w * 0.055)) }}
        >
          Lv
        </span>
        <span
          className="mt-1 font-display-lg text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]"
          // Scaled off the BODY, not the file: the gold plaque's box is wider
          // for the same shield, so a font size in `em` of the box would print
          // the new level larger than the old one for no reason.
          style={{
            fontSize: Math.round(
              PLAQUE_BODY * (highlight ? 1.12 : 1) * (level >= 100 ? 0.36 : 0.46),
            ),
          }}
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
