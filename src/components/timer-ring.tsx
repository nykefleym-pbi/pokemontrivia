// Countdown pill shared by solo, daily, live PvP, and mega raid screens.
export function TimerRing({ timer, maxTime }: { timer: number; maxTime: number }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold shadow-card ${
        timer <= 5
          ? "animate-pulse bg-destructive text-destructive-foreground"
          : "bg-card text-foreground"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="3"
        />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={timer <= 5 ? "currentColor" : "var(--color-hp-good)"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 9}
          strokeDashoffset={2 * Math.PI * 9 * (1 - timer / Math.max(1, maxTime))}
          transform="rotate(-90 12 12)"
          style={{ transition: "stroke-dashoffset 0.5s linear" }}
        />
      </svg>
      {timer}s
    </div>
  );
}
