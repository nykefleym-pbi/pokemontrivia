import { supabase } from "@/integrations/supabase/client";
import { ensureSession, syncProfile } from "@/lib/social";

// Loosely-typed clients so this compiles even before Supabase types regenerate.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase Database type doesn't yet include the mega_* tables; chained query builder needs a loose return.
const db = supabase as unknown as { from: (t: string) => any };
const rpc = supabase as unknown as {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export interface MegaRunRow {
  id: string;
  user_id: string;
  event_id: string;
  accuracy: number;
  correct: number;
  total: number;
  time_ms: number;
  trainer_name: string;
  trainer_sprite: string;
  level: number;
  attempts: number;
  finished_at: string;
}

/** Read the current user's stored run for an event (or null). */
export async function getMyMegaRun(eventId: string): Promise<MegaRunRow | null> {
  const uid = await ensureSession();
  if (!uid) return null;
  const { data, error } = await db
    .from("mega_runs")
    .select("*")
    .eq("user_id", uid)
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) {
    console.warn("[mega] getMyMegaRun failed:", error.message);
    return null;
  }
  return (data ?? null) as MegaRunRow | null;
}

/** Attempts used so far (0–2). Escapes are free and never increment this. */
export async function getMegaAttempts(eventId: string): Promise<number> {
  const row = await getMyMegaRun(eventId);
  return row?.attempts ?? 0;
}

/** Full leaderboard for an event, ordered by accuracy desc then time asc. */
/** Public leaderboard row (display columns only — no run id, served via RPC). */
export interface MegaLeaderboardRow {
  user_id: string;
  trainer_name: string;
  trainer_sprite: string;
  level: number;
  accuracy: number;
  correct: number;
  total: number;
  time_ms: number;
  attempts: number;
  finished_at: string;
}

/**
 * Leaderboard for an event via the get_mega_leaderboard RPC. The mega_runs table
 * itself is owner-only readable; this function exposes just the display columns.
 */
export async function fetchMegaLeaderboard(
  eventId: string,
  limit = 100,
): Promise<MegaLeaderboardRow[]> {
  const { data, error } = await rpc.rpc("get_mega_leaderboard", {
    p_event_id: eventId,
    p_limit: limit,
  });
  if (error) {
    console.warn("[mega] fetchMegaLeaderboard failed:", error.message);
    return [];
  }
  return (data ?? []) as MegaLeaderboardRow[];
}

/** The current user's row + 1-based rank for an event, or null if no run yet. */
export async function getMyMegaRank(
  eventId: string,
): Promise<{ row: MegaRunRow; rank: number } | null> {
  const mine = await getMyMegaRun(eventId);
  if (!mine) return null;
  const board = await fetchMegaLeaderboard(eventId, 1000);
  const idx = board.findIndex((r) => r.user_id === mine.user_id);
  return { row: mine, rank: idx >= 0 ? idx + 1 : board.length + 1 };
}

export type SubmitResult =
  { ok: true; row: MegaRunRow; rank: number } | { ok: false; error: string };

/**
 * Submit a finished Mega Raid run through the server RPC, which enforces the
 * active-window freeze, the 2-attempt cap, and keep-best (higher accuracy, ties
 * broken by faster time). A rejected 3rd attempt returns { ok: false }.
 */
export async function submitMegaRun(input: {
  eventId: string;
  accuracy: number;
  correct: number;
  total: number;
  timeMs: number;
}): Promise<SubmitResult> {
  // Guarantee the profiles row exists (mega_runs.user_id references it) and trainer fields are fresh.
  await syncProfile();
  const uid = await ensureSession();
  if (!uid) return { ok: false, error: "No session yet — try again in a moment." };

  const { data, error } = await rpc.rpc("submit_mega_run", {
    p_event_id: input.eventId,
    p_accuracy: input.accuracy,
    p_correct: input.correct,
    p_total: input.total,
    p_time_ms: input.timeMs,
  });
  if (error) {
    console.warn("[mega] submitMegaRun failed:", error.message);
    return { ok: false, error: error.message };
  }
  const ranked = await getMyMegaRank(input.eventId);
  return { ok: true, row: data as MegaRunRow, rank: ranked?.rank ?? 0 };
}
