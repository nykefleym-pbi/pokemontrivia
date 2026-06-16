import { curatedSupabase as supabase } from "./curated-client";
import type { TriviaPayload } from "./trivia-core";

interface CuratedRow {
  id: string;
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
  category: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  type_theme: string | null;
}

type CuratedDifficulty = "easy" | "medium" | "hard" | "expert";

interface FetchCuratedOpts {
  difficulty: CuratedDifficulty | CuratedDifficulty[];
  count: number;
  typeTheme?: string;
  excludeIds?: string[];
}

/**
 * Fetches N random curated verified questions from Supabase.
 * Returns at most `count` questions. Falls back to empty array on any error.
 */
export async function fetchCuratedQuestions(opts: FetchCuratedOpts): Promise<{
  questions: TriviaPayload[];
  servedIds: string[];
}> {
  const { difficulty, count, typeTheme, excludeIds = [] } = opts;
  if (count <= 0) return { questions: [], servedIds: [] };

  try {
    let query = supabase
      .from("curated_questions")
      .select("id, question, options, correct_index, explanation, category, difficulty, type_theme")
      .eq("verified", true);

    query = Array.isArray(difficulty)
      ? query.in("difficulty", difficulty)
      : query.eq("difficulty", difficulty);



    if (typeTheme) {
      query = query.eq("type_theme", typeTheme);
    }
    if (excludeIds.length > 0) {
      query = query.not("id", "in", `(${excludeIds.join(",")})`);
    }

    const { data, error } = await query.limit(count * 5);
    if (error) {
      console.warn("Curated question fetch failed:", error.message);
      return { questions: [], servedIds: [] };
    }
    if (!data || data.length === 0) {
      return { questions: [], servedIds: [] };
    }

    const rows = data as unknown as CuratedRow[];
    const shuffled = rows
      .map((r) => ({ r, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, count)
      .map(({ r }) => r);

    return {
      questions: shuffled.map((r) => ({
        question: r.question,
        options: r.options,
        correct: r.correct_index,
        explanation: r.explanation,
        category: r.category,
      })),
      servedIds: shuffled.map((r) => r.id),
    };
  } catch (e) {
    console.warn("Curated question fetch failed:", e);
    return { questions: [], servedIds: [] };
  }
}

export async function recordCuratedServed(ids: string[]) {
  if (ids.length === 0) return;
  try {
    const { error } = await supabase.rpc("increment_curated_served", { question_ids: ids });
    if (error) console.warn("Failed to record curated served:", error.message);
  } catch (e) {
    console.warn("Failed to record curated served:", e);
  }
}

export async function recordCuratedAnswer(id: string, correct: boolean) {
  if (!correct) return;
  try {
    const { error } = await supabase.rpc("increment_curated_correct", { question_id: id });
    if (error) console.warn("Failed to record curated correct:", error.message);
  } catch (e) {
    console.warn("Failed to record curated correct:", e);
  }
}
