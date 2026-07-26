import { describe, it, expect } from "vitest";
import { COMEBACK_COINS, litGiftPips, planDailyGift } from "@/lib/daily-gift";

const base = {
  lastClaim: "2026-07-25",
  streak: 3,
  freezeUsedDate: null as string | null,
  today: "2026-07-26",
};

describe("planDailyGift", () => {
  it("advances the streak on consecutive days", () => {
    expect(planDailyGift(base)).toMatchObject({ day: 4, usedFreeze: false, comebackCoins: 0 });
  });

  it("refuses a second claim on the same day", () => {
    expect(planDailyGift({ ...base, lastClaim: "2026-07-26" })).toBeNull();
  });

  it("starts a first-ever claim at day 1", () => {
    expect(planDailyGift({ ...base, lastClaim: null, streak: 0 })).toMatchObject({
      day: 1,
      gapDays: null,
      comebackCoins: 0,
    });
  });

  it("wraps day 7 back round to day 1", () => {
    expect(planDailyGift({ ...base, streak: 7 })?.day).toBe(1);
  });

  it("forgives a single missed day instead of resetting to day 1", () => {
    // The churn moment this exists for: a player on day 6, one day from the
    // guaranteed shiny, misses once and used to lose the lot.
    const plan = planDailyGift({ ...base, streak: 6, lastClaim: "2026-07-24" });
    expect(plan).toMatchObject({ day: 7, usedFreeze: true, gapDays: 2 });
  });

  it("does not forgive two missed days", () => {
    const plan = planDailyGift({ ...base, streak: 6, lastClaim: "2026-07-23" });
    expect(plan).toMatchObject({ day: 1, usedFreeze: false });
  });

  it("only forgives once a week", () => {
    const spentYesterday = {
      ...base,
      streak: 4,
      lastClaim: "2026-07-24",
      freezeUsedDate: "2026-07-22",
    };
    expect(planDailyGift(spentYesterday)).toMatchObject({ day: 1, usedFreeze: false });

    const rechargedFreeze = { ...spentYesterday, freezeUsedDate: "2026-07-19" };
    expect(planDailyGift(rechargedFreeze)).toMatchObject({ day: 5, usedFreeze: true });
  });

  it("has no streak to save for someone who never had one", () => {
    const plan = planDailyGift({ ...base, streak: 0, lastClaim: "2026-07-24" });
    expect(plan).toMatchObject({ day: 1, usedFreeze: false });
  });

  it("pays a welcome-back purse after three days away", () => {
    expect(planDailyGift({ ...base, lastClaim: "2026-07-23" })?.comebackCoins).toBe(COMEBACK_COINS);
    expect(planDailyGift({ ...base, lastClaim: "2026-06-01" })?.comebackCoins).toBe(COMEBACK_COINS);
  });

  it("does not pay it for a forgiven single miss", () => {
    // Two days away is a slip, not a lapse — the freeze already handled it.
    expect(planDailyGift({ ...base, lastClaim: "2026-07-24" })?.comebackCoins).toBe(0);
  });

  it("does not pay it to a brand-new player", () => {
    expect(planDailyGift({ ...base, lastClaim: null, streak: 0 })?.comebackCoins).toBe(0);
  });

  it("cannot be farmed by winding the clock backwards", () => {
    const plan = planDailyGift({ ...base, lastClaim: "2026-08-10" });
    expect(plan).toMatchObject({ day: 1, usedFreeze: false, comebackCoins: 0 });
  });

  it("counts the gap across a month boundary", () => {
    expect(planDailyGift({ ...base, lastClaim: "2026-06-30", today: "2026-07-01" })?.day).toBe(4);
  });
});

describe("litGiftPips", () => {
  it("shows nothing before the first claim", () => {
    expect(litGiftPips({ ...base, lastClaim: null, streak: 0 })).toBe(0);
  });

  it("shows today's streak once claimed", () => {
    expect(litGiftPips({ ...base, lastClaim: "2026-07-26", streak: 5 })).toBe(5);
  });

  it("keeps yesterday's streak lit while today is unclaimed", () => {
    expect(litGiftPips(base)).toBe(3);
  });

  it("keeps a streak lit while the freeze can still rescue it", () => {
    // Showing 0 here would tell the player they had already lost the streak,
    // one day before the freeze would in fact have saved it.
    expect(litGiftPips({ ...base, lastClaim: "2026-07-24" })).toBe(3);
  });

  it("goes dark once the freeze is spent and the day is missed", () => {
    expect(litGiftPips({ ...base, lastClaim: "2026-07-24", freezeUsedDate: "2026-07-23" })).toBe(0);
  });

  it("goes dark after a genuine lapse", () => {
    expect(litGiftPips({ ...base, lastClaim: "2026-07-01" })).toBe(0);
  });
});
