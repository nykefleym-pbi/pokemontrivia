// Type-effectiveness/immunity math. Split out of pokemon-data.ts (which
// re-exports everything here for existing callers) so engine/turn.ts and
// engine/solo-battle-config.ts can resolve a matchup from two type arrays
// without pulling in the ~1000-entry generated Pokédex those functions never
// touch — they only ever read `.types`. Keep this file free of any import
// from pokemon-data(.generated).ts's runtime values (the `PokeType` import
// below is type-only and erased, so it costs nothing at runtime).
import type { PokeType } from "./pokemon-data.generated";

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

/** Any matchup participant this module cares about — just its types.
 *  A full PokeEntry satisfies this structurally, unchanged. */
export interface Typed {
  types: PokeType[];
}

export function isSuperEffective(attacker: Typed, defender: Typed): boolean {
  for (const aType of attacker.types) {
    for (const dType of defender.types) {
      if (TYPE_CHART[aType]?.includes(dType)) return true;
    }
  }
  return false;
}

/** Returns true if enemy has ANY type that's super-effective against ANY of the player's types. */
export function isPlayerDisadvantaged(playerPokemon: Typed, enemyPokemon: Typed): boolean {
  for (const eType of enemyPokemon.types) {
    for (const pType of playerPokemon.types) {
      if (TYPE_CHART[eType]?.includes(pType)) return true;
    }
  }
  return false;
}

/** Returns true if NONE of the enemy's types can damage ANY of the player's types. */
export function isPlayerImmune(playerPokemon: Typed, enemyPokemon: Typed): boolean {
  for (const eType of enemyPokemon.types) {
    const immunityList = TYPE_IMMUNITIES[eType] ?? [];
    const playerHasImmunity = playerPokemon.types.some((pType) => immunityList.includes(pType));
    if (!playerHasImmunity) return false;
  }
  return true;
}
