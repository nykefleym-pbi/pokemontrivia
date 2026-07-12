import { supabase } from "@/integrations/supabase/client";
import type { Trivia } from "@/lib/trivia-core";
import type { ActiveStatus, PvpStatStages } from "@/lib/store";
import type { ItemId } from "@/lib/game-data";
import type {
  StatChangeSpec,
  SigEngineTickResult,
  SigRuntimeMap,
} from "@/lib/signature-rework-types";

export interface LiveOpponentPreview {
  id: string;
  trainer_name: string;
  trainer_sprite: string;
  level: number;
}

export interface LivePvpMatch {
  id: string;
  hostId: string;
  guestId: string;
  questions: Trivia[];
  status: "active" | "completed" | "forfeited";
  startedAt: string;
  hostCorrect: number | null;
  hostTotal: number | null;
  hostTimeMs: number | null;
  hostStreak: number | null;
  hostScore: number | null;
  hostCompletedAt: string | null;
  guestCorrect: number | null;
  guestTotal: number | null;
  guestTimeMs: number | null;
  guestStreak: number | null;
  guestScore: number | null;
  guestCompletedAt: string | null;
  winnerId: string | null;
  createdAt: string;
  expiresAt: string;

  // ── HP-endurance battle (Nearby Battle rework) ──────────────────────────
  hostHp: number;
  guestHp: number;
  hostStages: PvpStatStages;
  guestStages: PvpStatStages;
  hostStatuses: ActiveStatus[];
  guestStatuses: ActiveStatus[];
  hostCorrectLive: number;
  guestCorrectLive: number;
  hostAnsweredLive: number;
  guestAnsweredLive: number;
  hostTimeMsLive: number;
  guestTimeMsLive: number;
  hostItemsUsed: number;
  guestItemsUsed: number;
  liveResolvedAt: string | null;
  /** Each side's Legendary/Mythical partner dex id (null for a non-legendary
   * partner or a legacy row). Powers identity-dependent abilities (Mew's
   * Transform, weather-conflict resolution). */
  hostPartnerId: number | null;
  guestPartnerId: number | null;
  /** Each side's resolved non-legendary TYPE ability id (null for a legendary
   * partner — which uses a signature — or a legacy row). Lets the opponent name
   * the ability for attribution / "in play" toasts. */
  hostAbilityId: string | null;
  guestAbilityId: string | null;
  /** Question index at which each side's signature-ability suppression lifts
   * (0 = not suppressed). A side is locked while its current question index is
   * below this value (Phase 4: Heatran/Zygarde/Regieleki/Pecharunt). */
  hostSuppressedUntil: number;
  guestSuppressedUntil: number;
  /** Which side most recently (re-)established weather (Phase 5), or null. */
  weatherOwner: "host" | "guest" | null;
  /** Per-side per-battle signature counters keyed by partner dex id (Phase 1:
   * Moltres's Wrath stacks). Server-clamped on write. `{}` when unused. */
  hostSigState: Record<string, number>;
  guestSigState: Record<string, number>;
  /** Per-side signature-ENGINE runtime keyed by partner dex id (M1). Surfaced on the
   * synced row — not just in the tick's reply — so each client can OBSERVE the other
   * side's engine: `phaseIdx` advancing to a question number is the fact that their
   * signature fired there, which is what the `opponent_signature` rows react to
   * (Celebi/Manaphy/Solgaleo/Lunala). `{}` when unused. */
  hostSigRuntime: SigRuntimeMap;
  guestSigRuntime: SigRuntimeMap;
  /** Ho-Oh (250) Rainbow Rebirth: has this side already used its one-time
   * revive this match (via either the self-KO or opponent-inflicted-KO path)? */
  hostRevived: boolean;
  guestRevived: boolean;
  /** True when the guest is the shared Training Bot (Training-vs-Bot mode): the
   * host drives the bot locally via the bot RPCs, and presence/forfeit is off. */
  isBotMatch: boolean;
}

interface LivePvpMatchRow {
  id: string;
  host_id: string;
  guest_id: string;
  questions: unknown;
  status: string;
  started_at: string;
  host_correct: number | null;
  host_total: number | null;
  host_time_ms: number | null;
  host_streak: number | null;
  host_score: number | null;
  host_completed_at: string | null;
  guest_correct: number | null;
  guest_total: number | null;
  guest_time_ms: number | null;
  guest_streak: number | null;
  guest_score: number | null;
  guest_completed_at: string | null;
  winner_id: string | null;
  created_at: string;
  expires_at: string;
  host_hp: number;
  guest_hp: number;
  host_stages: PvpStatStages;
  guest_stages: PvpStatStages;
  host_statuses: ActiveStatus[];
  guest_statuses: ActiveStatus[];
  host_correct_live: number;
  guest_correct_live: number;
  host_answered_live: number;
  guest_answered_live: number;
  host_time_ms_live: number;
  guest_time_ms_live: number;
  host_items_used: number;
  guest_items_used: number;
  live_resolved_at: string | null;
  host_partner_id: number | null;
  guest_partner_id: number | null;
  host_ability_id: string | null;
  guest_ability_id: string | null;
  host_suppressed_until: number;
  guest_suppressed_until: number;
  weather_owner: "host" | "guest" | null;
  host_sig_state: Record<string, number> | null;
  guest_sig_state: Record<string, number> | null;
  host_sig_runtime: SigRuntimeMap | null;
  guest_sig_runtime: SigRuntimeMap | null;
  host_revived: boolean | null;
  guest_revived: boolean | null;
  is_bot_match: boolean | null;
}

function fromRow(r: LivePvpMatchRow): LivePvpMatch {
  return {
    id: r.id,
    hostId: r.host_id,
    guestId: r.guest_id,
    questions: (r.questions as Trivia[] | null) ?? [],
    status: r.status as LivePvpMatch["status"],
    startedAt: r.started_at,
    hostCorrect: r.host_correct,
    hostTotal: r.host_total,
    hostTimeMs: r.host_time_ms,
    hostStreak: r.host_streak,
    hostScore: r.host_score,
    hostCompletedAt: r.host_completed_at,
    guestCorrect: r.guest_correct,
    guestTotal: r.guest_total,
    guestTimeMs: r.guest_time_ms,
    guestStreak: r.guest_streak,
    guestScore: r.guest_score,
    guestCompletedAt: r.guest_completed_at,
    winnerId: r.winner_id,
    createdAt: r.created_at,
    expiresAt: r.expires_at,
    hostHp: r.host_hp ?? 120,
    guestHp: r.guest_hp ?? 120,
    hostStages: r.host_stages ?? { attack: 0, defense: 0, speed: 0, crit: 0 },
    guestStages: r.guest_stages ?? { attack: 0, defense: 0, speed: 0, crit: 0 },
    hostStatuses: r.host_statuses ?? [],
    guestStatuses: r.guest_statuses ?? [],
    hostCorrectLive: r.host_correct_live ?? 0,
    guestCorrectLive: r.guest_correct_live ?? 0,
    hostAnsweredLive: r.host_answered_live ?? 0,
    guestAnsweredLive: r.guest_answered_live ?? 0,
    hostTimeMsLive: r.host_time_ms_live ?? 0,
    guestTimeMsLive: r.guest_time_ms_live ?? 0,
    hostItemsUsed: r.host_items_used ?? 0,
    guestItemsUsed: r.guest_items_used ?? 0,
    liveResolvedAt: r.live_resolved_at,
    hostPartnerId: r.host_partner_id ?? null,
    guestPartnerId: r.guest_partner_id ?? null,
    hostAbilityId: r.host_ability_id ?? null,
    guestAbilityId: r.guest_ability_id ?? null,
    hostSuppressedUntil: r.host_suppressed_until ?? 0,
    guestSuppressedUntil: r.guest_suppressed_until ?? 0,
    weatherOwner: r.weather_owner ?? null,
    hostSigState: r.host_sig_state ?? {},
    guestSigState: r.guest_sig_state ?? {},
    hostSigRuntime: r.host_sig_runtime ?? {},
    guestSigRuntime: r.guest_sig_runtime ?? {},
    hostRevived: r.host_revived ?? false,
    guestRevived: r.guest_revived ?? false,
    isBotMatch: r.is_bot_match ?? false,
  };
}

export interface LivePvpEffect {
  id: string;
  matchId: string;
  questionIndex: number;
  sourceId: string;
  target: "self" | "opponent";
  /** Present for item uses; null for signature-ability activations. */
  itemId: ItemId | null;
  /** "item" (a berry/potion) or "ability" (a Legendary/Mythical signature move). */
  source: "item" | "ability";
  /** Partner dex id for signature-ability activations (the client resolves the
   * move name). Null for a non-legendary TYPE ability, which carries `abilityId`. */
  pokemonId: number | null;
  /** Non-legendary type-ability id (from the effect payload) for attribution. */
  abilityId: string | null;
  kind: "stat_stage" | "status" | "cure" | "immunity" | "heal";
  payload: Record<string, unknown>;
  createdAt: string;
}

type Rpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

const rpc = supabase as unknown as { rpc: Rpc };

/** Scan a trainer's Battle Code (their friend code) to instantly start a match. */
export async function startLivePvpMatch(
  opponentCode: string,
  questions: Trivia[],
  partnerId?: number | null,
): Promise<
  | { ok: true; matchId: string; startedAt: string; opponent: LiveOpponentPreview }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("start_live_pvp_match", {
      _opponent_code: opponentCode.trim().toUpperCase(),
      _questions: questions,
      _partner_id: partnerId ?? null,
    });
    if (error) {
      console.warn("[pvp-live] startLivePvpMatch failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      matchId?: string;
      startedAt?: string;
      opponent?: LiveOpponentPreview;
      error?: string;
    } | null;
    if (r && r.ok === true && r.matchId && r.startedAt && r.opponent) {
      return { ok: true, matchId: r.matchId, startedAt: r.startedAt, opponent: r.opponent };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] startLivePvpMatch threw:", e);
    return { ok: false, error: "network" };
  }
}

/**
 * Start a Training-vs-Bot match: server-backed, host = the caller, guest = the
 * shared Training Bot (a random Legendary/Mythical partner is rolled server-side
 * from the same egg-hatch roster). Same match shape as a real Nearby Battle, so
 * the whole HP/stats/status/ability engine runs unchanged; the human's device
 * drives the bot via the bot RPCs below.
 */
export async function startBotPvpMatch(
  questions: Trivia[],
  partnerId?: number | null,
): Promise<
  | { ok: true; matchId: string; startedAt: string; opponent: LiveOpponentPreview }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("start_bot_pvp_match", {
      _questions: questions,
      _partner_id: partnerId ?? null,
    });
    if (error) {
      console.warn("[pvp-live] startBotPvpMatch failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      matchId?: string;
      startedAt?: string;
      opponent?: LiveOpponentPreview;
      error?: string;
    } | null;
    if (r && r.ok === true && r.matchId && r.startedAt && r.opponent) {
      return { ok: true, matchId: r.matchId, startedAt: r.startedAt, opponent: r.opponent };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] startBotPvpMatch threw:", e);
    return { ok: false, error: "network" };
  }
}

/**
 * Submit one of the bot's (guest-side) moves in a Training match. Security-gated
 * server-side to `auth.uid() = host_id` AND `is_bot_match = true`, and only ever
 * writes the bot's own side — it can never touch a real opponent in a real
 * match. `dmg` is server-clamped to [0,60] exactly like submit_pvp_live_answer.
 */
export async function submitBotPvpMove(
  matchId: string,
  questionIndex: number,
  correct: boolean,
  dmg: number,
  timeMs: number,
): Promise<
  | { ok: true; hostHp: number; guestHp: number; resolved: boolean; winnerId?: string | null }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("submit_bot_pvp_move", {
      _match_id: matchId,
      _question_index: questionIndex,
      _correct: correct,
      _dmg: Math.round(dmg),
      _time_ms: Math.round(timeMs),
    });
    if (error) {
      console.warn("[pvp-live] submitBotPvpMove failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      hostHp?: number;
      guestHp?: number;
      resolved?: boolean;
      winnerId?: string | null;
      error?: string;
    } | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        hostHp: r.hostHp ?? 120,
        guestHp: r.guestHp ?? 120,
        resolved: !!r.resolved,
        winnerId: r.winnerId,
      };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] submitBotPvpMove threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Fire the bot's signature ability (guest side) for a battle_start/post_answer
 * phase. Same server-catalog trust model + host/is_bot ownership gate as the
 * bot move RPC. Best-effort — a no-op when the bot's partner has no catalog
 * effect for that phase. */
export async function applyBotPvpSignatureEffect(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  phase: "battle_start" | "post_answer" | "bespoke",
  scaleCount = 0,
): Promise<{ ok: boolean }> {
  try {
    const { error } = await rpc.rpc("apply_bot_pvp_signature_effect", {
      _match_id: matchId,
      _question_index: questionIndex,
      _pokemon_id: pokemonId,
      _phase: phase,
      _scale_count: scaleCount,
    });
    return { ok: !error };
  } catch (e) {
    console.warn("[pvp-live] applyBotPvpSignatureEffect threw:", e);
    return { ok: false };
  }
}

/**
 * Bot/guest-side parity for the generalized signature-engine tick (owner
 * ruling 5, docs/handoffs/signature-rework/01b-owner-decisions.md: the bot
 * runs its own signature identically to a human). Must be called once per
 * bot answer, unconditionally — same as `sigEngineTick` below — so that
 * `consecutiveWrong`/`disabled`/`firedThisBattle` bookkeeping stays correct
 * even for bespoke-only rows (03-db.md §3). See `sigEngineTick`'s doc comment
 * for the full arg→RPC mapping; this mirrors it exactly except for the RPC
 * name and the auth path it depends on.
 *
 * IMPORTANT — open DB gap (see docs/handoffs/signature-rework/03-backend.md,
 * "botSigEngineTick auth gap"): `pvp_sig_engine_tick`
 * (supabase/migrations/20260710120000_pvp_sig_engine_runtime.sql:148) only
 * authorizes `auth.uid() in (host_id, guest_id)` and resolves the acting
 * side FROM that uid — there is no host-acting-as-guest branch the way
 * `apply_bot_pvp_signature_effect` (:230 of
 * supabase/migrations/20260706202620_pvp_bot_match_rpcs.sql) has
 * (`v_uid = host_id` + `is_bot_match` + guest treated as "self"). Calling
 * `pvp_sig_engine_tick` from the host's session with the bot's `pokemonId`
 * would tick the HOST's own runtime (or fail `unauthorized_ability`), not
 * the bot's. This function therefore targets a NEW, not-yet-created RPC,
 * `pvp_bot_sig_engine_tick`, that DB Engineer must add (mirroring
 * `apply_bot_pvp_signature_effect`'s auth model) before this will work
 * against a live match — see the Handoff block in 03-backend.md.
 */
export async function botSigEngineTick(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  correct: boolean,
  triggerFired: boolean,
  spec: SigEngineTickSpec,
): Promise<SigEngineTickResult> {
  if (!matchId || questionIndex < 0) {
    console.warn("[pvp-live] botSigEngineTick: invalid args", { matchId, questionIndex });
    return { ok: false, reason: "invalid_args" };
  }
  try {
    const { data, error } = await rpc.rpc("pvp_bot_sig_engine_tick", {
      _match_id: matchId,
      _question_index: questionIndex,
      _pokemon_id: pokemonId,
      _correct: correct,
      _trigger_fired: triggerFired,
      _stat_specs: spec.statSpecs,
      _disable_kind: spec.disableKind,
      _disable_n: spec.disableN,
      _disable_next_question: spec.disableNextQuestion,
      _stack_cap: spec.stackCap ?? 3,
      _incorrect_stat_specs: spec.incorrectStatSpecs ?? [],
      _expire_after_questions: spec.expireAfterQuestions ?? 0,
      _self_hp: spec.selfHp ?? null,
      _opp_hp: spec.oppHp ?? null,
    });
    if (error) {
      console.warn("[pvp-live] botSigEngineTick failed:", error.message);
      return { ok: false, reason: "network" };
    }
    const r = data as (SigEngineTickResult & { error?: string }) | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        noop: r.noop,
        reason: r.reason,
        hostStages: r.hostStages,
        guestStages: r.guestStages,
        hostSigRuntime: r.hostSigRuntime,
        guestSigRuntime: r.guestSigRuntime,
      };
    }
    return { ok: false, reason: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] botSigEngineTick threw:", e);
    return { ok: false, reason: "network" };
  }
}

/** Use a (healing) item on the bot's guest side. Same ownership gate as above. */
export async function applyBotPvpLiveItem(
  matchId: string,
  questionIndex: number,
  itemId: ItemId,
): Promise<{ ok: boolean }> {
  try {
    const { error } = await rpc.rpc("use_bot_pvp_live_item", {
      _match_id: matchId,
      _question_index: questionIndex,
      _item_id: itemId,
    });
    return { ok: !error };
  } catch (e) {
    console.warn("[pvp-live] useBotPvpLiveItem threw:", e);
    return { ok: false };
  }
}

/**
 * Register the caller's own partner dex id on a match (Phase 1). The scanner's
 * partner is already stored by start_live_pvp_match; the guest calls this on
 * mount so both sides' partner ids are known before either fires an ability
 * that depends on the opponent's identity. Idempotent server-side (only writes
 * when the side is currently null). Returns whether both sides are now known.
 */
export async function setLivePvpPartner(
  matchId: string,
  partnerId: number | null,
  abilityId: string | null = null,
): Promise<
  | { ok: true; hostPartnerId: number | null; guestPartnerId: number | null; bothKnown: boolean }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("set_live_pvp_partner", {
      _match_id: matchId,
      _partner_id: partnerId ?? null,
      _ability_id: abilityId ?? null,
    });
    if (error) {
      console.warn("[pvp-live] setLivePvpPartner failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      hostPartnerId?: number | null;
      guestPartnerId?: number | null;
      bothKnown?: boolean;
      error?: string;
    } | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        hostPartnerId: r.hostPartnerId ?? null,
        guestPartnerId: r.guestPartnerId ?? null,
        bothKnown: !!r.bothKnown,
      };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] setLivePvpPartner threw:", e);
    return { ok: false, error: "network" };
  }
}

/**
 * Persist Mew's resolved Transform target dex id server-side (Phase 2 security).
 * The server stores it write-once on the caller's own side and validates every
 * subsequent `apply_pvp_signature_effect` call against it, so a Mew player can
 * only ever invoke the single ability Transform genuinely resolved to copy —
 * never an arbitrary id. Only an actual Mew (partner 151) may set it. Idempotent
 * (a later call can't re-roll the stored id). Best-effort: on failure the client
 * still plays, but the server refuses that side's server-catalog effects.
 */
export async function setLivePvpTransform(
  matchId: string,
  transformId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error } = await rpc.rpc("set_live_pvp_transform", {
      _match_id: matchId,
      _transform_id: transformId,
    });
    if (error) {
      console.warn("[pvp-live] setLivePvpTransform failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; error?: string } | null;
    if (r && r.ok === true) return { ok: true };
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] setLivePvpTransform threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Submit the caller's own side of a live match. Returns the computed score. */
export async function submitLivePvpResult(
  matchId: string,
  correct: number,
  total: number,
  timeMs: number,
  maxStreak: number,
): Promise<{ ok: true; score: number } | { ok: false; error: string }> {
  try {
    const { data, error } = await rpc.rpc("submit_live_pvp_result", {
      _match_id: matchId,
      _correct: correct,
      _total: total,
      _time_ms: timeMs,
      _max_streak: maxStreak,
    });
    if (error) {
      console.warn("[pvp-live] submitLivePvpResult failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; score?: number; error?: string } | null;
    if (r && r.ok === true && typeof r.score === "number") {
      return { ok: true, score: r.score };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] submitLivePvpResult threw:", e);
    return { ok: false, error: "network" };
  }
}

/**
 * Resolve a live match by forfeit.
 * - `concede = false` (default): CLAIM the win for the caller — used by the
 *   presence watchdog when the opponent has been gone for 30s.
 * - `concede = true`: the caller GIVES UP, so the opponent is recorded as the
 *   winner and the caller earns no rewards — used by the Forfeit button and the
 *   back-button guard (feedback 45f613c7).
 */
export async function forfeitLivePvpMatch(
  matchId: string,
  concede = false,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error } = await rpc.rpc("forfeit_live_pvp_match", {
      _match_id: matchId,
      _concede: concede,
    });
    if (error) {
      console.warn("[pvp-live] forfeitLivePvpMatch failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; error?: string } | null;
    if (r && r.ok === true) return { ok: true };
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] forfeitLivePvpMatch threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Fetch a single live match by id. */
export async function getLivePvpMatch(matchId: string): Promise<LivePvpMatch | null> {
  const { data, error } = await supabase
    .from("pvp_live_matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (error) {
    console.warn("[pvp-live] getLivePvpMatch failed:", error.message);
    return null;
  }
  return data ? fromRow(data as LivePvpMatchRow) : null;
}

/**
 * Submit the caller's outcome for one question in the HP-endurance battle:
 * correct/incorrect, damage dealt to the opponent, self-damage taken, and
 * time spent. `dmg`/`selfDmg` are computed client-side via pvp-combat.ts (run
 * identically by both trainers) and clamped server-side to a sane ceiling.
 * Resolves the match (HP KO, or HP/accuracy/avg-time tiebreak after 20
 * questions) automatically when appropriate.
 */
export async function submitPvpLiveAnswer(
  matchId: string,
  questionIndex: number,
  correct: boolean,
  dmg: number,
  selfDmg: number,
  timeMs: number,
): Promise<
  | { ok: true; hostHp: number; guestHp: number; resolved: boolean; winnerId?: string | null }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("submit_pvp_live_answer", {
      _match_id: matchId,
      _question_index: questionIndex,
      _correct: correct,
      _dmg: Math.round(dmg),
      _self_dmg: Math.round(selfDmg),
      _time_ms: Math.round(timeMs),
    });
    if (error) {
      console.warn("[pvp-live] submitPvpLiveAnswer failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      hostHp?: number;
      guestHp?: number;
      resolved?: boolean;
      winnerId?: string | null;
      error?: string;
    } | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        hostHp: r.hostHp ?? 120,
        guestHp: r.guestHp ?? 120,
        resolved: !!r.resolved,
        winnerId: r.winnerId,
      };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] submitPvpLiveAnswer threw:", e);
    return { ok: false, error: "network" };
  }
}

/**
 * Use an item/berry in the live match. The server looks up the effect from
 * its own catalog by item id (the client can't supply a magnitude), applies
 * it to the authoritative row, and logs it to `pvp_live_effects` so the
 * opponent's client can show an attribution toast.
 */
export async function applyPvpLiveItem(
  matchId: string,
  questionIndex: number,
  itemId: ItemId,
): Promise<
  | {
      ok: true;
      hostHp: number;
      guestHp: number;
      hostStages: PvpStatStages;
      guestStages: PvpStatStages;
      hostStatuses: ActiveStatus[];
      guestStatuses: ActiveStatus[];
    }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("use_pvp_live_item", {
      _match_id: matchId,
      _question_index: questionIndex,
      _item_id: itemId,
    });
    if (error) {
      console.warn("[pvp-live] applyPvpLiveItem failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      hostHp?: number;
      guestHp?: number;
      hostStages?: PvpStatStages;
      guestStages?: PvpStatStages;
      hostStatuses?: ActiveStatus[];
      guestStatuses?: ActiveStatus[];
      error?: string;
    } | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        hostHp: r.hostHp ?? 120,
        guestHp: r.guestHp ?? 120,
        hostStages: r.hostStages ?? { attack: 0, defense: 0, speed: 0, crit: 0 },
        guestStages: r.guestStages ?? { attack: 0, defense: 0, speed: 0, crit: 0 },
        hostStatuses: r.hostStatuses ?? [],
        guestStatuses: r.guestStatuses ?? [],
      };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] applyPvpLiveItem threw:", e);
    return { ok: false, error: "network" };
  }
}

/**
 * Apply a Legendary/Mythical partner's signature ability for a phase. The
 * server looks up the fixed magnitude from the `pvp_signature_effects` catalog
 * by partner dex id (the client can't supply a magnitude — same trust model as
 * berries), mutates the authoritative row, and logs to `pvp_live_effects` with
 * source='ability' for the opponent's toast. `_phase` is "battle_start" (one
 * standing buff per side) or "post_answer" (a triggered effect). `scaleCount`
 * feeds pokedex-scaled abilities (Fezandipiti). Returns the resolved state, or
 * a noop when nothing applied (already-started battle_start, or no catalog row
 * — e.g. a damage-calc/bespoke/manual ability that has no server effect).
 */
export async function applyPvpSignatureEffect(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  phase: "battle_start" | "post_answer" | "manual" | "sig_state" | "bespoke",
  scaleCount = 0,
): Promise<
  | {
      ok: true;
      noop?: boolean;
      reason?: string;
      hostHp?: number;
      guestHp?: number;
      hostStages?: PvpStatStages;
      guestStages?: PvpStatStages;
      hostStatuses?: ActiveStatus[];
      guestStatuses?: ActiveStatus[];
      hostSuppressedUntil?: number;
      guestSuppressedUntil?: number;
      hostSigState?: Record<string, number>;
      guestSigState?: Record<string, number>;
    }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("apply_pvp_signature_effect", {
      _match_id: matchId,
      _question_index: questionIndex,
      _pokemon_id: pokemonId,
      _phase: phase,
      _scale_count: scaleCount,
    });
    if (error) {
      console.warn("[pvp-live] applyPvpSignatureEffect failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      noop?: boolean;
      reason?: string;
      hostHp?: number;
      guestHp?: number;
      hostStages?: PvpStatStages;
      guestStages?: PvpStatStages;
      hostStatuses?: ActiveStatus[];
      guestStatuses?: ActiveStatus[];
      hostSuppressedUntil?: number;
      guestSuppressedUntil?: number;
      hostSigState?: Record<string, number>;
      guestSigState?: Record<string, number>;
      error?: string;
    } | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        noop: r.noop,
        reason: r.reason,
        hostHp: r.hostHp,
        guestHp: r.guestHp,
        hostStages: r.hostStages,
        guestStages: r.guestStages,
        hostStatuses: r.hostStatuses,
        guestStatuses: r.guestStatuses,
        hostSuppressedUntil: r.hostSuppressedUntil,
        guestSuppressedUntil: r.guestSuppressedUntil,
        hostSigState: r.hostSigState,
        guestSigState: r.guestSigState,
      };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] applyPvpSignatureEffect threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Per-call args for `sigEngineTick`/`botSigEngineTick`, resolved client-side
 * from the firing ability's catalog `SignatureEngineSpec` (signature-rework-types.ts
 * §8) — see 03-db.md §3 for the exact field→RPC-arg mapping this mirrors. */
/** Uxie #480 rides the stat-spec channel without changing a stat: the RPC scans
 * `_stat_specs` for this marker and, on the row's first fire, rolls + stores the
 * predicted status in `sig_runtime` (echoed back for the client to reveal). It is a
 * spec element rather than a 15th RPC arg so the tick's arity stays stable. */
export interface PredictedStatusSpec {
  mode: "predicted_status";
}

export interface SigEngineTickSpec {
  /** Catalog row's `SignatureEngineSpec.stat` (may be `[]`). Passed to the RPC
   * as jsonb, array as-is — no reshaping (03-db.md §1/§3). Only index 0 is
   * tracked (revert/decay/ramp); any further entries are untracked one-shot
   * bumps applied once on first fire (M1 limitation, 03-db.md §1). */
  statSpecs: (StatChangeSpec | PredictedStatusSpec)[];
  /** `DisableSpec.kind` resolved for this ability, or `'none'`. `any_of`,
   * `disable_multiplier_after_incorrect`, and `disable_healing_after_questions`
   * are not understood by this RPC — resolve client-side / leave on the
   * existing bespoke path and pass `'none'` here (03-db.md §2). */
  disableKind: string;
  /** `DisableSpec.n` where the kind takes one; `0` otherwise. */
  disableN: number;
  /** True only for `kind: 'disable_next_question_after_effect'` (Mewtwo/Entei/
   * Jirachi) — composes independently of `disableKind` (03-db.md §2). */
  disableNextQuestion: boolean;
  /** `SIG_STACK_CAP` override; defaults to 3 (signature-rework-types.ts §0). */
  stackCap?: number;
  // ── M2/M3 (migration 20260711133000 widens the RPC to 14 args) ─────────────
  /** `SignatureEngineSpec.incorrectStat` — stat specs applied on a WRONG answer
   * (Hoopa #386's −2 self Def). Accumulates into `netByStat` like the correct-path
   * specs, so a later revert unwinds it too. Omit → `[]` (no incorrect-path stats). */
  incorrectStatSpecs?: StatChangeSpec[];
  /** `SignatureEngineSpec.expireAfterQuestions` — auto-disable + revert this many
   * questions after the row fired (Moltres #146's 3-question window). `0`/omitted =
   * never auto-expires. Composes with `disableKind` (the row can also revert early). */
  expireAfterQuestions?: number;
  /** Acting side's HP at answer time; `null` when unknown. Sent for server-side
   * clamping of HP-gated payoffs (Regigigas #486). */
  selfHp?: number | null;
  /** Opponent's HP at answer time; `null` when unknown. */
  oppHp?: number | null;
}

/**
 * Tick the generalized signature-engine state machine (M1) for the caller's
 * own side: consecutive-wrong counter, ramp/decay per-stat (netByStat) bookkeeping,
 * revert/disable/re-arm, and the next-question skip
 * (`supabase/migrations/20260710120000_pvp_sig_engine_runtime.sql:148`,
 * `pvp_sig_engine_tick`). Additive to `applyPvpSignatureEffect` — bespoke
 * phases (battle_start/manual/sig_state, and most post_answer kinds:
 * stat_stage/status/cure/heal/drain/suppress_ability/swap_stages/cleanse)
 * still go through that RPC unchanged; this one owns ONLY the ramp/decay/
 * disable lifecycle for rows using `SignatureEngineSpec.stat`.
 *
 * Call once per side per answer, from `resolveQuestion`, ALWAYS — even when
 * `spec.statSpecs` is `[]` — so `consecutiveWrong`/`disabled`/
 * `firedThisBattle` bookkeeping stays correct for bespoke-only rows too
 * (03-db.md §3). `questionIndex` is 0-indexed exactly as the caller's loop
 * tracks it; do NOT pre-increment (the RPC maps to 1-indexed internally).
 *
 * `noop: true` (e.g. `reason: 'stale'` on replay) is expected, normal
 * behavior — do not toast it. Only `ok: false` should surface a sonner toast
 * at the call site (COMMON_RULES §2 — this function never swallows the
 * error, it returns it on `reason` since the frozen `SigEngineTickResult`
 * stub has no dedicated `error` field; see 03-backend.md for that mapping).
 */
export async function sigEngineTick(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  correct: boolean,
  triggerFired: boolean,
  spec: SigEngineTickSpec,
): Promise<SigEngineTickResult> {
  if (!matchId || questionIndex < 0) {
    console.warn("[pvp-live] sigEngineTick: invalid args", { matchId, questionIndex });
    return { ok: false, reason: "invalid_args" };
  }
  try {
    const { data, error } = await rpc.rpc("pvp_sig_engine_tick", {
      _match_id: matchId,
      _question_index: questionIndex,
      _pokemon_id: pokemonId,
      _correct: correct,
      _trigger_fired: triggerFired,
      _stat_specs: spec.statSpecs,
      _disable_kind: spec.disableKind,
      _disable_n: spec.disableN,
      _disable_next_question: spec.disableNextQuestion,
      _stack_cap: spec.stackCap ?? 3,
      _incorrect_stat_specs: spec.incorrectStatSpecs ?? [],
      _expire_after_questions: spec.expireAfterQuestions ?? 0,
      _self_hp: spec.selfHp ?? null,
      _opp_hp: spec.oppHp ?? null,
    });
    if (error) {
      console.warn("[pvp-live] sigEngineTick failed:", error.message);
      return { ok: false, reason: "network" };
    }
    const r = data as (SigEngineTickResult & { error?: string }) | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        noop: r.noop,
        reason: r.reason,
        hostStages: r.hostStages,
        guestStages: r.guestStages,
        hostSigRuntime: r.hostSigRuntime,
        guestSigRuntime: r.guestSigRuntime,
      };
    }
    return { ok: false, reason: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] sigEngineTick threw:", e);
    return { ok: false, reason: "network" };
  }
}

// ── signature-rework M4 ──────────────────────────────────────────────────────

/**
 * Deliver an engine row's STATUS (`engine.status`). Same trust model as every
 * other effect: the client only says "my row's trigger fired on question N"; the
 * server looks the status, the chance and the duration up in `pvp_signature_effects`
 * and rolls it. Ogerpon's species gate and Genesect's random-status roll both live
 * server-side too.
 *
 * Before M4 this channel did not exist — 34 rows carried `engine.status` that
 * NOTHING ever applied, and statuses were still coming from the legacy path.
 */
export async function sigEngineStatus(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  asBot = false,
): Promise<{ ok: boolean; noop?: boolean; hostStatuses?: ActiveStatus[]; guestStatuses?: ActiveStatus[] }> {
  try {
    const { data, error } = await rpc.rpc(
      asBot ? "pvp_bot_sig_engine_status" : "pvp_sig_engine_status",
      { _match_id: matchId, _question_index: questionIndex, _pokemon_id: pokemonId },
    );
    if (error) {
      console.warn("[pvp-live] sigEngineStatus failed:", error.message);
      return { ok: false };
    }
    const r = data as {
      ok: boolean;
      noop?: boolean;
      hostStatuses?: ActiveStatus[];
      guestStatuses?: ActiveStatus[];
    } | null;
    return r ?? { ok: false };
  } catch (e) {
    console.warn("[pvp-live] sigEngineStatus threw:", e);
    return { ok: false };
  }
}

/**
 * The M4 HP effects: the instant KO (Urshifu #892 / Fezandipiti #1016 / Terapagos
 * #1024) and the Ruination quartet's halve-current-HP (#1001-#1004).
 *
 * The KO roll happens on the SERVER and nowhere else — a client that could report
 * its own knockout would be an instant-win cheat. If it lands, the server resolves
 * the match itself and hands back the winner.
 */
export async function sigM4Fx(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  asBot = false,
): Promise<{
  ok: boolean;
  noop?: boolean;
  instantKo?: boolean;
  hostHp?: number;
  guestHp?: number;
  resolved?: boolean;
  winnerId?: string | null;
}> {
  try {
    const { data, error } = await rpc.rpc(asBot ? "pvp_bot_sig_m4_fx" : "pvp_sig_m4_fx", {
      _match_id: matchId,
      _question_index: questionIndex,
      _pokemon_id: pokemonId,
    });
    if (error) {
      console.warn("[pvp-live] sigM4Fx failed:", error.message);
      return { ok: false };
    }
    return (data as { ok: boolean } | null) ?? { ok: false };
  } catch (e) {
    console.warn("[pvp-live] sigM4Fx threw:", e);
    return { ok: false };
  }
}

/** What a row asks the server to open when its trigger fires. Every magnitude is
 *  re-clamped server-side — the timer can never go below 3s however this is called. */
export interface SigM4WindowSpec {
  /** Zamazenta #889 / Iron Boulder #1022 — questions of total damage immunity. */
  shieldQuestions?: number;
  /** Eternatus #890 — wrong answers stop costing HP. */
  selfDmgZero?: boolean;
  /** The Loyal Three — squeeze the OPPONENT's answer clock. */
  oppTimerMs?: number;
  oppTimerQuestions?: number;
}

/** Open the M4 runtime windows (shield / self-damage-zero / opponent-timer) on the
 *  caller's own row. These are read back cross-side: the shield by
 *  submit_pvp_live_answer, the timer by the victim's client. */
export async function sigM4Window(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  spec: SigM4WindowSpec,
  asBot = false,
): Promise<{ ok: boolean; noop?: boolean; hostSigRuntime?: SigRuntimeMap; guestSigRuntime?: SigRuntimeMap }> {
  try {
    const { data, error } = await rpc.rpc(asBot ? "pvp_bot_sig_m4_window" : "pvp_sig_m4_window", {
      _match_id: matchId,
      _question_index: questionIndex,
      _pokemon_id: pokemonId,
      _shield_questions: spec.shieldQuestions ?? 0,
      _self_dmg_zero: spec.selfDmgZero ?? false,
      _opp_timer_ms: spec.oppTimerMs ?? 0,
      _opp_timer_questions: spec.oppTimerQuestions ?? 0,
    });
    if (error) {
      console.warn("[pvp-live] sigM4Window failed:", error.message);
      return { ok: false };
    }
    return (data as { ok: boolean } | null) ?? { ok: false };
  } catch (e) {
    console.warn("[pvp-live] sigM4Window threw:", e);
    return { ok: false };
  }
}

/**
 * Apply a non-legendary partner's TYPE ability effect for a phase. Same trust
 * model as signatures/berries: the client names WHICH ability id + phase and the
 * server looks up the fixed magnitude from `pvp_type_ability_effects` (the client
 * can't supply a magnitude), mutates the authoritative row, and logs to
 * `pvp_live_effects` (source='ability', abilityId in the payload) for the
 * opponent's toast. `_phase` is "battle_start" (a one-time standing buff) or
 * "post_answer" (a triggered heal/stat/status/cure/chip). Returns the resolved
 * state, or a noop when nothing applied (already-started battle_start, or no
 * catalog row — a pure damage-calc ability has none). Pure damage/self-damage
 * abilities never call this; those are folded client-side and server-clamped.
 */
export async function applyPvpTypeAbilityEffect(
  matchId: string,
  questionIndex: number,
  abilityId: string,
  phase: "battle_start" | "post_answer",
): Promise<
  | {
      ok: true;
      noop?: boolean;
      hostHp?: number;
      guestHp?: number;
      hostStages?: PvpStatStages;
      guestStages?: PvpStatStages;
      hostStatuses?: ActiveStatus[];
      guestStatuses?: ActiveStatus[];
    }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("apply_pvp_type_ability_effect", {
      _match_id: matchId,
      _question_index: questionIndex,
      _ability_id: abilityId,
      _phase: phase,
    });
    if (error) {
      console.warn("[pvp-live] applyPvpTypeAbilityEffect failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as {
      ok?: boolean;
      noop?: boolean;
      hostHp?: number;
      guestHp?: number;
      hostStages?: PvpStatStages;
      guestStages?: PvpStatStages;
      hostStatuses?: ActiveStatus[];
      guestStatuses?: ActiveStatus[];
      error?: string;
    } | null;
    if (r && r.ok === true) {
      return {
        ok: true,
        noop: r.noop,
        hostHp: r.hostHp,
        guestHp: r.guestHp,
        hostStages: r.hostStages,
        guestStages: r.guestStages,
        hostStatuses: r.hostStatuses,
        guestStatuses: r.guestStatuses,
      };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp-live] applyPvpTypeAbilityEffect threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Subscribe to item/berry-effect events for a match (both self and opponent
 * uses are logged; the caller filters by sourceId). Returns an unsubscribe fn. */
export function subscribeToLivePvpEffects(
  matchId: string,
  onEffect: (effect: LivePvpEffect) => void,
): () => void {
  const channel = supabase
    .channel(`pvp_live_effects_${matchId}`)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "pvp_live_effects", filter: `match_id=eq.${matchId}` },
      (payload) => {
        const row = payload.new as Record<string, unknown>;
        onEffect({
          id: row.id as string,
          matchId: row.match_id as string,
          questionIndex: row.question_index as number,
          sourceId: row.source_id as string,
          target: row.target as "self" | "opponent",
          itemId: (row.item_id as ItemId | null) ?? null,
          source: (row.source as "item" | "ability" | undefined) ?? "item",
          pokemonId: (row.pokemon_id as number | null) ?? null,
          abilityId:
            ((row.payload as Record<string, unknown> | null)?.abilityId as string | undefined) ??
            null,
          kind: row.kind as LivePvpEffect["kind"],
          payload: (row.payload as Record<string, unknown>) ?? {},
          createdAt: row.created_at as string,
        });
      },
    )
    .subscribe();
  return () => {
    try {
      supabase.removeChannel(channel);
    } catch {
      /* noop */
    }
  };
}
