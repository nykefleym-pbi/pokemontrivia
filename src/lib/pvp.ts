import { supabase } from "@/integrations/supabase/client";
import { useGameStore } from "@/lib/store";
import type { Trivia } from "@/lib/trivia-core";

export interface PvpMatch {
  id: string;
  challengerId: string;
  opponentId: string;
  questions: Trivia[];
  status: "pending" | "completed" | "declined" | "expired";
  challengerCorrect: number | null;
  challengerTotal: number | null;
  challengerTimeMs: number | null;
  challengerStreak: number | null;
  challengerScore: number | null;
  challengerCompletedAt: string | null;
  opponentCorrect: number | null;
  opponentTotal: number | null;
  opponentTimeMs: number | null;
  opponentStreak: number | null;
  opponentScore: number | null;
  opponentCompletedAt: string | null;
  winnerId: string | null;
  createdAt: string;
  expiresAt: string;
}

interface PvpMatchRow {
  id: string;
  challenger_id: string;
  opponent_id: string;
  questions: unknown;
  status: string;
  challenger_correct: number | null;
  challenger_total: number | null;
  challenger_time_ms: number | null;
  challenger_streak: number | null;
  challenger_score: number | null;
  challenger_completed_at: string | null;
  opponent_correct: number | null;
  opponent_total: number | null;
  opponent_time_ms: number | null;
  opponent_streak: number | null;
  opponent_score: number | null;
  opponent_completed_at: string | null;
  winner_id: string | null;
  created_at: string;
  expires_at: string;
}

function fromRow(r: PvpMatchRow): PvpMatch {
  return {
    id: r.id,
    challengerId: r.challenger_id,
    opponentId: r.opponent_id,
    questions: (r.questions as Trivia[] | null) ?? [],
    status: r.status as PvpMatch["status"],
    challengerCorrect: r.challenger_correct,
    challengerTotal: r.challenger_total,
    challengerTimeMs: r.challenger_time_ms,
    challengerStreak: r.challenger_streak,
    challengerScore: r.challenger_score,
    challengerCompletedAt: r.challenger_completed_at,
    opponentCorrect: r.opponent_correct,
    opponentTotal: r.opponent_total,
    opponentTimeMs: r.opponent_time_ms,
    opponentStreak: r.opponent_streak,
    opponentScore: r.opponent_score,
    opponentCompletedAt: r.opponent_completed_at,
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

/**
 * Fire-and-forget push trigger. The Edge Function independently re-verifies
 * that the caller is actually a party to the match before sending.
 */
async function notifyPush(
  kind: "pvp_challenge" | "pvp_result",
  toUserId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke("send-push", {
      body: { kind, toUserId, title, body },
    });
    if (error) console.warn(`[pvp] notifyPush(${kind}) failed:`, error.message);
  } catch (e) {
    console.warn(`[pvp] notifyPush(${kind}) threw:`, e);
  }
}

/** Challenge a friend to a match using a frozen set of questions. */
export async function createPvpChallenge(
  opponentId: string,
  questions: Trivia[],
): Promise<{ ok: true; matchId: string } | { ok: false; error: string }> {
  try {
    const { data, error } = await rpc.rpc("create_pvp_challenge", {
      _opponent_id: opponentId,
      _questions: questions,
    });
    if (error) {
      console.warn("[pvp] createPvpChallenge failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; matchId?: string; error?: string } | null;
    if (r && r.ok === true && r.matchId) {
      const myName = useGameStore.getState().trainerName || "A trainer";
      void notifyPush(
        "pvp_challenge",
        opponentId,
        "New PvP challenge!",
        `${myName} challenged you to a trivia match!`,
      );
      return { ok: true, matchId: r.matchId };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp] createPvpChallenge threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Submit the caller's own side of a match. Returns the computed score. */
export async function submitPvpResult(
  matchId: string,
  opponentId: string,
  correct: number,
  total: number,
  timeMs: number,
  maxStreak: number,
): Promise<{ ok: true; score: number } | { ok: false; error: string }> {
  try {
    const { data, error } = await rpc.rpc("submit_pvp_result", {
      _match_id: matchId,
      _correct: correct,
      _total: total,
      _time_ms: timeMs,
      _max_streak: maxStreak,
    });
    if (error) {
      console.warn("[pvp] submitPvpResult failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; score?: number; error?: string } | null;
    if (r && r.ok === true && typeof r.score === "number") {
      const myName = useGameStore.getState().trainerName || "A trainer";
      void notifyPush(
        "pvp_result",
        opponentId,
        "PvP match update",
        `${myName} played your challenge — check the result!`,
      );
      return { ok: true, score: r.score };
    }
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp] submitPvpResult threw:", e);
    return { ok: false, error: "network" };
  }
}

/** Pending challenges where the caller is the invited opponent and hasn't played yet. */
export async function listPvpInvites(): Promise<PvpMatch[]> {
  try {
    const { data, error } = await rpc.rpc("list_pvp_invites");
    if (error) {
      console.warn("[pvp] listPvpInvites failed:", error.message);
      return [];
    }
    return ((data as PvpMatchRow[]) ?? []).map(fromRow);
  } catch (e) {
    console.warn("[pvp] listPvpInvites threw:", e);
    return [];
  }
}

/** All of the caller's matches (either role), most recent first. */
export async function listPvpMatches(): Promise<PvpMatch[]> {
  try {
    const { data, error } = await rpc.rpc("list_pvp_matches");
    if (error) {
      console.warn("[pvp] listPvpMatches failed:", error.message);
      return [];
    }
    return ((data as PvpMatchRow[]) ?? []).map(fromRow);
  } catch (e) {
    console.warn("[pvp] listPvpMatches threw:", e);
    return [];
  }
}

/** Fetch a single match by id (used when landing on the /pvp play route). */
export async function getPvpMatch(matchId: string): Promise<PvpMatch | null> {
  const { data, error } = await supabase
    .from("pvp_matches")
    .select("*")
    .eq("id", matchId)
    .single();
  if (error) {
    console.warn("[pvp] getPvpMatch failed:", error.message);
    return null;
  }
  return data ? fromRow(data as PvpMatchRow) : null;
}

/** Decline a challenge without playing it. */
export async function declinePvpChallenge(
  matchId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const { data, error } = await rpc.rpc("decline_pvp_challenge", { _match_id: matchId });
    if (error) {
      console.warn("[pvp] declinePvpChallenge failed:", error.message);
      return { ok: false, error: "network" };
    }
    const r = data as { ok?: boolean; error?: string } | null;
    if (r && r.ok === true) return { ok: true };
    return { ok: false, error: (r && r.error) || "network" };
  } catch (e) {
    console.warn("[pvp] declinePvpChallenge threw:", e);
    return { ok: false, error: "network" };
  }
}
