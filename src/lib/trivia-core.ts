// Shared trivia question shapes.
//
// AI question generation has been removed — every mode now serves curated
// questions (see src/routes/api.*.ts + src/lib/curated-questions.ts), with the
// bundled FALLBACK_QUESTIONS as the offline last resort. This module is now
// just the shared types.

export interface Trivia {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

export interface TriviaPayload {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

/**
 * Returns a copy of the question with its answer options in random order and
 * `correct` remapped to follow. Applied client-side at display time in every
 * mode so repeat questions can't be answered from memorized option positions.
 * Safe for PvP/Mega: clients submit correctness (or scores), never the raw
 * option index.
 */
export function shuffleTriviaOptions<T extends Trivia>(q: T): T {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    ...q,
    options: order.map((i) => q.options[i]),
    correct: order.indexOf(q.correct),
  };
}

/** Shuffles the options of every question in a set (new array, inputs untouched). */
export function shuffleAllTriviaOptions<T extends Trivia>(qs: T[]): T[] {
  return qs.map(shuffleTriviaOptions);
}
