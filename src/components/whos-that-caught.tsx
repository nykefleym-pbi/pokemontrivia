import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { FieldSprite } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { NaWordmark } from "@/components/na/celebration";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaIcon } from "@/components/na/icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaTypeChip } from "@/components/na/type-chip";
import { findPokemon } from "@/lib/pokemon-data";

export interface CaughtScreenProps {
  /** The species actually registered — the guess in modes that name one. */
  id: number;
  name: string;
  isShiny: boolean;
  /** XP as the SERVER granted it, not a client constant. */
  awardedXp: number;
  rewardName: string;
  rewardIcon: string;
  /** Minutes until the next round opens. */
  nextMin: number;
  onCollect: () => void;
}

/** One reward: its art, what you got, and what kind of reward it is. */
function Tile({ art, title, kind }: { art: ReactNode; title: string; kind: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[14px] bg-night-deep/50 p-2.5 text-center">
      <span className="flex h-10 items-center">{art}</span>
      <span className="na-body-strong line-clamp-1 text-foreground">{title}</span>
      <span className="na-label uppercase text-text-secondary">{kind}</span>
    </div>
  );
}

/**
 * Figma 12.2 "Caught: the Pokémon and the prize". GOTCHA! as on 3.7, the
 * Pokémon with no burst behind it, then the three rewards (shown only now,
 * after a right answer) and when the next round opens.
 */
export function WhosThatCaught({ id, name, isShiny, awardedXp, rewardName, rewardIcon, nextMin, onCollect }: CaughtScreenProps) {
  const species = findPokemon(id);
  return (
    <div className="na-bg-night flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+16px)]">
      <motion.div initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}>
        <NaWordmark kind="caught">GOTCHA!</NaWordmark>
      </motion.div>
      <div className="relative h-[200px] w-[300px] shrink-0">
        <FieldSprite id={id} shiny={isShiny} k={3.4} cx={150} feetY={0} centerY={100} />
        {[[40, 30, 20], [250, 20, 24], [262, 140, 16], [30, 150, 14]].map(([x, y, s], i) => (
          <span key={i} className="absolute text-success" style={{ left: x, top: y }}>
            <NaIcon name="sparkle" size={s} />
          </span>
        ))}
      </div>
      <h1 className="na-display-m text-center text-foreground">
        You caught {isShiny ? "a shiny " : ""}
        {name}!
      </h1>
      {species && (
        <div className="flex gap-1.5">
          {species.types.map((t) => (
            <NaTypeChip key={t} type={t} />
          ))}
        </div>
      )}
      <div className="na-glass flex w-full flex-col gap-2.5 rounded-[18px] p-3.5">
        <span className="na-label text-center uppercase text-text-secondary">Rewards</span>
        <div className="flex gap-2.5">
          <Tile art={<NaRewardIcon kind="XP" size={40} />} title={`+${awardedXp}`} kind="XP" />
          <Tile art={<img src={rewardIcon} alt={rewardName} className="h-10 w-10 object-contain [image-rendering:pixelated]" />} title={rewardName} kind="Item" />
          <Tile art={<NaGlossIcon kind="dex" size={36} />} title="Added to" kind="Pokédex" />
        </div>
      </div>
      <span className="flex items-center gap-1.5 rounded-full bg-white/[0.12] py-[5px] pl-2 pr-3">
        <span className="text-info">
          <NaIcon name="clock" size={14} />
        </span>
        <span className="na-label uppercase text-foreground">Next round in {nextMin} min</span>
      </span>
      <div className="min-h-2 flex-1" />
      <NaButton block onClick={onCollect}>
        Home
      </NaButton>
    </div>
  );
}
