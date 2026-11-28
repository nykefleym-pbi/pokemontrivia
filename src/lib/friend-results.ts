import type { PvpMatch } from "@/lib/pvp";

/**
 * Friend battles with a result you haven't opened yet (Paul, 2026-11-28): a
 * finished, declined or expired challenge turns that friend's Battle button
 * into Results until you've seen it once (16.6).
 */
const SEEN_KEY = "poke-trivia-seen-friend-results";
type Store = Pick<Storage, "getItem" | "setItem">;

export function readSeenResults(s: Store = window.localStorage): Set<string> {
  try {
    const v = JSON.parse(s.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(v) ? v : []);
  } catch {
    return new Set();
  }
}

export function markResultSeen(matchId: string, s: Store = window.localStorage): void {
  const seen = readSeenResults(s);
  seen.add(matchId);
  try {
    // The newest 100 are plenty: older matches drop off the list anyway.
    s.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-100)));
  } catch {
    /* private mode: Results stays until the next result replaces it */
  }
}

/** A pending challenge past its expiry is as good as expired, whatever the server row says yet. */
export const isOver = (m: PvpMatch, now: number) =>
  m.status === "completed" || m.status === "declined" || m.status === "expired" || Date.parse(m.expiresAt) < now;

/** The newest unseen over match between you and this friend, if any. */
export function unseenResultWith(
  matches: PvpMatch[],
  myId: string,
  friendId: string,
  seen: Set<string>,
  now = Date.now(),
): string | null {
  const ours = matches
    .filter(
      (m) =>
        (m.challengerId === myId && m.opponentId === friendId) || (m.challengerId === friendId && m.opponentId === myId),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const latest = ours[0];
  return latest && isOver(latest, now) && !seen.has(latest.id) ? latest.id : null;
}
