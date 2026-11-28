import { afterEach, describe, expect, it } from "vitest";
import { useGameStore } from "@/lib/store";

const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

describe("route steps in the store (Paul, 2026-11-28)", () => {
  it("a stop win advances only its own stop; Who's That marks the route", () => {
    useGameStore.setState({ route: { region: 0, gym: 0, beaten: 0 } });
    const s = useGameStore.getState();
    s.recordRouteStopWin(0, "wild");
    s.recordRouteStopWin(0, "wild"); // a stale second win for the same stop changes nothing
    expect(useGameStore.getState().route.beaten).toBe(1);
    s.recordRouteStopWin(null, "wild"); // an extra battle advances nothing
    expect(useGameStore.getState().route.beaten).toBe(1);
    s.markRouteWhos();
    expect(useGameStore.getState().route.whos).toBe(true);
  });

  it("losing the gym needs one trainer win to reopen it, and tries are unlimited", () => {
    useGameStore.setState({
      route: { region: 0, gym: 0, beaten: 4, whos: true },
      weeklyLeague: { weekStartTs: 0, gymLeaderId: "brock", status: "not_started", attemptStartedAt: null, questionsAnswered: 0 },
    });
    const s = useGameStore.getState();
    s.startWeeklyLeagueAttempt();
    s.recordWeeklyLeagueResult(false);
    expect(useGameStore.getState().route.gymLost).toBe(true);
    s.recordRouteStopWin(null, "wild"); // a wild extra does not count
    expect(useGameStore.getState().route.gymLost).toBe(true);
    s.recordRouteStopWin(null, "trainer");
    expect(useGameStore.getState().route.gymLost).toBe(false);
    s.startWeeklyLeagueAttempt(); // a second try after a loss
    expect(useGameStore.getState().weeklyLeague?.status).toBe("in_progress");
    s.recordWeeklyLeagueResult(true);
    expect(useGameStore.getState().route).toEqual({ region: 0, gym: 1, beaten: 0 });
    expect(useGameStore.getState().gymBadges).toContain("brock");
  });
});
