import { describe, it, expect } from "vitest";
import { shouldAskForPush, shouldOfferInstall, type PushAskInput } from "@/lib/push-opt-in";

const eligible: PushAskInput = {
  hasOnboarded: true,
  wins: 1,
  busy: false,
  subscribed: false,
  canSubscribe: true,
  state: "unasked",
  lastDate: null,
  today: "2026-07-26",
};

describe("shouldAskForPush", () => {
  it("asks once the player has won a battle", () => {
    expect(shouldAskForPush(eligible)).toBe(true);
  });

  it("never asks before a first win", () => {
    // A permission prompt shown on arrival gets denied, and a denied native
    // prompt can never be re-asked — this is the rule worth guarding hardest.
    expect(shouldAskForPush({ ...eligible, wins: 0 })).toBe(false);
  });

  it("never asks mid-onboarding", () => {
    expect(shouldAskForPush({ ...eligible, hasOnboarded: false })).toBe(false);
  });

  it("never interrupts a battle or a result screen", () => {
    expect(shouldAskForPush({ ...eligible, busy: true })).toBe(false);
  });

  it("does not ask someone who is already subscribed", () => {
    expect(shouldAskForPush({ ...eligible, subscribed: true })).toBe(false);
  });

  it("stays quiet where the platform cannot deliver a push at all", () => {
    expect(shouldAskForPush({ ...eligible, canSubscribe: false })).toBe(false);
  });

  it("waits a day before the second ask", () => {
    const declinedToday = {
      ...eligible,
      state: "soft-declined" as const,
      lastDate: "2026-07-26",
    };
    expect(shouldAskForPush(declinedToday)).toBe(false);
    expect(shouldAskForPush({ ...declinedToday, today: "2026-07-27" })).toBe(true);
  });

  it("stops for good after the second ask", () => {
    expect(
      shouldAskForPush({ ...eligible, state: "asked", lastDate: "2026-01-01" }),
    ).toBe(false);
  });

  it("asks at most twice across a long stretch of days", () => {
    // Walk a month of opens and count how often the card would appear.
    let state: PushAskInput["state"] = "unasked";
    let lastDate: string | null = null;
    let asks = 0;
    for (let day = 1; day <= 30; day++) {
      const today = `2026-07-${String(day).padStart(2, "0")}`;
      if (shouldAskForPush({ ...eligible, state, lastDate, today })) {
        asks++;
        // Player declines every time.
        state = state === "unasked" ? "soft-declined" : "asked";
        lastDate = today;
      }
    }
    expect(asks).toBe(2);
  });
});

describe("shouldOfferInstall", () => {
  const base = {
    hasOnboarded: true,
    wins: 1,
    busy: false,
    standalone: false,
    installable: true,
    state: "unasked" as const,
    lastDate: null,
    today: "2026-07-26",
  };

  it("offers once a win is on the board", () => {
    expect(shouldOfferInstall(base)).toBe(true);
  });

  it("never offers to an already-installed app", () => {
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
  });

  it("stays quiet when the platform gave us no way to install", () => {
    expect(shouldOfferInstall({ ...base, installable: false })).toBe(false);
  });

  it("shares the same two-ask budget", () => {
    expect(shouldOfferInstall({ ...base, state: "asked", lastDate: "2026-01-01" })).toBe(false);
    expect(shouldOfferInstall({ ...base, state: "soft-declined", lastDate: "2026-07-26" })).toBe(
      false,
    );
    expect(shouldOfferInstall({ ...base, state: "soft-declined", lastDate: "2026-07-25" })).toBe(
      true,
    );
  });
});
