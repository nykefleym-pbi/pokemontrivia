import { supabase } from "@/integrations/supabase/client";
import type { Trivia } from "@/lib/trivia-core";
import type { ActiveStatus, PvpStatStages } from "@/lib/store";
import type { ItemId } from "@/lib/game-data";

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
  host_suppressed_until: number;
  guest_suppressed_until: number;
  weather_owner: "host" | "guest" | null;
  host_sig_state: Record<string, number> | null;
  guest_sig_state: Record<string, number> | null;
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
    hostSuppressedUntil: r.host_suppressed_until ?? 0,
    guestSuppressedUntil: r.guest_suppressed_until ?? 0,
    weatherOwner: r.weather_owner ?? null,
    hostSigState: r.host_sig_state ?? {},
    guestSigState: r.guest_sig_state ?? {},
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
  /** Partner dex id for ability activations (the client resolves the move name). */
  pokemonId: number | null;
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
 * Register the caller's own partner dex id on a match (Phase 1). The scanner's
 * partner is already stored by start_live_pvp_match; the guest calls this on
 * mount so both sides' partner ids are known before either fires an ability
 * that depends on the opponent's identity. Idempotent server-side (only writes
 * when the side is currently null). Returns whether both sides are now known.
 */
export async function setLivePvpPartner(
  matchId: string,
  partnerId: number | null,
): Promise<
  | { ok: true; hostPartnerId: number | null; guestPartnerId: number | null; bothKnown: boolean }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("set_live_pvp_partner", {
      _match_id: matchId,
      _partner_id: partnerId ?? null,
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

/** Claim a forfeit win when the opponent's presence has been gone for 30s. */
export async function forfeitLivePvpMatch(
  matchId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error } = await rpc.rpc("forfeit_live_pvp_match", { _match_id: matchId });
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
  phase: "battle_start" | "post_answer" | "manual" | "sig_state",
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
