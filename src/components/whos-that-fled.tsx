import { motion } from "framer-motion";
import { FieldSprite } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { NaWordmark } from "@/components/na/celebration";
import { NaIcon } from "@/components/na/icon";
import { NaTypeChip } from "@/components/na/type-chip";
import { findPokemon } from "@/lib/pokemon-data";

export interface FledScreenProps {
  id: number;
  name: string;
  /** What the player answered, when the round asked for a name. */
  guess?: string;
  /** The Pokédex flavour text. `null` while it is still being fetched. */
  flavor: string | null;
  /** True once the fetch has settled, whatever the outcome. */
  flavorSettled: boolean;
  genus?: string | null;
  heightM?: number | null;
  /** Minutes until the next round opens. */
  nextMin: number;
  /** How the round was lost: telling a player who answered that they ran out of time is simply wrong. */
  reason: "timeout" | "wrong";
  onClose: () => void;
}

/**
 * Figma 12.3 "Fled: learn who it was". IT FLED!, what you guessed and who it
 * was, the Pokémon dashing off to the left (two fading after-images, speed
 * streaks, a puff of dust at its back feet), then its Pokédex entry so a miss
 * still teaches you something.
 */
export function WhosThatFled({ id, name, guess, flavor, flavorSettled, genus, heightM, nextMin, reason, onClose }: FledScreenProps) {
  const species = findPokemon(id);
  // The dash: the sprite (3 pt per pixel) on the left of a 300 x 170 stage, facing the way it runs.
  const ex = 18, cy = 85;
  return (
    <div className="na-bg-night flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-[calc(env(safe-area-inset-top)+16px)] text-center">
      <NaWordmark kind="soclose">IT FLED!</NaWordmark>
      <p className="na-body-strong text-text-secondary">
        {reason === "timeout" ? "You couldn’t guess it in time." : guess ? `‘${guess}’ wasn’t the right guess.` : "That wasn’t the right guess."} It was{" "}
        <span>{name}</span>!
      </p>
      <motion.div className="relative h-[170px] w-[300px] shrink-0" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.35, ease: "easeOut" }}>
        {[[96, 0.12], [50, 0.28]].map(([dx, op]) => (
          <span key={dx} className="absolute inset-0" style={{ opacity: op }}>
            <FieldSprite id={id} k={3} cx={ex + dx + 72} feetY={0} centerY={cy} />
          </span>
        ))}
        <FieldSprite id={id} k={3} cx={ex + 72} feetY={0} centerY={cy} />
        {[[cy - 36, 9], [cy - 10, 12], [cy + 18, 8]].map(([y, n]) =>
          Array.from({ length: n }, (_, i) => (
            <span
              key={`${y}-${i}`}
              className="absolute h-1.5 bg-white"
              style={{ left: ex + 79 + i * 12, top: y, width: i < 3 ? 10 : 6, opacity: Math.max(0.08, 0.7 - i * 0.07) }}
            />
          )),
        )}
        {[[0, 0, 22, 0.35], [18, -10, 16, 0.25], [30, 6, 12, 0.18], [44, -4, 8, 0.12]].map(([dx, dy, d, op]) => (
          <span key={dx} className="absolute rounded-full bg-text-secondary" style={{ left: ex + 120 + dx, top: cy + 30 + dy, width: d, height: d, opacity: op }} />
        ))}
      </motion.div>
      <div className="na-glass flex w-full flex-col gap-2 rounded-[18px] p-3.5 text-left">
        <span className="na-label uppercase text-reward-gold">Pokédex entry</span>
        <span className="flex flex-wrap items-center gap-1.5">
          {species?.types.map((t) => <NaTypeChip key={t} type={t} />)}
          {genus && <span className="na-body-strong rounded-full bg-white/[0.12] px-3 py-1 text-foreground">{genus}</span>}
          {heightM != null && <span className="na-body-strong rounded-full bg-white/[0.12] px-3 py-1 text-foreground">{heightM} m</span>}
        </span>
        {!flavorSettled ? (
          <p className="na-body text-text-muted">Reading the Pokédex…</p>
        ) : flavor ? (
          <p className="na-body text-foreground">“{flavor}”</p>
        ) : (
          <p className="na-body text-text-muted">No Pokédex entry available.</p>
        )}
      </div>
      <span className="flex items-center gap-1.5 rounded-full bg-white/[0.12] py-[5px] pl-2 pr-3">
        <span className="text-info">
          <NaIcon name="clock" size={14} />
        </span>
        <span className="na-label uppercase text-foreground">Next round in {nextMin} min</span>
      </span>
      <div className="min-h-2 flex-1" />
      <NaButton block onClick={onClose}>
        Home
      </NaButton>
    </div>
  );
}
