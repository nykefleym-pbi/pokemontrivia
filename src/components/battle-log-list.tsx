import type { BattleLogEntry } from "@/lib/store/types";
import { MODE_LABELS, relativeTime } from "@/lib/battle-log-format";

/**
 * The Arena's battle-log row UI, extracted so both `/arena` and Profile's
 * "Battle History" sheet render the exact same list from `battleLog`
 * entries (single source, no duplicated markup).
 */
export function BattleLogList({ entries }: { entries: BattleLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="rounded-3xl bg-card p-6 text-center text-sm text-foreground/55 shadow-card">
        No battles yet — jump into PvP or Training to get started!
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div
          key={`${entry.timestamp}-${i}`}
          className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-card"
        >
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${entry.won ? "bg-hp-good" : "bg-destructive"}`}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-foreground">
              vs {entry.opponent}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-foreground/55">
              <span className="rounded-full bg-muted px-1.5 py-0.5 font-pixel-xs text-foreground/60">
                {MODE_LABELS[entry.mode ?? "battle"] ?? "Battle"}
              </span>
              <span>{relativeTime(entry.timestamp)}</span>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className={`text-xs font-bold ${entry.won ? "text-hp-good" : "text-destructive"}`}>
              {entry.won ? "WIN" : "LOSS"}
            </div>
            {entry.xpGained > 0 && (
              <div className="text-[11px] text-foreground/55">+{entry.xpGained} XP</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
