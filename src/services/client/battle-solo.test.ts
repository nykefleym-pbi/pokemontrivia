import { describe, expect, it, vi, beforeEach } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { startSoloBattle, getSoloBattle } from "./battle-solo";

beforeEach(() => {
  invoke.mockReset();
});

describe("startSoloBattle", () => {
  it("calls battle-solo with op:start and returns the envelope's data", async () => {
    invoke.mockResolvedValue({
      data: { ok: true, data: { battleId: "b1", seed: "s1" } },
      error: null,
    });
    const result = await startSoloBattle({ mode: "regular" });
    expect(result).toEqual({ battleId: "b1", seed: "s1" });
    expect(invoke).toHaveBeenCalledWith("battle-solo", { body: { op: "start", cfg: { mode: "regular" } } });
  });

  it("throws when the transport itself errors", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "network down" } });
    await expect(startSoloBattle({})).rejects.toThrow(/network down/);
  });

  it("throws when the envelope reports ok:false", async () => {
    invoke.mockResolvedValue({
      data: { ok: false, error: { code: "unauthorized", msg: "no valid session" } },
      error: null,
    });
    await expect(startSoloBattle({})).rejects.toThrow(/unauthorized/);
  });
});

describe("getSoloBattle", () => {
  it("calls battle-solo with op:get and the given battleId", async () => {
    const record = {
      id: "b1",
      seed: "s1",
      cfg: {},
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
