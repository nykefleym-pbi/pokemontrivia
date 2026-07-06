import { ALL_LEGENDARY_MYTHICAL_IDS } from "./legendary-data";
import { PVP_BASE_TIMER_MS } from "./pvp-combat";

/**
 * Pure, testable brain for the Training-vs-Bot mode. The bot has no server-side
 * intelligence: its move is decided on the human's own device each question and
 * submitted through the narrowly-scoped bot RPCs (submit_bot_pvp_move etc.), so
 * everything here is deterministic given an injected `rng` (defaults to
 * Math.random). Mirrors the style of pvp-combat.ts — flat helpers, no state.
 */

/** Per-match skill profile, rolled once when a bot match starts. */
export interface BotProfile {
  /** Probability (0..1) the bot answers a given question correctly. */
  accuracy: number;
  /** Answer-time model, in ms: a mean plus symmetric jitter. */
  speed: { meanMs: number; jitter: number };
  /** Appetite (0..1) for spending its signature ability / an item when able. */
  aggression: number;
}

// A rolled profile stays inside these bounds so no bot is trivial or unbeatable.
const ACCURACY_MIN = 0.55;
const ACCURACY_MAX = 0.9;
const SPEED_MEAN_MIN_MS = 4000;
const SPEED_MEAN_MAX_MS = 12_000;
const SPEED_JITTER_MIN_MS = 1000;
const SPEED_JITTER_MAX_MS = 4000;
const AGGRESSION_MIN = 0.2;
const AGGRESSION_MAX = 0.8;
/** Answers never resolve below this or above the shared question slot. */
const ANSWER_TIME_FLOOR_MS = 800;
const ANSWER_TIME_CEIL_MS = PVP_BASE_TIMER_MS - 1000;

type Rng = () => number;

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/** Pick the bot's Legendary/Mythical partner from the exact egg-hatch roster
 * (server rolls its own copy in start_bot_pvp_match; this mirror lets the client
 * preview it if needed and keeps the two rolls drawn from one source of truth). */
export function rollBotPartner(rng: Rng = Math.random): number {
  const i = Math.floor(rng() * ALL_LEGENDARY_MYTHICAL_IDS.length);
  return ALL_LEGENDARY_MYTHICAL_IDS[Math.min(i, ALL_LEGENDARY_MYTHICAL_IDS.length - 1)];
}

/** Roll a fresh, bounded skill profile for one bot match. */
export function rollBotProfile(rng: Rng = Math.random): BotProfile {
  return {
    accuracy: lerp(ACCURACY_MIN, ACCURACY_MAX, rng()),
    speed: {
      meanMs: Math.round(lerp(SPEED_MEAN_MIN_MS, SPEED_MEAN_MAX_MS, rng())),
      jitter: Math.round(lerp(SPEED_JITTER_MIN_MS, SPEED_JITTER_MAX_MS, rng())),
    },
    aggression: lerp(AGGRESSION_MIN, AGGRESSION_MAX, rng()),
  };
}

/** Whether the bot answers this question correctly. */
export function botAnswersCorrectly(profile: BotProfile, rng: Rng = Math.random): boolean {
  return rng() < profile.accuracy;
}

/** How long (ms) the bot "spends" before locking its answer, clamped so it
 * always lands inside the shared question slot. */
export function botAnswerTimeMs(profile: BotProfile, rng: Rng = Math.random): number {
  const raw = profile.speed.meanMs + (rng() * 2 - 1) * profile.speed.jitter;
  return Math.round(Math.max(ANSWER_TIME_FLOOR_MS, Math.min(ANSWER_TIME_CEIL_MS, raw)));
}

/**
 * Whether the bot fires its signature ability this question. Gated on having
 * just answered correctly (mirrors how a human's post_answer abilities key off
 * a correct answer) and on the bot actually owning a fireable ability, then
 * rolled against aggression. The server is authoritative — a fire that has no
 * catalog effect simply no-ops.
 */
export function botShouldFireAbility(
  profile: BotProfile,
  ctx: { answeredCorrectly: boolean; hasAbility: boolean },
  rng: Rng = Math.random,
): boolean {
  if (!ctx.hasAbility || !ctx.answeredCorrectly) return false;
  return rng() < profile.aggression;
}

/**
 * Whether the bot uses a healing item this question. Only considered when the
 * bot is hurt; the more hurt (and the more aggressive) it is, the likelier.
 * `itemsRemaining` guards the shared 3-item-per-battle cap.
 */
export function botShouldUseItem(
  profile: BotProfile,
  ctx: { hpPct: number; itemsRemaining: number },
  rng: Rng = Math.random,
): boolean {
  if (ctx.itemsRemaining <= 0 || ctx.hpPct > 0.45) return false;
  const urgency = (0.45 - ctx.hpPct) / 0.45; // 0 at 45% HP → 1 at 0% HP
  return rng() < profile.aggression * urgency;
}
