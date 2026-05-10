// Re-exports the generated all-gen roster and provides helpers.
import { ALL_POKEMON as GENERATED, type PokeEntry, type PokeType } from "./pokemon-data.generated";

export type { PokeEntry, PokeType };
export const ALL_POKEMON: PokeEntry[] = GENERATED;
// Back-compat alias
export const GEN1_POKEMON: PokeEntry[] = GENERATED.filter((p) => p.id <= 151);

export function findPokemon(id: number): PokeEntry | undefined {
  return ALL_POKEMON.find((p) => p.id === id);
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

// Sprite URL: pokemondb for front sprites; PokeAPI Showdown for backs.
// Backward-compatible: spriteUrl(id, true) still works (= back sprite).
export function spriteUrl(
  id: number,
  optsOrBack?: boolean | { back?: boolean; shiny?: boolean },
): string {
  const opts =
    typeof optsOrBack === "boolean" ? { back: optsOrBack, shiny: false } : optsOrBack ?? {};
  const back = opts.back ?? false;
  const shiny = opts.shiny ?? false;
  const p = findPokemon(id);
  if (!p) return "";
  const variant = shiny ? "shiny/" : "";
  if (back) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/back/${variant}${id}.png`;
  }
  if (shiny) {
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`;
  }
  // pokemondb black-white pack covers Gen 1–5; scarlet-violet covers later.
  const pack = id <= 649 ? "black-white" : "scarlet-violet";
  return `https://img.pokemondb.net/sprites/${pack}/normal/${p.slug}.png`;
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
