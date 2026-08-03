/**
 * Falling confetti, filling whatever it is placed inside.
 *
 * Absolutely positioned and `pointer-events-none`, so it is dropped into a
 * `relative` container and costs that container no layout. It clips itself:
 * pieces start above the top edge and are cut off at the bottom, which is what
 * makes the shower look like it continues past the frame rather than ending.
 *
 * ## Why the pieces are a fixed table
 *
 * A screen can be re-rendered for reasons that have nothing to do with the
 * animation — a state update, a resize, a parent re-render — and `Math.random()`
 * in the body would reshuffle every piece on each one, so the shower would
 * visibly jump. A constant table is generated once at module load and never
 * moves. It also means the layout can be checked in a screenshot and stay
 * checked.
 *
 * ## Why the fall distance is a length
 *
 * `--fall-to` is a CSS length, not a percentage. A percentage inside
 * `translate` resolves against the ELEMENT's own size, and a confetto is a few
 * pixels tall — the same trap that left the Pokédex snow globe's snow hanging
 * in the air twenty pixels below where it started.
 */

const COLORS = ["#f7dd6a", "#e23b2e", "#4f9ad6", "#7ee0a0", "#b57fe0", "#ffffff"];

/** Deterministic, seeded once at module load. See the note above. */
const PIECES = Array.from({ length: 28 }, (_, i) => {
  // A cheap hash of the index — enough spread for a scatter, and stable across
  // reloads so two screenshots of the same screen match.
  const r = (n: number) => ((Math.sin(i * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;
  return {
    left: r(1) * 100,
    delay: r(2) * 3.2,
    dur: 2.6 + r(3) * 2.4,
    sway: (r(4) - 0.5) * 90,
    spin: 180 + r(5) * 420,
    w: 5 + Math.round(r(6) * 4),
    h: 8 + Math.round(r(7) * 6),
    color: COLORS[Math.floor(r(8) * COLORS.length)],
    round: r(9) > 0.72,
  };
});

export function ConfettiRain({
  className = "",
  /**
   * How far a piece falls. Must be a LENGTH — `110vh` clears any phone. A
   * percentage here would resolve against the piece's own ~12px height and the
   * confetti would twitch instead of fall.
   */
  fallTo = "110vh",
}: {
  className?: string;
  fallTo?: string;
}) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
    >
      {PIECES.map((p, i) => (
        <span
          key={i}
          className="confetti-piece absolute block"
          style={
            {
              left: `${p.left}%`,
              top: "-6%",
              width: `${p.w}px`,
              height: `${p.h}px`,
              background: p.color,
              borderRadius: p.round ? "9999px" : "1px",
              "--fall-to": fallTo,
              "--sway": `${p.sway}px`,
              "--spin": `${p.spin}deg`,
              "--dur": `${p.dur}s`,
              "--delay": `${p.delay}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
