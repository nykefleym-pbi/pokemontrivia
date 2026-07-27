import { describe, it, expect } from "vitest";
import { inviteUrl } from "@/lib/referral-rewards";

describe("inviteUrl", () => {
  it("builds the /refer link that actually pays both sides", () => {
    // claimReferral only fires for arrivals through this path; a bare app link
    // brings the person in but pays nobody.
    expect(inviteUrl("ABC123")).toBe("https://pokemontriviabattle.vercel.app/refer?code=ABC123");
  });

  it("falls back to the plain app link when there is no code yet", () => {
    expect(inviteUrl(null)).toBe("https://pokemontriviabattle.vercel.app/");
    expect(inviteUrl(undefined)).toBe("https://pokemontriviabattle.vercel.app/");
    expect(inviteUrl("")).toBe("https://pokemontriviabattle.vercel.app/");
  });
});
