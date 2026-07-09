import { ALL_LEGENDARY_MYTHICAL_IDS } from "./legendary-data";
import { PVP_BASE_TIMER_MS } from "./pvp-combat";

/**
 * Pure, testable brain for the Training-vs-Bot mode. The bot has no server-side
 * intelligence: its move is decided on the human's own device each question and
 * submitted through the narrowly-scoped bot RPCs (submit_bot_pvp_move etc.), so
 * everything here is deterministic given an injected `rng` (defaults to
 * Math.random). Mirrors the style of pvp-combat.ts — flat helpers, no state.
 */

/** Discrete skill tier rolled per match, so back-to-back Training matches feel
 * distinctly easier or harder instead of a narrow same-ish difficulty band. */
export type BotTier = "rookie" | "trainer" | "ace";

/** Per-match skill profile, rolled once when a bot match starts. */
export interface BotProfile {
  /** Which difficulty tier this match's bot was rolled into. */
  tier: BotTier;
  /** Probability (0..1) the bot answers a given question correctly. */
  accuracy: number;
  /** Answer-time model, in ms: a mean plus symmetric jitter. */
  speed: { meanMs: number; jitter: number };
  /** Appetite (0..1) for spending its signature ability / an item when able. */
  aggression: number;
}

/** Per-tier bands. Each tier owns a non-overlapping accuracy range and its own
 * speed/aggression feel, so a Rookie is clearly beatable and an Ace is a real
 * threat — but the outer envelope still keeps no bot trivial or unbeatable. */
interface TierBand {
  accuracy: [number, number];
  meanMs: [number, number];
  jitter: [number, number];
  aggression: [number, number];
}
const TIER_BANDS: Record<BotTier, TierBand> = {
  // Slow, error-prone, timid — a gentle warm-up opponent.
  rookie: { accuracy: [0.45, 0.6], meanMs: [8500, 12_000], jitter: [2000, 4000], aggression: [0.15, 0.35] },
  // The middle of the road: competent but fallible.
  trainer: { accuracy: [0.62, 0.8], meanMs: [5500, 8500], jitter: [1500, 3000], aggression: [0.35, 0.6] },
  // Fast, sharp, and quick to spend abilities/items — a proper challenge.
  ace: { accuracy: [0.82, 0.95], meanMs: [3000, 5500], jitter: [800, 2000], aggression: [0.6, 0.9] },
};
/** Tier draw order + weights (rng in [0,1)). Roughly bell-shaped: most matches
 * are Trainer, with Rookie/Ace the tails, so the average game is fair. */
const TIER_ROLL: { tier: BotTier; upTo: number }[] = [
  { tier: "rookie", upTo: 0.3 },
  { tier: "trainer", upTo: 0.75 },
  { tier: "ace", upTo: 1 },
];

/** Answers never resolve below this or above the shared question slot. */
const ANSWER_TIME_FLOOR_MS = 800;
const ANSWER_TIME_CEIL_MS = PVP_BASE_TIMER_MS - 1000;

type Rng = () => number;

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

/** Roll this match's difficulty tier from the weighted table. */
export function rollBotTier(rng: Rng = Math.random): BotTier {
  const r = rng();
  for (const { tier, upTo } of TIER_ROLL) if (r < upTo) return tier;
  return "ace";
}

/** Human-readable tier name (for optional display). */
export function botTierLabel(tier: BotTier): string {
  return tier === "rookie" ? "Rookie" : tier === "ace" ? "Ace" : "Trainer";
}

/** Pick the bot's Legendary/Mythical partner from the exact egg-hatch roster
 * (server rolls its own copy in start_bot_pvp_match; this mirror lets the client
 * preview it if needed and keeps the two rolls drawn from one source of truth). */
export function rollBotPartner(rng: Rng = Math.random): number {
  const i = Math.floor(rng() * ALL_LEGENDARY_MYTHICAL_IDS.length);
  return ALL_LEGENDARY_MYTHICAL_IDS[Math.min(i, ALL_LEGENDARY_MYTHICAL_IDS.length - 1)];
}

/** Roll a fresh skill profile for one bot match: pick a difficulty tier, then
 * draw accuracy/speed/aggression from that tier's bands. An explicit `tier` may
 * be forced (e.g. for tests); otherwise it's rolled from the weighted table. */
export function rollBotProfile(rng: Rng = Math.random, forceTier?: BotTier): BotProfile {
  const tier = forceTier ?? rollBotTier(rng);
  const b = TIER_BANDS[tier];
  return {
    tier,
    accuracy: lerp(b.accuracy[0], b.accuracy[1], rng()),
    speed: {
      meanMs: Math.round(lerp(b.meanMs[0], b.meanMs[1], rng())),
      jitter: Math.round(lerp(b.jitter[0], b.jitter[1], rng())),
    },
    aggression: lerp(b.aggression[0], b.aggression[1], rng()),
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
