import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia, type TriviaPayload } from "@/lib/trivia-core";
import { fetchCuratedQuestions, recordCuratedServed } from "@/lib/curated-questions";

type Difficulty = "easy" | "medium" | "hard" | "expert";

export const Route = createFileRoute("/api/trivia-elite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let type = "fire";
        let memberName = "the Elite Four";
        let seenHashes: string[] = [];
        let seenSamples: string[] = [];
        let flowSeed = Math.floor(Math.random() * 1_000_000);
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
            seenHashes?: string[];
            seenSamples?: string[];
            flowSeed?: number;
          };
          if (body.type) type = body.type;
          if (body.memberName) memberName = body.memberName;
          if (Array.isArray(body.difficultyTiers)) {
            const valid = body.difficultyTiers.filter((d): d is Difficulty =>
              ["easy", "medium", "hard", "expert"].includes(d)
            );
            if (valid.length > 0) tiers = valid;
          }
          if (typeof body.curatedTarget === "number" && body.curatedTarget >= 0 && body.curatedTarget <= 60) {
            curatedTarget = Math.floor(body.curatedTarget);
          }
          if (typeof body.aiCount === "number" && body.aiCount >= 0 && body.aiCount <= 20) {
            aiNominal = Math.floor(body.aiCount);
          }
          if (Array.isArray(body.seenHashes)) seenHashes = body.seenHashes.slice(-500);
          if (Array.isArray(body.seenSamples)) seenSamples = body.seenSamples.slice(-80);
          if (typeof body.flowSeed === "number") flowSeed = body.flowSeed;
        } catch {
          /* defaults */
        }

        const TOTAL = curatedTarget + aiNominal;
        const aiDifficulty = tiers.join(" or ");

        const themeNote = `THIS IS A BOSS BATTLE vs ${memberName}. Bias HEAVILY toward the ${type.toUpperCase()} type — at least 70% of questions must involve ${type}-type Pokémon, ${type}-type moves, abilities, matchups, lore, characters, or ${type}-themed regions/gyms. The remainder may be general Pokémon trivia. Make it feel like a thematic boss battle.`;

        let curatedQuestions: TriviaPayload[] = [];
        let curatedIds: string[] = [];
        const themed = await fetchCuratedQuestions({
          difficulty: tiers,
          count: curatedTarget,
          typeTheme: type.toLowerCase(),
        });
        curatedQuestions = themed.questions;
        curatedIds = themed.servedIds;

        if (curatedQuestions.length < curatedTarget) {
          const need = curatedTarget - curatedQuestions.length;
          const fill = await fetchCuratedQuestions({
            difficulty: tiers,
            count: need,
            excludeIds: curatedIds,
          });
          curatedQuestions = [...curatedQuestions, ...fill.questions];
          curatedIds = [...curatedIds, ...fill.servedIds];
        }

        const aiCount = Math.max(0, TOTAL - curatedQuestions.length);
        const aiResult = await generateTrivia({
          difficulty: aiDifficulty,
          flowSeed,
          seenHashes,
          seenSamples,
          batchSize: aiCount,
          themeNote,
        });

        await recordCuratedServed(curatedIds).catch(() => {
          console.warn("Failed to record curated served (non-fatal).");
        });

        if (aiResult.status) {
          if (curatedQuestions.length >= 5) {
            const onlyCurated = curatedQuestions
              .map((q) => ({ q, sort: Math.random() }))
              .sort((a, b) => a.sort - b.sort)
              .map(({ q }) => q);
            return Response.json({
              questions: onlyCurated,
              source: `curated-only-${curatedQuestions.length}`,
            });
          }
          return Response.json({ error: aiResult.error, code: aiResult.status }, { status: aiResult.status });
        }

        const merged = [...aiResult.questions, ...curatedQuestions];
        const shuffled = merged
          .map((q) => ({ q, sort: Math.random() }))
          .sort((a, b) => a.sort - b.sort)
          .map(({ q }) => q);

        return Response.json({
          questions: shuffled,
          source:
            curatedQuestions.length > 0
              ? `${aiResult.source}+curated-${curatedQuestions.length}`
              : aiResult.source,
        });
      },
    },
  },
});
