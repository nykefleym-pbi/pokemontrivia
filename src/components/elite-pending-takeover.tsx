import { motion } from "framer-motion";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PokemonSprite } from "@/components/game-ui";
import type { EliteMember } from "@/lib/elite-four";

export function ElitePendingTakeover({
  elite,
  onStart,
  loading,
}: {
  elite: EliteMember;
  onStart: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-elite-arena relative flex h-full w-full flex-col overflow-y-auto pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+8rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-poke-dark/40 via-transparent to-poke-dark/70" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex items-center justify-center gap-2 font-pixel text-[10px] tracking-[0.3em] text-poke-yellow"
      >
        <Crown className="h-3 w-3" /> ELITE FOUR <Crown className="h-3 w-3" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mx-auto mt-6 flex w-full max-w-xs flex-col items-center text-center"
      >
        <div className="relative flex items-end justify-center gap-2">
          <div className="absolute inset-0 -m-6 rounded-full bg-poke-yellow/15 blur-3xl" />
          <img
            src={elite.trainerSpriteUrl}
            alt={elite.name}
            crossOrigin="anonymous"
            className="sprite relative h-40 w-40 object-contain drop-shadow-2xl"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
          <PokemonSprite
            id={elite.signaturePokemonId}
            alt={elite.signaturePokemonName}
            className="sprite relative h-28 w-28 object-contain drop-shadow-2xl"
          />
        </div>
        <p className="mt-3 font-pixel text-[10px] tracking-[0.25em] text-poke-yellow/80">
          {elite.title.toUpperCase()}
        </p>
        <h1 className="mt-2 text-5xl font-extrabold leading-none text-poke-yellow drop-shadow">
          {elite.name}
        </h1>
        <p className="mt-3 text-xs text-poke-yellow/70">
          {elite.region} · {elite.type.toUpperCase()} specialist · 200 HP boss
        </p>
        <p className="mt-4 text-sm italic leading-relaxed text-poke-yellow/85">"{elite.quote}"</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-poke-yellow/40 bg-poke-dark/50 px-3 py-1 text-[11px] font-semibold text-poke-yellow">
            🏅 Region unlock
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-poke-yellow/40 bg-poke-dark/50 px-3 py-1 text-[11px] font-semibold text-poke-yellow">
            🪙 2,000 Coins
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-poke-yellow/40 bg-poke-dark/50 px-3 py-1 text-[11px] font-semibold text-poke-yellow">
            🎁 Rare Candy + Lucky Egg
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="relative mx-auto mt-12 mb-auto flex w-full max-w-xs flex-col gap-3 pt-8"
      >
        {loading ? (
          <Skeleton className="h-14 w-full rounded-full" />
        ) : (
          <Button
            size="lg"
            onClick={onStart}
            className="h-14 w-full rounded-full bg-poke-yellow text-base font-bold text-foreground shadow-pop hover:bg-poke-yellow/90"
          >
            <Crown className="mr-2 h-5 w-5" /> Challenge {elite.name}
          </Button>
        )}
        <p className="text-center font-pixel text-[9px] tracking-[0.2em] text-poke-yellow/50">
          REGULAR BATTLES LOCKED UNTIL VICTORY
        </p>
      </motion.div>
    </div>
  );
}
