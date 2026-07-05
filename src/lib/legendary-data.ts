/** Canonical Legendary + Mythical Pokémon roster (National Dex IDs, gens 1-9).
 * Single source of truth for the "Legendary/Mythical are Poké-Egg exclusive"
 * rule: excluded from every enemy pool and only obtainable via hatching. */
export type LegendaryCategory = "legendary" | "mythical";

export const LEGENDARY_IDS: readonly number[] = [
  // Gen 1
  144, 145, 146, 150,
  // Gen 2
  243, 244, 245, 249, 250,
  // Gen 3
  377, 378, 379, 380, 381, 382, 383, 384,
  // Gen 4
  480, 481, 482, 483, 484, 485, 486, 487, 488,
  // Gen 5
  638, 639, 640, 641, 642, 643, 644, 645, 646,
  // Gen 6
  716, 717, 718,
  // Gen 7 (includes Ultra Beasts, which carry the same legendary encounter flag in-game;
  // Type: Null / Silvally are the synthetic-trio prototype line, grouped Legendary per the v2 roster)
  772, 773, 785, 786, 787, 788, 789, 790, 791, 792, 800, 803, 804, 805, 806,
  // Gen 8
  888, 889, 890, 891, 892, 894, 895, 896, 897, 898,
  // Shadow Rider Calyrex — synthetic forme id (PokeAPI form id 10194); Ice Rider
  // keeps dex 898. See CALYREX_SHADOW_RIDER_ID in pokemon-data.ts.
  10194,
  // Gen 9 (Paradox Pokémon 1009-1023 carry the same legendary encounter flag in-game)
  1001, 1002, 1003, 1004, 1007, 1008, 1009, 1010, 1014, 1015, 1016, 1017, 1020, 1021, 1022, 1023,
  1024,
];

export const MYTHICAL_IDS: readonly number[] = [
  151, // Mew
  251, // Celebi
  385,
  386, // Jirachi, Deoxys
  489,
  490,
  491,
  492,
  493, // Phione, Manaphy, Darkrai, Shaymin, Arceus
  494,
  647,
  648,
  649, // Victini, Keldeo, Meloetta, Genesect
  719,
  720,
  721, // Diancie, Hoopa, Volcanion
  801,
  802,
  807,
  808,
  809, // Magearna, Marshadow, Zeraora, Meltan, Melmetal
  893, // Zarude
  1025, // Pecharunt
];

const LEGENDARY_SET = new Set(LEGENDARY_IDS);
const MYTHICAL_SET = new Set(MYTHICAL_IDS);

export function isLegendary(id: number): boolean {
  return LEGENDARY_SET.has(id);
}

export function isMythical(id: number): boolean {
  return MYTHICAL_SET.has(id);
}

/** True for any Pokémon reserved for Poké-Egg hatching (Legendary or Mythical). */
export function isLegendaryOrMythical(id: number): boolean {
  return LEGENDARY_SET.has(id) || MYTHICAL_SET.has(id);
}

export function legendaryCategory(id: number): LegendaryCategory | null {
  if (LEGENDARY_SET.has(id)) return "legendary";
  if (MYTHICAL_SET.has(id)) return "mythical";
  return null;
}

export const ALL_LEGENDARY_MYTHICAL_IDS: readonly number[] = [...LEGENDARY_IDS, ...MYTHICAL_IDS];

/** Box-art / mascot-tier Legendaries and Mythicals get an extra gold ring on
 * their partner frame, on top of their type-color border. */
const MASCOT_IDS = new Set([
  150, 151, 249, 250, 382, 383, 384, 483, 484, 487, 493, 643, 644, 716, 717, 791, 792, 888, 889,
  1007, 1008,
]);

export function isMascotTier(id: number): boolean {
  return MASCOT_IDS.has(id);
}
