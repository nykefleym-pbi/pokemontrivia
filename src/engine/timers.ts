// Question-timer math: speed stages shorten the answering window.
import { clampStage } from "./state";

export const PVP_BASE_TIMER_MS = 20_000;
/**
 * Speed is a first-class stat now (not a timer-item hack). Each Speed stage
 * lengthens/shortens the holder's OWN per-question timer by 10% — matching the
 * Attack/Defense magnitude, so at the ±3 clamp a holder's own timer ranges
 * 70%–130% of base (20s → 14s–26s): +3 → 130%, −3 → 70%. So buffing your Speed
 * gives you more thinking time, and an opponent-facing Speed debuff
 * (Salac/Colbur) shortens the target's timer.
 */
export const PVP_SPEED_PER_STAGE = 0.1;

export function timerMsForSpeedStage(stage: number, baseMs = PVP_BASE_TIMER_MS): number {
  return Math.round(baseMs * (1 + PVP_SPEED_PER_STAGE * clampStage(stage)));
}
