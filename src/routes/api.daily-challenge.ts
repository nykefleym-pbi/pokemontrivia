import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia, type TriviaPayload } from "@/lib/trivia-core";
import { curatedSupabase as supabase } from "@/lib/curated-client";
import { recordCuratedServed } from "@/lib/curated-questions";

// daily_questions table + RPCs are not in the generated Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function todayUTC(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateSeed(date: string): number {
  return parseInt(date.replace(/-/g, ""), 10);
}

interface CuratedRow {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  category: string;
}

const cache = new Map<string, TriviaPayload[]>();
const inflight = new Map<string, Promise<TriviaPayload[]>>();

async function readDaily(date: string): Promise<TriviaPayload[] | null> {
  try {
    const { data, error } = await sb
      .from("daily_questions")
      .select("questions")
      .eq("date", date)
      .maybeSingle();
    if (error || !data) return null;
    return (data.questions as TriviaPayload[]) ?? null;
  } catch {
    return null;
  }
}

async function getDaily(date: string): Promise<TriviaPayload[]> {
  const cached = cache.get(date);
  if (cached) return cached;
  const pending = inflight.get(date);
  if (pending) return pending;

  const p = (async () => {
    const existing = await readDaily(date);
    if (existing && existing.length > 0) {
      cache.set(date, existing);
      return existing;
    }

    // Pull today's 10 from the curated bank, excluding questions used in the
    // last 50 daily sets (no repeat until ~500 unique dailies have passed).
    let curated: CuratedRow[] = [];
    try {
      const { data, error } = await sb.rpc("pick_daily_curated", {
        p_easy: 3,
        p_medium: 7,
        p_window: 50,
      });
      if (!error && Array.isArray(data)) curated = data as CuratedRow[];
    } catch {
      /* fall through to fallback top-up */
    }

    const servedIds = curated.map((r) => r.id);
    let questions: TriviaPayload[] = curated.map((r) => ({
      question: r.question,
      options: r.options,
      correct: r.correct_index,
      explanation: r.explanation,
      category: r.category,
    }));

    // Top up from AI / bundled fallback only if curated came up short.
    if (questions.length < 10) {
      const need = 10 - questions.length;
      const top = await generateTrivia({
        difficulty: "easy",
        flowSeed: dateSeed(date),
        seenHashes: [],
        seenSamples: questions.map((q) => q.question),
        batchSize: need,
      });
      questions = [...questions, ...top.questions];
    }

    // Shuffle so easy/medium aren't grouped; cap at 10.
    questions = questions
      .map((q) => ({ q, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ q }) => q)
      .slice(0, 10);

    if (questions.length < 5) return questions;

    try {
      await sb.rpc("insert_daily_if_absent", {
        p_date: date,
        p_questions: questions,
        p_served_ids: servedIds,
      });
    } catch {
      /* non-fatal */
    }
    await recordCuratedServed(servedIds).catch(() => {});

    const authoritative = (await readDaily(date)) ?? questions;
    cache.set(date, authoritative);
    return authoritative;
  })();
  inflight.set(date, p);
  try {
    return await p;
  } finally {
    inflight.delete(date);
  }
}

export const Route = createFileRoute("/api/daily-challenge")({
  server: {
    handlers: {
      GET: async () => {
        const date = todayUTC();
        const questions = await getDaily(date);
        return Response.json({ date, questions });
      },
    },
  },
});
