import { supabase } from "@/integrations/supabase/client";
import type { Trivia } from "@/components/battle-screen";
import type { MegaEvent } from "./schedule";

// Loosely-typed client so this compiles even before Supabase types regenerate.
const db = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

interface PublicQuestion {
  question: string;
  options: string[];
  category?: string;
}

/**
 * Read the frozen 50-question set for an event, with correct-answer and explanation
 * fields stripped server-side. Returns [] if the event hasn't been generated yet.
 */
export async function fetchMegaQuestions(eventId: string): Promise<Trivia[]> {
  const { data, error } = await db.rpc("get_mega_questions_public", { p_event_id: eventId });
  if (error) { console.warn("[mega] fetchMegaQuestions failed:", error.message); return []; }
  const rows = (data as PublicQuestion[] | null) ?? [];
  return rows.map((r) => ({
    question: r.question,
    options: r.options,
    correct: -1,          // unknown to the client; resolved via reveal_mega_answer
    explanation: "",
    category: r.category ?? "",
  }));
}

/** Reveal a single question's correct option + explanation (called on answer / hint item). */
export async function revealMegaAnswer(eventId: string, qIndex: number): Promise<{ correctIndex: number; explanation: string } | null> {
  const { data, error } = await db.rpc("reveal_mega_answer", { p_event_id: eventId, p_q_index: qIndex });
  if (error) { console.warn("[mega] revealMegaAnswer failed:", error.message); return null; }
  const d = data as { ok?: boolean; correct_index?: number; explanation?: string } | null;
  if (!d || !d.ok || typeof d.correct_index !== "number") return null;
  return { correctIndex: d.correct_index, explanation: d.explanation ?? "" };
}

/**
 * Return the event's frozen 50, generating them once if missing
 * (lazy-on-activation). The set is the same for everyone and never regenerated.
 */
export async function ensureMegaQuestions(event: MegaEvent): Promise<Trivia[]> {
  let qs = await fetchMegaQuestions(event.id);
  if (qs.length > 0) return qs;
  try {
    const resp = await fetch("/api/mega-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id }),
    });
    if (resp.ok) {
      // Server generation is best-effort; re-read via the sanitized RPC.
      qs = await fetchMegaQuestions(event.id);
      if (qs.length > 0) return qs;
    }
  } catch (e) {
    console.warn("[mega] mega-questions generation failed:", e);
  }
  return await fetchMegaQuestions(event.id);
}
