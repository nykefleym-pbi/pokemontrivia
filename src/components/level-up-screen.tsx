import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { playSfx } from "@/lib/audio";
import { ITEMS, rankForLevel, trainerSpriteUrl, xpForLevel } from "@/lib/game-data";
import { useGameStore } from "@/lib/store";
import { ShareCardDialog } from "@/components/share-card-dialog";
import { ItemIcon } from "@/components/game-ui";
import { NaButton } from "@/components/na/button";
import { NaConfetti, NaLevelBadge, NaWordmark } from "@/components/na/celebration";
import { NaRewardIcon } from "@/components/na/reward-icon";
import type { LevelUpRewards } from "@/lib/level-rewards";

interface Props {
  rewards: LevelUpRewards;
  onContinue: () => void;
}

/** The leagues the trainer level opens (rankForLevel): the next one and how far along you are. */
const LEAGUES: Array<[number, string]> = [
  [6, "Great League"],
  [16, "Ultra League"],
  [26, "Master League"],
  [51, "Monarch rank"],
];

function rewardLine(r: LevelUpRewards): string {
  const parts: string[] = [];
  if (r.coins > 0) parts.push(`+${r.coins} coins`);
  for (const it of r.items) parts.push(it.qty > 1 ? `${it.qty} ${it.name}s` : `${/^[aeiou]/i.test(it.name) ? "an" : "a"} ${it.name}`);
  if (r.eggs > 0) parts.push(r.eggs > 1 ? `${r.eggs} Poké Eggs` : "a Poké Egg");
  if (parts.length < 2) return parts.join("");
  return parts.length === 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * Figma 4.4 "Level up: a badge you earned, and what it unlocks". The trainer
 * level lives in a gold badge with one side per level. Level N-1 shrinks,
 * shakes and bursts into gold pieces; Level N scales in past full size and
 * confetti falls; then the rewards rise into the card. Shown when the player
 * returns to the battle hub (battle.tsx gates it on phase "home").
 * shortcut: Share uses the trainer card (new level and rank) until row 9 brings a level-up story card.
 */
export function LevelUpScreen({ rewards, onContinue }: Props) {
  useEffect(() => {
    playSfx("level");
    const t = setTimeout(() => playSfx("reward"), 1700);
    return () => clearTimeout(t);
  }, []);

  const lv = rewards.toLevel;
  const prev = LEAGUES.filter(([at]) => at <= lv).pop();
  const next = LEAGUES.find(([at]) => at > lv);
  const reached = prev && prev[0] > rewards.fromLevel;
  const from = prev?.[0] ?? 1;
  // How far along the XP road to the next league, as Figma's meter.
  const xpTo = (a: number, b: number) => Array.from({ length: Math.max(0, b - a) }, (_, i) => xpForLevel(a + i)).reduce((x, y) => x + y, 0);
  const pct = next ? Math.max(0.04, xpTo(from, lv) / xpTo(from, next[0])) : 1;
  const [shareOpen, setShareOpen] = useState(false);
  const s = useGameStore();

  return (
    <div className="na-bg-night fixed inset-0 z-[110] flex flex-col items-center gap-4 overflow-hidden px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+24px)]">
      {/* Figma confetti covers the top 520 of the phone, status bar included. */}
      <div className="pointer-events-none absolute left-1/2 top-[calc(env(safe-area-inset-top)-47px)] -translate-x-1/2">
        <NaConfetti w={390} h={520} n={46} delay={0.8} />
      </div>

      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <NaWordmark kind="levelup">LEVEL UP!</NaWordmark>
      </motion.div>

      <div className="relative h-[200px] w-[320px] shrink-0">
        {/* Level N-1: shrinks to 90%, shakes harder and harder, bursts. */}
        <motion.div
          className="absolute left-2 top-[74px]"
          initial={{ scale: 1, rotate: 0, opacity: 0.7 }}
          animate={{
            scale: [1, 0.9, 0.9, 0.9, 0.9, 1.25],
            rotate: [0, 0, -6, 7, -9, 0],
            opacity: [0.7, 0.7, 0.7, 0.7, 0.7, 0],
          }}
          transition={{ duration: 0.65, times: [0, 0.3, 0.45, 0.6, 0.8, 1] }}
        >
          <NaLevelBadge level={rewards.fromLevel} size={64} />
        </motion.div>
        {/* The burst: gold pieces fly out where Level N-1 was. */}
        {[[-38, -30, 30], [36, -34, -40], [-40, 30, 60], [38, 32, -20], [0, -44, 10], [2, 42, 80]].map(([dx, dy, r], i) => (
          <motion.span
            key={i}
            aria-hidden
            className="na-fill-gold absolute left-[35px] top-[99px] h-3.5 w-2.5 rounded-sm"
            initial={{ x: 0, y: 0, opacity: 0, rotate: 0 }}
            animate={{ x: dx, y: dy, opacity: [0, 1, 0], rotate: r }}
            transition={{ delay: 0.6, duration: 0.5, ease: "easeOut" }}
          />
        ))}
        {/* Level N-1 comes back, small and dim, as the "from" of the pair. */}
        <motion.div className="absolute left-2 top-[74px]" initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 1.2 }}>
          <NaLevelBadge level={rewards.fromLevel} size={64} />
        </motion.div>
        <motion.div
          className="absolute left-[80px] top-[94px] flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          <NaIcon name="chevron-right" size={26} className="-mr-2.5 text-reward-gold" />
          <NaIcon name="chevron-right" size={26} className="text-reward-gold" />
        </motion.div>
        <motion.div
          className="absolute left-[140px] top-[22px]"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.15, 1], opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5, times: [0, 0.65, 1] }}
        >
          <NaLevelBadge level={lv} size={150} />
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.7, duration: 0.35 }}
        className="na-glass flex w-full flex-col gap-3 rounded-[20px] p-4"
      >
        <span className="na-label uppercase text-text-secondary">Level-up rewards</span>
        <div className="flex items-center gap-2.5">
          {rewards.coins > 0 && (
            <span className="shrink-0">
              <NaRewardIcon kind="Coin" size={32} />
            </span>
          )}
          {rewards.items.slice(0, 2).map((it) => {
            const def = ITEMS.find((x) => x.id === it.id);
            return def ? <ItemIcon key={it.id} item={def} className="h-8 w-8 shrink-0" /> : null;
          })}
          {rewards.eggs > 0 && <NaRewardIcon kind="Egg" size={32} />}
          <span className="na-body-strong text-foreground">{rewardLine(rewards)}</span>
        </div>
        {(next || reached) && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <span className="shrink-0">
                <NaRewardIcon kind="Trophy" size={32} />
              </span>
              <span className="na-body-strong text-foreground">
                {reached
                  ? `You reached the ${prev![1]}! Face tougher questions and earn bigger rewards.`
                  : `${next![1]} unlocks at Level ${next![0]}! Face tougher questions and earn bigger rewards.`}
              </span>
            </div>
            {next && !reached && (
              <span className="relative h-2 overflow-hidden rounded bg-night-deep">
                <span className="na-fill-gold absolute inset-y-0 left-0 rounded" style={{ width: `${pct * 100}%` }} />
              </span>
            )}
          </div>
        )}
      </motion.div>

      <div className="min-h-2 flex-1" />
      <div className="flex w-full flex-col gap-4">
        <NaButton block onClick={onContinue}>
          Let&apos;s go!
        </NaButton>
        <NaButton kind="secondary" size="M" block onClick={() => setShareOpen(true)}>
          Share
        </NaButton>
      </div>
      <ShareCardDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        data={{
          type: "trainer-card",
          trainerName: s.trainerName || "Trainer",
          trainerSpriteUrl: trainerSpriteUrl(s.trainerSprite),
          level: lv,
          rank: rankForLevel(lv),
          friendCode: s.friendCode ?? "------",
          pokedexCount: Object.keys(s.pokedex).length,
          wins: s.stats.wins,
          bestStreak: s.stats.bestStreak,
          acePokemonId: s.pokemon?.id ?? 0,
          aceShiny: false,
          dateISO: new Date().toISOString().slice(0, 10),
        }}
      />
    </div>
  );
}
