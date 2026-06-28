import type { GameState } from "@/lib/store";
import type { StoreSlice } from "@/lib/store/slice";

export const createCollectionsSlice: StoreSlice<
  Pick<
    GameState,
    | "pokedex"
    | "defeatedElites"
    | "defeatedEliteRegions"
    | "abilityCodex"
    | "recordPokedexCapture"
    | "markEliteDefeated"
    | "registerAbilityTriggered"
  >
> = (set, get) => ({
  pokedex: {},
  defeatedElites: [],
  defeatedEliteRegions: [],
  abilityCodex: [],

  recordPokedexCapture: (pokemonId, isShiny) => {
    const s = get();
    const existing = s.pokedex[pokemonId];
    set({
      pokedex: {
        ...s.pokedex,
        [pokemonId]: {
          pokemonId,
          firstSeenAt: existing?.firstSeenAt ?? Date.now(),
          shinyUnlocked: (existing?.shinyUnlocked ?? false) || isShiny,
          defeatCount: (existing?.defeatCount ?? 0) + 1,
        },
      },
    });
  },

  markEliteDefeated: (memberId, region, regionDone) => {
    const s = get();
    const elites = s.defeatedElites.includes(memberId)
      ? s.defeatedElites
      : [...s.defeatedElites, memberId];
    const regions =
      regionDone && !s.defeatedEliteRegions.includes(region)
        ? [...s.defeatedEliteRegions, region]
        : s.defeatedEliteRegions;
    set({ defeatedElites: elites, defeatedEliteRegions: regions });
  },

  registerAbilityTriggered: (abilityId) => {
    const s = get();
    if (s.abilityCodex.includes(abilityId)) return;
    set({ abilityCodex: [...s.abilityCodex, abilityId] });
  },
});
