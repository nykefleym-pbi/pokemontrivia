import { supabase } from "@/integrations/supabase/client";
import type { Trivia } from "@/lib/trivia-core";

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
  };
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
): Promise<
  | { ok: true; matchId: string; startedAt: string; opponent: LiveOpponentPreview }
  | { ok: false; error: string }
> {
  try {
    const { data, error } = await rpc.rpc("start_live_pvp_match", {
      _opponent_code: opponentCode.trim().toUpperCase(),
      _questions: questions,
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
