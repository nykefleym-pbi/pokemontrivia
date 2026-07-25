import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON, loadingArtForMonth } from "@/lib/app-icons";
import { buildProgressSteps } from "@/lib/loading-progress";
import { randomTip } from "@/lib/loading-tips";

/**
 * Pokémon GO-style two-phase boot sequence, mounted once by RootComponent.
 *
 *   phase "logo"    — LOGO_MS of black-background wordmark
 *   phase "loading" — LOADING_MS of the month's artwork, progress bar, tip
 *   phase "done"    — unmounts, revealing the app
 *
 * ## Why phase 1 is pure black
 *
 * The platform splash — the black screen Android/iOS paints from the manifest's
 * `background_color` and icon — is shown only while the browser fetches and
 * parses the bundle, and its duration is owned by the OS. Nothing in this app
 * can make it last five seconds.
 *
 * So phase 1 *impersonates* it: same `#000000`, same centred wordmark, no
 * decoration. The platform hands off to this component invisibly, and the black
 * splash the user sees holds for LOGO_MS in total before the loading screen
 * arrives. Keeping the background an exact match matters more than matching the
 * logo's size to the pixel, because a background colour change reads as a flash
 * while a slight scale difference does not. If you restyle this phase, keep it
 * in sync with `background_color` in vite.config.ts.
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

/**
 * Must match `background_color` in vite.config.ts — see the note above.
 *
 * One seam remains and is deliberately left alone: in an installed PWA the OS
 * tints the status bar from <meta name="theme-color"> (the app's red), so a thin
 * red strip sits above this black phase. Overriding that meta from here does not
 * hold — the router re-applies head tags, and for a returning player "/"
 * redirects to /battle within the first phase and resets it. Making it stick
 * would mean routing theme-color through the root route's head as app state,
 * which is a far larger change than a 4px strip justifies.
 */
const PLATFORM_SPLASH_BG = "#000000";

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

/**
 * The wordmark's box, shared by phase 1 and by phase 2's no-artwork fallback.
 *
 * They must stay identical. The two phases cross-fade, so a logo in a different
 * place or size in each renders as two overlapping logos sliding past one
 * another for 400ms. Sharing the layout instead pins it: the wordmark holds
 * still while the background turns from black to gradient and the bar and tip
 * fade up beneath it.
 *
 * Width is tuned to sit close to the icon in the platform splash.
 */
const SPLASH_LOGO_BOX = "absolute inset-0 flex items-center justify-center px-10";
const SPLASH_LOGO_WIDTH = "w-[min(52vw,260px)]";

function LogoPhase() {
  return (
    <motion.div
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className={SPLASH_LOGO_BOX}
      // Bare black, no gradient and no decoration: this phase continues the
      // platform splash rather than introducing a second, different one.
      style={{ background: PLATFORM_SPLASH_BG }}
    >
      {/* No entrance animation. The platform splash is already showing this
          wordmark on this background, so fading or scaling it in would announce
          the handoff that the matching background exists to hide. */}
      <AppIcon
        src={UI_ICON.appLogo}
        alt="Pokémon Trivia Battle"
        className={SPLASH_LOGO_WIDTH}
        eager
      />
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
        // first month's art is uploaded, so it has to stand on its own — and it
        // reuses phase 1's exact logo box so the cross-fade leaves the wordmark
        // sitting still instead of doubling it.
        <div className={SPLASH_LOGO_BOX}>
          <AppIcon src={UI_ICON.appLogo} className={SPLASH_LOGO_WIDTH} />
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
