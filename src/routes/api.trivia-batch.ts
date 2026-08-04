import { createFileRoute } from "@tanstack/react-router";
import { pickBattleCurated, recordCuratedServed } from "@/lib/curated-questions";
import {
  FALLBACK_QUESTIONS,
  normalizeDifficultyBand,
  type CuratedDifficulty,
} from "@/lib/game-data";

// Pure-curated: a regular battle is sourced entirely from the curated bank
// (no AI generation). The bundled FALLBACK_QUESTIONS are only a defensive
// offline top-up if the curated pool somehow comes up short.
export const Route = createFileRoute("/api/trivia-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // `difficulties` is the current shape; `difficulty` is what a cached
        // PWA shell from an older deploy still sends. Both go through the same
        // normaliser so a stale client can't fall off the band it asked for.
        let difficulties: CuratedDifficulty[] = ["easy"];
        let excludeIds: string[] = [];
        try {
          const body = (await request.json()) as {
            difficulties?: unknown;
            difficulty?: unknown;
            excludeIds?: string[];
          };
          difficulties =
            normalizeDifficultyBand(body.difficulties ?? body.difficulty) ?? difficulties;
          if (Array.isArray(body.excludeIds)) excludeIds = body.excludeIds.slice(-2000);
        } catch {
          /* defaults */
        }

        const TOTAL = 20;

        const curatedResult = await pickBattleCurated({ difficulties, count: TOTAL, excludeIds });

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
