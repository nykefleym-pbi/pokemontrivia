import { NaIcon } from "@/components/na/icon";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaButton } from "@/components/na/button";
import { NaTypeChip } from "@/components/na/type-chip";
import { FieldSprite } from "@/components/na/battle";
import { MEGA_QUESTION_COUNT, MEGA_REWARD, MEGA_WIN_CORRECT, type MegaEvent } from "@/lib/mega/schedule";

/**
 * Figma 13.1 "Before the raid: the boss and the rules". Opens from the Mega
 * Raid stop on Home; Start raid begins the run, Back returns to Home.
 */
export function MegaIntro({
  event,
  attemptsLeft,
  loading,
  onStart,
  onLeaderboard,
  onBack,
  takeover = false,
}: {
  event: MegaEvent;
  attemptsLeft: number;
  loading: boolean;
  onStart: () => void;
  onLeaderboard: () => void;
  onBack?: () => void;
  /** In place of Home (2+ badges, no try yet): no Back, and the tab bar stays. */
  takeover?: boolean;
}) {
  const ms = Date.parse(event.endsAt) - Date.now();
  const days = Math.floor(ms / 86_400_000), hours = Math.max(1, Math.floor((ms % 86_400_000) / 3_600_000));
  const ends = days >= 1 ? `${days} day${days === 1 ? "" : "s"}` : `${hours} hour${hours === 1 ? "" : "s"}`;
  const fmt = (n: number) => n.toLocaleString("en-US");
  const rules: Array<[React.ReactNode, string]> = [
    [<NaGlossIcon key="t" kind="target" size={24} />, `Get ${MEGA_WIN_CORRECT} out of ${MEGA_QUESTION_COUNT} questions right to defeat the Mega Pokémon!`],
    [<NaGlossIcon key="r" kind="refresh" size={24} />, `You have ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"}. Leaving mid-raid counts as an attempt!`],
    [<NaRewardIcon key="w" kind="Trophy" size={24} />, "Every correct answer brings you closer to the top!"],
  ];
  return (
    <div className={`na-bg-night flex h-full w-full flex-col overflow-y-auto pt-[env(safe-area-inset-top)] ${takeover ? "pb-nav" : "pb-[calc(env(safe-area-inset-bottom)+16px)]"}`}>
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        {onBack && !takeover && (
          <button type="button" aria-label="Back" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
            <NaIcon name="arrow-left" size={20} />
          </button>
        )}
        <h1 className="na-display-s flex-1 text-foreground">Mega Raid</h1>
      </div>
      <div className="flex flex-1 flex-col items-center gap-3 px-4 pt-1">
        <span className="flex items-center gap-1.5 rounded-full border border-brand-red/50 bg-night-deep/70 py-[5px] pl-2 pr-3">
          <span className="text-[#FF7A85]">
            <NaIcon name="clock" size={14} />
          </span>
          <span className="na-label uppercase text-foreground">Live now · ends in {ends}</span>
        </span>
        <div className="relative h-[150px] w-[300px] shrink-0">
          <FieldSprite id={event.megaId} k={1.6} cx={150} feetY={0} centerY={75} />
        </div>
        <h2 className="na-display-m text-center uppercase text-foreground">{event.name}</h2>
        <span className="flex gap-1.5">
          {event.types.map((t) => (
            <NaTypeChip key={t} type={t} />
          ))}
        </span>
        <div className="na-glass flex w-full flex-col gap-2.5 rounded-[18px] p-3.5">
          {rules.map(([icon, text]) => (
            <span key={text} className="flex items-center gap-2.5">
              <span className="shrink-0">{icon}</span>
              <span className="na-body-strong text-foreground">{text}</span>
            </span>
          ))}
        </div>
        <div className="flex w-full flex-col gap-2.5 rounded-[18px] border border-reward-gold/40 bg-white/[0.08] p-3.5">
          <span className="na-label uppercase text-reward-gold">Raid rewards</span>
          <span className="flex items-center gap-2.5">
            <NaRewardIcon kind="Trophy" size={24} />
            <span className="na-caption text-foreground">
              1st Place: {fmt(MEGA_REWARD.xp)} XP, {fmt(MEGA_REWARD.coins)} coins, {fmt(MEGA_REWARD.tp)} Training Points, {MEGA_REWARD.items} items, a Poké Egg & {event.baseName}!
            </span>
          </span>
          <span className="flex items-center gap-2.5">
            <NaRewardIcon kind="XP" size={24} />
            <span className="na-caption text-foreground">2nd Place: 50% rewards · 3rd Place: 30% · Everyone else: 5%</span>
          </span>
        </div>
        <div className="min-h-3 flex-1" />
        <NaButton block disabled={loading || attemptsLeft <= 0} onClick={onStart}>
          {attemptsLeft <= 0 ? "No attempts left" : "Start raid"}
        </NaButton>
        <NaButton kind="text" size="M" block onClick={onLeaderboard}>
          View leaderboard
        </NaButton>
      </div>
    </div>
  );
}
