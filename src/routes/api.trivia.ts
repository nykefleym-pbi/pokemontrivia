import { createFileRoute } from "@tanstack/react-router";
import { FALLBACK_QUESTIONS } from "@/lib/game-data";

// Legacy single-question endpoint. AI generation has been removed — every mode
// now serves curated questions (see the other api.*.ts routes), so this route
// just returns a question from the bundled offline bank. The route stays
// registered to avoid churning routeTree.gen.ts.
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
      POST: async () => Response.json({ ...pickFallback(), source: "fallback" }),
    },
  },
});
