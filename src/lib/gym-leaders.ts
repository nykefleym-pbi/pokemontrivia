import type { PokeType } from "./pokemon-data";

export interface GymLeader {
  id: string;
  name: string;
  region: "Kanto" | "Johto" | "Hoenn" | "Sinnoh" | "Unova";
  type: PokeType;
  signaturePokemonId: number;
  badge: string;
  badgeIconUrl: string;
  quote: string;
  trainerSpriteId: string;
}

const BADGE = (path: string) => `https://archives.bulbagarden.net/media/upload/${path}`;

export const GYM_LEADERS: GymLeader[] = [
  // KANTO
  { id: "brock", name: "Brock", region: "Kanto", type: "rock", signaturePokemonId: 95, badge: "Boulder Badge", badgeIconUrl: BADGE("c/c4/Boulder_Badge.png"), quote: "The best defense is a strong offense! My rocks won't fall easily!", trainerSpriteId: "brock" },
  { id: "misty", name: "Misty", region: "Kanto", type: "water", signaturePokemonId: 121, badge: "Cascade Badge", badgeIconUrl: BADGE("5/53/Cascade_Badge.png"), quote: "My policy is an all-out offensive with water-type Pokémon!", trainerSpriteId: "misty" },
  { id: "lt-surge", name: "Lt. Surge", region: "Kanto", type: "electric", signaturePokemonId: 26, badge: "Thunder Badge", badgeIconUrl: BADGE("0/0c/Thunder_Badge.png"), quote: "I'll show you the real power of electric Pokémon!", trainerSpriteId: "lt-surge" },
  { id: "erika", name: "Erika", region: "Kanto", type: "grass", signaturePokemonId: 45, badge: "Rainbow Badge", badgeIconUrl: BADGE("d/d2/Rainbow_Badge.png"), quote: "My pleasure to meet you... let us have a quick battle.", trainerSpriteId: "erika" },
  { id: "koga", name: "Koga", region: "Kanto", type: "poison", signaturePokemonId: 110, badge: "Soul Badge", badgeIconUrl: BADGE("e/ed/Soul_Badge.png"), quote: "A mere child like you dares to challenge me?", trainerSpriteId: "koga" },
  { id: "sabrina", name: "Sabrina", region: "Kanto", type: "psychic", signaturePokemonId: 65, badge: "Marsh Badge", badgeIconUrl: BADGE("0/0a/Marsh_Badge.png"), quote: "I had a vision of your arrival.", trainerSpriteId: "sabrina" },
  { id: "blaine", name: "Blaine", region: "Kanto", type: "fire", signaturePokemonId: 126, badge: "Volcano Badge", badgeIconUrl: BADGE("9/95/Volcano_Badge.png"), quote: "Hah! I am Blaine! My fiery Pokémon will incinerate all challengers!", trainerSpriteId: "blaine" },
  { id: "giovanni", name: "Giovanni", region: "Kanto", type: "ground", signaturePokemonId: 112, badge: "Earth Badge", badgeIconUrl: BADGE("2/20/Earth_Badge.png"), quote: "So! I must say, I am most impressed you got here.", trainerSpriteId: "giovanni" },
  // JOHTO
  { id: "falkner", name: "Falkner", region: "Johto", type: "flying", signaturePokemonId: 18, badge: "Zephyr Badge", badgeIconUrl: BADGE("6/62/Zephyr_Badge.png"), quote: "I'll show you the real power of the magnificent bird Pokémon!", trainerSpriteId: "falkner" },
  { id: "bugsy", name: "Bugsy", region: "Johto", type: "bug", signaturePokemonId: 123, badge: "Hive Badge", badgeIconUrl: BADGE("9/9b/Hive_Badge.png"), quote: "I never lose when it comes to bug Pokémon.", trainerSpriteId: "bugsy" },
  { id: "whitney", name: "Whitney", region: "Johto", type: "normal", signaturePokemonId: 241, badge: "Plain Badge", badgeIconUrl: BADGE("4/41/Plain_Badge.png"), quote: "Hi! I'm Whitney! Everyone was into Pokémon, so I got into it too!", trainerSpriteId: "whitney" },
  { id: "morty", name: "Morty", region: "Johto", type: "ghost", signaturePokemonId: 94, badge: "Fog Badge", badgeIconUrl: BADGE("d/d4/Fog_Badge.png"), quote: "I see... You possess a great deal of skill.", trainerSpriteId: "morty" },
  { id: "chuck", name: "Chuck", region: "Johto", type: "fighting", signaturePokemonId: 62, badge: "Storm Badge", badgeIconUrl: BADGE("1/19/Storm_Badge.png"), quote: "WAHAHAH! So you've come this far!", trainerSpriteId: "chuck" },
  { id: "jasmine", name: "Jasmine", region: "Johto", type: "steel", signaturePokemonId: 208, badge: "Mineral Badge", badgeIconUrl: BADGE("3/3e/Mineral_Badge.png"), quote: "...You came here for a battle... Forgive me, but I will win.", trainerSpriteId: "jasmine" },
  { id: "pryce", name: "Pryce", region: "Johto", type: "ice", signaturePokemonId: 221, badge: "Glacier Badge", badgeIconUrl: BADGE("4/45/Glacier_Badge.png"), quote: "Pokémon have many experiences in their lives, just as we do.", trainerSpriteId: "pryce" },
  { id: "clair", name: "Clair", region: "Johto", type: "dragon", signaturePokemonId: 230, badge: "Rising Badge", badgeIconUrl: BADGE("9/9b/Rising_Badge.png"), quote: "I am Clair, the world's best dragon master.", trainerSpriteId: "clair" },
  // HOENN
  { id: "roxanne", name: "Roxanne", region: "Hoenn", type: "rock", signaturePokemonId: 299, badge: "Stone Badge", badgeIconUrl: BADGE("9/9e/Stone_Badge.png"), quote: "Allow me to demonstrate the true power of rock Pokémon!", trainerSpriteId: "roxanne" },
  { id: "brawly", name: "Brawly", region: "Hoenn", type: "fighting", signaturePokemonId: 297, badge: "Knuckle Badge", badgeIconUrl: BADGE("d/d3/Knuckle_Badge.png"), quote: "I am Brawly, a wave-riding Pokémon trainer!", trainerSpriteId: "brawly" },
  { id: "wattson", name: "Wattson", region: "Hoenn", type: "electric", signaturePokemonId: 82, badge: "Dynamo Badge", badgeIconUrl: BADGE("2/2c/Dynamo_Badge.png"), quote: "Wahahahah! Welcome, challenger!", trainerSpriteId: "wattson" },
  { id: "flannery", name: "Flannery", region: "Hoenn", type: "fire", signaturePokemonId: 324, badge: "Heat Badge", badgeIconUrl: BADGE("6/65/Heat_Badge.png"), quote: "Welcome! No, wait, I have to do this differently...", trainerSpriteId: "flannery" },
  { id: "norman", name: "Norman", region: "Hoenn", type: "normal", signaturePokemonId: 289, badge: "Balance Badge", badgeIconUrl: BADGE("c/c8/Balance_Badge.png"), quote: "I'm surprised you made it here. I will have to battle you as a gym leader.", trainerSpriteId: "norman" },
  { id: "winona", name: "Winona", region: "Hoenn", type: "flying", signaturePokemonId: 334, badge: "Feather Badge", badgeIconUrl: BADGE("3/3e/Feather_Badge.png"), quote: "I am the leader of Fortree Gym, Winona.", trainerSpriteId: "winona" },
  { id: "tate-liza", name: "Tate & Liza", region: "Hoenn", type: "psychic", signaturePokemonId: 337, badge: "Mind Badge", badgeIconUrl: BADGE("3/38/Mind_Badge.png"), quote: "We're Hoenn's only twin gym leaders! We can decipher what the other is thinking!", trainerSpriteId: "tate-and-liza" },
  { id: "wallace", name: "Wallace", region: "Hoenn", type: "water", signaturePokemonId: 350, badge: "Rain Badge", badgeIconUrl: BADGE("2/24/Rain_Badge.png"), quote: "Welcome, I am Wallace. There's something about you...", trainerSpriteId: "wallace" },
  // SINNOH
  { id: "roark", name: "Roark", region: "Sinnoh", type: "rock", signaturePokemonId: 408, badge: "Coal Badge", badgeIconUrl: BADGE("6/65/Coal_Badge.png"), quote: "I'm not going to let you have your way!", trainerSpriteId: "roark" },
  { id: "gardenia", name: "Gardenia", region: "Sinnoh", type: "grass", signaturePokemonId: 407, badge: "Forest Badge", badgeIconUrl: BADGE("5/55/Forest_Badge.png"), quote: "Anyway, that's enough chitchat. Let's get our battle started!", trainerSpriteId: "gardenia" },
  { id: "maylene", name: "Maylene", region: "Sinnoh", type: "fighting", signaturePokemonId: 448, badge: "Cobble Badge", badgeIconUrl: BADGE("9/96/Cobble_Badge.png"), quote: "I am Maylene, the gym leader of Veilstone.", trainerSpriteId: "maylene" },
  { id: "crasher-wake", name: "Crasher Wake", region: "Sinnoh", type: "water", signaturePokemonId: 419, badge: "Fen Badge", badgeIconUrl: BADGE("c/cd/Fen_Badge.png"), quote: "Crasher Wake! Crasher Wake! I am one with water!", trainerSpriteId: "crasher-wake" },
  { id: "fantina", name: "Fantina", region: "Sinnoh", type: "ghost", signaturePokemonId: 429, badge: "Relic Badge", badgeIconUrl: BADGE("3/3b/Relic_Badge.png"), quote: "Bonjour. I have come from afar to challenge trainers in Sinnoh.", trainerSpriteId: "fantina" },
  { id: "byron", name: "Byron", region: "Sinnoh", type: "steel", signaturePokemonId: 411, badge: "Mine Badge", badgeIconUrl: BADGE("4/49/Mine_Badge.png"), quote: "I am Byron, the gym leader of Canalave!", trainerSpriteId: "byron" },
  { id: "candice", name: "Candice", region: "Sinnoh", type: "ice", signaturePokemonId: 460, badge: "Icicle Badge", badgeIconUrl: BADGE("0/03/Icicle_Badge.png"), quote: "I'm Candice, the gym leader. Bring it on!", trainerSpriteId: "candice" },
  { id: "volkner", name: "Volkner", region: "Sinnoh", type: "electric", signaturePokemonId: 405, badge: "Beacon Badge", badgeIconUrl: BADGE("3/30/Beacon_Badge.png"), quote: "I'm Volkner, the gym leader of Sunyshore.", trainerSpriteId: "volkner" },
  // UNOVA
  { id: "cilan", name: "Cilan", region: "Unova", type: "grass", signaturePokemonId: 511, badge: "Trio Badge", badgeIconUrl: BADGE("8/8b/Trio_Badge.png"), quote: "I will battle you using grass-type Pokémon!", trainerSpriteId: "cilan" },
  { id: "lenora", name: "Lenora", region: "Unova", type: "normal", signaturePokemonId: 505, badge: "Basic Badge", badgeIconUrl: BADGE("8/82/Basic_Badge.png"), quote: "Welcome to my Pokémon gym. I'm Lenora.", trainerSpriteId: "lenora" },
  { id: "burgh", name: "Burgh", region: "Unova", type: "bug", signaturePokemonId: 542, badge: "Insect Badge", badgeIconUrl: BADGE("d/db/Insect_Badge.png"), quote: "I'll be using bug Pokémon, naturally.", trainerSpriteId: "burgh" },
  { id: "elesa", name: "Elesa", region: "Unova", type: "electric", signaturePokemonId: 587, badge: "Bolt Badge", badgeIconUrl: BADGE("0/0a/Bolt_Badge.png"), quote: "Now it's time to brighten up the stage!", trainerSpriteId: "elesa" },
  { id: "clay", name: "Clay", region: "Unova", type: "ground", signaturePokemonId: 530, badge: "Quake Badge", badgeIconUrl: BADGE("d/d6/Quake_Badge.png"), quote: "Now then. We're gonna have us a Pokémon battle.", trainerSpriteId: "clay" },
  { id: "skyla", name: "Skyla", region: "Unova", type: "flying", signaturePokemonId: 581, badge: "Jet Badge", badgeIconUrl: BADGE("c/c8/Jet_Badge.png"), quote: "I'm Skyla, the leader of Mistralton Gym!", trainerSpriteId: "skyla" },
  { id: "brycen", name: "Brycen", region: "Unova", type: "ice", signaturePokemonId: 615, badge: "Freeze Badge", badgeIconUrl: BADGE("c/c8/Freeze_Badge.png"), quote: "I have grown stronger by training in the harsh cold.", trainerSpriteId: "brycen" },
  { id: "drayden", name: "Drayden", region: "Unova", type: "dragon", signaturePokemonId: 612, badge: "Legend Badge", badgeIconUrl: BADGE("d/d9/Legend_Badge.png"), quote: "I'll show you what dragon Pokémon can do.", trainerSpriteId: "drayden" },
  { id: "roxie", name: "Roxie", region: "Unova", type: "poison", signaturePokemonId: 544, badge: "Toxic Badge", badgeIconUrl: BADGE("8/87/Toxic_Badge.png"), quote: "Get ready to feel the venom!", trainerSpriteId: "roxie" },
  { id: "marlon", name: "Marlon", region: "Unova", type: "water", signaturePokemonId: 593, badge: "Wave Badge", badgeIconUrl: BADGE("c/cf/Wave_Badge.png"), quote: "Oh, you're a challenger? I'm Marlon, the gym leader.", trainerSpriteId: "marlon" },
];

export function findGymLeader(id: string | null | undefined): GymLeader | undefined {
  if (!id) return undefined;
  return GYM_LEADERS.find((g) => g.id === id);
}

export function pickRandomGymLeader(defeatedIds: string[]): GymLeader {
  const unbeaten = GYM_LEADERS.filter((g) => !defeatedIds.includes(g.id));
  const pool = unbeaten.length > 0 ? unbeaten : GYM_LEADERS;
  return pool[Math.floor(Math.random() * pool.length)];
}
