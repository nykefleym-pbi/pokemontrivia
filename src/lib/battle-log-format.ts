/** Battle-log mode chip labels and relative-time formatting shared by
 * `battle-log-list.tsx` and `/arena`'s "Recent Nearby Battles" strip — kept
 * in a plain util module (not a component file) so neither triggers the
 * react-refresh/only-export-components lint rule. */
export const MODE_LABELS: Record<string, string> = {
  battle: "Battle",
  elite: "Elite Four",
  weekly: "Weekly",
  daily: "Daily",
  mega: "Mega Raid",
  pvp: "PvP",
  nearby: "Nearby",
  whosthat: "Who's That?",
};

/** Coarse relative-time label — matches the "just now / Xm / Xh / Xd / Xw ago"
 * granularity used elsewhere in the app's activity surfaces. */
export function relativeTime(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return `${Math.floor(day / 7)}w ago`;
}
