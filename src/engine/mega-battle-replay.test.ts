import { describe, expect, it } from "vitest";
import {
  applyNextMegaAction,
  isValidMegaRaidAction,
  replayMegaLog,
  MegaRaidActionError,
  type StoredMegaRaidAction,
} from "./mega-battle-replay";

describe("isValidMegaRaidAction", () => {
  it("accepts a well-formed answer, including a null (timed-out) choiceIdx", () => {
    expect(isValidMegaRaidAction({ type: "answer", questionIdx: 0, choiceIdx: 2 })).toBe(true);
    expect(isValidMegaRaidAction({ type: "answer", questionIdx: 0, choiceIdx: null })).toBe(true);
  });

  it("rejects an answer missing questionIdx", () => {
    expect(isValidMegaRaidAction({ type: "answer", choiceIdx: 1 })).toBe(false);
  });

  it("accepts use_xattack and forfeit with no other fields", () => {
    expect(isValidMegaRaidAction({ type: "use_xattack" })).toBe(true);
    expect(isValidMegaRaidAction({ type: "forfeit" })).toBe(true);
  });

  it("accepts a well-formed use_potion, rejecting an unknown itemId", () => {
    expect(isValidMegaRaidAction({ type: "use_potion", itemId: "potion" })).toBe(true);
    expect(isValidMegaRaidAction({ type: "use_potion", itemId: "xattack" })).toBe(false);
  });

  it("rejects an unknown action type and non-objects", () => {
    expect(isValidMegaRaidAction({ type: "cheat" })).toBe(false);
    expect(isValidMegaRaidAction(null)).toBe(false);
    expect(isValidMegaRaidAction("forfeit")).toBe(false);
  });
});

describe("replayMegaLog / applyNextMegaAction", () => {
  it("replays a mixed log to the same state applying actions one at a time would produce", () => {
    const log: StoredMegaRaidAction[] = [
      { type: "answer", questionIdx: 0, choiceIdx: 0, correct: true },
      { type: "answer", questionIdx: 1, choiceIdx: 1, correct: false },
      { type: "use_xattack" },
      { type: "answer", questionIdx: 2, choiceIdx: 0, correct: true },
    ];
    const state = replayMegaLog(10, log);
    // correct, wrong, xattack armed, correct-with-xattack (20 dmg instead of 10)
    expect(state.correctCount).toBe(2);
    expect(state.bossHp).toBe(400 - 10 - 20);
    expect(state.playerHp).toBe(100 - 8);
    expect(state.phase).toBe("in_progress");
  });

  it("applyNextMegaAction replays the existing log then applies the new action, returning the extended log", () => {
    const log: StoredMegaRaidAction[] = [{ type: "answer", questionIdx: 0, choiceIdx: 0, correct: true }];
    const next: StoredMegaRaidAction = { type: "answer", questionIdx: 1, choiceIdx: 3, correct: false };
    const result = applyNextMegaAction(10, log, next);
    expect(result.log).toEqual([...log, next]);
    expect(result.state.correctCount).toBe(1);
    expect(result.state.playerHp).toBe(100 - 8);
  });

  it("throws MegaRaidActionError if the run already ended", () => {
    const log: StoredMegaRaidAction[] = Array.from({ length: 13 }, (_, i) => ({
      type: "answer" as const,
      questionIdx: i,
      choiceIdx: 1,
      correct: false,
    }));
    // 13 wrong answers (8 dmg each) deplete player HP to 0 — run already lost.
    expect(replayMegaLog(20, log).phase).toBe("lost");
    const next: StoredMegaRaidAction = { type: "answer", questionIdx: 13, choiceIdx: 0, correct: true };
    expect(() => applyNextMegaAction(20, log, next)).toThrow(MegaRaidActionError);
    expect(() => applyNextMegaAction(20, log, next)).toThrow(/already ended/);
  });
});
