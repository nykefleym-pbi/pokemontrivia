/**
 * Add-to-home-screen plumbing.
 *
 * Chrome fires `beforeinstallprompt` exactly once, early, and the event is only
 * usable if you called `preventDefault()` on it — so it has to be captured at
 * app start and stashed, long before any UI wants to offer the install. Nothing
 * in the app did this, which is why there was no install path at all.
 *
 * iOS has no such event: Safari only installs via the Share sheet. That matters
 * beyond tidiness — iOS does not expose the Push API to a browser tab at all,
 * so on iPhone "turn on notifications" is meaningless until the app is
 * installed, and the opt-in card has to teach the Share→Add step instead.
 */

/** The slice of BeforeInstallPromptEvent we use; it is not in lib.dom yet. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function announce() {
  for (const l of listeners) l(deferred !== null);
}

/** Call once at app start. Returns an uninstaller. */
export function captureInstallPrompt(win: Window = window): () => void {
  const onBeforeInstall = (e: Event) => {
    e.preventDefault(); // without this the event is spent and prompt() throws
    deferred = e as InstallPromptEvent;
    announce();
  };
  const onInstalled = () => {
    deferred = null;
    announce();
  };
  win.addEventListener("beforeinstallprompt", onBeforeInstall);
  win.addEventListener("appinstalled", onInstalled);
  return () => {
    win.removeEventListener("beforeinstallprompt", onBeforeInstall);
    win.removeEventListener("appinstalled", onInstalled);
  };
}

export function installAvailable(): boolean {
  return deferred !== null;
}

export function onInstallAvailability(cb: (available: boolean) => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Shows the browser's install sheet. Resolves to what the player chose. */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  const e = deferred;
  deferred = null; // single-use: Chrome refuses a second prompt() on the same event
  announce();
  try {
    await e.prompt();
    const { outcome } = await e.userChoice;
    return outcome;
  } catch {
    return "dismissed";
  }
}

/** True when the app is already running as an installed PWA. */
export function isStandalone(win: Window = window): boolean {
  const iosStandalone = (win.navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(iosStandalone) || win.matchMedia?.("(display-mode: standalone)").matches === true;
}

/** True on an iOS browser tab, where installing is a manual Share-sheet step. */
export function isIos(win: Window = window): boolean {
  const ua = win.navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; the touch points give it away.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && win.navigator.maxTouchPoints > 1);
}
