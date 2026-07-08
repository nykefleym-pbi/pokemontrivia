// Re-exports the generated all-gen roster and provides helpers.
import { ALL_POKEMON as GENERATED, type PokeEntry, type PokeType } from "./pokemon-data.generated";

export type { PokeEntry, PokeType };

/**
 * Synthetic dex ids for alternate formes that share a National Dex number in
 * mainline but need to be independently hatchable/partnerable roster entries.
 *
 * PRECEDENT (set here): the generated species dataset (pokemon-data.generated.ts)
 * is one-entry-per-National-Dex-number and must not be hand-edited. When a forme
 * needs its own roster identity, we mint a synthetic id equal to PokeAPI's own
 * *form* id (the 10000-block), which conveniently already resolves to a real
 * sprite at `.../sprites/pokemon/<formId>.png`, so `spriteUrl()` needs no special
 * casing. The base dex number keeps the "default" forme.
 *
 * First (and currently only) case: Calyrex. Dex 898 stays bound to ICE RIDER
 * Calyrex (Glacial Lance / As One — Glacial Reign, unchanged). Shadow Rider
 * Calyrex is minted here as id 10194 (PokeAPI's calyrex-shadow form id) with its
 * own name/types/sprite and its own signature ability (Astral Barrage / As One —
 * Spectral Reign). Both are separate hatchable entries.
 */
export const CALYREX_SHADOW_RIDER_ID = 10194;

const SYNTHETIC_FORME_ENTRIES: PokeEntry[] = [
  {
    id: CALYREX_SHADOW_RIDER_ID,
    slug: "calyrex-shadow",
    name: "Shadow Rider Calyrex",
    types: ["psychic", "ghost"],
    evolvesFromId: null,
    evolvesToIds: [],
    evolutionStage: 1,
    isFullyEvolved: true,
  },
];

export const ALL_POKEMON: PokeEntry[] = [...GENERATED, ...SYNTHETIC_FORME_ENTRIES];
// Back-compat alias
export const GEN1_POKEMON: PokeEntry[] = GENERATED.filter((p) => p.id <= 151);

const _byId = new Map<number, PokeEntry>(ALL_POKEMON.map((p) => [p.id, p]));
const _byName = new Map<string, PokeEntry>(ALL_POKEMON.map((p) => [p.name.toLowerCase(), p]));

export function findPokemon(id: number): PokeEntry | undefined {
  return _byId.get(id);
}

export function isStartingPartner(p: PokeEntry): boolean {
  return p.evolvesFromId === null;
}

export function getEvolutionTargets(p: PokeEntry | null | undefined): PokeEntry[] {
  return (p?.evolvesToIds ?? []).map((id) => findPokemon(id)).filter(Boolean) as PokeEntry[];
}

export function canEvolve(p: PokeEntry | null | undefined): boolean {
  return (p?.evolvesToIds?.length ?? 0) > 0;
}

/** Re-sync a persisted partner with the current ALL_POKEMON entry so legacy
 *  saves pick up new fields (evolvesToIds, evolvesFromId, evolutionStage). */
export function rehydratePokemon(p: PokeEntry | null | undefined): PokeEntry | null {
  if (!p) return null;
  const fresh = findPokemon(p.id);
  if (fresh) return { ...fresh };
  return {
    ...p,
    types: p.types ?? [],
    evolvesFromId: p.evolvesFromId ?? null,
    evolvesToIds: p.evolvesToIds ?? [],
    evolutionStage: p.evolutionStage ?? 1,
  } as PokeEntry;
}

export function findPokemonByName(name: string): PokeEntry | undefined {
  return _byName.get(name.trim().toLowerCase());
}

export function searchPokemon(query: string, limit = 9): PokeEntry[] {
  if (!query.trim()) return ALL_POKEMON.slice(0, limit);
  const q = query.toLowerCase();
  return ALL_POKEMON.filter((p) => p.name.toLowerCase().includes(q)).slice(0, limit);
}

// PokeAPI sprites mirror — single template covers all Gens 1–9.
export function spriteUrl(
  id: number,
  optsOrBack?: boolean | { back?: boolean; shiny?: boolean },
): string {
  const opts =
    typeof optsOrBack === "boolean" ? { back: optsOrBack, shiny: false } : (optsOrBack ?? {});
  const back = opts.back ?? false;
  const shiny = opts.shiny ?? false;
  const variant = shiny ? "shiny/" : "";
  if (back) {
    return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/back/${variant}${id}.png`;
  }
  return `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${variant}${id}.png`;
}

export function spriteFallbacks(id: number, shiny = false): string[] {
  const variant = shiny ? "shiny/" : "";
  // jsDelivr mirrors the PokeAPI sprites repo on a real CDN with CORS enabled;
  // raw.githubusercontent stays as fallback (it rate-limits with 429s under
  // shared IPs). img.pokemondb.net was dropped: it sends no
  // Access-Control-Allow-Origin header, so it can never load into an image
  // element that sets crossOrigin="anonymous".
  return [
    `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${variant}${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`,
    `https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/other/official-artwork/${variant}${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${variant}${id}.png`,
  ];
}

// Type effectiveness — attacker -> list of types it's super effective against (Gen 6+ chart, simplified).
export const TYPE_CHART: Record<PokeType, PokeType[]> = {
  normal: [],
  fire: ["grass", "ice", "bug", "steel"],
  water: ["fire", "ground", "rock"],
  electric: ["water", "flying"],
  grass: ["water", "ground", "rock"],
  ice: ["grass", "ground", "flying", "dragon"],
  fighting: ["normal", "ice", "rock", "dark", "steel"],
  poison: ["grass", "fairy"],
  ground: ["fire", "electric", "poison", "rock", "steel"],
  flying: ["grass", "fighting", "bug"],
  psychic: ["fighting", "poison"],
  bug: ["grass", "psychic", "dark"],
  rock: ["fire", "ice", "flying", "bug"],
  ghost: ["psychic", "ghost"],
  dragon: ["dragon"],
  dark: ["psychic", "ghost"],
  steel: ["ice", "rock", "fairy"],
  fairy: ["fighting", "dragon", "dark"],
};

export function isSuperEffective(attacker: PokeEntry, defender: PokeEntry): boolean {
  for (const aType of attacker.types) {
    for (const dType of defender.types) {
      if (TYPE_CHART[aType]?.includes(dType)) return true;
    }
  }
  return false;
}

// Canonical type immunities (Gen 6+).
// Key = attacker type, Value = defender types it CANNOT damage at all (0× damage).
export const TYPE_IMMUNITIES: Record<PokeType, PokeType[]> = {
  normal: ["ghost"],
  fighting: ["ghost"],
  poison: ["steel"],
  ground: ["flying"],
  ghost: ["normal"],
  electric: [],
  psychic: ["dark"],
  dragon: ["fairy"],
  fire: [],
  water: [],
  grass: [],
  ice: [],
  flying: [],
  bug: [],
  rock: [],
  dark: [],
  steel: [],
  fairy: [],
};

/** Returns true if enemy has ANY type that's super-effective against ANY of the player's types. */
export function isPlayerDisadvantaged(playerPokemon: PokeEntry, enemyPokemon: PokeEntry): boolean {
  for (const eType of enemyPokemon.types) {
    for (const pType of playerPokemon.types) {
      if (TYPE_CHART[eType]?.includes(pType)) return true;
    }
  }
  return false;
}

/** Returns true if NONE of the enemy's types can damage ANY of the player's types. */
export function isPlayerImmune(playerPokemon: PokeEntry, enemyPokemon: PokeEntry): boolean {
  for (const eType of enemyPokemon.types) {
    const immunityList = TYPE_IMMUNITIES[eType] ?? [];
    const playerHasImmunity = playerPokemon.types.some((pType) => immunityList.includes(pType));
    if (!playerHasImmunity) return false;
  }
  return true;
}

/** Pre-filtered list of strict-stage-1 Pokémon (those with evolvesFromId === null).
 *  Use this directly instead of calling ALL_POKEMON.filter(isStartingPartner) at render time. */
export const STARTING_PARTNERS: PokeEntry[] = ALL_POKEMON.filter(isStartingPartner);
