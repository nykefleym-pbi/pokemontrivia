import { createFileRoute } from "@tanstack/react-router";
import { FALLBACK_QUESTIONS } from "@/lib/game-data";

const CATEGORIES = [
  "General",
  "Games",
  "Anime",
  "Pokédex",
  "Moves & Abilities",
  "Items",
  "Regions",
  "Lore",
  "Competitive",
  "Generations",
];

interface TriviaPayload {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

function pickFallback(): TriviaPayload {
  const f = FALLBACK_QUESTIONS[Math.floor(Math.random() * FALLBACK_QUESTIONS.length)];
  return { ...f };
}

export const Route = createFileRoute("/api/trivia")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let difficulty = "easy";
        let category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
        try {
          const body = (await request.json()) as { difficulty?: string; category?: string };
          if (body.difficulty) difficulty = body.difficulty;
          if (body.category) category = body.category;
        } catch {
          /* use defaults */
        }

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return Response.json({ ...pickFallback(), source: "fallback-no-key" });
        }

        const systemPrompt = `You are a Pokémon trivia question generator. Generate ONE high-quality multiple-choice question that is factually accurate about the Pokémon franchise (games, anime, manga, TCG). The four answer options must all be plausible — only one correct. Keep questions concise and the explanation under 30 words.`;

        const userPrompt = `Generate one ${difficulty} difficulty Pokémon trivia question in the "${category}" category. Return via the submit_trivia tool.`;

        try {
          const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              tools: [
                {
                  type: "function",
                  function: {
                    name: "submit_trivia",
                    description: "Submit a single trivia question.",
                    parameters: {
                      type: "object",
                      properties: {
                        question: { type: "string" },
                        options: {
                          type: "array",
                          items: { type: "string" },
                          minItems: 4,
                          maxItems: 4,
                        },
                        correct: { type: "integer", minimum: 0, maximum: 3 },
                        explanation: { type: "string" },
                        category: { type: "string" },
                      },
                      required: ["question", "options", "correct", "explanation", "category"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "submit_trivia" } },
            }),
          });

          if (resp.status === 429) {
            return Response.json(
              { error: "Rate limit exceeded. Please wait a moment.", code: 429 },
              { status: 429 },
            );
          }
          if (resp.status === 402) {
            return Response.json(
              { error: "AI credits exhausted. Add credits in Settings.", code: 402 },
              { status: 402 },
            );
          }
          if (!resp.ok) {
            console.error("AI gateway error", resp.status, await resp.text());
            return Response.json({ ...pickFallback(), source: "fallback-error" });
          }

          const data = await resp.json();
          const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall?.function?.arguments) {
            return Response.json({ ...pickFallback(), source: "fallback-no-tool" });
          }
          const parsed = JSON.parse(toolCall.function.arguments) as TriviaPayload;

          // basic validation
          if (
            !parsed.question ||
            !Array.isArray(parsed.options) ||
            parsed.options.length !== 4 ||
            typeof parsed.correct !== "number" ||
            parsed.correct < 0 ||
            parsed.correct > 3
          ) {
            return Response.json({ ...pickFallback(), source: "fallback-invalid" });
          }

          return Response.json({ ...parsed, source: "ai" });
        } catch (e) {
          console.error("trivia error", e);
          return Response.json({ ...pickFallback(), source: "fallback-exception" });
        }
      },
    },
  },
});
