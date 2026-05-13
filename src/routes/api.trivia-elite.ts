import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia } from "@/lib/trivia-core";
import { fetchCuratedQuestions, recordCuratedServed } from "@/lib/curated-questions";

export const Route = createFileRoute("/api/trivia-elite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let type = "fire";
        let memberName = "the Elite Four";
        let seenHashes: string[] = [];
        let seenSamples: string[] = [];
        let flowSeed = Math.floor(Math.random() * 1_000_000);
        let requestedCount = 12;
        try {
          const body = (await request.json()) as {
            type?: string;
            memberName?: string;
            count?: number;
            seenHashes?: string[];
            seenSamples?: string[];
            flowSeed?: number;
          };
          if (body.type) type = body.type;
          if (body.memberName) memberName = body.memberName;
          if (typeof body.count === "number" && body.count >= 5 && body.count <= 25) {
            requestedCount = Math.floor(body.count);
          }
          if (Array.isArray(body.seenHashes)) seenHashes = body.seenHashes.slice(-500);
          if (Array.isArray(body.seenSamples)) seenSamples = body.seenSamples.slice(-80);
          if (typeof body.flowSeed === "number") flowSeed = body.flowSeed;
        } catch {
          /* defaults */
        }

        const themeNote = `THIS IS AN ELITE FOUR BATTLE vs ${memberName}. Bias HEAVILY toward the ${type.toUpperCase()} type — at least 70% of questions must involve ${type}-type Pokémon, ${type}-type moves, abilities, matchups, lore, characters, or ${type}-themed regions/gyms. The remainder may be general Pokémon trivia. Make it feel like a thematic boss battle.`;

        const CURATED_COUNT = Math.min(2, Math.max(1, Math.floor(requestedCount * 0.1)));
        const AI_COUNT = requestedCount - CURATED_COUNT;

        const [curatedResult, aiResult] = await Promise.all([
          fetchCuratedQuestions({
            difficulty: "hard",
            count: CURATED_COUNT,
            typeTheme: type.toLowerCase(),
          }),
          generateTrivia({
            difficulty: "hard",
            flowSeed,
            seenHashes,
            seenSamples,
            batchSize: AI_COUNT,
            themeNote,
          }),
        ]);

        if (aiResult.status) {
          return Response.json({ error: aiResult.error, code: aiResult.status }, { status: aiResult.status });
        }

        await recordCuratedServed(curatedResult.servedIds).catch(() => {
          console.warn("Failed to record curated served (non-fatal).");
        });

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
        });
      },
    },
  },
});
