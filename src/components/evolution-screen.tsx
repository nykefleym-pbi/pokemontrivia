import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { FieldSprite } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { NaGlassRow } from "@/components/na/celebration";
import { playSfx, playCry, playEvolutionCue } from "@/lib/audio";
import { canEvolve, getEvolutionTargets, type PokeEntry } from "@/lib/pokemon-data";
import { useGameStore } from "@/lib/store";
import { EVOLUTION_TP_COST, trainerSpriteUrl, rankForLevel } from "@/lib/game-data";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";

interface Props {
  from: PokeEntry;
  to: PokeEntry;
  onComplete: () => void;
}

type Phase = "glow" | "flicker" | "burst" | "done";

const SPRITE = (id: number) => `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${id}.png`;

/**
 * Figma 4.8 "Evolution: the moment, then what is next". The partner glows, its
 * old and new shapes flicker faster and faster, a burst of light, and the new
 * form stands on its platform; then the next goal in Training Points.
 */
export function EvolutionScreen({ from, to, onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("glow");
  const [showTo, setShowTo] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const level = useGameStore((s) => s.level);
  const stats = useGameStore((s) => s.stats);
  const tp = useGameStore((s) => s.trainingPoints[to.id] ?? 0);

  const nextTarget = canEvolve(to) ? getEvolutionTargets(to)[0] : undefined;
  const stage = to.evolutionStage;
  const cost = stage === 1 || stage === 2 ? EVOLUTION_TP_COST[stage] : null;

  const shareData: ShareData = {
    type: "evolution",
    trainerName: trainerName || "Trainer",
    trainerSpriteUrl: trainerSpriteUrl(trainerSprite),
    fromPokemonId: from.id,
    fromName: from.name,
    toPokemonId: to.id,
    toName: to.name,
    toShiny: false,
    level,
    rank: rankForLevel(level),
    statBattles: stats.battles,
    statWins: stats.wins,
    statLosses: stats.losses,
    statBestStreak: stats.bestStreak,
    statCorrect: stats.correct,
    statAnswered: stats.answered,
    statTotalAnswerTime: stats.totalAnswerTime,
    dateISO: new Date().toISOString().slice(0, 10),
  };

  // 0.0 s glow · 1.2 s flicker, faster and faster · 2.9 s burst · 3.3 s the new form.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    playEvolutionCue();
    timers.push(setTimeout(() => setPhase("flicker"), 1200));
    let t = 1200;
    let gap = 260;
    let on = false;
    while (t < 2900) {
      const show = (on = !on);
      timers.push(setTimeout(() => setShowTo(show), t));
      t += gap;
      gap = Math.max(60, gap * 0.8);
    }
    timers.push(setTimeout(() => { setPhase("burst"); setShowTo(true); playSfx("evolution_glow"); }, 2900));
    timers.push(
      setTimeout(() => {
        setPhase("done");
        playSfx("evolution_complete");
        playCry(to.id);
      }, 3300),
    );
    return () => timers.forEach(clearTimeout);
  }, [to.id]);

  const done = phase === "done";
  const id = showTo ? to.id : from.id;

  return (
    <div className="na-bg-night fixed inset-0 z-[100] flex flex-col items-center gap-3 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+28px)]">
      <motion.span key={done ? "c" : "e"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="na-label text-center uppercase text-reward-gold">
        {done ? "Congratulations!" : "What?"}
      </motion.span>
      <motion.h1 key={done ? "d" : "w"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="na-display-m text-center text-foreground">
        {done ? `${from.name} evolved into ${to.name}!` : `${from.name} is evolving!`}
      </motion.h1>

      <div className="relative h-[280px] w-[330px] shrink-0">
        <img
          src="/battle/field/pad-player-morning.png"
          alt=""
          aria-hidden
          draggable={false}
          className="absolute left-[61px] top-[214px] h-[72px] w-[208px] max-w-none [image-rendering:pixelated]"
        />
        {/* 3 pt per sprite pixel, feet on the pad (Figma spr(id, 3)). Before the reveal the
            shape is drawn in white light, glowing harder as it goes. */}
        <FieldSprite
          key={done ? "to" : id}
          id={done ? to.id : id}
          k={3}
          cx={165}
          feetY={226}
          style={done ? undefined : { filter: `brightness(0) invert(1) drop-shadow(0 0 ${phase === "glow" ? 6 : 14}px #fff)` }}
        />
        <span className="sr-only">{done ? to.name : `${from.name} is evolving`}</span>
        {phase === "burst" && (
          <motion.span
            aria-hidden
            className="absolute left-1/2 top-[136px] h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white"
            initial={{ scale: 0.2, opacity: 1 }}
            animate={{ scale: 4, opacity: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        )}
        {done &&
          [
            [40, 60, 20],
            [276, 40, 24],
            [290, 150, 16],
            [30, 170, 14],
          ].map(([x, y, s], i) => (
            <motion.span
              key={i}
              className="absolute text-foreground"
              style={{ left: x, top: y }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.08 }}
            >
              <NaIcon name="sparkle" size={s} />
            </motion.span>
          ))}
      </div>

      {done && nextTarget && cost !== null && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="w-full">
          <NaGlassRow
            lead={
              <span
                aria-hidden
                className="block h-11 w-11 bg-[#3b4a8c]"
                style={{ maskImage: `url(${SPRITE(nextTarget.id)})`, WebkitMaskImage: `url(${SPRITE(nextTarget.id)})`, maskSize: "100% 100%", WebkitMaskSize: "100% 100%" }}
              />
            }
            title={`Next: ${nextTarget.name}`}
            sub={tp >= cost ? "Ready to evolve!" : `${(cost - tp).toLocaleString("en-US")} Training Points to go`}
          />
        </motion.div>
      )}

      <div className="min-h-2 flex-1" />
      {done && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="flex w-full flex-col gap-4">
          <NaButton block onClick={onComplete}>
            Let&apos;s go!
          </NaButton>
          <NaButton kind="secondary" size="M" block onClick={() => setShareOpen(true)}>
            Share
          </NaButton>
        </motion.div>
      )}

      <ShareCardDialog open={shareOpen} onClose={() => setShareOpen(false)} data={shareData} />
    </div>
  );
}
