import { FALLBACK_QUESTIONS } from "./game-data";

export interface TriviaPayload {
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

export function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function tokens(s: string): Set<string> {
  return new Set(
    normalize(s)
      .split(" ")
      .filter((w) => w.length > 2),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
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

function topUpFromFallback(
  existing: TriviaPayload[],
  target: number,
  isSeen?: (q: string) => boolean,
): TriviaPayload[] {
  const tokSets = existing.map((q) => tokens(q.question));
  const out = [...existing];
  const shuffled = [...FALLBACK_QUESTIONS].sort(() => Math.random() - 0.5);
  for (const f of shuffled) {
    if (out.length >= target) break;
    if (isSeen && isSeen(f.question)) continue;
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

export interface GenerateOpts {
  difficulty: string;
  flowSeed: number;
  seenHashes: string[];
  seenSamples: string[];
  batchSize?: number;
  themeNote?: string;
}

export interface GenerateResult {
  questions: TriviaPayload[];
  source: string;
  status?: number;
  error?: string;
}

const fnv1a = (str: string) => {
  const norm = normalize(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
};

export async function generateTrivia(opts: GenerateOpts): Promise<GenerateResult> {
  const BATCH = opts.batchSize ?? 20;
  const seenHashSet = new Set(opts.seenHashes);
  const seenTokenSets = opts.seenSamples.map((s) => tokens(s));
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
    return { questions: topUpFromFallback([], BATCH, isSeen), source: "fallback-no-key" };
  }

  const themeBlock = opts.themeNote ? `\n\nTHEME OVERRIDE: ${opts.themeNote}` : "";
  const recentAvoid = opts.seenSamples.slice(-30);
  const avoidBlock = recentAvoid.length
    ? `\n\nAVOID these recent questions and any paraphrase of them (different wording but same answer/topic counts as a repeat):\n${recentAvoid.map((s, i) => `${i + 1}. ${s}`).join("\n")}`
    : "";

  const systemPrompt = `You are a Pokémon trivia question generator. Generate exactly ${BATCH} factually accurate multiple-choice questions about the Pokémon franchise (games, anime, manga, TCG, competitive).

KNOWLEDGE SOURCES — only use facts verifiable on these canonical sources:
- pokemondb.net (Pokédex, moves, abilities, items, locations)
- bulbapedia.bulbagarden.net (lore, anime, characters, history, regions, generations)
- pvpoke.com (competitive PvP movesets, tiers, meta)

QUESTION TYPES — distribute across these formats. NO single format may exceed ~30% of the batch:
1. DIRECT — "What type is X?", "Who evolves into X?"
2. ELIMINATION — "Which of these is NOT a Fire-type?"
3. COMPARISON — "Which Pokémon has the highest base Speed?"
4. MATCHUP — "Pikachu uses Thunderbolt against Geodude. The damage is..."
5. TRIVIA — "In the anime, who gave Ash his Charmander?"
6. PVP — "In Great League PvP, what is Lanturn's optimal fast move?" (ground in pvpoke.com Great/Ultra/Master meta)
7. CHRONOLOGY — "Which generation introduced Fairy type?"

For ELIMINATION questions, wrong-answer traps should be subtle, not obviously absurd.

CRITICAL RULES:
- All ${BATCH} questions MUST be DISTINCT — different topics, no paraphrases, no overlapping correct answers, no repeated subjects.
- Spread across these categories: ${CATEGORIES.join(", ")} (each category at least once when possible).
- Spread across generations 1-9, multiple regions, mechanics, anime arcs, TCG, and competitive (PvP tiers, movesets) for maximum variety.
- Each question must have 4 plausible options with exactly one correct answer.
- Keep questions concise. Keep each explanation under 30 words.
- Difficulty for the whole set: ${opts.difficulty}.
- Variation seed: ${opts.flowSeed}. Use this seed to vary category order, phrasing, and topic emphasis so this batch does NOT mirror prior batches even if some topics recur.${themeBlock}${avoidBlock}`;

  const userPrompt = `Generate ${BATCH} unique ${opts.difficulty} difficulty Pokémon trivia questions grounded in pokemondb.net, bulbapedia.bulbagarden.net, and pvpoke.com. Return them via the submit_trivia_batch tool.`;

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
              description: `Submit a batch of ${BATCH} unique trivia questions.`,
              parameters: {
                type: "object",
                properties: {
                  questions: {
                    type: "array",
                    minItems: BATCH,
                    maxItems: BATCH,
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
      return {
        questions: [],
        source: "rate-limited",
        status: 429,
        error: "Rate limit exceeded. Please wait a moment.",
      };
    }
    if (resp.status === 402) {
      return {
        questions: [],
        source: "no-credits",
        status: 402,
        error: "AI credits exhausted. Add credits in Settings.",
      };
    }
    if (!resp.ok) {
      console.error("AI gateway error", resp.status, await resp.text());
      return { questions: topUpFromFallback([], BATCH, isSeen), source: "fallback-error" };
    }

    const data = await resp.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return { questions: topUpFromFallback([], BATCH, isSeen), source: "fallback-no-tool" };
    }

    let parsed: { questions?: unknown[] };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return { questions: topUpFromFallback([], BATCH, isSeen), source: "fallback-parse" };
    }

    const raw = Array.isArray(parsed.questions) ? parsed.questions : [];
    const valid = raw.filter(isValid);
    const deduped = dedupe(valid);
    const unseen = deduped.filter((q) => !isSeen(q.question));

    // Always backfill to BATCH so the client gets a full deck.
    let finalList = unseen.slice(0, BATCH);
    if (finalList.length < BATCH) {
      finalList = topUpFromFallback(finalList, BATCH, isSeen);
    }
    if (finalList.length < BATCH) {
      // Last resort: allow seen fallbacks. A repeat is better than no battle.
      finalList = topUpFromFallback(finalList, BATCH);
    }

    return { questions: finalList, source: finalList.length === BATCH ? "ai" : "ai-partial" };
  } catch (e) {
    console.error("trivia-core error", e);
    return { questions: topUpFromFallback([], BATCH, isSeen), source: "fallback-exception" };
  }
}
