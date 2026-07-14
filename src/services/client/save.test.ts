import { describe, expect, it, vi, beforeEach } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));

import { loadSave, pushSave } from "./save";

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
