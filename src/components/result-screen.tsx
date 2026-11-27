import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronRight, FileText } from "lucide-react";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaButton } from "@/components/na/button";
import { NaCatchCard, NaGlassRow, NaRewardTile, NaWordmark, VictoryHero } from "@/components/na/celebration";
import { SaveProgressSheet } from "@/components/save-progress-sheet";
import { MistakesReview } from "@/components/mistakes-review";
import { RemindSheet } from "@/components/remind-sheet";
import { getPushSubscriptionState, pushSupported } from "@/lib/push";
import { isIos, isStandalone } from "@/lib/install-prompt";
import { PokemonSprite } from "@/components/game-ui";
import { useGameStore } from "@/lib/store";
import { GENERATIONS } from "@/lib/dex-rewards";
import { useDailyGift } from "@/lib/use-daily-gift";
import type { MissedAnswer } from "@/lib/trivia-core";

export function ResultScreen({
  won,
  opponentName,
  correctCount,
  totalQuestions,
  xpEarned,
  tpEarned,
  coinsEarned,
  speedBonus,
  newTrophies: _newTrophies,
  badgeEarned,
  missed,
  durationMs,
  caught,
  onRebattle,
  onBackHome,
  onRematch,
  hideRematch,
  canShare,
  onShare,
}: {
  won: boolean;
  opponentName: string;
  correctCount: number;
  totalQuestions: number;
  xpEarned: number;
  tpEarned: number;
  coinsEarned: number;
  speedBonus: number;
  partnerName: string;
  partnerId: number;
  streak: number;
  streakKept: boolean;
  currentLevel: number;
  xpIntoLevel: number;
  xpForThisLevel: number;
  levelProgressPct: number;
  newTrophies: Array<{ name: string }>;
  /**
   * The Gym Badge this win earned, if any.
   *
   * Weekly League only: it is the whole point of the mode — one attempt a week,
   * and a badge you keep — and it was the one reward the screen never mentioned.
   */
  badgeEarned?: { name: string; iconUrl: string };
  missed: MissedAnswer[];
  /** First question to the end, for the Time tile. */
  durationMs?: number;
  /** The Pokémon this win caught (every win does), for the catch card. */
  caught?: { id: number; name: string; isNew: boolean; shiny: boolean };
  onRebattle: () => void;
  onBackHome: () => void;
  onRematch?: () => void;
  /** Drop the rematch button entirely, for modes that are one attempt and have
   *  nothing to start again (Weekly League, Daily Quest). */
  hideRematch?: boolean;
  canShare?: boolean;
  onShare?: () => void;
}) {
  // Both outcomes are full-screen takeovers, so the bottom nav has no business
  // floating over them. `setBattleScreenActive` is a claim counter: ONE claim,
  // ONE release (see lib/store.ts).
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive]);

  // 1.5/1.6: a guest is asked to save a trainer name after every win until they
  // do (owner ruling 2026-11-26); the sheet rises once the rewards have landed.
  const isGuest = useGameStore((s) => s.isGuest);
  // "Your first Pokédex entry!" (1.5): this win's catch is the only one so far.
  const pokedex = useGameStore((s) => s.pokedex);
  const firstCatch = Object.values(pokedex).filter((e) => e?.caught).length <= 1;
  // 4.1 catch card: "Unova: 1 of 156 caught".
  const region = caught ? GENERATIONS.find((g) => caught.id >= g.from && caught.id <= g.to) : undefined;
  const regionLine = region
    ? ` · ${region.region}: ${Object.entries(pokedex).filter(([id, e]) => +id >= region.from && +id <= region.to && e?.caught).length} of ${region.to - region.from + 1} caught`
    : "";
  const [saveOpen, setSaveOpen] = useState(false);
  useEffect(() => {
    if (!won || !isGuest) return;
    const t = window.setTimeout(() => setSaveOpen(true), 1400);
    return () => window.clearTimeout(t);
  }, [won, isGuest]);
  const [mistakesOpen, setMistakesOpen] = useState(false);
  const gift = useDailyGift(60_000);

  // 4.1 Tomorrow row: where reminders can be turned on and are not yet, or on an
  // iPhone in Safari, where the ask becomes the install steps (4.5b).
  const [canRemind, setCanRemind] = useState(false);
  const [iosInstall, setIosInstall] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  useEffect(() => {
    if (!won) return;
    if (isIos() && !isStandalone()) {
      setIosInstall(true);
      return;
    }
    if (!pushSupported()) return;
    let live = true;
    void getPushSubscriptionState().then((s) => live && setCanRemind(!s.subscribed));
    return () => {
      live = false;
    };
  }, [won]);

  const accuracy = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;
  const secs = Math.max(0, Math.round((durationMs ?? 0) / 1000));
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
  const tiles = (
    <div className="flex gap-[9px]">
      <NaRewardTile tone="xp" label="Total XP" value={`+${xpEarned}`} icon={<NaRewardIcon kind="XP" size={30} />} />
      <NaRewardTile tone="success" label="Accuracy" value={`${accuracy}%`} icon={<NaRewardIcon kind="Accuracy" size={30} />} />
      <NaRewardTile tone="info" label="Time" value={time} icon={<NaRewardIcon kind="Time" size={30} />} />
    </div>
  );
  const review = mistakesOpen && <MistakesReview missed={missed} onClose={() => setMistakesOpen(false)} />;

  if (!won) {
    // Figma 4.7 Defeat: still worth something — the same tiles, and the mistakes to learn from.
    const n = missed.length;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="relative flex h-full w-full flex-col items-center gap-3.5 overflow-y-auto px-4 pt-[calc(env(safe-area-inset-top)+12px)] screen-bottom"
      >
        <NaWordmark kind="soclose">SO CLOSE!</NaWordmark>
        <p className="na-body-strong text-center text-text-secondary">
          {opponentName} won this time · {correctCount} of {totalQuestions} right
        </p>
        {tiles}
        {n > 0 && (
          <NaGlassRow
            tone="gold"
            lead={<NaRewardIcon kind="Accuracy" size={36} />}
            title={`See your ${n} ${n === 1 ? "mistake" : "mistakes"}`}
            sub="Learn the right answers."
            onClick={() => setMistakesOpen(true)}
            trailing={<ChevronRight className="h-[18px] w-[18px] text-text-muted" aria-hidden />}
          />
        )}
        <div className="min-h-2 flex-1" />
        {!hideRematch && (
          <NaButton block onClick={() => (onRematch ? onRematch() : onRebattle())}>
            Try again
          </NaButton>
        )}
        <NaButton kind={hideRematch ? "primary" : "text"} size={hideRematch ? "L" : "M"} block={!!hideRematch} onClick={onBackHome}>
          Home
        </NaButton>
        {review}
      </motion.div>
    );
  }

  return (
    // Figma 4.1 Victory (and 1.5 First win): thunder, then the rewards, then
    // what is next. One screen, no level bar: goals live on Home and Profile.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+8px)]"
    >
      <VictoryHero />
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="na-body-strong text-text-secondary">
          You beat {opponentName} · {correctCount} of {totalQuestions} right
        </span>
        {missed.length > 0 && (
          <button
            type="button"
            onClick={() => setMistakesOpen(true)}
            className="na-label uppercase flex items-center gap-1 rounded-full bg-white/[0.12] px-2.5 py-1 text-foreground"
          >
            <FileText className="h-3.5 w-3.5 text-reward-gold" aria-hidden />
            {missed.length} {missed.length === 1 ? "mistake" : "mistakes"}
          </button>
        )}
      </div>

      {tiles}

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {coinsEarned > 0 && (
          <span className="na-body-strong flex items-center gap-1.5 text-foreground">
            <NaRewardIcon kind="Coin" size={24} /> +{coinsEarned} coins
          </span>
        )}
        {tpEarned > 0 && (
          <span className="na-body-strong flex items-center gap-1.5 text-foreground">
            <NaRewardIcon kind="TP" size={24} /> +{tpEarned} Training Points
          </span>
        )}
        {speedBonus > 0 && <span className="na-body-strong text-success">+{speedBonus} speed bonus</span>}
      </div>

      {badgeEarned && <BadgeRow badge={badgeEarned} />}

      {caught && (
        <NaCatchCard
          big={caught.isNew && firstCatch}
          sprite={(px) => (
            <PokemonSprite
              id={caught.id}
              shiny={caught.shiny}
              alt={caught.name}
              className={`sprite max-w-none shrink-0 ${px > 100 ? "h-[200px] w-[200px]" : "h-[68px] w-[68px]"}`}
            />
          )}
          title={`You caught ${caught.name}!`}
          isNew={caught.isNew}
          sub={(caught.isNew ? (firstCatch ? "Your first Pokédex entry!" : "New Pokédex entry!") : `${caught.name} is in your Pokédex.`) + regionLine}
        />
      )}

      {isGuest ? (
        <NaGlassRow
          tone="gold"
          lead={<NaRewardIcon kind="Trophy" size={40} />}
          title="Save your progress"
          sub="Choose a trainer name to keep your Pokémon and progress safe!"
          onClick={() => setSaveOpen(true)}
          trailing={
            <span className="na-btn na-btn-m na-btn-gold pointer-events-none" aria-hidden>
              Save
            </span>
          }
        />
      ) : (
        (canRemind || iosInstall) && (
          <NaGlassRow
            lead={<NaRewardIcon kind="Gift" size={36} />}
            title="Tomorrow"
            sub={`Your next Daily Quest and Day ${gift.claimable ? (gift.nextDay % 7) + 1 : gift.nextDay} gift are waiting!`}
            trailing={
              <NaButton kind="secondary" size="M" onClick={() => setRemindOpen(true)}>
                Remind me
              </NaButton>
            }
          />
        )
      )}

      <div className="min-h-2 flex-1" />
      {/* Next battle starts the next one on the spot when the caller gives us
          a way to (owner request 2026-07-26). One-attempt modes (Daily, the
          Weekly League) set hideRematch rather than a button that only left. */}
      {!hideRematch && (
        <NaButton block onClick={() => (onRematch ? onRematch() : onRebattle())}>
          Next battle
        </NaButton>
      )}
      <div className="flex w-full gap-2.5">
        {canShare && onShare && (
          <NaButton kind="secondary" size="M" className="flex-1" onClick={onShare}>
            Share
          </NaButton>
        )}
        <NaButton kind={hideRematch ? "primary" : "text"} size={hideRematch ? "L" : "M"} className="flex-1" onClick={onBackHome}>
          Home
        </NaButton>
      </div>

      <SaveProgressSheet open={saveOpen} onOpenChange={setSaveOpen} />
      <RemindSheet open={remindOpen} onOpenChange={setRemindOpen} ios={iosInstall} onEnabled={() => setCanRemind(false)} />
      {review}
    </motion.div>
  );
}

/**
 * The Gym Badge a Weekly League win earns: louder than the XP and coin rows,
 * because it is the only permanent reward here and the one the mode exists for.
 */
function BadgeRow({ badge }: { badge: { name: string; iconUrl: string } }) {
  return (
    <div className="mt-2 flex items-center gap-3 rounded-2xl border-2 border-poke-yellow/60 bg-poke-yellow/15 px-3 py-2">
      <img
        src={encodeURI(badge.iconUrl)}
        alt={badge.name}
        draggable={false}
        className="h-11 w-11 shrink-0 object-contain drop-shadow"
      />
      <div className="min-w-0">
        <div className="font-pixel-xs uppercase tracking-wide text-foreground/60">Badge earned</div>
        <div className="truncate font-display-md leading-tight text-foreground">{badge.name}</div>
      </div>
    </div>
  );
}
