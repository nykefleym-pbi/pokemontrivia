/**
 * Progress-bar pacing for the boot loading screen.
 *
 * The bar is cosmetic — the app behind it is already loading, and there is no
 * single "percent fetched" number to report. A bar that simply animates from 0
 * to 100 at a constant rate reads as an animation, not as work happening, so
 * instead of interpolating we precompute an uneven *schedule*: a handful of
 * chunks that each land at a random size after a random pause, the way real
 * resources arrive in bursts with stalls between them.
 *
 * Precomputing (rather than stepping randomly as time passes) is what makes the
 * bar guaranteed to finish: the sizes are normalised to sum to exactly 100 and
 * the pauses to exactly `durationMs`, so the last step is always
 * `{ at: durationMs, to: 100 }` no matter what the RNG produced.
 */

/** One scheduled jump: at `at` ms after the bar starts, fill to `to` percent. */
export interface ProgressStep {
  at: number;
  to: number;
}

const MIN_CHUNKS = 9;
const MAX_CHUNKS = 13;

/**
 * Builds the jump schedule for a bar that fills over `durationMs`.
 *
 * `rand` is injectable so tests can pin the shape; it must behave like
 * `Math.random` (return values in [0, 1)).
 */
export function buildProgressSteps(durationMs: number, rand: () => number = Math.random): ProgressStep[] {
  const count = MIN_CHUNKS + Math.floor(rand() * (MAX_CHUNKS - MIN_CHUNKS + 1));

  // Two independent weight sets: how *much* each chunk adds, and how long the
  // pause before it is. Drawing them separately is what decouples a big jump
  // from a long wait — a fast trickle of small chunks and one long stall
  // followed by a large chunk are both possible.
  //
  // Both are power-skewed rather than uniform, and that is the whole trick.
  // Uniform weights normalise to near-identical chunks (measured: ten steps of
  // 12% each, 12ths of a second apart) which reads as a linear animation — the
  // exact thing this is meant not to look like. Squaring biases toward small
  // chunks with the occasional large one; cubing the pauses makes most of them
  // short and lets a few become real stalls.
  const sizes = Array.from({ length: count }, () => 0.05 + rand() ** 2 * 1.6);
  const pauses = Array.from({ length: count }, () => 0.05 + rand() ** 3 * 3);

  const sizeTotal = sizes.reduce((a, b) => a + b, 0);
  const pauseTotal = pauses.reduce((a, b) => a + b, 0);

  let pct = 0;
  let t = 0;
  return sizes.map((size, i) => {
    pct += (size / sizeTotal) * 100;
    t += (pauses[i] / pauseTotal) * durationMs;
    // Round for display, but pin the final step to the exact endpoint so
    // accumulated rounding can never leave the bar at 99% or overshoot the
    // phase it belongs to.
    const last = i === count - 1;
    return { at: last ? durationMs : Math.round(t), to: last ? 100 : Math.round(pct) };
  });
}
