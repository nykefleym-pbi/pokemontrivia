import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { playSfx } from "@/lib/audio";
import type { MegaEvent } from "@/lib/mega/schedule";
import { useGameStore } from "@/lib/store";
import { trainerSpriteUrl } from "@/lib/game-data";
import { FieldSprite } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { NaGlassRow, NaRewardTile, NaWordmark } from "@/components/na/celebration";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";

export interface MegaRewardItem {
  id: string;
  name: string;
  iconUrl: string;
  qty: number;
}

interface MegaResultsProps {
  event: MegaEvent;
  outcome: "win" | "loss";
  accuracy: number; // 0–100 integer
  correct: number;
  total: number;
  timeMs: number;
  rank: number | null;
  shiny: boolean;
  items: MegaRewardItem[];
  canRematch: boolean;
  onRematch: () => void;
  onHome: () => void;
  onViewLeaderboard: () => void;
}

function fmtTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Figma 13.3 "Raid result: your rank so far". RAID VICTORY! (or, under 40
 * right, the boss gets away and the second try is offered), the boss, accuracy,
 * time and your rank so far (it opens the leaderboard), and when rewards come.
 */
export function MegaResults({ event, outcome, accuracy, correct, total, timeMs, rank, shiny, canRematch, onRematch, onHome, onViewLeaderboard }: MegaResultsProps) {
  const win = outcome === "win";
  const [shareOpen, setShareOpen] = useState(false);
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const level = useGameStore((s) => s.level);
  const ends = new Date(event.endsAt).toLocaleDateString("en-US", { weekday: "long" });

  useEffect(() => {
    playSfx(win ? "victory" : "defeat");
    if (win) {
      const a = setTimeout(() => playSfx("cheer"), 450);
      const b = shiny ? setTimeout(() => playSfx("shiny"), 950) : undefined;
      return () => {
        clearTimeout(a);
        if (b) clearTimeout(b);
      };
    }
    const c = setTimeout(() => playSfx("disappointed"), 450);
    return () => clearTimeout(c);
  }, [win, shiny]);

  // Row 9 "Raid won" story card.
  const shareData = useMemo<ShareData>(
    () => ({
      type: "mega",
      trainerName: trainerName || "Trainer",
      trainerSpriteUrl: trainerSpriteUrl(trainerSprite),
      level,
      bossName: event.name,
      megaId: event.megaId,
      shiny,
      correct,
      total,
      rank,
      timeMs,
      dateISO: new Date().toISOString().slice(0, 10),
    }),
    [trainerName, trainerSprite, level, event, shiny, correct, total, rank, timeMs],
  );

  return (
    <div className="na-bg-night flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+12px)]">
      <motion.div initial={{ scale: 1.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 16 }}>
        <NaWordmark kind={win ? "victory" : "soclose"} className="text-center">
          {win ? "RAID" : "IT GOT"}
          <br />
          {win ? "VICTORY!" : "AWAY!"}
        </NaWordmark>
      </motion.div>
      <div className="relative h-[160px] w-[300px] shrink-0">
        <FieldSprite id={event.megaId} shiny={shiny} k={1.6} cx={150} feetY={0} centerY={80} />
      </div>
      <p className="na-body-strong text-center text-text-secondary">
        {win ? `You defeated ${event.name}!` : `${event.name} got away · ${correct} of ${total} right`}
      </p>
      <div className="flex items-stretch gap-[9px]">
        <NaRewardTile tone="success" label="Accuracy" value={`${accuracy}%`} icon={<NaRewardIcon kind="Accuracy" size={30} />} />
        <NaRewardTile tone="info" label="Time" value={fmtTime(timeMs)} icon={<NaRewardIcon kind="Time" size={30} />} />
        <button
          type="button"
          onClick={onViewLeaderboard}
          className="na-fill-gold flex w-[100px] flex-col items-center justify-center rounded-2xl px-4 py-2.5 shadow-[0_4px_0_#B07A00] press"
        >
          <span className="na-label whitespace-pre-line text-center uppercase text-on-gold">{`Current\nrank:\n${rank ? `#${rank}` : "—"}`}</span>
        </button>
      </div>
      <div className="w-full">
        <NaGlassRow
          tone="gold"
          lead={<NaRewardIcon kind="Trophy" size={36} />}
          title="Rewards arrive when the raid ends!"
          sub={`Your final rank determines your rewards. Return ${ends} to claim them!`}
        />
      </div>
      <div className="min-h-2 flex-1" />
      {!win && canRematch && (
        <NaButton block onClick={onRematch}>
          Try again (1 try left)
        </NaButton>
      )}
      <NaButton block kind={!win && canRematch ? "secondary" : "primary"} size={!win && canRematch ? "M" : "L"} onClick={onViewLeaderboard}>
        View leaderboard
      </NaButton>
      {win && (
        <NaButton kind="secondary" size="M" block onClick={() => setShareOpen(true)}>
          Share
        </NaButton>
      )}
      <NaButton kind="text" size="M" block onClick={onHome}>
        Back to home
      </NaButton>
      {win && <ShareCardDialog open={shareOpen} onClose={() => setShareOpen(false)} data={shareData} />}
    </div>
  );
}
