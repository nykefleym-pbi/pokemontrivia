import { describe, expect, it, vi, beforeEach } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { loadSave, pushSave, replayBattles, type OfflineBattle } from "./save";

beforeEach(() => {
  invoke.mockReset();
});

describe("loadSave", () => {
  it("calls save-sync with op:pull and returns the envelope's data", async () => {
    invoke.mockResolvedValue({ data: { ok: true, data: { save: { xp: 5 }, version: 3 } }, error: null });
    const result = await loadSave();
    expect(result).toEqual({ save: { xp: 5 }, version: 3 });
    expect(invoke).toHaveBeenCalledWith("save-sync", { body: { op: "pull" } });
  });

  it("throws when the transport itself errors", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(loadSave()).rejects.toThrow(/network down/);
  });

  it("throws when the envelope reports ok:false", async () => {
    invoke.mockResolvedValue({
      data: { ok: false, error: { code: "unauthorized", msg: "no valid session" } },
      error: null,
    });
    await expect(loadSave()).rejects.toThrow(/unauthorized/);
  });
});

describe("pushSave", () => {
  it("calls save-sync with op:push and the given baseVersion/save", async () => {
    invoke.mockResolvedValue({ data: { ok: true, data: { version: 4 } }, error: null });
    const result = await pushSave(3, { xp: 10 });
    expect(result).toEqual({ version: 4 });
    expect(invoke).toHaveBeenCalledWith("save-sync", {
      body: { op: "push", baseVersion: 3, save: { xp: 10 } },
    });
  });

  it("surfaces a conflict result without throwing", async () => {
    invoke.mockResolvedValue({ data: { ok: true, data: { conflict: true } }, error: null });
    const result = await pushSave(3, { xp: 10 });
    expect(result).toEqual({ conflict: true });
  });
});

const BATTLE: OfflineBattle = {
  id: "11111111-1111-1111-1111-111111111111",
  cfg: {
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
  },
  seed: "offline-seed-1",
  log: [{ type: "submit_answer", questionIdx: 0, choiceIdx: 0, elapsedMs: 3000 }],
};

describe("replayBattles", () => {
  it("calls save-sync with op:replay and the given battles", async () => {
    const responseData = {
      results: [{ id: BATTLE.id, status: "recorded" as const }],
      reward: { xp: 10, coins: 2, trainingPoints: { "1": 1 } },
      save: { version: 5, state: { xp: 20 } },
    };
    invoke.mockResolvedValue({ data: { ok: true, data: responseData }, error: null });
    const result = await replayBattles([BATTLE]);
    expect(result).toEqual(responseData);
    expect(invoke).toHaveBeenCalledWith("save-sync", { body: { op: "replay", battles: [BATTLE] } });
  });

  it("surfaces a null save when no server save exists yet", async () => {
    const responseData = {
      results: [{ id: BATTLE.id, status: "recorded" as const }],
      reward: { xp: 10, coins: 2, trainingPoints: { "1": 1 } },
      save: null,
    };
    invoke.mockResolvedValue({ data: { ok: true, data: responseData }, error: null });
    const result = await replayBattles([BATTLE]);
    expect(result.save).toBeNull();
    expect(result.reward).not.toBeNull();
  });

  it("throws when the envelope reports ok:false", async () => {
    invoke.mockResolvedValue({
      data: { ok: false, error: { code: "bad_request", msg: "battles must be an array" } },
      error: null,
    });
    await expect(replayBattles([BATTLE])).rejects.toThrow(/bad_request/);
  });
});
