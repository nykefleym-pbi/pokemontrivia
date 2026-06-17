import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia } from "@/lib/trivia-core";
import { pickBattleCurated, recordCuratedServed } from "@/lib/curated-questions";

type Difficulty = "easy" | "medium" | "hard" | "expert";

export const Route = createFileRoute("/api/trivia-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let difficulty: Difficulty = "easy";
        let seenHashes: string[] = [];
        let seenSamples: string[] = [];
        let excludeIds: string[] = [];
        let flowSeed = Math.floor(Math.random() * 1_000_000);
        try {
          const body = (await request.json()) as {
            difficulty?: string;
            seenHashes?: string[];
            seenSamples?: string[];
            excludeIds?: string[];
            flowSeed?: number;
          };
          if (body.difficulty && ["easy", "medium", "hard", "expert"].includes(body.difficulty)) {
            difficulty = body.difficulty as Difficulty;
          }
          if (Array.isArray(body.seenHashes)) seenHashes = body.seenHashes.slice(-500);
          if (Array.isArray(body.seenSamples)) seenSamples = body.seenSamples.slice(-80);
          if (Array.isArray(body.excludeIds)) excludeIds = body.excludeIds.slice(-500);
          if (typeof body.flowSeed === "number") flowSeed = body.flowSeed;
        } catch {
          /* defaults */
        }

        const TOTAL = 20;
        const CURATED_TARGET = 18;

        const curatedResult = await pickBattleCurated({
          difficulty,
          count: CURATED_TARGET,
          excludeIds,
        });

        const aiCount = Math.max(0, TOTAL - curatedResult.questions.length);
        const aiResult = await generateTrivia({
          difficulty,
          flowSeed,
          seenHashes,
          seenSamples,
          batchSize: aiCount,
        });

        await recordCuratedServed(curatedResult.servedIds).catch(() => {
          console.warn("Failed to record curated served (non-fatal).");
        });

        if (aiResult.status) {
          if (curatedResult.questions.length >= 5) {
            const onlyCurated = curatedResult.questions
              .map((q) => ({ q, sort: Math.random() }))
              .sort((a, b) => a.sort - b.sort)
              .map(({ q }) => q);
            return Response.json({
              questions: onlyCurated,
              source: `curated-only-${curatedResult.questions.length}`,
              curatedCount: curatedResult.questions.length,
              servedIds: curatedResult.servedIds,
            });
          }
          return Response.json({ error: aiResult.error, code: aiResult.status }, { status: aiResult.status });
        }

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
