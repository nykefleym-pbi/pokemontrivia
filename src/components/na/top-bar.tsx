import { useMemo } from "react";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { trainerSpriteUrl, xpProgressInLevel } from "@/lib/game-data";
import { useGameStore } from "@/lib/store";
import { dayStreak } from "@/lib/win-streak";

/** Figma "Stat pill": your reward art and a number. */
export function NaStatPill({ kind, value }: { kind: "Streak" | "Coin"; value: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full border border-white/[0.14] bg-night-deep/60 py-[3px] pl-[3px] pr-3">
      <NaRewardIcon kind={kind} size={28} />
      <span className="na-number-m text-foreground">{value}</span>
    </span>
  );
}

/**
 * Figma "Top bar" (2.3, 6.3): your avatar, name, level with its XP meter, the day
 * streak and coins. `afterName` sits right after the name (Profile's pencil).
 */
export function NaTopBar({ onAvatar, avatarLabel, afterName }: { onAvatar: () => void; avatarLabel: string; afterName?: React.ReactNode }) {
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const coins = useGameStore((s) => s.coins);
  const battleLog = useGameStore((s) => s.battleLog);
  const frozenDays = useGameStore((s) => s.frozenDays);
  const streak = useMemo(() => dayStreak(battleLog, Date.now(), false, frozenDays).days, [battleLog, frozenDays]);
  const prog = xpProgressInLevel(xp);
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onAvatar}
        aria-label={avatarLabel}
        className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-reward-gold bg-night-card-2"
      >
        <img src={trainerSpriteUrl(trainerSprite)} alt="" className="sprite h-11 w-11 object-contain" />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="na-headline truncate text-foreground">{trainerName}</span>
          {afterName}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="na-fill-gold na-label rounded-md px-1.5 py-px text-on-gold">LEVEL {level}</span>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.12]">
            <span className="na-fill-gold block h-full rounded-full" style={{ width: `${Math.min(100, (prog.current / prog.need) * 100)}%` }} />
          </span>
        </span>
      </div>
      <NaStatPill kind="Streak" value={String(streak)} />
      <NaStatPill kind="Coin" value={coins.toLocaleString()} />
    </div>
  );
}
