import { type ReactNode } from "react";
import type { MissedAnswer } from "@/lib/trivia-core";

/**
 * Post-defeat "Review · N Missed" card listing the questions the player got
 * wrong. Shared by the Solo `ResultScreen` and the Nearby/Training
 * `PvpResultScreen` so both lose screens present missed answers identically by
 * construction. Renders nothing when there is nothing to review and no footer
 * to show (graceful degrade for a loss with zero wrong answers).
 *
 * `footer` is an optional slot rendered below a dashed divider inside the same
 * card — Solo uses it for its consolation XP/streak line; PvP passes none.
 */
export function MissedReview({
  missed,
  footer,
}: {
  missed: MissedAnswer[];
  footer?: ReactNode;
}) {
  if (missed.length === 0 && !footer) return null;
  const shown = missed.slice(0, 5);
  const more = Math.max(0, missed.length - shown.length);
  return (
    <div className="mx-auto mt-6 w-full max-w-sm rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="font-pixel-xs uppercase tracking-wider text-white/60">
        Review · {missed.length} Missed
      </div>
      <div className="mt-3 space-y-2.5">
        {shown.length === 0 ? (
          <p className="text-sm text-white/70">No wrong answers — the clock got you!</p>
        ) : (
          shown.map((m, i) => (
            <div key={i} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-destructive/80 text-[10px] font-bold text-white">
                ✕
              </span>
              <p className="line-clamp-2 text-[13px] leading-snug text-white/90">
                <span className="font-semibold">{m.correctAnswer}</span>
                {m.explanation ? <span className="text-white/60"> — {m.explanation}</span> : null}
              </p>
            </div>
          ))
        )}
        {more > 0 && <p className="text-xs italic text-white/45">and {more} more…</p>}
      </div>
      {footer ? (
        <>
          <div className="my-3 border-t border-dashed border-white/10" />
          {footer}
        </>
      ) : null}
    </div>
  );
}
