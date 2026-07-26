import { postJson, getJson } from "./client";
import type { Trivia } from "@/lib/trivia-core";

export interface BattleQuestionsParams {
  difficulties: string[];
  seenHashes: string[];
  seenSamples: string[];
  excludeIds: string[];
  flowSeed: number;
}
export function fetchBattleQuestions(p: BattleQuestionsParams) {
  return postJson<{ questions: Trivia[]; servedIds?: string[] }>("/api/trivia-batch", p);
}

export interface EliteQuestionsParams {
  type: string;
  memberName: string;
  difficultyTiers: string[];
  curatedTarget: number;
  aiCount: number;
  seenHashes: string[];
  seenSamples: string[];
  flowSeed: number;
}
export function fetchEliteQuestions(p: EliteQuestionsParams) {
  return postJson<{ questions: Trivia[] }>("/api/trivia-elite", p);
}

export function fetchDailyChallenge() {
  return getJson<{ questions: Trivia[] }>("/api/daily-challenge");
}

export function triggerMegaQuestionGeneration(eventId: string) {
  return postJson<unknown>("/api/mega-questions", { eventId });
}
