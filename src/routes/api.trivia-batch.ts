import { createFileRoute } from "@tanstack/react-router";
import { FALLBACK_QUESTIONS } from "@/lib/game-data";

interface TriviaPayload {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

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

const BATCH_SIZE = 20;

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((w) => w.length > 2));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function dedupe(items: TriviaPayload[]): TriviaPayload[] {
  const out: TriviaPayload[] = [];
  const tokSets: Set<string>[] = [];
  for (const q of items) {
    const t = tokens(q.question);
    let dup = false;
    for (const existing of tokSets) {
      if (jaccard(t, existing) > 0.6) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      out.push(q);
      tokSets.push(t);
    }
  }
  return out;
}

function isValid(q: unknown): q is TriviaPayload {
  if (!q || typeof q !== "object") return false;
  const o = q as Record<string, unknown>;
  return (
    typeof o.question === "string" &&
    Array.isArray(o.options) &&
    o.options.length === 4 &&
    o.options.every((x) => typeof x === "string") &&
    typeof o.correct === "number" &&
    o.correct >= 0 &&
    o.correct <= 3 &&
    typeof o.explanation === "string" &&
    typeof o.category === "string"
  );
}

function topUpFromFallback(existing: TriviaPayload[], target: number): TriviaPayload[] {
  const tokSets = existing.map((q) => tokens(q.question));
  const out = [...existing];
  const shuffled = [...FALLBACK_QUESTIONS].sort(() => Math.random() - 0.5);
  for (const f of shuffled) {
    if (out.length >= target) break;
    const t = tokens(f.question);
    let dup = false;
    for (const ex of tokSets) {
      if (jaccard(t, ex) > 0.6) {
        dup = true;
        break;
      }
    }
    if (!dup) {
      out.push({ ...f });
      tokSets.push(t);
    }
  }
  return out;
}

export const Route = createFileRoute("/api/trivia-batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let difficulty = "easy";
        let seenHashes: string[] = [];
        let seenSamples: string[] = [];
        try {
          const body = (await request.json()) as {
            difficulty?: string;
            seenHashes?: string[];
            seenSamples?: string[];
          };
          if (body.difficulty) difficulty = body.difficulty;
          if (Array.isArray(body.seenHashes)) seenHashes = body.seenHashes.slice(-2000);
          if (Array.isArray(body.seenSamples)) seenSamples = body.seenSamples.slice(-40);
        } catch {
          /* defaults */
        }

        const seenHashSet = new Set(seenHashes);
        const seenTokenSets = seenSamples.map((s) => tokens(s));

        const fnv1a = (str: string) => {
          const norm = str
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          let h = 0x811c9dc5;
          for (let i = 0; i < norm.length; i++) {
            h ^= norm.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
          }
          return h.toString(16);
        };

        const isSeen = (q: string) => {
          if (seenHashSet.has(fnv1a(q))) return true;
          const t = tokens(q);
          for (const ex of seenTokenSets) {
            if (jaccard(t, ex) > 0.6) return true;
          }
          return false;
        };

        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          const fallback = topUpFromFallback([], BATCH_SIZE, isSeen);
          return Response.json({ questions: fallback, source: "fallback-no-key" });
        }

        const avoidBlock = seenSamples.length
          ? `\n\nAVOID these recent questions and any paraphrase of them (different wording but same answer/topic counts as a repeat):\n${seenSamples.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
          : "";

        const systemPrompt = `You are a Pokémon trivia question generator. Generate exactly ${BATCH_SIZE} factually accurate multiple-choice questions about the Pokémon franchise (games, anime, manga, TCG, competitive).

KNOWLEDGE SOURCES — only use facts verifiable on these canonical sources:
- pokemondb.net (Pokédex, moves, abilities, items, locations)
- bulbapedia.bulbagarden.net (lore, anime, characters, history, regions, generations)
- pvpoke.com (competitive PvP movesets, tiers, meta)

CRITICAL RULES:
- All ${BATCH_SIZE} questions MUST be DISTINCT — different topics, no paraphrases, no overlapping correct answers, no repeated subjects.
- Spread across these categories: ${CATEGORIES.join(", ")} (each category at least once when possible).
- Spread across generations 1-9, multiple regions, mechanics, anime arcs, TCG, and competitive (PvP tiers, movesets) for maximum variety.
- Each question must have 4 plausible options with exactly one correct answer.
- Keep questions concise. Keep each explanation under 30 words.
- Difficulty for the whole set: ${difficulty}.${avoidBlock}`;

        const userPrompt = `Generate ${BATCH_SIZE} unique ${difficulty} difficulty Pokémon trivia questions grounded in pokemondb.net, bulbapedia.bulbagarden.net, and pvpoke.com. Return them via the submit_trivia_batch tool.`;

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
                    name: "submit_trivia_batch",
                    description: `Submit a batch of ${BATCH_SIZE} unique trivia questions.`,
                    parameters: {
                      type: "object",
                      properties: {
                        questions: {
                          type: "array",
                          minItems: BATCH_SIZE,
                          maxItems: BATCH_SIZE,
                          items: {
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
                      required: ["questions"],
                      additionalProperties: false,
                    },
                  },
                },
              ],
              tool_choice: { type: "function", function: { name: "submit_trivia_batch" } },
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
            const fallback = topUpFromFallback([], BATCH_SIZE);
            return Response.json({ questions: fallback, source: "fallback-error" });
          }

          const data = await resp.json();
          const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall?.function?.arguments) {
            const fallback = topUpFromFallback([], BATCH_SIZE);
            return Response.json({ questions: fallback, source: "fallback-no-tool" });
          }

          let parsed: { questions?: unknown[] };
          try {
            parsed = JSON.parse(toolCall.function.arguments);
          } catch {
            const fallback = topUpFromFallback([], BATCH_SIZE);
            return Response.json({ questions: fallback, source: "fallback-parse" });
          }

          const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
          const valid = raw.filter(isValid);
          const unique = dedupe(valid);
          const finalList = unique.length >= BATCH_SIZE ? unique.slice(0, BATCH_SIZE) : topUpFromFallback(unique, BATCH_SIZE);

          return Response.json({ questions: finalList, source: "ai" });
        } catch (e) {
          console.error("trivia-batch error", e);
          const fallback = topUpFromFallback([], BATCH_SIZE);
          return Response.json({ questions: fallback, source: "fallback-exception" });
        }
      },
    },
  },
});
