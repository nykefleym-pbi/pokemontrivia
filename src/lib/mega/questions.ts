import { supabase } from "@/integrations/supabase/client";
import type { Trivia } from "@/components/battle-screen";
import type { MegaEvent } from "./schedule";

// Loosely-typed clients so this compiles even before Supabase types regenerate.
const db = supabase as unknown as { from: (t: string) => any };
const fns = supabase as unknown as {
  functions: { invoke: (name: string, opts?: { body?: unknown }) => Promise<{ data: unknown; error: unknown }> };
};

/** Read the frozen 50-question set for an event (or [] if not generated yet). */
export async function fetchMegaQuestions(eventId: string): Promise<Trivia[]> {
  const { data, error } = await db
    .from("mega_event_questions")
    .select("questions")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) { console.warn("[mega] fetchMegaQuestions failed:", error.message); return []; }
  return ((data?.questions ?? []) as Trivia[]);
}

/**
 * Return the event's frozen 50, generating them once if missing
 * (lazy-on-activation). The set is the same for everyone and never regenerated.
 * Event #1 is pre-seeded, so this resolves instantly without invoking generation.
 */
export async function ensureMegaQuestions(event: MegaEvent): Promise<Trivia[]> {
  let qs = await fetchMegaQuestions(event.id);
  if (qs.length > 0) return qs;
  // Not generated yet — ask the edge function to generate + save (idempotent, race-safe).
  try {
    await fns.functions.invoke("mega-questions", { body: { eventId: event.id } });
  } catch (e) {
    console.warn("[mega] mega-questions generation invoke failed:", e);
  }
  qs = await fetchMegaQuestions(event.id);
  return qs;
}
