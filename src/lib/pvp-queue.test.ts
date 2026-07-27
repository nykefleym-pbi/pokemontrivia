// The client half of online matchmaking.
//
// The pairing itself is SQL (enqueue_pvp) and is verified against the real
// database; what is worth pinning here is the bookkeeping around it, because
// getting it wrong is invisible: a queue session that marks its questions as
// "seen" on every poll would chew through the curated pool while the player
// sits waiting, and only show up weeks later as repeated questions.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcCall = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcCall(...args) },
}));

const tracked: Array<{ event: string; props?: Record<string, unknown> }> = [];
vi.mock("@/lib/analytics", () => ({
  track: (event: string, props?: Record<string, unknown>) => void tracked.push({ event, props }),
}));

const { useGameStore } = await import("@/lib/store");
const { attemptQueueMatch, leaveQueue } = await import("@/lib/pvp-live");

const ticket = {
  questions: [
    { question: "q1", options: ["a", "b", "c", "d"], correct: 0, explanation: "", category: "" },
    { question: "q2", options: ["a", "b", "c", "d"], correct: 1, explanation: "", category: "" },
  ],
  servedIds: ["id-1", "id-2"],
};

beforeEach(() => {
  rpcCall.mockReset();
  tracked.length = 0;
  useGameStore.setState({ seenQuestions: [], seenCuratedIds: [] });
});

const seen = () => ({
  questions: useGameStore.getState().seenQuestions,
  curated: useGameStore.getState().seenCuratedIds,
});

describe("attemptQueueMatch", () => {
  it("reports waiting without spending the ticket", async () => {
    rpcCall.mockResolvedValue({ data: { ok: true, matched: false }, error: null });

    const res = await attemptQueueMatch(ticket);

    expect(res).toEqual({ ok: true, matched: false });
    // The questions were never served, so they must not be marked seen.
    expect(seen()).toEqual({ questions: [], curated: [] });
    expect(tracked).toHaveLength(0);
  });

  it("stays quiet across a long wait", async () => {
    rpcCall.mockResolvedValue({ data: { ok: true, matched: false }, error: null });
    for (let i = 0; i < 12; i++) await attemptQueueMatch(ticket);
    expect(seen()).toEqual({ questions: [], curated: [] });
  });

  it("spends the ticket exactly once, on the poll that pairs", async () => {
    rpcCall
      .mockResolvedValueOnce({ data: { ok: true, matched: false }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, matched: false }, error: null })
      .mockResolvedValueOnce({
        data: { ok: true, matched: true, matchId: "m-1" },
        error: null,
      });

    await attemptQueueMatch(ticket);
    await attemptQueueMatch(ticket);
    const res = await attemptQueueMatch(ticket);

    expect(res).toEqual({ ok: true, matched: true, matchId: "m-1" });
    expect(seen()).toEqual({ questions: ["q1", "q2"], curated: ["id-1", "id-2"] });
  });

  // The waiting side of the queue is paired IN by somebody else's enqueue_pvp
  // call: their row is deleted and a match is created with them as guest. The
  // server now hands that match back on the next poll (`pulledIn`) instead of
  // silently re-queueing them into a second battle — but it is the HOST's
  // questions that match is playing, so our own ticket went unspent.
  it("does not spend the ticket for a match somebody else created", async () => {
    rpcCall.mockResolvedValue({
      data: { ok: true, matched: true, pulledIn: true, matchId: "m-2" },
      error: null,
    });

    const res = await attemptQueueMatch(ticket);

    expect(res).toEqual({ ok: true, matched: true, matchId: "m-2" });
    expect(seen()).toEqual({ questions: [], curated: [] });
    // The host already counted this match; counting it again would double it.
    expect(tracked).toHaveLength(0);
  });

  it("records the match as a human one, tagged as coming from the queue", async () => {
    rpcCall.mockResolvedValue({ data: { ok: true, matched: true, matchId: "m-1" }, error: null });
    await attemptQueueMatch(ticket);
    expect(tracked).toEqual([
      { event: "pvp_match_started", props: { opponent: "human", via: "queue" } },
    ]);
  });

  it("passes the caller's partner so the server can seed guest_partner_id", async () => {
    useGameStore.setState({
      pokemon: { id: 25, name: "Pikachu", types: ["electric"] } as never,
    });
    rpcCall.mockResolvedValue({ data: { ok: true, matched: false }, error: null });

    await attemptQueueMatch(ticket);

    expect(rpcCall).toHaveBeenCalledWith("enqueue_pvp", {
      _questions: ticket.questions,
      _partner_id: 25,
    });
  });

  it("surfaces a transport failure rather than pretending to be queued", async () => {
    rpcCall.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(attemptQueueMatch(ticket)).resolves.toEqual({ ok: false, error: "network" });
  });

  it("passes a server-side refusal through by name", async () => {
    rpcCall.mockResolvedValue({ data: { ok: false, error: "no_profile" }, error: null });
    await expect(attemptQueueMatch(ticket)).resolves.toEqual({ ok: false, error: "no_profile" });
  });

  it("does not throw when the call itself blows up", async () => {
    rpcCall.mockRejectedValue(new Error("offline"));
    await expect(attemptQueueMatch(ticket)).resolves.toEqual({ ok: false, error: "network" });
  });
});

describe("leaveQueue", () => {
  it("asks the server to drop the caller's row", async () => {
    rpcCall.mockResolvedValue({ data: { ok: true }, error: null });
    await leaveQueue();
    expect(rpcCall).toHaveBeenCalledWith("leave_pvp_queue");
  });

  it("swallows failures — a row left behind expires on its own", async () => {
    rpcCall.mockRejectedValue(new Error("offline"));
    await expect(leaveQueue()).resolves.toBeUndefined();
  });
});
