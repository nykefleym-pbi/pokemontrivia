import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia } from "@/lib/trivia-core";

export const Route = createFileRoute("/api/trivia-elite")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let type = "fire";
        let memberName = "the Elite Four";
        let seenHashes: string[] = [];
        let seenSamples: string[] = [];
        let flowSeed = Math.floor(Math.random() * 1_000_000);
        try {
          const body = (await request.json()) as {
            type?: string;
            memberName?: string;
            seenHashes?: string[];
            seenSamples?: string[];
            flowSeed?: number;
          };
          if (body.type) type = body.type;
          if (body.memberName) memberName = body.memberName;
          if (Array.isArray(body.seenHashes)) seenHashes = body.seenHashes.slice(-500);
          if (Array.isArray(body.seenSamples)) seenSamples = body.seenSamples.slice(-80);
          if (typeof body.flowSeed === "number") flowSeed = body.flowSeed;
        } catch {
          /* defaults */
        }

        const themeNote = `THIS IS AN ELITE FOUR BATTLE vs ${memberName}. Bias HEAVILY toward the ${type.toUpperCase()} type — at least 70% of questions must involve ${type}-type Pokémon, ${type}-type moves, abilities, matchups, lore, characters, or ${type}-themed regions/gyms. The remainder may be general Pokémon trivia. Make it feel like a thematic boss battle.`;

        const result = await generateTrivia({
          difficulty: "hard",
          flowSeed,
          seenHashes,
          seenSamples,
          batchSize: 12,
          themeNote,
        });
        if (result.status) {
          return Response.json({ error: result.error, code: result.status }, { status: result.status });
        }
        return Response.json({ questions: result.questions, source: result.source });
      },
    },
  },
});
