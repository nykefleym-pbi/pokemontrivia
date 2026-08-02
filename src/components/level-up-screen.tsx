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

  const chips = rewardChips(rewards);

  return (
    <div
      // `overflow-hidden`, and every band below sized so nothing needs to
      // scroll. The previous version centred a taller-than-viewport column in a
      // scroll box, which does not merely add a scrollbar: a flex container
      // centring overflowing content pushes the overflow out of BOTH ends and
      // the top is unreachable, so the wordmark's "AMAZING!" ribbon was cut off
      // and could not be scrolled back into view.
      // `justify-between`, so whatever height is left over is shared out as an
      // even gap between the bands. Pinning it anywhere — all to the trainer,
      // or all to one spacer — just moves the hole: the screen reads as either
      // a marooned sprite or a chasm above the rewards. Spread across five
      // gaps the same slack reads as breathing room.
      //
      // Safe here in a way it was NOT when this centred: content can no longer
      // exceed the viewport, because the trainer band shrinks first (see
      // below). `justify-between` would push overflow out of the bottom only,
      // never off the top where it cannot be scrolled back.
      className="fixed inset-0 z-[110] flex flex-col items-center justify-between overflow-hidden screen-x"
      style={{
        background:
          "radial-gradient(circle at 50% 34%, oklch(0.42 0.09 265) 0%, oklch(0.24 0.06 265) 52%, oklch(0.16 0.04 265) 100%)",
        paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)",
      }}
      onClick={skipToEnd}
    >
      <FallingBits won />

      <AnimatePresence>
        {step >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 flex w-full shrink-0 flex-col items-center text-center"
          >
            <LevelUpWordmark />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shrink-only: basis 9.5rem, grow 0, shrink 1.
          `flex-1` here meant the trainer ate ALL the leftover height on a tall
          phone — the sprite stayed at its cap and sat marooned in a band half
          again its own size, with a gulf above and below it. Growth is what had
          to go, not the shrinking: `min-h-0` still lets this collapse on a
          short phone (a flex item's min-height defaults to `auto` and would
          otherwise refuse to go below the image), so the trainer is still what
          gives way rather than the button falling off the bottom. The slack it
          no longer takes goes to the spacer below the plaques. */}
      <div className="relative z-10 flex min-h-0 w-full flex-[0_1_9.5rem] items-center justify-center">
        <AnimatePresence>
          {step >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              // Square, sized off its own height so the burst stays circular at
              // any viewport.
              //
              // The trainer is WHO levelled up, not WHAT the screen is about —
              // given its head it was the largest thing here and the plaques,
              // which carry the actual news, read as a footnote under it.
              className="relative h-full max-w-full"
              style={{ aspectRatio: "1" }}
            >
              {/* The burst is a positioned sibling of the sprite, so it needs an
                  explicit negative z to sit BEHIND it — positioned elements paint
                  above non-positioned in-flow content otherwise. */}
              <div className="absolute inset-0 -z-10">
                <SpriteBurst tint="rgba(255,206,94,0.5)" />
              </div>
              <img
                src={trainerSpriteUrl(trainerSprite)}
                alt={trainerName}
                className="sprite relative h-full w-full object-contain drop-shadow-2xl"
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {step >= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 flex w-full shrink-0 flex-col items-center text-center"
          >
            {/* Negative gaps, deliberately: each plaque carries its own glow out
                to the edge of its box, so touching boxes read as a comfortable
                gap and a real gap reads as a chasm. */}
            <div className="mt-0.5 flex items-center justify-center">
              <LevelPlaque kind="from" level={rewards.fromLevel} />
              <motion.img
                aria-hidden
                src={encodeURI(LEVEL_PLAQUE_ICON.arrow)}
                alt=""
                draggable={false}
                animate={{ x: [0, 5, 0] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                className="relative z-10 -mx-3 w-[66px] shrink-0 select-none"
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
            className="relative z-10 shrink-0 rounded-full bg-poke-dark px-4 py-1.5 text-center shadow-pop"
          >
            <div className="flex items-center justify-center gap-1.5 font-pixel-xs uppercase tracking-wide text-poke-yellow">
              <AppIcon src={UI_ICON.badges} className="h-3.5 w-3.5" />
              New Rank Unlocked
            </div>
            <div className="text-base font-extrabold leading-tight text-white">{newRank}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step >= 3 && chips.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="relative z-10 w-full max-w-xs shrink-0 rounded-2xl border-2 border-white bg-card px-3 py-2 shadow-pop"
          >
            <div className="text-center font-pixel-xs uppercase text-foreground/50">Rewards</div>
            <div className="mt-1.5 flex items-end justify-center gap-3">
              {chips.map((c, i) => (
                <RewardChip key={c.key} index={i} icon={c.icon} qty={c.qty} label={c.label} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {step >= 4 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative z-10 w-full max-w-xs shrink-0"
          >
            <Button
              size="action"
              onClick={(e) => {
                e.stopPropagation();
                onContinue();
              }}
              className="w-full border-2 border-white bg-primary text-primary-foreground shadow-pop"
            >
              Continue
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** At most this many reward chips before the tail collapses into a "+N". */
const MAX_CHIPS = 5;

interface Chip {
  key: string;
  icon: ReactNode;
  qty: number;
  label: string;
}

/**
 * The level-up haul as one row of art, rather than a stacked list of labelled
 * rows.
 *
 * The list version cost a line of height per grant and was the difference
 * between this screen fitting a phone and not — with a rank-up banner and two
 * items it pushed Continue off the bottom. Icon plus quantity says the same
 * thing in a fifth of the space, and the art is already there.
 *
 * The name survives as the chip's accessible label and tooltip, so what is lost
 * is only the width, not the information.
 */
function rewardChips(rewards: LevelUpRewards): Chip[] {
  const all: Chip[] = [];
  if (rewards.coins > 0) {
    all.push({
      key: "coins",
      icon: <AppIcon src={COIN_ICON} className="h-8 w-8" />,
      qty: rewards.coins,
      label: "Coins",
    });
  }
  for (const it of rewards.items) {
    const def = ITEMS.find((x) => x.id === it.id);
    all.push({
      key: it.id,
      // `def` always resolves for a real granted id; the undefined arm is just
      // belt-and-braces for an unknown one. The `fallback` is NOT belt-and-
      // braces: without a label beside it, an item whose sprite 404s would be
      // an empty tile and a bare "+1".
      icon: def ? (
        <ItemIcon item={def} className="h-8 w-8" fallback={<Initials name={it.name} />} />
      ) : (
        <Initials name={it.name} />
      ),
      qty: it.qty,
      label: it.name,
    });
  }
  if (rewards.eggs > 0) {
    all.push({
      key: "eggs",
      icon: <AppIcon src={UI_ICON.pokeEgg} className="h-8 w-8" />,
      qty: rewards.eggs,
      label: `Poké Egg${rewards.eggs > 1 ? "s" : ""}`,
    });
  }
  if (all.length <= MAX_CHIPS) return all;
  // One row is the point, so an unusually generous level collapses its tail
  // rather than wrapping onto a second one.
  const shown = all.slice(0, MAX_CHIPS - 1);
  const rest = all.slice(MAX_CHIPS - 1);
  shown.push({
    key: "more",
    icon: <span className="font-display-md text-foreground/60">+{rest.length}</span>,
    qty: rest.reduce((n, c) => n + c.qty, 0),
    label: rest.map((c) => c.label).join(", "),
  });
  return shown;
}

/** Last resort when an item has no art: two letters beat an empty tile. */
function Initials({ name }: { name: string }) {
  const letters = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return <span className="text-sm font-extrabold text-foreground/70">{letters}</span>;
}

function RewardChip({
  index,
  icon,
  qty,
  label,
}: {
  index: number;
  icon: ReactNode;
  qty: number;
  label: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.7 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.12 }}
      className="flex flex-col items-center gap-0.5"
      title={`+${qty} ${label}`}
      aria-label={`+${qty} ${label}`}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-poke-yellow/15">
        {icon}
      </div>
      <span className="text-xs font-extrabold text-foreground">+{qty}</span>
    </motion.div>
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
    <div className="relative w-full max-w-[300px]" style={s.wrapper}>
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

/** The shield BODY's width on screen at scale 1. Both plaques derive from it. */
const PLAQUE_BODY = 66;

/**
 * How big each plaque is relative to the other.
 *
 * The gap is the point: this is a before-and-after, and a pair drawn the same
 * size states two facts instead of showing one becoming the other. The old
 * level is drawn down and the new one up, so the growth is visible without a
 * word of copy.
 *
 * ONE scale drives both the shield and its number, so "the grey container is
 * smaller" and "its number is smaller" cannot drift apart — which they would
 * the moment either was tuned on its own.
 */
const PLAQUE_SCALE = { from: 0.8, to: 1.18 } as const;

/**
 * One level number on its supplied shield plaque — silver for the level you
 * left, gold for the one you reached.
 *
 * Sized by `plaqueWidth` rather than by a flat width, because the two files
 * carry differently-sized glows: given the same box the gold shield's body
 * comes out a fifth smaller than the silver one, which would cancel out the
 * growth the pair exists to show. Sizing each file by its own measured body
 * makes PLAQUE_SCALE mean what it says.
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
  const body = PLAQUE_BODY * PLAQUE_SCALE[kind];
  const w = plaqueWidth(kind, body);
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
          style={{ fontSize: Math.max(7, Math.round(body * 0.14)) }}
        >
          Lv
        </span>
        <span
          className="mt-1 font-display-lg text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]"
          // Scaled off the BODY, not the file: the gold plaque's box is wider
          // for the same shield, so a font size taken from the box would print
          // the new level larger than the old one for no reason.
          style={{ fontSize: Math.round(body * (level >= 100 ? 0.36 : 0.46)) }}
        >
          {level}
        </span>
      </div>
    </motion.div>
  );
}
