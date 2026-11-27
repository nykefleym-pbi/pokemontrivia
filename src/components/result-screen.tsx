import { useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaButton } from "@/components/na/button";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { GYM_LEADERS } from "@/lib/gym-leaders";
import { ITEMS } from "@/lib/game-data";
import { ACHIEVEMENTS } from "@/lib/achievements";
import { FittedTrainer } from "@/components/na/battle";
import { ItemIcon } from "@/components/game-ui";
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
import { dayStreak, weekWins } from "@/lib/win-streak";
import { StreakSafe } from "@/components/streak-safe";

const STREAK_SHOWN_KEY = "poke-trivia-streak-shown";
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
  eliteWin,
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
  badgeEarned?: { name: string; iconUrl: string; leader: string };
  /** An Elite Four win (11.3): who fell and the region's four. */
  eliteWin?: EliteWinInfo;
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
  // 4.2: the first win of the day shows the day streak on the way out (Next battle or Home).
  const battleLog = useGameStore((s) => s.battleLog);
  const [streakThen, setStreakThen] = useState<null | (() => void)>(null);
  function leave(go: () => void) {
    const today = new Date().toISOString().slice(0, 10);
    let shown: string | null = null;
    try {
      shown = localStorage.getItem(STREAK_SHOWN_KEY);
    } catch {
      /* private mode: show it */
    }
    if (won && !isGuest && shown !== today && dayStreak(battleLog).secured) {
      try {
        localStorage.setItem(STREAK_SHOWN_KEY, today);
      } catch {
        /* ignore */
      }
      setStreakThen(() => go);
    } else go();
  }

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
            trailing={<NaIcon name="chevron-right" size={18} className="text-text-muted" />}
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

  if (badgeEarned || eliteWin) {
    return (
      <>
        {eliteWin ? (
          <EliteWon
            elite={eliteWin}
            accuracy={accuracy}
            time={time}
            coinsEarned={coinsEarned}
            tpEarned={tpEarned}
            trophies={_newTrophies}
            canShare={canShare}
            onShare={onShare}
            onHome={() => leave(onBackHome)}
          />
        ) : (
          <BadgeWon
            badge={badgeEarned!}
            tiles={tiles}
            coinsEarned={coinsEarned}
            tpEarned={tpEarned}
            canShare={canShare}
            onShare={onShare}
            onHome={() => leave(onBackHome)}
          />
        )}
        <SaveProgressSheet open={saveOpen} onOpenChange={setSaveOpen} />
        {streakThen && (
          <StreakSafe
            days={dayStreak(battleLog).days}
            week={weekWins(battleLog)}
            today={(new Date().getUTCDay() + 6) % 7}
            onContinue={() => {
              const go = streakThen;
              setStreakThen(null);
              go();
            }}
          />
        )}
      </>
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
            <NaIcon name="review" size={14} className="text-reward-gold" />
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
        <NaButton block onClick={() => leave(() => (onRematch ? onRematch() : onRebattle()))}>
          Next battle
        </NaButton>
      )}
      <div className="flex w-full gap-2.5">
        {canShare && onShare && (
          <NaButton kind="secondary" size="M" className="flex-1" onClick={onShare}>
            Share
          </NaButton>
        )}
        <NaButton kind={hideRematch ? "primary" : "text"} size={hideRematch ? "L" : "M"} className="flex-1" onClick={() => leave(onBackHome)}>
          Home
        </NaButton>
      </div>

      <SaveProgressSheet open={saveOpen} onOpenChange={setSaveOpen} />
      {streakThen && (
        <StreakSafe
          days={dayStreak(battleLog).days}
          week={weekWins(battleLog)}
          today={(new Date().getUTCDay() + 6) % 7}
          onContinue={() => {
            const go = streakThen;
            setStreakThen(null);
            go();
          }}
        />
      )}
      <RemindSheet open={remindOpen} onOpenChange={setRemindOpen} ios={iosInstall} onEnabled={() => setCanRemind(false)} />
      {review}
    </motion.div>
  );
}

/**
 * Figma 10.3 "Badge earned: the badge is the hero". The badge drops in spinning,
 * slams down with a shake (0.4 s), then BADGE EARNED! slams in and the rewards
 * rise (0.8 s). No rings or glow behind it (owner rule: no sunbursts).
 */
/** The Elite Four member a win just beat, and her region's four for the progress row (11.3). */
export interface EliteWinInfo {
  name: string;
  region: string;
  members: Array<{ id: string; name: string; art: string; unlockLevel: number }>;
  defeated: string[];
}

/**
 * Figma 11.3 "Elite Four win": the Victory hero, accuracy and time, every reward
 * in one card (no XP), the trophy it unlocked, and how far through the region you are.
 */
function EliteWon({
  elite,
  accuracy,
  time,
  coinsEarned,
  tpEarned,
  trophies,
  canShare,
  onShare,
  onHome,
}: {
  elite: EliteWinInfo;
  accuracy: number;
  time: string;
  coinsEarned: number;
  tpEarned: number;
  trophies: Array<{ name: string }>;
  canShare?: boolean;
  onShare?: () => void;
  onHome: () => void;
}) {
  const items = ["candy", "luckyegg"].map((id) => ITEMS.find((x) => x.id === id)).filter((x): x is NonNullable<typeof x> => !!x);
  const trophy = trophies.map((t) => ACHIEVEMENTS.find((a) => a.name === t.name)).find((a) => a && a.id.startsWith("elite_"));
  const done = new Set(elite.defeated);
  const rise = (d: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.3 } });
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+8px)]"
    >
      <VictoryHero />
      <p className="na-body-strong text-center text-text-secondary">You defeated {elite.name} of the Elite Four!</p>
      <motion.div {...rise(0.6)} className="flex gap-[9px]">
        <NaRewardTile tone="success" label="Accuracy" value={`${accuracy}%`} icon={<NaRewardIcon kind="Accuracy" size={30} />} />
        <NaRewardTile tone="info" label="Time" value={time} icon={<NaRewardIcon kind="Time" size={30} />} />
      </motion.div>
      <motion.div {...rise(0.7)} className="na-glass flex w-full flex-col gap-2.5 rounded-[18px] p-3.5">
        <span className="flex items-center gap-2.5">
          <NaRewardIcon kind="Coin" size={28} />
          <span className="na-body-strong text-foreground">+{coinsEarned.toLocaleString("en-US")} coins</span>
        </span>
        {tpEarned > 0 && (
          <span className="flex items-center gap-2.5">
            <NaRewardIcon kind="TP" size={28} />
            <span className="na-body-strong text-foreground">+{tpEarned} Training Points</span>
          </span>
        )}
        <span className="flex items-center gap-2.5">
          {items.map((it) => (
            <ItemIcon key={it.id} item={it} className="h-7 w-7 shrink-0" />
          ))}
          <span className="na-body-strong text-foreground">+1 Rare Candy and +1 Lucky Egg</span>
        </span>
      </motion.div>
      {trophy && (
        <motion.div {...rise(0.8)} className="w-full">
          <NaGlassRow
            tone="gold"
            lead={<NaRewardIcon kind="Trophy" size={40} />}
            title={`New trophy: ${trophy.name}`}
            sub={trophy.id === "elite_first" ? "Your first Elite Four victory!" : trophy.desc}
          />
        </motion.div>
      )}
      <motion.div {...rise(0.9)} className="flex gap-3">
        {elite.members.map((m) => {
          const beat = done.has(m.id);
          return (
            <span key={m.id} className="flex w-[72px] flex-col items-center gap-1">
              <span
                className={`relative flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 bg-night-card-2 ${beat ? "border-success" : "border-white/20"}`}
              >
                {beat ? <FittedTrainer art={m.art} height={40} cx={22} feetY={44} alt={m.name} /> : <NaGlossIcon kind="lock" size={20} />}
              </span>
              <span className={`na-label ${beat ? "text-success" : "text-text-muted"}`}>{beat ? "Defeated!" : `Level ${m.unlockLevel}`}</span>
            </span>
          );
        })}
      </motion.div>
      <div className="min-h-2 flex-1" />
      <NaButton block onClick={onHome}>
        Let&apos;s go!
      </NaButton>
      {canShare && onShare && (
        <NaButton kind="secondary" size="M" block onClick={onShare}>
          Share
        </NaButton>
      )}
    </motion.div>
  );
}

function BadgeWon({
  badge,
  tiles,
  coinsEarned,
  tpEarned,
  canShare,
  onShare,
  onHome,
}: {
  badge: { name: string; iconUrl: string; leader: string };
  tiles: ReactNode;
  coinsEarned: number;
  tpEarned: number;
  canShare?: boolean;
  onShare?: () => void;
  onHome: () => void;
}) {
  const owned = useGameStore((s) => s.gymBadges.length);
  const rise = (d: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: d, duration: 0.3 } });
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative flex h-full w-full flex-col items-center gap-3 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-[calc(env(safe-area-inset-top)+16px)]"
    >
      {/* Figma scales the wordmark to the full width: its sparkles sit in the side gutters */}
      <motion.div
        className="-mx-4 flex w-[calc(100%+32px)] justify-center overflow-hidden"
        initial={{ scale: 1.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.8, type: "spring", stiffness: 420, damping: 16 }}
      >
        <NaWordmark kind="victory" size={47} className="shrink-0">
          BADGE EARNED!
        </NaWordmark>
      </motion.div>
      <div className="relative h-[150px] w-[300px] shrink-0">
        <motion.img
          src={encodeURI(badge.iconUrl)}
          alt={badge.name}
          draggable={false}
          className="absolute left-[85px] top-0 h-[130px] w-[130px] object-contain"
          initial={{ y: -140, rotate: -540, scale: 0.4, opacity: 0 }}
          animate={{ y: 0, rotate: 0, scale: 1, opacity: 1, x: [0, 0, -6, 6, -3, 0] }}
          transition={{ duration: 0.4, ease: "easeIn", x: { delay: 0.4, duration: 0.3, times: [0, 0, 0.25, 0.5, 0.75, 1] } }}
        />
        {[[34, 30, 22], [246, 16, 26], [258, 96, 16], [26, 104, 14]].map(([x, y, s], i) => (
          <motion.span
            key={i}
            className="absolute text-reward-gold"
            style={{ left: x, top: y }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.45 + i * 0.06 }}
          >
            <NaIcon name="sparkle" size={s} />
          </motion.span>
        ))}
      </div>
      <motion.p {...rise(0.9)} className="na-body-strong text-center text-text-secondary">
        You defeated {badge.leader} and earned the {badge.name}!
      </motion.p>
      <motion.div {...rise(0.95)}>{tiles}</motion.div>
      <motion.div {...rise(1)} className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
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
      </motion.div>
      <motion.div {...rise(1.05)} className="flex w-full flex-col gap-3">
        <NaGlassRow
          lead={<img src={encodeURI(badge.iconUrl)} alt="" className="h-9 w-9 object-contain" />}
          title={owned <= 1 ? "Your first Gym Badge!" : "Another Gym Badge!"}
          sub={`${owned}/${GYM_LEADERS.length} collected · View all in Profile > Badges`}
        />
        <NaGlassRow lead={<NaGlossIcon kind="calendar" size={30} />} title="A new gym opens Monday" sub="One challenge per week. Make it count!" />
      </motion.div>
      <div className="min-h-2 flex-1" />
      <NaButton block onClick={onHome}>
        Let&apos;s go!
      </NaButton>
      {canShare && onShare && (
        <NaButton kind="secondary" size="M" block onClick={onShare}>
          Share
        </NaButton>
      )}
    </motion.div>
  );
}
