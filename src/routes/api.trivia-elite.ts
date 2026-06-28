import { createFileRoute } from "@tanstack/react-router";
import { type TriviaPayload } from "@/lib/trivia-core";
import { fetchCuratedQuestions, recordCuratedServed } from "@/lib/curated-questions";
import { FALLBACK_QUESTIONS } from "@/lib/game-data";

type Difficulty = "easy" | "medium" | "hard" | "expert";

// Pure-curated: Elite Four / Weekly League boss sets are sourced entirely from
// the curated bank — themed by the boss's type first, then topped up from the
// broader pool at the same difficulty tiers. No AI generation. The request's
// `curatedTarget` + `aiCount` still define the total set size for back-compat.
export const Route = createFileRoute("/api/trivia-elite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let type = "fire";
        let tiers: Difficulty[] = ["hard"];
        let curatedTarget = 26;
        let aiNominal = 4;
        try {
          const body = (await request.json()) as {
            type?: string;
            memberName?: string;
            difficultyTiers?: string[];
            curatedTarget?: number;
            aiCount?: number;
          };
          if (body.type) type = body.type;
          if (Array.isArray(body.difficultyTiers)) {
            const valid = body.difficultyTiers.filter((d): d is Difficulty =>
              ["easy", "medium", "hard", "expert"].includes(d),
            );
            if (valid.length > 0) tiers = valid;
          }
          if (
            typeof body.curatedTarget === "number" &&
            body.curatedTarget >= 0 &&
            body.curatedTarget <= 60
          ) {
            curatedTarget = Math.floor(body.curatedTarget);
          }
          if (typeof body.aiCount === "number" && body.aiCount >= 0 && body.aiCount <= 20) {
            aiNominal = Math.floor(body.aiCount);
          }
        } catch {
          /* defaults */
        }

        const TOTAL = curatedTarget + aiNominal;

        let questions: TriviaPayload[] = [];
        let curatedIds: string[] = [];

        // Themed by the boss's type first.
        const themed = await fetchCuratedQuestions({
          difficulty: tiers,
          count: TOTAL,
          typeTheme: type.toLowerCase(),
        });
        questions = themed.questions;
        curatedIds = themed.servedIds;

        // Top up from the broader pool (same tiers) if the theme ran short.
        if (questions.length < TOTAL) {
          const fill = await fetchCuratedQuestions({
            difficulty: tiers,
            count: TOTAL - questions.length,
            excludeIds: curatedIds,
          });
          questions = [...questions, ...fill.questions];
          curatedIds = [...curatedIds, ...fill.servedIds];
        }

        await recordCuratedServed(curatedIds).catch(() => {
          console.warn("Failed to record curated served (non-fatal).");
        });

        // Defensive offline top-up (curated bank is normally deep enough).
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
          source: `curated-${questions.length}`,
        });
      },
    },
  },
});
