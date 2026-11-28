import { track as vercelTrack } from "@vercel/analytics";

/**
 * Product funnel events.
 *
 * Deliberately a closed list. `@vercel/analytics` accepts any string, which is
 * how event sets rot into a hundred near-duplicates that nobody can read; the
 * union below means a typo is a type error and the whole funnel fits on screen.
 *
 * These exist to answer one question — does an engagement change move the
 * numbers? — so they cover the funnel a new player walks, not every tap:
 * arrive, finish onboarding, finish a first battle, come back, opt into
 * notifications, meet another human.
 */
export type AnalyticsEvent =
  | "onboard_complete"
  /** First session: partner chosen, first battle starts before any name. */
  | "onboard_play_first"
  | "first_battle_complete"
  | "battle_complete"
  | "daily_claimed"
  | "push_prompt_shown"
  | "push_prompt_accepted"
  | "push_prompt_dismissed"
  | "install_prompt_accepted"
  | "pvp_match_started"
  | "egg_hatched"
  | "return_after_days";

/** What Vercel Web Analytics will accept as a property value. */
type PropValue = string | number | boolean | null;

/**
 * Records a funnel event. Safe to call from anywhere: no-ops during SSR and
 * under test, and never throws — analytics must not be able to break a battle.
 */
export function track(event: AnalyticsEvent, props?: Record<string, PropValue>): void {
  if (typeof window === "undefined") return;
  if (import.meta.env.MODE === "test") return;
  try {
    vercelTrack(event, props);
  } catch {
    /* a dropped event is never worth an error surfacing to the player */
  }
  // Vercel drops custom events on the Hobby plan; our own table keeps them.
  void flushAnalytics({ event, props: props ?? {}, at: new Date().toISOString() }).catch(() => {});
}

const QUEUE_KEY = "poke-trivia-analytics-queue";
const QUEUE_MAX = 30;
export interface QueuedEvent {
  event: AnalyticsEvent;
  props: Record<string, PropValue>;
  at: string;
}
type Store = Pick<Storage, "getItem" | "setItem">;
interface Sink {
  /** Whether a signed-in (anonymous counts) session exists — read locally, never created here. */
  hasSession: () => Promise<boolean>;
  insert: (rows: { event: string; props: Record<string, PropValue> }[]) => Promise<{ error: unknown }>;
}

const readQueue = (s: Store): QueuedEvent[] => {
  try {
    const q = JSON.parse(s.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(q) ? q : [];
  } catch {
    return [];
  }
};
const writeQueue = (s: Store, q: QueuedEvent[]) => {
  try {
    s.setItem(QUEUE_KEY, JSON.stringify(q.slice(-QUEUE_MAX)));
  } catch {
    /* private mode: the event is lost, never the battle */
  }
};

const supabaseSink: Sink = {
  hasSession: async () => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data } = await supabase.auth.getSession();
    return !!data.session;
  },
  insert: async (rows) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const db = supabase as unknown as { from: (t: string) => { insert: (r: unknown) => Promise<{ error: unknown }> } };
    return db.from("analytics_events").insert(rows);
  },
};

/**
 * Sends `next` (if any) plus everything queued to `analytics_events`. Before a
 * session exists (a new player's first minutes) events wait in localStorage,
 * capped at 30, and go out with the first event after sign-in. Never creates a
 * session itself, so analytics never makes accounts.
 */
export async function flushAnalytics(
  next?: QueuedEvent,
  storage: Store = window.localStorage,
  sink: Sink = supabaseSink,
): Promise<void> {
  const q = readQueue(storage);
  if (next) q.push(next);
  if (q.length === 0) return;
  if (!(await sink.hasSession())) {
    writeQueue(storage, q);
    return;
  }
  writeQueue(storage, []);
  const { error } = await sink.insert(q.map((e) => ({ event: e.event, props: { ...e.props, at: e.at } })));
  if (error) writeQueue(storage, [...readQueue(storage), ...q]);
}

const LAST_SEEN_KEY = "poke-trivia-last-seen-day";

/** Local date as YYYY-MM-DD. Local, not UTC: "yesterday" should mean the player's. */
function today(now: Date): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Records the return-visit gap and remembers today.
 *
 * Returns the whole-day gap since the player was last seen, or null on their
 * first ever open (nothing to measure yet) and on repeat opens the same day
 * (already counted). Exported for the test; call `trackReturnVisit` in the app.
 */
export function readReturnGap(
  now: Date,
  storage: Pick<Storage, "getItem" | "setItem">,
): number | null {
  let last: string | null = null;
  try {
    last = storage.getItem(LAST_SEEN_KEY);
  } catch {
    return null;
  }
  const stamp = today(now);
  try {
    storage.setItem(LAST_SEEN_KEY, stamp);
  } catch {
    /* private mode: still report the gap we managed to read */
  }
  if (!last || last === stamp) return null;
  const days = Math.round((Date.parse(stamp) - Date.parse(last)) / 86_400_000);
  return days > 0 ? days : null;
}

/** Fires `return_after_days` once per day, on the first open of that day. */
export function trackReturnVisit(now: Date = new Date()): void {
  if (typeof window === "undefined") return;
  const days = readReturnGap(now, window.localStorage);
  if (days !== null) track("return_after_days", { days });
}
