import { createFileRoute } from "@tanstack/react-router";
import { generateTrivia } from "@/lib/trivia-core";

export const Route = createFileRoute("/api/trivia-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let difficulty = "easy";
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
          if (body.difficulty) difficulty = body.difficulty;
          if (Array.isArray(body.seenHashes)) seenHashes = body.seenHashes.slice(-500);
          if (Array.isArray(body.seenSamples)) seenSamples = body.seenSamples.slice(-80);
          if (typeof body.flowSeed === "number") flowSeed = body.flowSeed;
        } catch {
          /* defaults */
        }

        const result = await generateTrivia({ difficulty, flowSeed, seenHashes, seenSamples });
        if (result.status) {
          return Response.json({ error: result.error, code: result.status }, { status: result.status });
        }
        return Response.json({ questions: result.questions, source: result.source });
      },
    },
  },
});
