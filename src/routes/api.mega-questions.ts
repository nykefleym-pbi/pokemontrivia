import { createFileRoute } from "@tanstack/react-router";
import { type TriviaPayload } from "@/lib/trivia-core";
import { pickBattleCurated, recordCuratedServed } from "@/lib/curated-questions";
import { FALLBACK_QUESTIONS } from "@/lib/game-data";
const MEGA_TOTAL = 50;
// difficulty curve for a Mega Raid's frozen 50-question set
const TIERS: ReadonlyArray<readonly ["easy" | "medium" | "hard" | "expert", number]> = [
  ["easy", 15],
  ["medium", 22],
  ["hard", 13],
];

const inflight = new Map<string, Promise<TriviaPayload[]>>();

async function readQuestions(eventId: string): Promise<TriviaPayload[] | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    const { data, error } = await sb
      .from("mega_event_questions")
      .select("questions")
      .eq("event_id", eventId)
      .maybeSingle();
    if (error || !data) return null;
    return (data.questions as TriviaPayload[]) ?? null;
  } catch {
    return null;
  }
}

async function buildQuestions(eventId: string): Promise<TriviaPayload[]> {
  const existing = await readQuestions(eventId);
  if (existing && existing.length > 0) return existing;

  // Pull a varied curated set across difficulties (pure curated — no AI).
  let pool: TriviaPayload[] = [];
  const served: string[] = [];
  for (const [difficulty, count] of TIERS) {
    try {
      const r = await pickBattleCurated({ difficulty, count, excludeIds: served });
      pool = pool.concat(r.questions);
      served.push(...r.servedIds);
    } catch {
      /* fall through */
    }
  }

  // Defensive offline top-up (curated bank is normally deep enough for 50).
  if (pool.length < MEGA_TOTAL) {
    const have = new Set(pool.map((q) => q.question));
    pool = pool.concat(
      FALLBACK_QUESTIONS.filter((q) => !have.has(q.question)).slice(0, MEGA_TOTAL - pool.length),
    );
  }

  // De-dupe by question text, shuffle, cap at 50.
  const seen = new Set<string>();
  pool = pool.filter((q) => {
    const k = q.question.trim().toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  pool = pool
    .map((q) => ({ q, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ q }) => q)
    .slice(0, MEGA_TOTAL);

  if (pool.length < 20) return pool; // too few — don't persist a thin set

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).rpc("insert_mega_questions_if_absent", {
      p_event_id: eventId,
      p_questions: pool,
    });
  } catch {
    /* non-fatal — return what we have */
  }
  await recordCuratedServed(served).catch(() => {});

  return (await readQuestions(eventId)) ?? pool;
}

async function getQuestions(eventId: string): Promise<TriviaPayload[]> {
  const pending = inflight.get(eventId);
  if (pending) return pending;
  const p = buildQuestions(eventId).finally(() => inflight.delete(eventId));
  inflight.set(eventId, p);
  return p;
}

export const Route = createFileRoute("/api/mega-questions")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let eventId = "";
        try {
          const body = (await request.json()) as { eventId?: string };
          eventId = (body.eventId ?? "").trim();
        } catch {
          /* no body */
        }
        if (!eventId) return Response.json({ error: "Missing eventId" }, { status: 400 });
        const questions = await getQuestions(eventId);
        return Response.json({ eventId, questions });
      },
    },
  },
});
