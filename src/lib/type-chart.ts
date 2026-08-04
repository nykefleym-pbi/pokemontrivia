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
  // Ground is immune to Electric in the mainline chart. This used to be []
  // (a pre-effectiveness simplification); restored to feed the type-multiplier
  // math and the immune→floor rule (see typeMatchup below).
  electric: ["ground"],
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

// Canonical type resistances (Gen 6+) — the 0.5× band the SE/immunity tables
// above don't cover. Key = attacker type, Value = defender types that take
// HALF damage from it. Together the three tables give the full mainline ladder.
export const TYPE_RESISTANCES: Record<PokeType, PokeType[]> = {
  normal: ["rock", "steel"],
  fire: ["fire", "water", "rock", "dragon"],
  water: ["water", "grass", "dragon"],
  electric: ["electric", "grass", "dragon"],
  grass: ["fire", "grass", "poison", "flying", "bug", "dragon", "steel"],
  ice: ["fire", "water", "ice", "steel"],
  fighting: ["poison", "flying", "psychic", "bug", "fairy"],
  poison: ["poison", "ground", "rock", "ghost"],
  ground: ["grass", "bug"],
  flying: ["electric", "rock", "steel"],
  psychic: ["psychic", "steel"],
  bug: ["fire", "fighting", "poison", "flying", "ghost", "steel", "fairy"],
  rock: ["fighting", "ground", "steel"],
  ghost: ["dark"],
  dragon: ["steel"],
  dark: ["fighting", "dark", "fairy"],
  steel: ["fire", "water", "electric", "steel"],
  fairy: ["fire", "poison", "steel"],
};

/** An immune (0×) roll deals this fraction of normal damage instead of nothing.
 *  Owner ruling 2026-08-04: a bad type roll should sting, never auto-lose the
 *  question — so a true 0× matchup floors here rather than dealing 0. A natural
 *  double-resist (0.25×) already lands on this same value, so the two read the
 *  same to the player. */
export const IMMUNE_FLOOR_MULT = 0.25;

/** The mainline effectiveness of a SINGLE attacking type into a SINGLE defending
 *  type: 0 (immune), 0.5 (resisted), 1 (neutral), or 2 (super-effective). */
export function pairTypeMultiplier(attack: PokeType, defend: PokeType): number {
  if (TYPE_IMMUNITIES[attack]?.includes(defend)) return 0;
  if (TYPE_CHART[attack]?.includes(defend)) return 2;
  if (TYPE_RESISTANCES[attack]?.includes(defend)) return 0.5;
  return 1;
}

/** Small self-contained FNV-1a hash — deliberately NOT imported from engine/rng
 *  to keep this lib module free of any engine dependency (engine/turn.ts imports
 *  THIS file, so importing back would form a cycle). Same shape as hashSeed. */
function seedHash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/**
 * The attacking type a partner "swings with" on a given question. A Pokémon here
 * has no per-move type, so a dual-typed attacker rolls ONE of its two types each
 * question (owner ruling 2026-08-04 — an RNG effect, so the same matchup can read
 * differently question to question). The roll is a deterministic hash of the two
 * type lists and the question index, NOT `Math.random()`: the client's optimistic
 * preview and the server's authoritative recompute both derive the identical type
 * from the identical inputs, so they can never disagree and it can't be gamed.
 */
export function rolledAttackType(
  attackerTypes: PokeType[],
  defenderTypes: PokeType[],
  questionIndex: number,
): PokeType {
  if (attackerTypes.length <= 1) return attackerTypes[0];
  const seed = seedHash(`${attackerTypes.join(",")}>${defenderTypes.join(",")}#${questionIndex}`);
  return attackerTypes[seed % attackerTypes.length];
}

export type EffectivenessBand = "immune" | "resisted" | "neutral" | "super";

export interface TypeMatchup {
  /** The single type rolled for THIS question (see rolledAttackType). */
  attackType: PokeType;
  /** Damage multiplier to apply, immune floored to IMMUNE_FLOOR_MULT. */
  multiplier: number;
  /** The true mainline product (0 possible) — for the feedback band only. */
  rawMultiplier: number;
  band: EffectivenessBand;
}

/**
 * Resolve one question's type matchup: roll the attacker's attacking type, take
 * the mainline product across the defender's type(s) (yielding 0 / 0.25 / 0.5 /
 * 1 / 2 / 4), and floor an immune 0× to IMMUNE_FLOOR_MULT. Pure and deterministic
 * in its inputs — the one source of truth every battle mode's damage calc calls.
 */
export function typeMatchup(
  attackerTypes: PokeType[],
  defenderTypes: PokeType[],
  questionIndex: number,
): TypeMatchup {
  const attackType = rolledAttackType(attackerTypes, defenderTypes, questionIndex);
  let raw = 1;
  for (const d of defenderTypes) raw *= pairTypeMultiplier(attackType, d);
  const band: EffectivenessBand =
    raw === 0 ? "immune" : raw < 1 ? "resisted" : raw > 1 ? "super" : "neutral";
  return { attackType, multiplier: raw === 0 ? IMMUNE_FLOOR_MULT : raw, rawMultiplier: raw, band };
}

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
