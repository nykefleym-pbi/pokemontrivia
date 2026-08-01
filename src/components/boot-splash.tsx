import { useEffect, useState } from "react";
import LOADING_ART from "virtual:loading-art";
import { pickLoadingArt } from "@/lib/app-icons";
import { buildProgressSteps } from "@/lib/loading-progress";
import { randomTip } from "@/lib/loading-tips";
import { setBootSilence } from "@/lib/audio";

/**
 * Pokémon GO-style loading screen, mounted once by RootComponent: a piece of
 * artwork drawn at random from public/loading, a progress bar and a tip of the
 * day, held for LOADING_MS before the app is revealed.
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
 * retires the component outright so its timers never run.
 */

const LOADING_MS = 5000;
/** The bar finishes slightly early, leaving a beat of full bar before handoff. */
const BAR_MS = 4400;
/** The app's status-bar tint. Must match the fallback in __root.tsx's script. */
const APP_THEME_COLOR = "#dc2626";

/**
 * The field the artwork lands on. Must stay in step with `background_color` in
 * the manifest (vite.config.ts).
 *
 * Deliberately the SAME black the OS paints for the platform splash, and not a
 * brand gradient of its own. The art is fetched at hydration, so there is
 * always a beat where this screen has none — and with a look of its own that
 * beat was a whole extra screen going past: a pale gradient carrying a progress
 * bar and a tip, arriving after the black splash and leaving again the moment
 * the picture loaded. Matching the splash makes that beat invisible instead:
 * nothing appears to happen until the artwork does.
 */
const SPLASH_BG = "#000000";
/**
 * How long the chrome waits for artwork before showing up anyway.
 *
 * The bar and the tip are hidden until there is a picture behind them, which is
 * what keeps the artless frame from reading as a screen. If the file 404s or
 * the network stalls they must still arrive — a black rectangle for five
 * seconds is worse than the thing this replaced.
 */
const CHROME_GRACE_MS = 1400;

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

/**
 * The artwork the previous open used, so this one can avoid repeating it.
 *
 * Its own key rather than the game store: the store rehydrates after mount and
 * carries save-synced player state, and which picture was on screen last time is
 * neither. Any failure here is silently a miss — a repeated image is a
 * cosmetic outcome, not worth a try/catch that reports.
 */
const LAST_ART_KEY = "poke-trivia-last-loading-art";

function readLastArt(): string | null {
  try {
    return localStorage.getItem(LAST_ART_KEY);
  } catch {
    return null;
  }
}

function rememberLastArt(path: string): void {
  try {
    localStorage.setItem(LAST_ART_KEY, path);
  } catch {
    /* private mode / quota — the next open just re-rolls blind. */
  }
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

  // Which artwork this open gets is drawn at random from whatever is in
  // public/loading, so the screen is different each time the app is launched.
  //
  // The draw has to happen on the client, after mount: choosing during render
  // would have the server commit to one file and the client to another, and the
  // installed PWA serves a cached HTML shell anyway, so a server-side choice
  // would freeze on whichever file was picked when that shell was cached. The
  // cost is that the fetch starts at hydration instead of while the HTML is
  // being parsed — a fraction of the five seconds this screen is held for.
  //
  // The <img> is rendered from the first frame regardless, with no src until the
  // draw lands, so the server and client markup agree and hydration is clean.
  //
  // It stays transparent until the file has actually loaded, so both failure
  // modes degrade to bare SPLASH_BG: art that 404s, and the browser painting
  // its broken-image glyph before any error handler could fire.
  //
  // There is deliberately no fallback image. A wordmark here reads as a second
  // splash flashing past on the way to the artwork — briefly on a warm cache,
  // for the whole download on a cold one.
  const [artLoaded, setArtLoaded] = useState(false);
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => {
    const last = readLastArt();
    const pick = pickLoadingArt(LOADING_ART, { last });
    if (!pick) return;
    rememberLastArt(pick);
    setArt(encodeURI(pick));
  }, []);

  // The bar and the tip wait for the picture. Without this the screen's first
  // frame is chrome on an empty field — which is precisely the "loading screen
  // with nothing on it" this is meant to stop being. `CHROME_GRACE_MS` is the
  // escape hatch for art that never arrives; an empty folder resolves it
  // immediately, since there is nothing to wait for.
  const [graced, setGraced] = useState(LOADING_ART.length === 0);
  useEffect(() => {
    if (graced) return;
    const t = setTimeout(() => setGraced(true), CHROME_GRACE_MS);
    return () => clearTimeout(t);
  }, [graced]);
  const showChrome = artLoaded || graced;

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
      style={{ background: SPLASH_BG }}
      role="status"
      aria-busy
      aria-label="Loading Pokémon Trivia Battle"
    >
      <img
        // src is left off entirely until the draw lands: an empty string would
        // have the browser re-request the page itself.
        src={art ?? undefined}
        alt=""
        aria-hidden
        draggable={false}
        // Images are fetched at low priority by default and this one is the whole
        // screen, so it competes with the app's own bundle for no reason.
        fetchPriority="high"
        onLoad={() => setArtLoaded(true)}
        className={`absolute inset-0 h-full w-full select-none object-cover ${
          artLoaded ? "opacity-100" : "opacity-0"
        }`}
      />

      {/* Scrim: the artwork is arbitrary owner-supplied art, so the bar and tip
          need their own guaranteed-legible backdrop rather than trusting
          whatever happens to be behind them this time. */}
      <div
        className={`absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-poke-dark via-poke-dark/85 to-transparent transition-opacity duration-300 ${
          showChrome ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-8 pb-[calc(env(safe-area-inset-bottom)+2.5rem)] transition-opacity duration-300 ${
          showChrome ? "opacity-100" : "opacity-0"
        }`}
      >
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
