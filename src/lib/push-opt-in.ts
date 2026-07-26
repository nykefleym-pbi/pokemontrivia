/**
 * When to ask a player to turn on notifications.
 *
 * Kept pure and separate from the card that renders it, because the timing is
 * the whole feature. The recall system this feeds — two crons and an Edge
 * Function that really do send — currently reaches nobody: the only place that
 * calls `enablePushNotifications()` is a toggle buried in Profile, and not one
 * player who arrived after the owner ever found it.
 *
 * The rules, in order of how much damage getting them wrong does:
 *
 *  - Never on arrival. A permission prompt before the player knows what the app
 *    is gets denied, and a denied native prompt cannot be re-asked — the
 *    browser remembers it forever. So the ask waits for a first win.
 *  - Soft ask first. The in-app card is recoverable; the native sheet is not.
 *    The native prompt only appears after the player says yes to the card.
 *  - Twice, ever. Second ask no sooner than the next day; after that, silence.
 */

export interface PushAskInput {
  /** Player has finished onboarding (we never ask mid-wizard). */
  hasOnboarded: boolean;
  /** Wins so far — the ask is earned by one. */
  wins: number;
  /** Somewhere the ask would interrupt: a battle, a result screen, a takeover. */
  busy: boolean;
  /** Already subscribed, so there is nothing to ask for. */
  subscribed: boolean;
  /**
   * The platform can actually deliver a push right now. False on an iOS tab,
   * where the Push API is hidden until the app is installed — that case is the
   * install card's job, not this one's.
   */
  canSubscribe: boolean;
  state: "unasked" | "soft-declined" | "asked";
  /** YYYY-MM-DD of the previous ask. */
  lastDate: string | null;
  /** YYYY-MM-DD today. */
  today: string;
}

export function shouldAskForPush(i: PushAskInput): boolean {
  if (!i.hasOnboarded || i.busy || i.subscribed || !i.canSubscribe) return false;
  if (i.wins < 1) return false;
  if (i.state === "asked") return false;
  if (i.state === "unasked") return true;
  // soft-declined: give it a day before the one and only second ask.
  return i.lastDate !== null && i.lastDate < i.today;
}

/**
 * Whether to offer "add to home screen" instead.
 *
 * On iOS this is a prerequisite for notifications rather than a nicety, so it
 * uses the same earned-a-win gate and the same two-ask budget.
 */
export function shouldOfferInstall(i: {
  hasOnboarded: boolean;
  wins: number;
  busy: boolean;
  standalone: boolean;
  /** Chrome handed us a deferred beforeinstallprompt, or this is an iOS tab. */
  installable: boolean;
  state: "unasked" | "soft-declined" | "asked";
  lastDate: string | null;
  today: string;
}): boolean {
  if (!i.hasOnboarded || i.busy || i.standalone || !i.installable) return false;
  if (i.wins < 1) return false;
  if (i.state === "asked") return false;
  if (i.state === "unasked") return true;
  return i.lastDate !== null && i.lastDate < i.today;
}
