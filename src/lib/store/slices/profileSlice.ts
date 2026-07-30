import type { GameState } from "@/lib/store/types";
import type { StoreSlice } from "@/lib/store/slice";
import type { ItemId } from "@/lib/game-data";
import { TRAINER_SPRITES } from "@/lib/game-data";
import { rollAbilityId } from "@/lib/abilities";
import { planDailyGift } from "@/lib/daily-gift";
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
    | "versusBackdropId"
    | "friendCode"
    | "nameReconciled"
    | "needsNameReclaim"
    | "engageDismissCount"
    | "engageDismissDate"
    | "engageShownThisSession"
    | "dailyGiftLastClaim"
    | "dailyGiftStreak"
    | "dailyGiftFreezeUsedDate"
    | "guaranteedShinyPending"
    | "darkMode"
    | "reducedMotion"
    | "setName"
    | "setTrainerSprite"
    | "setVersusBackdropId"
    | "setOnboarded"
    | "setFriendCode"
    | "setNameReconciled"
    | "setNeedsNameReclaim"
    | "setEngageShownThisSession"
    | "recordEngageDismiss"
    | "pushPromptState"
    | "pushPromptLastDate"
    | "recordPushPrompt"
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
  // Null, not the default id: "never chose" and "chose Forest" are the same
  // picture but not the same fact, and only the resolver needs to know.
  versusBackdropId: null,
  friendCode: null,
  engageDismissCount: 0,
  engageDismissDate: null,
  engageShownThisSession: false,
  nameReconciled: false,
  needsNameReclaim: false,
  pushPromptState: "unasked",
  pushPromptLastDate: null,

  dailyGiftLastClaim: null,
  dailyGiftStreak: 0,
  dailyGiftFreezeUsedDate: null,
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

  recordPushPrompt: (outcome) =>
    set({ pushPromptState: outcome, pushPromptLastDate: new Date().toISOString().slice(0, 10) }),

  claimDailyGift: () => {
    const s = get();
    const today = new Date().toISOString().slice(0, 10);
    // Cadence (missed-day forgiveness, welcome-back purse) lives in daily-gift.ts;
    // this action only grants what that plan says.
    const plan = planDailyGift({
      lastClaim: s.dailyGiftLastClaim,
      streak: s.dailyGiftStreak,
      freezeUsedDate: s.dailyGiftFreezeUsedDate,
      today,
    });
    if (!plan) return null;
    const { day, usedFreeze, comebackCoins } = plan;
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
      dailyGiftFreezeUsedDate: usedFreeze ? today : s.dailyGiftFreezeUsedDate,
      coins: s.coins + comebackCoins,
      guaranteedShinyPending: shiny ? true : s.guaranteedShinyPending,
    });
    return { itemId, qty, day, shiny, usedFreeze, comebackCoins };
  },
  consumeGuaranteedShiny: () => set({ guaranteedShinyPending: false }),

  setName: (name) => set({ trainerName: name }),
  setTrainerSprite: (id) => set({ trainerSprite: id }),
  setVersusBackdropId: (id) => set({ versusBackdropId: id }),
});
