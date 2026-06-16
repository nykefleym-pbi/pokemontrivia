import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia, type TriviaPayload } from "@/lib/trivia-core";
import { curatedSupabase as supabase } from "@/lib/curated-client";

// daily_questions table + insert_daily_if_absent RPC are not in the generated
// Supabase types yet, so use an untyped handle for those two calls.
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

    const seed = dateSeed(date);
    const [easy, medium] = await Promise.all([
      generateTrivia({ difficulty: "easy", flowSeed: seed, seenHashes: [], seenSamples: [], batchSize: 3 }),
      generateTrivia({ difficulty: "medium", flowSeed: seed + 1, seenHashes: [], seenSamples: [], batchSize: 7 }),
    ]);
    const generated = [...easy.questions, ...medium.questions]
      .map((q) => ({ q, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .map(({ q }) => q)
      .slice(0, 10);

    if (generated.length < 5) return generated;

    try {
      await sb.rpc("insert_daily_if_absent", { p_date: date, p_questions: generated });
    } catch {
      /* non-fatal */
    }
    const authoritative = (await readDaily(date)) ?? generated;
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
