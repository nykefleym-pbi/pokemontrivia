import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SoloBattleCfg } from "@/engine";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { startSoloBattle, getSoloBattle, submitBattleAction } from "./battle-solo";

const CFG: SoloBattleCfg = {
  questions: [{ question: "Q?", options: ["A", "B"], correct: 0, explanation: "e", category: "c" }],
  playerPokemonId: 1,
  playerTypes: ["grass"],
  abilityId: null,
  level: 5,
  mode: "battle",
  enemyPokemonId: 4,
  enemyTypes: ["fire"],
  trainingPoints: 0,
  items: {
    assaultVestActive: false,
    kingsRockActive: false,
    leftoversActive: false,
    metronomeActive: false,
    silkScarfAvailable: false,
    focusBandAvailable: false,
    reviveAvailable: false,
    oranBerryAvailable: false,
  },
};

beforeEach(() => {
  invoke.mockReset();
});

describe("startSoloBattle", () => {
  it("calls battle-solo with op:start and returns the envelope's data", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, data: { battleId: "b1", seed: "s1" } },
      error: null,
    });
    const result = await startSoloBattle(CFG);
    expect(result).toEqual({ battleId: "b1", seed: "s1" });
    expect(invoke).toHaveBeenCalledWith("battle-solo", { body: { op: "start", cfg: CFG } });
  });

  it("throws when the transport itself errors", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(startSoloBattle(CFG)).rejects.toThrow(/network down/);
  });

  it("throws when the envelope reports ok:false", async () => {
    invoke.mockResolvedValue({
      data: { ok: false, error: { code: "unauthorized", msg: "no valid session" } },
      error: null,
    });
    await expect(startSoloBattle(CFG)).rejects.toThrow(/unauthorized/);
  });
});

describe("getSoloBattle", () => {
  it("calls battle-solo with op:get and the given battleId", async () => {
    const record = {
      id: "b1",
      seed: "s1",
      cfg: CFG,
      log: [],
      status: "in_progress" as const,
      result: null,
    };
    invoke.mockResolvedValue({ data: { ok: true, data: record }, error: null });
    const result = await getSoloBattle("b1");
    expect(result).toEqual(record);
    expect(invoke).toHaveBeenCalledWith("battle-solo", { body: { op: "get", battleId: "b1" } });
  });

  it("throws when the battle isn't found", async () => {
    invoke.mockResolvedValue({
      data: { ok: false, error: { code: "not_found", msg: "no battle with that id" } },
      error: null,
    });
    await expect(getSoloBattle("missing")).rejects.toThrow(/not_found/);
  });
});

describe("submitBattleAction", () => {
  it("calls battle-solo with op:submit_action, the battleId, and the action", async () => {
    const state = { playerHp: 85, enemyHp: 100 };
    invoke.mockResolvedValue({ data: { ok: true, data: { state, events: [] } }, error: null });
    const action = { type: "submit_answer" as const, questionIdx: 0, choiceIdx: 1, elapsedMs: 3000 };
    const result = await submitBattleAction("b1", action);
    expect(result).toEqual({ state, events: [] });
    expect(invoke).toHaveBeenCalledWith("battle-solo", {
      body: { op: "submit_action", battleId: "b1", action },
    });
  });

  it("throws when the action is rejected (e.g. out-of-order question index)", async () => {
    invoke.mockResolvedValue({
      data: { ok: false, error: { code: "unexpected_question_idx", msg: "expected an answer for question 0" } },
      error: null,
    });
    await expect(
      submitBattleAction("b1", { type: "submit_answer", questionIdx: 5, choiceIdx: 0, elapsedMs: 1000 }),
    ).rejects.toThrow(/unexpected_question_idx/);
  });
});
