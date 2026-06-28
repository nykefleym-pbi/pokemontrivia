import { createFileRoute } from "@tanstack/react-router";
import { pickBattleCurated, recordCuratedServed } from "@/lib/curated-questions";
import { FALLBACK_QUESTIONS } from "@/lib/game-data";

type Difficulty = "easy" | "medium" | "hard" | "expert";

// Pure-curated: a regular battle is sourced entirely from the curated bank
// (no AI generation). The bundled FALLBACK_QUESTIONS are only a defensive
// offline top-up if the curated pool somehow comes up short.
export const Route = createFileRoute("/api/trivia-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let difficulty: Difficulty = "easy";
        let excludeIds: string[] = [];
        try {
          const body = (await request.json()) as {
            difficulty?: string;
            excludeIds?: string[];
          };
          if (body.difficulty && ["easy", "medium", "hard", "expert"].includes(body.difficulty)) {
            difficulty = body.difficulty as Difficulty;
          }
          if (Array.isArray(body.excludeIds)) excludeIds = body.excludeIds.slice(-500);
        } catch {
          /* defaults */
        }

        const TOTAL = 20;

        const curatedResult = await pickBattleCurated({ difficulty, count: TOTAL, excludeIds });

        await recordCuratedServed(curatedResult.servedIds).catch(() => {
          console.warn("Failed to record curated served (non-fatal).");
        });

        let questions = curatedResult.questions;
        if (questions.length < TOTAL) {
          const have = new Set(questions.map((q) => q.question));
          questions = [
            ...questions,
            ...FALLBACK_QUESTIONS.filter((q) => !have.has(q.question)).slice(
              0,
              TOTAL - questions.length,
            ),
          ];
        }

        const shuffled = questions
          .map((q) => ({ q, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ q }) => q);

        return Response.json({
          questions: shuffled,
          source: `curated-${curatedResult.questions.length}`,
          curatedCount: curatedResult.questions.length,
          servedIds: curatedResult.servedIds,
        });
      },
    },
  },
});
