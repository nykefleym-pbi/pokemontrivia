import type { GameState } from "@/lib/store/types";
import type { StoreSlice } from "@/lib/store/slice";
import type { ItemId } from "@/lib/game-data";
import { TRAINER_SPRITES } from "@/lib/game-data";
import { rollAbilityId } from "@/lib/abilities";
import { WHATS_NEW } from "@/lib/whats-new";

/** Item pools shared by the daily gift and the Arena's set-of-5 win rewards
 * (slots 3/5 draw from these — one source, no duplicated lists). */
export const DAILY_COMMON_POOL: ItemId[] = [
  "potion",
  "xattack",
  "scope",
  "superpotion",
  "xaccuracy",
  "escape",
  "quickclaw",
  "maxpotion",
  "starpiece",
];
export const DAILY_PREMIUM_POOL: ItemId[] = [
  "candy",
  "luckyegg",
  "focusband",
  "assaultvest",
  "bignugget",
  "choicespecs",
];

export const createProfileSlice: StoreSlice<
  Pick<
    GameState,
    | "hasOnboarded"
    | "isGuest"
    | "trainerName"
    | "trainerSprite"
    | "friendCode"
    | "nameReconciled"
    | "needsNameReclaim"
    | "lastEngagePromptDate"
    | "engageDismissCount"
    | "engageDismissDate"
    | "engageShownThisSession"
    | "dailyGiftLastClaim"
    | "dailyGiftStreak"
    | "guaranteedShinyPending"
    | "darkMode"
    | "reducedMotion"
    | "setName"
    | "setTrainerSprite"
    | "setOnboarded"
    | "setFriendCode"
    | "setNameReconciled"
    | "setNeedsNameReclaim"
    | "setLastEngagePromptDate"
    | "setEngageShownThisSession"
    | "recordEngageDismiss"
    | "claimDailyGift"
    | "consumeGuaranteedShiny"
    | "setDarkMode"
    | "setReducedMotion"
  >
> = (set, get) => ({
  hasOnboarded: false,
  isGuest: false,
  trainerName: "",
  trainerSprite: TRAINER_SPRITES[0]?.id ?? "",
  friendCode: null,
  lastEngagePromptDate: null,
  engageDismissCount: 0,
  engageDismissDate: null,
  engageShownThisSession: false,
  nameReconciled: false,
  needsNameReclaim: false,

  dailyGiftLastClaim: null,
  dailyGiftStreak: 0,
  guaranteedShinyPending: false,
  darkMode: false,
  reducedMotion: false,

  setDarkMode: (v) => set({ darkMode: v }),
  setReducedMotion: (v) => set({ reducedMotion: v }),

  setOnboarded: (name, pokemon, trainerSprite, abilityId) =>
    set({
      hasOnboarded: true,
      isGuest: false,
      lastSeenWhatsNew: WHATS_NEW.version,
      engageShownThisSession: true,
      trainerName: name,
      pokemon,
      abilityId: abilityId ?? rollAbilityId(pokemon.types),
      // The starter counts as captured so the partner picker is never empty.
      pokedex: {
        ...get().pokedex,
        [pokemon.id]: {
          pokemonId: pokemon.id,
          firstSeenAt: get().pokedex[pokemon.id]?.firstSeenAt ?? Date.now(),
          shinyUnlocked: get().pokedex[pokemon.id]?.shinyUnlocked ?? false,
          defeatCount: get().pokedex[pokemon.id]?.defeatCount ?? 0,
        },
      },
      trainerSprite,
    }),

  setFriendCode: (code) => set({ friendCode: code }),
  setLastEngagePromptDate: (date) => set({ lastEngagePromptDate: date }),
  setNameReconciled: (v) => set({ nameReconciled: v }),
  setNeedsNameReclaim: (v) => set({ needsNameReclaim: v }),
  setEngageShownThisSession: (v) => set({ engageShownThisSession: v }),

  recordEngageDismiss: () => {
    const today = new Date().toISOString().slice(0, 10);
    const s = get();
    if (s.engageDismissDate !== today) {
      set({ engageDismissDate: today, engageDismissCount: 1 });
    } else {
      set({ engageDismissCount: s.engageDismissCount + 1 });
    }
  },

  claimDailyGift: () => {
    const s = get();
    const today = new Date().toISOString().slice(0, 10);
    if (s.dailyGiftLastClaim === today) return null;
    const yd = new Date();
    yd.setUTCDate(yd.getUTCDate() - 1);
    const yesterday = yd.toISOString().slice(0, 10);
    const continuing = s.dailyGiftLastClaim === yesterday;
    const day = ((continuing ? s.dailyGiftStreak : 0) % 7) + 1;
    const shiny = day === 7;
    let itemId: ItemId;
    let qty = 1;
    if (shiny) {
      itemId = DAILY_PREMIUM_POOL[Math.floor(Math.random() * DAILY_PREMIUM_POOL.length)];
    } else {
      itemId = DAILY_COMMON_POOL[Math.floor(Math.random() * DAILY_COMMON_POOL.length)];
      qty = Math.random() < 0.3 ? 2 : 1;
    }
    set({
      inventory: { ...s.inventory, [itemId]: (s.inventory[itemId] ?? 0) + qty },
      dailyGiftStreak: day,
      dailyGiftLastClaim: today,
      guaranteedShinyPending: shiny ? true : s.guaranteedShinyPending,
    });
    return { itemId, qty, day, shiny };
  },
  consumeGuaranteedShiny: () => set({ guaranteedShinyPending: false }),

  setName: (name) => set({ trainerName: name }),
  setTrainerSprite: (id) => set({ trainerSprite: id }),
});
