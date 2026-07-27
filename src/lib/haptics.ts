/**
 * Answer feedback you feel rather than hear — the short buzz on a correct
 * answer, the double buzz on a wrong one.
 *
 * Was copy-pasted into Solo, Daily and Live PvP and simply missing from Mega
 * Raid and Who's That, so two of the five question screens felt dead by
 * comparison. One implementation now, so a sixth screen cannot forget.
 *
 * Deliberately not gated on the Reduced Motion setting: that setting is about
 * vestibular triggers from on-screen animation, and silencing haptics with it
 * would take feedback away from players who turned it on for a different
 * reason. Muting the game already silences the audio half separately.
 */
export function answerHaptic(correct: boolean): void {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return;
  try {
    navigator.vibrate(correct ? 30 : [50, 30, 50]);
  } catch {
    // Blocked by a permissions policy, or the page has never been interacted
    // with. Never worth failing an answer over.
  }
}
