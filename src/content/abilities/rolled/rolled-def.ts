// Base rollable partner abilities (non-legendary). One file per ability; a
// partner rolls one of its primary type's three at onboarding. Generated once
// from lib/abilities.ts by scripts/gen-rolled-content.ts — lib/abilities.ts is
// now a re-export bridge over this registry so its import surface (AbilityId,
// Ability, ABILITY_SETS, getAbility*, rollAbilityId) stays unchanged for
// existing consumers.
import type { PokeType } from "../../../lib/pokemon-data";

export interface RolledAbilityDef {
  id: AbilityId;
  name: string;
  type: PokeType;
  description: string;
  /** Position within its type's 3-ability roll set. Slot 0 is the legacy
   *  ability — existing saves without a stored roll resolve to it. */
  slot: 0 | 1 | 2;
}

export type AbilityId =
  // set 1 (original — some retuned)
  | "adaptable"
  | "flame-body"
  | "hydration"
  | "static"
  | "leech-seed"
  | "snow-cloak"
  | "guts"
  | "toxic"
  | "sand-veil"
  | "tailwind"
  | "foresight"
  | "compound-eyes"
  | "sturdy"
  | "cursed-body"
  | "multiscale"
  | "intimidate"
  | "filter"
  | "cute-charm"
  // set 2
  | "pickup"
  | "blaze"
  | "torrent"
  | "volt-absorb"
  | "synthesis"
  | "ice-body"
  | "no-guard"
  | "corrosion"
  | "sand-force"
  | "aerilate"
  | "magic-guard"
  | "shield-dust"
  | "solid-rock"
  | "shadow-tag"
  | "berserk"
  | "moxie"
  | "iron-barbs"
  | "pixie-dust"
  // set 3
  | "even-tempo"
  | "flash-fire"
  | "swift-swim"
  | "charge"
  | "overgrow"
  | "slush-rush"
  | "counter"
  | "poison-touch"
  | "bulldoze"
  | "acrobatics"
  | "amnesia"
  | "swarm"
  | "stealth-rock"
  | "hex"
  | "dragon-dance"
  | "dark-aura"
  | "metalworks"
  | "moonblast";
