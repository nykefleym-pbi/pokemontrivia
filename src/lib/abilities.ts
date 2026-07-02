import type { PokeType } from "./pokemon-data";

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

export interface Ability {
  id: AbilityId;
  name: string;
  description: string;
  type: PokeType;
}

// Three abilities per type. A partner ROLLS one of its primary type's three at
// onboarding (and re-rolls when the partner or its primary type changes).
// Numbers are simulation-balanced (20k+ trials/ability at 70% accuracy across
// L16-25 and L26-50 regular battles, with the real matchup mix) so every roll
// lands in roughly the same win-rate band and no ability is a strictly worse
// pick. Index 0 is the legacy ability — existing saves without a stored roll
// resolve to it.
export const ABILITY_SETS: Record<PokeType, [Ability, Ability, Ability]> = {
  normal: [
    {
      id: "adaptable",
      name: "Adaptable",
      type: "normal",
      description: "Starts with 105 HP instead of 100.",
    },
    {
      id: "pickup",
      name: "Pickup",
      type: "normal",
      description: "Earns 25% more coins from battles.",
    },
    {
      id: "even-tempo",
      name: "Even Tempo",
      type: "normal",
      description: "+2 damage on neutral type matchups.",
    },
  ],
  fire: [
    {
      id: "flame-body",
      name: "Flame Body",
      type: "fire",
      description: "15% chance to ignore wrong-answer damage entirely.",
    },
    {
      id: "blaze",
      name: "Blaze",
      type: "fire",
      description: "+20% damage while below 40% HP.",
    },
    {
      id: "flash-fire",
      name: "Flash Fire",
      type: "fire",
      description: "All correct answers deal +8% damage.",
    },
  ],
  water: [
    {
      id: "hydration",
      name: "Hydration",
      type: "water",
      description: "Auto-cures the first Confused status of every battle.",
    },
    {
      id: "torrent",
      name: "Torrent",
      type: "water",
      description: "Heals 10 HP the first time you drop below 30% HP each battle.",
    },
    {
      id: "swift-swim",
      name: "Swift Swim",
      type: "water",
      description: "Speed bonus is never lower than 3.",
    },
  ],
  electric: [
    {
      id: "static",
      name: "Static",
      type: "electric",
      description: "Wrong-answer damage is halved 20% of the time.",
    },
    {
      id: "volt-absorb",
      name: "Volt Absorb",
      type: "electric",
      description: "Answers within 5 seconds deal +3 damage.",
    },
    {
      id: "charge",
      name: "Charge",
      type: "electric",
      description: "Every correct answer deals +2 damage.",
    },
  ],
  grass: [
    {
      id: "leech-seed",
      name: "Leech Seed",
      type: "grass",
      description: "Heals 2 HP for every correct answer.",
    },
    {
      id: "synthesis",
      name: "Synthesis",
      type: "grass",
      description: "Potions and Super Potions heal 50% more.",
    },
    {
      id: "overgrow",
      name: "Overgrow",
      type: "grass",
      description: "+12% damage while the enemy is above half HP.",
    },
  ],
  ice: [
    {
      id: "snow-cloak",
      name: "Snow Cloak",
      type: "ice",
      description: "The first wrong answer of every battle deals 0 damage.",
    },
    {
      id: "ice-body",
      name: "Ice Body",
      type: "ice",
      description: "Heals 6 HP every 4th correct answer.",
    },
    {
      id: "slush-rush",
      name: "Slush Rush",
      type: "ice",
      description: "Wrong-answer damage is reduced by 5 when type-disadvantaged.",
    },
  ],
  fighting: [
    {
      id: "guts",
      name: "Guts",
      type: "fighting",
      description: "Correct answers deal +15% damage when below 50% HP.",
    },
    {
      id: "no-guard",
      name: "No Guard",
      type: "fighting",
      description: "+18% damage on every correct answer, but wrong answers hit 2 harder.",
    },
    {
      id: "counter",
      name: "Counter",
      type: "fighting",
      description: "The correct answer right after a wrong one deals +4 damage.",
    },
  ],
  poison: [
    {
      id: "toxic",
      name: "Toxic",
      type: "poison",
      description: "Immune to Poisoned, and Confused cures after 1 correct answer.",
    },
    {
      id: "corrosion",
      name: "Corrosion",
      type: "poison",
      description: "Wrong answers still deal 2 damage to the enemy.",
    },
    {
      id: "poison-touch",
      name: "Poison Touch",
      type: "poison",
      description: "Correct answers poison the enemy for 2 extra damage on the next question.",
    },
  ],
  ground: [
    {
      id: "sand-veil",
      name: "Sand Veil",
      type: "ground",
      description: "+2 seconds added to every question timer.",
    },
    {
      id: "sand-force",
      name: "Sand Force",
      type: "ground",
      description: "The first two wrong answers each battle don't reset your streak.",
    },
    {
      id: "bulldoze",
      name: "Bulldoze",
      type: "ground",
      description: "+25% damage when type-disadvantaged.",
    },
  ],
  flying: [
    {
      id: "tailwind",
      name: "Tailwind",
      type: "flying",
      description: "+20% damage on the first 3 questions of every battle.",
    },
    {
      id: "aerilate",
      name: "Aerilate",
      type: "flying",
      description: "Speed bonuses are 50% bigger.",
    },
    {
      id: "acrobatics",
      name: "Acrobatics",
      type: "flying",
      description: "+30% damage while at full HP.",
    },
  ],
  psychic: [
    {
      id: "foresight",
      name: "Foresight",
      type: "psychic",
      description: "Reveals one wrong option for free on every 5th question.",
    },
    {
      id: "magic-guard",
      name: "Magic Guard",
      type: "psychic",
      description: "Statuses deal no HP damage.",
    },
    {
      id: "amnesia",
      name: "Amnesia",
      type: "psychic",
      description: "Confused and Poisoned need one extra wrong answer to trigger.",
    },
  ],
  bug: [
    {
      id: "compound-eyes",
      name: "Compound Eyes",
      type: "bug",
      description: "Auto-reveals a wrong option on the first and last question of every set.",
    },
    {
      id: "shield-dust",
      name: "Shield Dust",
      type: "bug",
      description: "Immune to the Confused status.",
    },
    {
      id: "swarm",
      name: "Swarm",
      type: "bug",
      description: "+3 damage while on a 3-streak or higher.",
    },
  ],
  rock: [
    {
      id: "sturdy",
      name: "Sturdy",
      type: "rock",
      description: "Survives the first otherwise-fatal hit at 1 HP. Once per battle.",
    },
    {
      id: "solid-rock",
      name: "Solid Rock",
      type: "rock",
      description: "No single hit can deal more than 12 damage.",
    },
    {
      id: "stealth-rock",
      name: "Stealth Rock",
      type: "rock",
      description: "The enemy takes 3 damage at the start of every 5-question round.",
    },
  ],
  ghost: [
    {
      id: "cursed-body",
      name: "Cursed Body",
      type: "ghost",
      description:
        "Wrong answers heal back fully if the next question is answered correctly within 5 seconds.",
    },
    {
      id: "shadow-tag",
      name: "Shadow Tag",
      type: "ghost",
      description: "The enemy loses 2 HP whenever you take damage.",
    },
    {
      id: "hex",
      name: "Hex",
      type: "ghost",
      description: "+30% damage while you are Confused or Poisoned.",
    },
  ],
  dragon: [
    {
      id: "multiscale",
      name: "Multiscale",
      type: "dragon",
      description: "Wrong-answer damage is halved while at full HP.",
    },
    {
      id: "berserk",
      name: "Berserk",
      type: "dragon",
      description: "+12% damage after your first wrong answer of the battle.",
    },
    {
      id: "dragon-dance",
      name: "Dragon Dance",
      type: "dragon",
      description: "Base damage grows by +1 with every 5-question round.",
    },
  ],
  dark: [
    {
      id: "intimidate",
      name: "Intimidate",
      type: "dark",
      description: "The enemy starts at 90% HP instead of 100%.",
    },
    {
      id: "moxie",
      name: "Moxie",
      type: "dark",
      description: "+1 permanent damage each time you reach a 3-streak (stacks all battle).",
    },
    {
      id: "dark-aura",
      name: "Dark Aura",
      type: "dark",
      description: "+10% damage in Elite Four and Weekly League battles.",
    },
  ],
  steel: [
    {
      id: "filter",
      name: "Filter",
      type: "steel",
      description: "Reduces super-effective wrong-answer damage by 25%.",
    },
    {
      id: "iron-barbs",
      name: "Iron Barbs",
      type: "steel",
      description: "All wrong-answer damage is reduced by 3.",
    },
    {
      id: "metalworks",
      name: "Metalworks",
      type: "steel",
      description: "Shop items cost 10% less.",
    },
  ],
  fairy: [
    {
      id: "cute-charm",
      name: "Cute Charm",
      type: "fairy",
      description: "15% chance to ignore wrong-answer damage entirely.",
    },
    {
      id: "pixie-dust",
      name: "Pixie Dust",
      type: "fairy",
      description: "Heals 5 HP every time you reach a 3-streak.",
    },
    {
      id: "moonblast",
      name: "Moonblast",
      type: "fairy",
      description: "+4 damage while on a 3-streak or higher.",
    },
  ],
};

const BY_ID: Map<AbilityId, Ability> = new Map(
  Object.values(ABILITY_SETS)
    .flat()
    .map((a) => [a.id, a]),
);

export function getAbilityById(id: AbilityId | null | undefined): Ability | null {
  return (id && BY_ID.get(id)) || null;
}

/** Randomly roll one of the primary type's three abilities. */
export function rollAbilityId(pokemonTypes: PokeType[]): AbilityId {
  const setFor = ABILITY_SETS[pokemonTypes[0]];
  return setFor[Math.floor(Math.random() * setFor.length)].id;
}

/**
 * Resolve the partner's ability: the stored roll if present, otherwise the
 * primary type's legacy (first) ability — existing saves keep exactly the
 * ability they've always had.
 */
export function getAbility(pokemonTypes: PokeType[], abilityId?: AbilityId | null): Ability {
  const stored = getAbilityById(abilityId);
  if (stored) return stored;
  return ABILITY_SETS[pokemonTypes[0]][0];
}
