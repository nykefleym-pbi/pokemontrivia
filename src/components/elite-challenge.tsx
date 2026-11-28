import { useEffect } from "react";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaButton } from "@/components/na/button";
import { NaTypeChip } from "@/components/na/type-chip";
import { FieldSprite, FittedTrainer } from "@/components/na/battle";
import { ItemIcon } from "@/components/game-ui";
import { ITEMS } from "@/lib/game-data";
import { ELITE_FOUR, type EliteMember } from "@/lib/elite-four";
import { useGameStore } from "@/lib/store";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Type colours light enough to need dark text on the button. */
const LIGHT_TYPES = new Set(["electric", "ice", "normal", "ground", "fairy", "bug", "steel", "flying"]);

/**
 * Figma 11.2 "The challenge: who she is and what you win". Opens from her stop
 * on the road (11.1); Back returns to Home, which stays open around her.
 */
export function EliteChallenge({
  elite,
  onStart,
  onBack,
  loading,
  takeover = false,
}: {
  elite: EliteMember;
  onStart: () => void;
  onBack?: () => void;
  loading: boolean;
  /** In place of Home until beaten: no Back, and the tab bar stays. */
  takeover?: boolean;
}) {
  // Opened on its own it is a full screen: the tab bar steps aside, as for every battle screen.
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    if (takeover) return;
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive, takeover]);

  const four = ELITE_FOUR.filter((m) => m.region === elite.region);
  const nth = four.findIndex((m) => m.id === elite.id) + 1;
  const type = cap(elite.type);
  const items = ["candy", "luckyegg"].map((id) => ITEMS.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);

  return (
    <div className={`na-bg-night flex h-full w-full flex-col overflow-y-auto pt-[env(safe-area-inset-top)] ${takeover ? "pb-nav" : "pb-[calc(env(safe-area-inset-bottom)+16px)]"}`}>
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        {onBack && !takeover && (
          <button type="button" aria-label="Back" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
            <NaIcon name="arrow-left" size={20} />
          </button>
        )}
        <h1 className="na-display-s flex-1 text-foreground">Elite Four</h1>
      </div>
      <div className="flex flex-1 flex-col items-center gap-3 px-4 pt-1">
        <span className="flex items-center gap-1.5">
          <NaGlossIcon kind="crown" size={16} />
          <span className="na-label uppercase text-[#FF7A85]">
            {elite.region} · {nth} of {four.length}
          </span>
          <NaGlossIcon kind="crown" size={16} />
        </span>
        {/* She and her Pokémon stand together, it just in front of her; no glow behind them (owner rule). */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="relative h-[180px] w-[358px] shrink-0">
          <div className="absolute left-[75px] top-[166px] h-[18px] w-[208px] rounded-[50%] bg-night-deep/35" />
          <FittedTrainer art={elite.trainerSpriteUrl} alt={elite.name} height={140} cx={143} feetY={159} />
          <FieldSprite id={elite.signaturePokemonId} k={1.8} cx={241} feetY={178} />
          <span className="absolute left-[33px] top-[18px] text-[#8FD8FF]">
            <NaIcon name="sparkle" size={18} />
          </span>
          <span className="absolute left-[301px] top-[14px] text-[#8FD8FF]">
            <NaIcon name="sparkle" size={16} />
          </span>
        </motion.div>
        <h2 className="na-display-l text-center uppercase text-foreground">{elite.name}</h2>
        <span className="flex items-center gap-2">
          <NaTypeChip type={elite.type} />
          <span className="na-caption text-text-secondary">{type}-type expert · 200 HP</span>
        </span>
        <p className="na-body-strong text-center text-foreground">“{elite.quote}”</p>
        <div className="na-glass flex w-full flex-col gap-2.5 rounded-[18px] p-3.5">
          <span className="na-label uppercase text-text-secondary">Win to get</span>
          <span className="flex items-center gap-2.5">
            <NaRewardIcon kind="Coin" size={28} />
            <span className="na-body-strong text-foreground">2,000 coins and Training Points</span>
          </span>
          <span className="flex items-center gap-2.5">
            {items.map((it) => (
              <ItemIcon key={it.id} item={it} className="h-7 w-7 shrink-0" />
            ))}
            <span className="na-body-strong text-foreground">A Rare Candy and a Lucky Egg</span>
          </span>
          <span className="flex items-center gap-2.5">
            <NaRewardIcon kind="Trophy" size={28} />
            <span className="na-body-strong text-foreground">Defeat all four to conquer {elite.region}!</span>
          </span>
        </div>
        <div className="min-h-4 flex-1" />
        {/* Paul 2026-11-28: the button wears her Pokémon's main type colour. */}
        <NaButton
          block
          disabled={loading}
          onClick={onStart}
          style={{
            background: `var(--type-${elite.type.toLowerCase()})`,
            boxShadow: `0 4px 0 color-mix(in srgb, var(--type-${elite.type.toLowerCase()}) 55%, black)`,
            color: LIGHT_TYPES.has(elite.type.toLowerCase()) ? "#0B1030" : "#FFFFFF",
          }}
        >
          Challenge {elite.name}
        </NaButton>
        <p className="na-caption text-center text-text-secondary">Tough {type}-type questions await! Win to unlock the next route!</p>
      </div>
    </div>
  );
}
