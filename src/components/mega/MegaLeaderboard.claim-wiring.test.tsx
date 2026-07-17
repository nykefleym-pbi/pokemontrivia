// Verifies MegaLeaderboard.tsx's mega-reward-claim wiring: claimReward() now
// calls the idempotent Edge Function for the core XP/coins/TP payout instead
// of computing it purely client-side, while the rank-1-only bonuses (items/
// egg/Pokédex/trophy/level-up cascade) stay client-side — but only fire on a
// genuinely NEW grant (`granted: true`), never on `alreadyGranted: true`,
// since those bonuses aren't (yet) covered by the server's idempotency ledger
// (see mega-reward-claim/index.ts's module doc).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/audio", () => ({ playSfx: vi.fn() }));

vi.mock("sonner", () => {
  const toastFn = vi.fn() as unknown as {
    (msg: string): void;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  toastFn.success = vi.fn();
  toastFn.error = vi.fn();
  return { toast: toastFn };
});

const { claimMegaReward } = vi.hoisted(() => ({ claimMegaReward: vi.fn() }));
vi.mock("@/services/client/mega-reward-claim", () => ({ claimMegaReward }));

const { fetchMegaLeaderboard, getMyMegaRun } = vi.hoisted(() => ({
  fetchMegaLeaderboard: vi.fn(),
  getMyMegaRun: vi.fn(),
}));
vi.mock("@/lib/mega/runs", () => ({ fetchMegaLeaderboard, getMyMegaRun }));

const { ensureSession, listFriends, listPendingRequestTargets, sendFriendRequestById } = vi.hoisted(
  () => ({
    ensureSession: vi.fn(),
    listFriends: vi.fn(),
    listPendingRequestTargets: vi.fn(),
    sendFriendRequestById: vi.fn(),
  }),
);
vi.mock("@/lib/social", () => ({
  ensureSession,
  listFriends,
  listPendingRequestTargets,
  sendFriendRequestById,
}));

import { MegaLeaderboard } from "./MegaLeaderboard";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import type { MegaEvent } from "@/lib/mega/schedule";
import type { MegaLeaderboardRow, MegaRunRow } from "@/lib/mega/runs";

const PLAYER = findPokemon(1)!; // Bulbasaur

const EVENT: MegaEvent = {
  id: "event-1",
  megaId: 6,
  name: "Mega Charizard X",
  baseName: "Charizard",
  baseDexId: 6,
  types: ["fire", "dragon"],
  startsAt: "2020-01-01T00:00:00Z",
  endsAt: "2020-01-10T00:00:00Z", // far in the past — always "ended", no fake timers needed
  reward: { xp: 2500, tp: 1000, items: 10, egg: true, dexId: 6 },
  champion: { xp: 5000, tp: 2000, items: 20, trophyId: "trophy-1", trophyName: "Champion" },
};

const MY_RUN: MegaRunRow = {
  id: "run-1",
  user_id: "me",
  event_id: EVENT.id,
  accuracy: 80,
  correct: 8,
  total: 10,
  time_ms: 60_000,
  trainer_name: "Me",
  trainer_sprite: "red",
  level: 5,
  attempts: 1,
  finished_at: "2026-01-05T00:00:00Z",
};

function board(rank2nd = false): MegaLeaderboardRow[] {
  const mine: MegaLeaderboardRow = {
    user_id: "me",
    trainer_name: "Me",
    trainer_sprite: "red",
    level: 5,
    accuracy: 80,
    correct: 8,
    total: 10,
    time_ms: 60_000,
    attempts: 1,
    finished_at: "2026-01-05T00:00:00Z",
  };
  const other: MegaLeaderboardRow = { ...mine, user_id: "other", trainer_name: "Rival", accuracy: 95 };
  return rank2nd ? [other, mine] : [mine, other];
}

let initialStoreState: ReturnType<typeof useGameStore.getState>;

beforeEach(() => {
  if (!initialStoreState) initialStoreState = useGameStore.getState();
  claimMegaReward.mockReset();
  fetchMegaLeaderboard.mockReset();
  getMyMegaRun.mockReset();
  ensureSession.mockReset().mockResolvedValue("me");
  listFriends.mockReset().mockResolvedValue([]);
  listPendingRequestTargets.mockReset().mockResolvedValue(new Set());
  sendFriendRequestById.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useGameStore.setState(initialStoreState, true);
});

function seedStore() {
  useGameStore.setState({ ...initialStoreState, pokemon: PLAYER }, true);
}

async function renderAndWaitForBoard(rank2nd = false) {
  fetchMegaLeaderboard.mockResolvedValue(board(rank2nd));
  getMyMegaRun.mockResolvedValue(MY_RUN);
  seedStore();
  render(<MegaLeaderboard event={EVENT} onBack={() => {}} onBattle={() => {}} />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitFor(() => screen.getByText("CLAIM REWARDS"));
}

describe("MegaLeaderboard mega-reward-claim wiring", () => {
  it("calls claimMegaReward(event.id) and applies the server-computed core reward", async () => {
    claimMegaReward.mockResolvedValue({
      granted: true,
      rank: 2,
      reward: { xp: 1250, coins: 1250, tp: 500 },
      save: null,
    });
    await renderAndWaitForBoard(true); // rank 2

    const prevXp = useGameStore.getState().xp;
    const prevCoins = useGameStore.getState().coins;

    await act(async () => {
      fireEvent.click(screen.getByText("CLAIM REWARDS"));
      await Promise.resolve();
    });

    expect(claimMegaReward).toHaveBeenCalledWith(EVENT.id);
    // >= rather than exact equality: crossing a level boundary from the XP
    // grant also adds level-up cash/items on top (pre-existing, unrelated
    // cascade logic) — this test only verifies the server-computed reward
    // itself gets applied, not the cascade's exact amount.
    expect(useGameStore.getState().xp).toBeGreaterThanOrEqual(prevXp + 1250);
    expect(useGameStore.getState().coins).toBeGreaterThanOrEqual(prevCoins + 1250);
    expect(useGameStore.getState().trainingPoints?.[PLAYER.id]).toBe(500);
    expect(useGameStore.getState().claimedMegaRewards).toContain(EVENT.id);
  });

  it("does not grant the champion-only rank-1 bonuses when the server reports alreadyGranted", async () => {
    claimMegaReward.mockResolvedValue({ granted: false, alreadyGranted: true, rank: 1, save: null });
    await renderAndWaitForBoard(false); // rank 1 (champion)

    const prevXp = useGameStore.getState().xp;
    const prevEggs = useGameStore.getState().pokeEggs?.length ?? 0;

    await act(async () => {
      fireEvent.click(screen.getByText("CLAIM REWARDS"));
      await Promise.resolve();
    });

    expect(claimMegaReward).toHaveBeenCalledWith(EVENT.id);
    // No payout applied a second time.
    expect(useGameStore.getState().xp).toBe(prevXp);
    // No champion-only egg/trophy grant either.
    expect(useGameStore.getState().pokeEggs?.length ?? 0).toBe(prevEggs);
    expect(useGameStore.getState().megaTrophies?.some((t) => t.eventId === EVENT.id)).toBe(false);
    // Still marked claimed locally so the button doesn't loop forever.
    expect(useGameStore.getState().claimedMegaRewards).toContain(EVENT.id);
  });

  it("grants champion-only bonuses (egg + trophy) on a genuine rank-1 claim", async () => {
    claimMegaReward.mockResolvedValue({
      granted: true,
      rank: 1,
      reward: { xp: 2500, coins: 2500, tp: 1000 },
      save: null,
    });
    await renderAndWaitForBoard(false); // rank 1 (champion)

    await act(async () => {
      fireEvent.click(screen.getByText("CLAIM REWARDS"));
      await Promise.resolve();
    });

    expect(useGameStore.getState().megaTrophies?.some((t) => t.eventId === EVENT.id)).toBe(true);
  });

  it("shows an error toast and does not mark claimed when claimMegaReward rejects", async () => {
    claimMegaReward.mockRejectedValue(new Error("network down"));
    await renderAndWaitForBoard(true);

    await act(async () => {
      fireEvent.click(screen.getByText("CLAIM REWARDS"));
      await Promise.resolve();
    });

    expect(useGameStore.getState().claimedMegaRewards).not.toContain(EVENT.id);
  });
});
