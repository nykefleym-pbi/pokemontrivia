import { afterEach, describe, expect, it, vi } from "vitest";
import { useGameStore } from "@/lib/store";

const initial = useGameStore.getState();
afterEach(() => {
  useGameStore.setState(initial, true);
  vi.useRealTimers();
});

const winBadge = (leader: string) => {
  useGameStore.setState({
    weeklyLeague: { weekStartTs: 0, gymLeaderId: leader, status: "in_progress", attemptStartedAt: 0, questionsAnswered: 0 },
  });
  useGameStore.getState().recordWeeklyLeagueResult(true);
};

describe("Streak Freeze from gym badges", () => {
  it("a new badge gives a freeze, up to 2; then coins instead", () => {
    useGameStore.setState({ gymBadges: [], streakFreezes: 0, coins: 0 });
    winBadge("brock");
    winBadge("misty");
    expect(useGameStore.getState().streakFreezes).toBe(2);
    winBadge("surge");
    expect(useGameStore.getState().streakFreezes).toBe(2);
    expect(useGameStore.getState().coins).toBe(250);
    expect(useGameStore.getState().lastBadgeGift).toBe("coins");
  });

  it("a badge already owned gives nothing", () => {
    useGameStore.setState({ gymBadges: ["brock"], streakFreezes: 0 });
    winBadge("brock");
    expect(useGameStore.getState().streakFreezes).toBe(0);
  });

  it("on app open, held freezes cover the missed days and leave a notice", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-28T12:00:00Z"));
    useGameStore.setState({
      streakFreezes: 2,
      frozenDays: [],
      freezeNotice: null,
      battleLog: [{ opponent: "x", won: true, xpGained: 0, bestStreak: 0, timestamp: Date.parse("2026-11-26T12:00:00Z"), mode: "battle" }],
    });
    useGameStore.getState().applyStreakFreezes();
    const s = useGameStore.getState();
    expect(s.streakFreezes).toBe(1);
    expect(s.frozenDays).toEqual(["2026-11-27"]);
    expect(s.freezeNotice).toEqual(["2026-11-27"]);
  });
});
