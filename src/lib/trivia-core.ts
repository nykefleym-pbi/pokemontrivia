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
