import { useEffect, useRef, useState } from "react";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON, loadingArtForMonth } from "@/lib/app-icons";
import { buildProgressSteps } from "@/lib/loading-progress";
import { randomTip } from "@/lib/loading-tips";
import { setBootSilence } from "@/lib/audio";

/**
 * Pokémon GO-style loading screen, mounted once by RootComponent: the month's
 * artwork, a progress bar and a tip of the day, held for LOADING_MS before the
 * app is revealed.
 *
 * The platform splash (the black screen Android/iOS paints from the manifest's
 * `background_color` and icon) runs first and is left entirely alone — its
 * duration belongs to the OS. This picks up from it.
 *
 * It renders during SSR, so the very first HTML the browser paints is already
 * the loading screen; that is what closes the gap between the platform splash
 * being dismissed and the app being ready. Nothing here starts at opacity 0 for
 * the same reason — an entrance animation would ship an invisible screen in that
 * HTML and leave a blank frame until hydration ran.
 *
 * The app mounts and loads *behind* this overlay the whole time, so the five
 * seconds are brand time rather than a stall added to real work.
 *
 * Lives in RootComponent rather than a route so in-app navigation never
 * re-triggers it: it plays once per page load, which is what "whenever the app
 * is opened" means for an installed PWA.
 *
 * ## Players without a trainer never see it
 *
 * Someone still choosing a starter, or who has not tapped "Play as Guest" yet,
 * goes straight to onboarding — a loading screen in front of a first run is five
 * seconds of nothing before they have any reason to wait.
 *
 * The gate is the `has-trainer` class that the pre-paint script in __root.tsx
 * puts on <html>, not store state: the store rehydrates after React mounts, so
 * reading it here would show the screen first and hide it a frame later. CSS
 * keeps the overlay hidden until that class proves otherwise (see .boot-splash
 * in styles.css), which covers the server-rendered frame, and the effect below
 * retires the component outright so its timers stop and the app is told the boot
 * sequence is over.
 */

const LOADING_MS = 5000;
/** The bar finishes slightly early, leaving a beat of full bar before handoff. */
const BAR_MS = 4400;
/** The app's status-bar tint. Must match the fallback in __root.tsx's script. */
const APP_THEME_COLOR = "#dc2626";

/** Shared with the onboarding hero so the boot screen and step one are one look. */
const BRAND_GRADIENT =
  "radial-gradient(circle at 15% 12%, oklch(0.9 0.13 95 / 0.55) 0%, transparent 42%), radial-gradient(circle at 88% 90%, oklch(0.62 0.22 25 / 0.16) 0%, transparent 48%), linear-gradient(168deg, oklch(0.975 0.025 95) 0%, oklch(0.93 0.05 230) 100%)";

/**
 * Hand the OS status bar back to the app's colour.
 *
 * The tag itself is created before first paint by the inline script in
 * __root.tsx, which is the only place that can pick the right initial value —
 * see the comment there. All this does is release it.
 */
function releaseStatusBarTint() {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", APP_THEME_COLOR);
}

export function BootSplash() {
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  // Both are picked on the client only, so the server and first client render
  // agree. The tip lands a frame after mount; the bar starts at 0 either way.
  const [tip, setTip] = useState("");

  useEffect(() => {
    // No trainer yet — retire immediately rather than run five seconds of timers
    // behind a screen CSS is already hiding. The tint needs no release here: the
    // inline script already chose the app colour for a player without one.
    if (!document.documentElement.classList.contains("has-trainer")) {
      setDone(true);
      return;
    }

    // The loading screen plays silent. Both the silence and the tint are released
    // on the timer below rather than from a cleanup, because reaching `done`
    // renders null without unmounting this component — a cleanup would never run,
    // and the app would stay muted and black-tinted for the whole session.
    setBootSilence(true);
    setTip(randomTip());

    const timers = buildProgressSteps(BAR_MS).map((step) =>
      setTimeout(() => setProgress(step.to), step.at),
    );
    timers.push(
      setTimeout(() => {
        setBootSilence(false);
        releaseStatusBarTint();
        setDone(true);
      }, LOADING_MS),
    );
    // Still restore on unmount, so a teardown mid-sequence (a dev remount, a
    // route-level error boundary) cannot leave the app permanently silent.
    return () => {
      timers.forEach(clearTimeout);
      setBootSilence(false);
      releaseStatusBarTint();
    };
  }, []);

  // The artwork is in the markup from the start (rather than preloaded into
  // state) so the browser begins fetching it as it parses the HTML.
  //
  // Three visual states, and the distinction between the last two is what keeps
  // the wordmark from flashing before the artwork arrives:
  //   loading — gradient only. The <img> is present but transparent, because a
  //             404 paints the browser's broken-image glyph before onError can
  //             fire.
  //   loaded  — artwork, full bleed.
  //   failed  — wordmark, the fallback for a month with no uploaded file.
  // Showing the wordmark during `loading` (as this once did) means every launch
  // on a cold cache flashes the logo for as long as the download takes.
  const [artState, setArtState] = useState<"loading" | "loaded" | "failed">("loading");
  const art = encodeURI(loadingArtForMonth(new Date()));

  // onLoad/onError alone are not enough. The <img> is server-rendered, so it can
  // finish loading before React hydrates and attaches the handlers — the event is
  // already gone and neither fires, leaving the artwork stuck transparent forever
  // (or, for a missing month, never falling back). Ask the element directly on
  // mount instead. `complete` is true for a failed load too, so naturalWidth is
  // what separates the two outcomes.
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete) setArtState(img.naturalWidth > 0 ? "loaded" : "failed");
  }, []);

  if (done) return null;

  return (
    <div
      // Above every other full-screen overlay (the share dialog tops out at
      // z-[200]) — nothing should ever draw over the boot screen. The handoff to
      // the app is a hard cut, so this never sits half-faded over a live screen
      // swallowing taps.
      // .boot-splash is the CSS half of the has-trainer gate (styles.css): it
      // keeps this hidden in the server-rendered frame, before the effect above
      // has had a chance to run.
      className="boot-splash fixed inset-0 z-[300] overflow-hidden"
      style={{ background: BRAND_GRADIENT }}
      role="status"
      aria-busy
      aria-label="Loading Pokémon Trivia Battle"
    >
      {/* Only once the artwork is known to be missing — never while it is still
          downloading, or the logo flashes on every cold-cache launch. */}
      {artState === "failed" && (
        <div className="absolute inset-0 flex items-center justify-center px-10">
          <AppIcon
            src={UI_ICON.appLogo}
            alt="Pokémon Trivia Battle"
            className="w-[min(52vw,260px)]"
            eager
          />
        </div>
      )}

      <img
        ref={imgRef}
        src={art}
        alt=""
        aria-hidden
        draggable={false}
        // Images are fetched at low priority by default and this one is the whole
        // screen, so it competes with the app's own bundle for no reason.
        fetchPriority="high"
        onLoad={() => setArtState("loaded")}
        onError={() => setArtState("failed")}
        className={`absolute inset-0 h-full w-full select-none object-cover ${
          artState === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />

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
    </div>
  );
}
