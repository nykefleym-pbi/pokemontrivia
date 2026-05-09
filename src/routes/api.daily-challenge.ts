import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia, type TriviaPayload } from "@/lib/trivia-core";

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

async function getDaily(date: string): Promise<TriviaPayload[]> {
  const cached = cache.get(date);
  if (cached) return cached;
  const pending = inflight.get(date);
  if (pending) return pending;

  const p = (async () => {
    const seed = dateSeed(date);
    const result = await generateTrivia({
      difficulty: "hard",
      flowSeed: seed,
      seenHashes: [],
      seenSamples: [],
    });
    const sliced = result.questions.slice(0, 10);
    if (sliced.length > 0) cache.set(date, sliced);
    return sliced;
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
