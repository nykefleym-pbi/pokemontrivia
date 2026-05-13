// Re-exports the generated all-gen roster and provides helpers.
import { ALL_POKEMON as GENERATED, type PokeEntry, type PokeType } from "./pokemon-data.generated";

export type { PokeEntry, PokeType };
export const ALL_POKEMON: PokeEntry[] = GENERATED;
// Back-compat alias
export const GEN1_POKEMON: PokeEntry[] = GENERATED.filter((p) => p.id <= 151);

export function findPokemon(id: number): PokeEntry | undefined {
  return ALL_POKEMON.find((p) => p.id === id);
}

export function isStartingPartner(p: PokeEntry): boolean {
  return p.evolvesFromId === null;
}

export function getEvolutionTargets(p: PokeEntry): PokeEntry[] {
  return p.evolvesToIds.map((id) => findPokemon(id)).filter(Boolean) as PokeEntry[];
}

export function canEvolve(p: PokeEntry): boolean {
  return p.evolvesToIds.length > 0;
}

export function findPokemonByName(name: string): PokeEntry | undefined {
  const n = name.trim().toLowerCase();
  return ALL_POKEMON.find((p) => p.name.toLowerCase() === n);
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
    typeof optsOrBack === "boolean" ? { back: optsOrBack, shiny: false } : optsOrBack ?? {};
  const back = opts.back ?? false;
  const shiny = opts.shiny ?? false;
  const variant = shiny ? "shiny/" : "";
  if (back) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${variant}${id}.png`;
  }
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`;
}

export function spriteFallbacks(id: number, shiny = false): string[] {
  const variant = shiny ? "shiny/" : "";
  const p = findPokemon(id);
  const slug = p?.slug ?? "";

  let dbPack = "black-white";
  if (id >= 906) dbPack = "scarlet-violet";
  else if (id >= 810) dbPack = "sword-shield";
  else if (id >= 722) dbPack = "sun-moon";
  else if (id >= 650) dbPack = "x-y";

  const list = [
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${variant}${id}.png`,
    `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${variant}${id}.png`,
  ];
  if (slug) {
    list.push(`https://img.pokemondb.net/sprites/${dbPack}/normal/${slug}.png`);
    list.push(`https://img.pokemondb.net/sprites/home/normal/${slug}.png`);
  }
  return list;
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
