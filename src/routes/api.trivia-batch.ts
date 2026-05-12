import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia } from "@/lib/trivia-core";
import { fetchCuratedQuestions, recordCuratedServed } from "@/lib/curated-questions";

type Difficulty = "easy" | "medium" | "hard" | "expert";

export const Route = createFileRoute("/api/trivia-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let difficulty: Difficulty = "easy";
        let seenHashes: string[] = [];
        let seenSamples: string[] = [];
        let flowSeed = Math.floor(Math.random() * 1_000_000);
        try {
          const body = (await request.json()) as {
            difficulty?: string;
            seenHashes?: string[];
            seenSamples?: string[];
            flowSeed?: number;
          };
          if (body.difficulty && ["easy", "medium", "hard", "expert"].includes(body.difficulty)) {
            difficulty = body.difficulty as Difficulty;
          }
          if (Array.isArray(body.seenHashes)) seenHashes = body.seenHashes.slice(-500);
          if (Array.isArray(body.seenSamples)) seenSamples = body.seenSamples.slice(-80);
          if (typeof body.flowSeed === "number") flowSeed = body.flowSeed;
        } catch {
          /* defaults */
        }

        const CURATED_COUNT = 2;
        const AI_COUNT = 18;

        const [curatedResult, aiResult] = await Promise.all([
          fetchCuratedQuestions({ difficulty, count: CURATED_COUNT }),
          generateTrivia({ difficulty, flowSeed, seenHashes, seenSamples, batchSize: AI_COUNT }),
        ]);

        if (aiResult.status) {
          return Response.json({ error: aiResult.error, code: aiResult.status }, { status: aiResult.status });
        }

        recordCuratedServed(curatedResult.servedIds).catch(() => {});

        const merged = [...aiResult.questions, ...curatedResult.questions];
        const shuffled = merged
          .map((q) => ({ q, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ q }) => q);

        return Response.json({
          questions: shuffled,
          source:
            curatedResult.questions.length > 0
              ? `${aiResult.source}+curated-${curatedResult.questions.length}`
              : aiResult.source,
          curatedCount: curatedResult.questions.length,
        });
      },
    },
  },
});
