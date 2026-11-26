/**
 * An invite code kept until the player saves a trainer name.
 *
 * Since the first-session rework (Figma flow "First session" / "Invite link"),
 * a new player battles first and picks a name after their first win. The
 * referral can only be claimed for a named trainer, so the `?ref=` code from the
 * landing link has to outlive the battle — and a reload — until the save sheet
 * claims it. localStorage rather than the store: it is not part of the save and
 * must never sync to the server.
 */
const KEY = "poke-trivia-pending-ref";

export function setPendingReferral(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    /* private mode or storage full: the referral is lost, play still works */
  }
}

export function getPendingReferral(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingReferral(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}
