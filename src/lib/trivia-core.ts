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

/**
 * A question the player answered incorrectly, retained for the post-battle
 * review shown on a defeat screen (Solo `ResultScreen` and Nearby/Training
 * `PvpResultScreen`). `correctAnswer` is the option text after per-client
 * shuffle (see `shuffleAllTriviaOptions`), never the raw index.
 */
export interface MissedAnswer {
  question: string;
  correctAnswer: string;
  explanation: string;
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
  return shuffleTriviaOptionsWithOrder(q).q;
}

/**
 * Like `shuffleTriviaOptions`, but also returns the permutation used:
 * `order[displayIndex] === originalIndex`. Needed by Mega Raids, where the
 * client only learns the correct index from the server (in ORIGINAL option
 * order) and must map it into the shuffled display order via
 * `order.indexOf(serverIndex)`. A `correct` of -1 (unknown) stays -1.
 */
export function shuffleTriviaOptionsWithOrder<T extends Trivia>(q: T): { q: T; order: number[] } {
  const order = q.options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return {
    q: {
      ...q,
      options: order.map((i) => q.options[i]),
      correct: q.correct >= 0 ? order.indexOf(q.correct) : q.correct,
    },
    order,
  };
}

/** Shuffles the options of every question in a set (new array, inputs untouched). */
export function shuffleAllTriviaOptions<T extends Trivia>(qs: T[]): T[] {
  return qs.map(shuffleTriviaOptions);
}
