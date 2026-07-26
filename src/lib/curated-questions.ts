import { curatedSupabase as supabase } from "./curated-client";
import type { TriviaPayload } from "./trivia-core";
import type { CuratedDifficulty } from "./game-data";

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
    const { data, error } = await supabase.rpc("get_curated_questions", {
      p_difficulties: Array.isArray(difficulty) ? difficulty : [difficulty],
      p_count: count,
      p_type_theme: typeTheme ?? null,
      p_exclude: excludeIds,
    });
    if (error || !Array.isArray(data)) {
      console.warn("get_curated_questions failed:", error?.message);
      return { questions: [], servedIds: [] };
    }
    const rows = data as unknown as CuratedRow[];
    return {
      questions: rows.map((r) => ({
        question: r.question,
        options: r.options,
        correct: r.correct_index,
        explanation: r.explanation,
        category: r.category,
      })),
      servedIds: rows.map((r) => r.id),
    };
  } catch (e) {
    console.warn("Curated question fetch failed:", e);
    return { questions: [], servedIds: [] };
  }
}

/**
 * Battle question picker. Unlike `fetchCuratedQuestions`, the RPC behind this
 * treats `excludeIds` as a preference (`order by seen asc`) rather than a
 * filter, so a drained pool degrades into repeats instead of coming up short
 * and falling through to the 30 bundled fallback questions.
 */
export async function pickBattleCurated(opts: {
  difficulties: CuratedDifficulty[];
  count: number;
  excludeIds?: string[];
}): Promise<{ questions: TriviaPayload[]; servedIds: string[] }> {
  const { difficulties, count, excludeIds = [] } = opts;
  if (count <= 0 || difficulties.length === 0) return { questions: [], servedIds: [] };
  try {
    const { data, error } = await supabase.rpc("pick_battle_curated", {
      p_difficulties: difficulties,
      p_count: count,
      p_exclude: excludeIds,
    });
    if (error || !Array.isArray(data)) {
      console.warn("pick_battle_curated failed:", error?.message);
      return { questions: [], servedIds: [] };
    }
    const rows = data as unknown as CuratedRow[];
    return {
      questions: rows.map((r) => ({
        question: r.question,
        options: r.options,
        correct: r.correct_index,
        explanation: r.explanation,
        category: r.category,
      })),
      servedIds: rows.map((r) => r.id),
    };
  } catch (e) {
    console.warn("pick_battle_curated failed:", e);
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
