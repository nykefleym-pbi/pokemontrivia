import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON, loadingArtForMonth } from "@/lib/app-icons";
import { buildProgressSteps } from "@/lib/loading-progress";
import { randomTip } from "@/lib/loading-tips";

/**
 * Pokémon GO-style two-phase boot sequence, mounted once by RootComponent.
 *
 * The platform splash (the Apple launch image / PWA icon) is only shown while
 * the browser fetches the bundle — a second or less on a warm cache, which is
 * why the logo used to flash past. This component takes over the moment React
 * paints and holds the brand on screen for a fixed beat instead:
 *
 *   phase "logo"    — LOGO_MS on the wordmark, matching the platform splash
 *   phase "loading" — LOADING_MS on the month's artwork, progress bar, tip
 *   phase "done"    — unmounts, revealing the app
 *
 * It renders during SSR at phase "logo", so the very first HTML the browser
 * paints is already the splash — that is what closes the gap the platform
 * splash leaves behind. The timers are client-only, and initial state is
 * identical on both sides, so there is no hydration mismatch.
 *
 * The app mounts and loads *behind* this overlay the whole time; the ten
 * seconds are brand time, not a stall added to real work.
 *
 * Lives in RootComponent rather than a route so that in-app navigation never
 * re-triggers it: it plays once per page load, which is what "whenever the app
 * is opened" means for an installed PWA.
 */

const LOGO_MS = 5000;
const LOADING_MS = 5000;
/** The bar finishes slightly early, leaving a beat of full bar before handoff. */
const BAR_MS = 4400;

export function BootSplash() {
  const [phase, setPhase] = useState<"logo" | "loading" | "done">("logo");

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase("loading"), LOGO_MS),
      setTimeout(() => setPhase("done"), LOGO_MS + LOADING_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  // Fetch this month's artwork during the logo phase so the second phase opens
  // on a painted image instead of a blank frame. Staying null covers both "no
  // art uploaded for this month yet" and a failed request — the loading phase
  // falls back to the gradient either way, so no error branch is needed.
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => {
    const src = encodeURI(loadingArtForMonth(new Date()));
    const img = new Image();
    img.onload = () => setArt(src);
    img.src = src;
  }, []);

  if (phase === "done") return null;

  return (
    <div
      className="fixed inset-0 z-[300] overflow-hidden"
      // Above every other full-screen overlay (the share dialog tops out at
      // z-[200]) — nothing should ever draw over the boot screen.
      role="status"
      aria-busy
      aria-label="Loading Pokémon Trivia Battle"
    >
      {/* Cross-fade, not mode="wait": waiting would hold the loading screen back
          until the logo's exit finished, spending 400ms of its 5 seconds on a
          blank frame. Both phases are absolutely positioned, so overlapping them
          for the length of one fade is exactly the handoff we want. */}
      <AnimatePresence>
        {phase === "logo" ? (
          <LogoPhase key="logo" />
        ) : (
          <LoadingPhase key="loading" art={art} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Shared with the onboarding hero so the boot screen and step one are one look. */
const BRAND_GRADIENT =
  "radial-gradient(circle at 15% 12%, oklch(0.9 0.13 95 / 0.55) 0%, transparent 42%), radial-gradient(circle at 88% 90%, oklch(0.62 0.22 25 / 0.16) 0%, transparent 48%), linear-gradient(168deg, oklch(0.975 0.025 95) 0%, oklch(0.93 0.05 230) 100%)";

function LogoPhase() {
  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="absolute inset-0 flex items-center justify-center px-10"
      style={{ background: BRAND_GRADIENT }}
    >
      {/* Decorative rings, same language as the onboarding splash. */}
      <div className="pointer-events-none absolute -right-[120px] -top-20 h-80 w-80 rounded-full border-[26px] border-poke-dark/5" />
      <div className="pointer-events-none absolute -left-[90px] bottom-[90px] h-60 w-60 rounded-full border-[22px] border-poke-dark/5" />

      {/* CSS entrance, not framer-motion: this phase is server-rendered, and a
          framer `initial` would put opacity:0 in that HTML — so the splash would
          sit there as an empty gradient until hydration ran, which is the very
          gap it exists to cover. A keyframe animates with no JS. */}
      <div className="animate-boot-logo-in relative z-10">
        <AppIcon
          src={UI_ICON.appLogo}
          alt="Pokémon Trivia Battle"
          className="w-[min(78vw,320px)]"
          eager
        />
      </div>
    </motion.div>
  );
}

function LoadingPhase({ art }: { art: string | null }) {
  const [progress, setProgress] = useState(0);
  // Picked here rather than in state initialisation so the server and the first
  // client render agree; this phase only exists 5s in, long after hydration.
  const [tip, setTip] = useState("");

  useEffect(() => {
    setTip(randomTip());

    const timers = buildProgressSteps(BAR_MS).map((step) =>
      setTimeout(() => setProgress(step.to), step.at),
    );
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      // No exit: the handoff to the app is a hard cut (BootSplash unmounts
      // outright), so the overlay never blocks taps on a half-faded frame.
      transition={{ duration: 0.4 }}
      className="absolute inset-0"
      style={art ? undefined : { background: BRAND_GRADIENT }}
    >
      {art ? (
        <img
          src={art}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full select-none object-cover"
        />
      ) : (
        // No artwork for this month: fall back to the wordmark over the brand
        // gradient rather than an empty frame. This is what ships until the
        // first month's art is uploaded, so it has to stand on its own.
        <div className="absolute inset-x-0 top-0 flex h-1/2 items-center justify-center px-12">
          <AppIcon src={UI_ICON.appLogo} className="w-[min(58vw,240px)] opacity-90" />
        </div>
      )}

      {/* Scrim: the artwork is arbitrary owner-supplied art, so the bar and tip
          need their own guaranteed-legible backdrop rather than trusting
          whatever happens to be behind them this month. */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-poke-dark via-poke-dark/85 to-transparent" />

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-8 pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        <div className="w-full max-w-[320px]">
          <div className="font-pixel-xs text-center text-poke-yellow/80">Loading</div>
          <div
            className="mt-2.5 h-3 w-full overflow-hidden rounded-full border-2 border-poke-dark/40 bg-black/35"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-poke-yellow to-poke-red transition-[width] duration-200 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Reserved height: the tip lands one frame after mount, and without a
            fixed box its arrival would shove the progress bar upward. */}
        <div className="flex min-h-[4.5rem] max-w-[19rem] flex-col items-center justify-start text-center">
          <div className="font-pixel-xs text-poke-yellow/70">Tip of the Day</div>
          <p className="mt-2 text-[13px] leading-snug text-white/85">{tip}</p>
        </div>
      </div>
    </motion.div>
  );
}
