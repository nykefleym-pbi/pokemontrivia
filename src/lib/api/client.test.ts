import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson, postJson } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("postJson", () => {
  it("resolves to parsed JSON on 200 and sends POST + JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ a: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const out = await postJson<{ a: number }>("/x", { hello: "world" });
    expect(out).toEqual({ a: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/x");
    expect(opts.method).toBe("POST");
    expect(opts.headers).toEqual({ "Content-Type": "application/json" });
    expect(opts.body).toBe(JSON.stringify({ hello: "world" }));
  });

  it("throws ApiError with status 429 when fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
    );
    await expect(postJson("/x", {})).rejects.toMatchObject({
      name: "ApiError",
      status: 429,
    });
    await expect(postJson("/x", {})).rejects.toBeInstanceOf(ApiError);
  });
});

describe("getJson", () => {
  it("resolves to parsed JSON on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ b: 2 }) }),
    );
    const out = await getJson<{ b: number }>("/y");
    expect(out).toEqual({ b: 2 });
  });

  it("throws ApiError with status 500 when fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }),
    );
    await expect(getJson("/y")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
    });
  });
});
