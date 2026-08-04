import { describe, it, expect, vi, beforeEach } from "vitest";

// The curated bank is a network call; what matters here is which band the
// handler asks it for, so record the calls and hand back a full set.
const picked = vi.fn();
vi.mock("@/lib/curated-questions", () => ({
  pickBattleCurated: (opts: unknown) => picked(opts),
  recordCuratedServed: () => Promise.resolve(),
}));

const { Route } = await import("@/routes/api.trivia-batch");

type Handler = (ctx: { request: Request }) => Promise<Response>;
const post = (
  Route as unknown as { options: { server: { handlers: { POST: Handler } } } }
).options.server.handlers.POST;

function twentyCurated() {
  return {
    questions: Array.from({ length: 20 }, (_, i) => ({
      question: `q${i}`,
      options: ["a", "b", "c", "d"],
      correct: 0,
      explanation: "",
      category: "",
    })),
    servedIds: Array.from({ length: 20 }, (_, i) => `id${i}`),
  };
}

async function ask(body: unknown) {
  const res = await post({
    request: new Request("http://localhost/api/trivia-batch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  return (await res.json()) as { questions: unknown[]; source: string };
}

const bandAsked = () => (picked.mock.calls[0][0] as { difficulties: string[] }).difficulties;

beforeEach(() => {
  picked.mockReset();
  picked.mockResolvedValue(twentyCurated());
});

describe("/api/trivia-batch difficulty handling", () => {
  it("asks the bank for the band the client sent", async () => {
    await ask({ difficulties: ["hard", "expert"] });
    expect(bandAsked()).toEqual(["hard", "expert"]);
  });

  it('sends a stale client\'s "master" to the top band, not to easy', async () => {
    // The regression: "master" was an unknown value, the handler clamped it to
    // "easy", and every level-26+ trainer silently got beginner questions.
    await ask({ difficulty: "master" });
    expect(bandAsked()).toEqual(["hard", "expert"]);
    expect(bandAsked()).not.toContain("easy");
  });

  it("still honours the single-string shape an older cached shell sends", async () => {
    await ask({ difficulty: "expert" });
    expect(bandAsked()).toEqual(["expert"]);
  });

  it("falls back to easy only when the client sent nothing usable", async () => {
    await ask({ flowSeed: 1 });
    expect(bandAsked()).toEqual(["easy"]);
  });

  it("serves the curated set without reaching for the bundled fallbacks", async () => {
    const body = await ask({ difficulties: ["medium", "hard"] });
    expect(body.source).toBe("curated-20");
    expect(body.questions).toHaveLength(20);
  });

  it("tops up from the bundled fallbacks only when the bank comes up short", async () => {
    const short = twentyCurated();
    short.questions = short.questions.slice(0, 12);
    short.servedIds = short.servedIds.slice(0, 12);
    picked.mockResolvedValue(short);
    const body = await ask({ difficulties: ["expert"] });
    expect(body.source).toBe("curated-12");
    expect(body.questions).toHaveLength(20);
  });

  it("caps the exclude list it forwards at the most recent 2000", async () => {
    const ids = Array.from({ length: 2100 }, (_, i) => `x${i}`);
    await ask({ difficulties: ["easy"], excludeIds: ids });
    const sent = (picked.mock.calls[0][0] as { excludeIds: string[] }).excludeIds;
    expect(sent).toHaveLength(2000);
    expect(sent[0]).toBe("x100");
  });
});
