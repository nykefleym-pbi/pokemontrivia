import { supabase } from "@/integrations/supabase/client";
import { ensureSession, syncProfile } from "@/lib/social";
import { useGameStore } from "@/lib/store";

// Loosely-typed table client so this compiles even before Supabase types regenerate.
const db = supabase as unknown as { from: (t: string) => any };

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
  finished_at: string;
}

/** True when `a` outranks `b`: higher accuracy, ties broken by faster time. */
function isBetter(a: { accuracy: number; time_ms: number }, b: { accuracy: number; time_ms: number }) {
  return a.accuracy > b.accuracy || (a.accuracy === b.accuracy && a.time_ms < b.time_ms);
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
  if (error) { console.warn("[mega] getMyMegaRun failed:", error.message); return null; }
  return (data ?? null) as MegaRunRow | null;
}

/** Full leaderboard for an event, ordered by accuracy desc then time asc. */
export async function fetchMegaLeaderboard(eventId: string, limit = 100): Promise<MegaRunRow[]> {
  const { data, error } = await db
    .from("mega_runs")
    .select("*")
    .eq("event_id", eventId)
    .order("accuracy", { ascending: false })
    .order("time_ms", { ascending: true })
    .limit(limit);
  if (error) { console.warn("[mega] fetchMegaLeaderboard failed:", error.message); return []; }
  return (data ?? []) as MegaRunRow[];
}

/** The current user's row + 1-based rank for an event, or null if no run yet. */
export async function getMyMegaRank(eventId: string): Promise<{ row: MegaRunRow; rank: number } | null> {
  const mine = await getMyMegaRun(eventId);
  if (!mine) return null;
  const board = await fetchMegaLeaderboard(eventId, 1000);
  const idx = board.findIndex((r) => r.user_id === mine.user_id);
  return { row: mine, rank: idx >= 0 ? idx + 1 : board.length + 1 };
}

/**
 * Submit a finished Mega Raid run. Keeps the player's BEST run for the event
 * (higher accuracy, ties broken by faster time) — a worse replay never demotes
 * an earlier good score. Returns the stored row + 1-based rank, or null on failure.
 */
export async function submitMegaRun(input: {
  eventId: string;
  accuracy: number;
  correct: number;
  total: number;
  timeMs: number;
}): Promise<{ row: MegaRunRow; rank: number } | null> {
  // Guarantee the profiles row exists (mega_runs.user_id references it) and trainer fields are fresh.
  await syncProfile();
  const uid = await ensureSession();
  if (!uid) return null;
  const s = useGameStore.getState();

  const incoming = { accuracy: input.accuracy, time_ms: input.timeMs };
  const existing = await getMyMegaRun(input.eventId);

  if (!existing || isBetter(incoming, existing)) {
    const payload = {
      user_id: uid,
      event_id: input.eventId,
      accuracy: input.accuracy,
      correct: input.correct,
      total: input.total,
      time_ms: input.timeMs,
      trainer_name: s.trainerName || "Trainer",
      trainer_sprite: s.trainerSprite || "red",
      level: s.level ?? 1,
    };
    const { error } = await db
      .from("mega_runs")
      .upsert(payload, { onConflict: "user_id,event_id" });
    if (error) console.warn("[mega] submitMegaRun failed:", error.message);
  }

  return getMyMegaRank(input.eventId);
}
