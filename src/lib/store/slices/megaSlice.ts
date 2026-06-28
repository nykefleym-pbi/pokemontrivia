import type { GameState } from "@/lib/store";
import type { StoreSlice } from "@/lib/store/slice";

export const createMegaSlice: StoreSlice<
  Pick<
    GameState,
    "megaTrophies" | "claimedMegaRewards" | "claimMegaChampion" | "markMegaRewardClaimed"
  >
> = (set, get) => ({
  megaTrophies: [],
  claimedMegaRewards: [],

  claimMegaChampion: (eventId, name, pokeId) => {
    const s = get();
    if ((s.megaTrophies ?? []).some((t) => t.eventId === eventId)) return false;
    set({
      megaTrophies: [
        ...(s.megaTrophies ?? []),
        { eventId, name, pokeId, claimedAt: new Date().toISOString() },
      ],
    });
    return true;
  },

  markMegaRewardClaimed: (eventId) =>
    set((s) =>
      s.claimedMegaRewards.includes(eventId)
        ? s
        : { claimedMegaRewards: [...s.claimedMegaRewards, eventId] },
    ),
});
