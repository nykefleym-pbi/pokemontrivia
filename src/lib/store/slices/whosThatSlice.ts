import type { GameState } from "@/lib/store/types";
import type { StoreSlice } from "@/lib/store/slice";

export const createWhosThatSlice: StoreSlice<
  Pick<
    GameState,
    | "whosThatHourKey"
    | "whosThatActiveRound"
    | "whosThatRoundHourKey"
    | "consumeWhosThat"
    | "setWhosThatRound"
    | "clearWhosThatRound"
  >
> = (set) => ({
  whosThatHourKey: 0,
  whosThatActiveRound: null,
  whosThatRoundHourKey: null,

  consumeWhosThat: () => {
    set({ whosThatHourKey: Math.floor(Date.now() / 3_600_000) });
  },
  setWhosThatRound: (round, hourKey) =>
    set({ whosThatActiveRound: round, whosThatRoundHourKey: hourKey }),
  clearWhosThatRound: () => set({ whosThatActiveRound: null, whosThatRoundHourKey: null }),
});
