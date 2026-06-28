// Elite 4 + Champion roster. Players face one elite every 5 peak levels.
import type { PokeType } from "./pokemon-data";

export interface EliteMember {
  id: string;
  name: string;
  title: string;
  region: string;
  type: PokeType;
  signaturePokemonId: number;
  signaturePokemonName: string;
  trainerSpriteUrl: string;
  unlockLevel: number;
  quote: string;
}

const SPRITE = (slug: string) => `/trainers/elite/${slug}.png`;

export const ELITE_FOUR: EliteMember[] = [
  {
    id: "lorelei",
    name: "Lorelei",
    title: "Elite Four",
    region: "Kanto",
    type: "ice",
    signaturePokemonId: 131,
    signaturePokemonName: "Lapras",
    trainerSpriteUrl: SPRITE("lorelei"),
    unlockLevel: 5,
    quote: "No one can best me when it comes to icy Pokémon!",
  },
  {
    id: "bruno",
    name: "Bruno",
    title: "Elite Four",
    region: "Kanto",
    type: "fighting",
    signaturePokemonId: 68,
    signaturePokemonName: "Machamp",
    trainerSpriteUrl: SPRITE("bruno"),
    unlockLevel: 10,
    quote: "We will grind you down with our superior power!",
  },
  {
    id: "agatha",
    name: "Agatha",
    title: "Elite Four",
    region: "Kanto",
    type: "ghost",
    signaturePokemonId: 94,
    signaturePokemonName: "Gengar",
    trainerSpriteUrl: SPRITE("agatha"),
    unlockLevel: 15,
    quote: "I'll show you how a real Trainer battles!",
  },
  {
    id: "lance",
    name: "Lance",
    title: "Champion",
    region: "Kanto",
    type: "dragon",
    signaturePokemonId: 149,
    signaturePokemonName: "Dragonite",
    trainerSpriteUrl: SPRITE("lance"),
    unlockLevel: 20,
    quote: "I am the most powerful Trainer of all!",
  },
  {
    id: "will",
    name: "Will",
    title: "Elite Four",
    region: "Johto",
    type: "psychic",
    signaturePokemonId: 178,
    signaturePokemonName: "Xatu",
    trainerSpriteUrl: SPRITE("will"),
    unlockLevel: 25,
    quote: "I have trained all around the world!",
  },
  {
    id: "koga",
    name: "Koga",
    title: "Elite Four",
    region: "Johto",
    type: "poison",
    signaturePokemonId: 169,
    signaturePokemonName: "Crobat",
    trainerSpriteUrl: SPRITE("koga"),
    unlockLevel: 30,
    quote: "Fwahahaha! Prepare for poison!",
  },
  {
    id: "karen",
    name: "Karen",
    title: "Elite Four",
    region: "Johto",
    type: "dark",
    signaturePokemonId: 197,
    signaturePokemonName: "Umbreon",
    trainerSpriteUrl: SPRITE("karen"),
    unlockLevel: 35,
    quote: "Strong Pokémon. Weak Pokémon. That is only the selfish perception of people.",
  },
  {
    id: "sidney",
    name: "Sidney",
    title: "Elite Four",
    region: "Hoenn",
    type: "dark",
    signaturePokemonId: 359,
    signaturePokemonName: "Absol",
    trainerSpriteUrl: SPRITE("sidney"),
    unlockLevel: 40,
    quote:
      "I like that look you're giving me. I guess you'll just naturally use Dark-type Pokémon.",
  },
  {
    id: "phoebe",
    name: "Phoebe",
    title: "Elite Four",
    region: "Hoenn",
    type: "ghost",
    signaturePokemonId: 356,
    signaturePokemonName: "Dusclops",
    trainerSpriteUrl: SPRITE("phoebe"),
    unlockLevel: 45,
    quote: "I trained on Mt. Pyre, where ghostly Pokémon dwell.",
  },
  {
    id: "glacia",
    name: "Glacia",
    title: "Elite Four",
    region: "Hoenn",
    type: "ice",
    signaturePokemonId: 365,
    signaturePokemonName: "Walrein",
    trainerSpriteUrl: SPRITE("glacia"),
    unlockLevel: 50,
    quote: "I have travelled from afar to challenge here.",
  },
  {
    id: "drake",
    name: "Drake",
    title: "Elite Four",
    region: "Hoenn",
    type: "dragon",
    signaturePokemonId: 373,
    signaturePokemonName: "Salamence",
    trainerSpriteUrl: SPRITE("drake"),
    unlockLevel: 55,
    quote: "I am the last of the Pokémon League Elite Four!",
  },
  {
    id: "aaron",
    name: "Aaron",
    title: "Elite Four",
    region: "Sinnoh",
    type: "bug",
    signaturePokemonId: 414,
    signaturePokemonName: "Mothim",
    trainerSpriteUrl: SPRITE("aaron"),
    unlockLevel: 60,
    quote: "Bug Pokémon are awesome and cute!",
  },
  {
    id: "bertha",
    name: "Bertha",
    title: "Elite Four",
    region: "Sinnoh",
    type: "ground",
    signaturePokemonId: 450,
    signaturePokemonName: "Hippowdon",
    trainerSpriteUrl: SPRITE("bertha"),
    unlockLevel: 65,
    quote: "Well, well! You're quite the adorable trainer!",
  },
  {
    id: "flint",
    name: "Flint",
    title: "Elite Four",
    region: "Sinnoh",
    type: "fire",
    signaturePokemonId: 392,
    signaturePokemonName: "Infernape",
    trainerSpriteUrl: SPRITE("flint"),
    unlockLevel: 70,
    quote: "My fiery Pokémon will incinerate all challengers!",
  },
  {
    id: "lucian",
    name: "Lucian",
    title: "Elite Four",
    region: "Sinnoh",
    type: "psychic",
    signaturePokemonId: 475,
    signaturePokemonName: "Gallade",
    trainerSpriteUrl: SPRITE("lucian"),
    unlockLevel: 75,
    quote: "I do believe you are ready. Let me show you the power of Psychic!",
  },
  {
    id: "shauntal",
    name: "Shauntal",
    title: "Elite Four",
    region: "Unova",
    type: "ghost",
    signaturePokemonId: 563,
    signaturePokemonName: "Cofagrigus",
    trainerSpriteUrl: SPRITE("shauntal"),
    unlockLevel: 80,
    quote: "I will write of your defeat in my next novel!",
  },
  {
    id: "marshal",
    name: "Marshal",
    title: "Elite Four",
    region: "Unova",
    type: "fighting",
    signaturePokemonId: 534,
    signaturePokemonName: "Conkeldurr",
    trainerSpriteUrl: SPRITE("marshal"),
    unlockLevel: 85,
    quote: "I shall pursue brute strength with my Pokémon!",
  },
  {
    id: "grimsley",
    name: "Grimsley",
    title: "Elite Four",
    region: "Unova",
    type: "dark",
    signaturePokemonId: 553,
    signaturePokemonName: "Krookodile",
    trainerSpriteUrl: SPRITE("grimsley"),
    unlockLevel: 90,
    quote: "A wager always adds spice to a battle.",
  },
  {
    id: "caitlin",
    name: "Caitlin",
    title: "Elite Four",
    region: "Unova",
    type: "psychic",
    signaturePokemonId: 576,
    signaturePokemonName: "Gothitelle",
    trainerSpriteUrl: SPRITE("caitlin"),
    unlockLevel: 95,
    quote: "My Pokémon and I will battle gracefully!",
  },
  {
    id: "cynthia",
    name: "Cynthia",
    title: "Champion",
    region: "Sinnoh",
    type: "dragon",
    signaturePokemonId: 445,
    signaturePokemonName: "Garchomp",
    trainerSpriteUrl: SPRITE("cynthia"),
    unlockLevel: 100,
    quote: "The strong Pokémon. The weak Pokémon. That is only the selfish perception of people.",
  },
];

const BY_ID = new Map(ELITE_FOUR.map((e) => [e.id, e] as const));

export function getEliteById(id: string): EliteMember | undefined {
  return BY_ID.get(id);
}

/** Returns the next undefeated elite the player has unlocked, or null. */
export function nextPendingElite(peakLevel: number, defeated: string[]): EliteMember | null {
  const done = new Set(defeated);
  for (const e of ELITE_FOUR) {
    if (peakLevel >= e.unlockLevel && !done.has(e.id)) return e;
  }
  return null;
}

export const ELITE_REGIONS = ["Kanto", "Johto", "Hoenn", "Sinnoh", "Unova"];

export function regionCompleted(region: string, defeated: string[]): boolean {
  const done = new Set(defeated);
  return ELITE_FOUR.filter((e) => e.region === region).every((e) => done.has(e.id));
}
