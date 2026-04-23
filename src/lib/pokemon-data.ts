// Gen 1 Pokémon roster (id, name, primary type, secondary type)
export type PokeType =
  | "normal" | "fire" | "water" | "electric" | "grass" | "ice"
  | "fighting" | "poison" | "ground" | "flying" | "psychic"
  | "bug" | "rock" | "ghost" | "dragon";

export interface PokeEntry {
  id: number;
  name: string;
  types: PokeType[];
}

export const GEN1_POKEMON: PokeEntry[] = [
  { id: 1, name: "Bulbasaur", types: ["grass", "poison"] },
  { id: 2, name: "Ivysaur", types: ["grass", "poison"] },
  { id: 3, name: "Venusaur", types: ["grass", "poison"] },
  { id: 4, name: "Charmander", types: ["fire"] },
  { id: 5, name: "Charmeleon", types: ["fire"] },
  { id: 6, name: "Charizard", types: ["fire", "flying"] },
  { id: 7, name: "Squirtle", types: ["water"] },
  { id: 8, name: "Wartortle", types: ["water"] },
  { id: 9, name: "Blastoise", types: ["water"] },
  { id: 10, name: "Caterpie", types: ["bug"] },
  { id: 11, name: "Metapod", types: ["bug"] },
  { id: 12, name: "Butterfree", types: ["bug", "flying"] },
  { id: 13, name: "Weedle", types: ["bug", "poison"] },
  { id: 14, name: "Kakuna", types: ["bug", "poison"] },
  { id: 15, name: "Beedrill", types: ["bug", "poison"] },
  { id: 16, name: "Pidgey", types: ["normal", "flying"] },
  { id: 17, name: "Pidgeotto", types: ["normal", "flying"] },
  { id: 18, name: "Pidgeot", types: ["normal", "flying"] },
  { id: 19, name: "Rattata", types: ["normal"] },
  { id: 20, name: "Raticate", types: ["normal"] },
  { id: 21, name: "Spearow", types: ["normal", "flying"] },
  { id: 22, name: "Fearow", types: ["normal", "flying"] },
  { id: 23, name: "Ekans", types: ["poison"] },
  { id: 24, name: "Arbok", types: ["poison"] },
  { id: 25, name: "Pikachu", types: ["electric"] },
  { id: 26, name: "Raichu", types: ["electric"] },
  { id: 27, name: "Sandshrew", types: ["ground"] },
  { id: 28, name: "Sandslash", types: ["ground"] },
  { id: 29, name: "Nidoran♀", types: ["poison"] },
  { id: 30, name: "Nidorina", types: ["poison"] },
  { id: 31, name: "Nidoqueen", types: ["poison", "ground"] },
  { id: 32, name: "Nidoran♂", types: ["poison"] },
  { id: 33, name: "Nidorino", types: ["poison"] },
  { id: 34, name: "Nidoking", types: ["poison", "ground"] },
  { id: 35, name: "Clefairy", types: ["normal"] },
  { id: 36, name: "Clefable", types: ["normal"] },
  { id: 37, name: "Vulpix", types: ["fire"] },
  { id: 38, name: "Ninetales", types: ["fire"] },
  { id: 39, name: "Jigglypuff", types: ["normal"] },
  { id: 40, name: "Wigglytuff", types: ["normal"] },
  { id: 41, name: "Zubat", types: ["poison", "flying"] },
  { id: 42, name: "Golbat", types: ["poison", "flying"] },
  { id: 43, name: "Oddish", types: ["grass", "poison"] },
  { id: 44, name: "Gloom", types: ["grass", "poison"] },
  { id: 45, name: "Vileplume", types: ["grass", "poison"] },
  { id: 46, name: "Paras", types: ["bug", "grass"] },
  { id: 47, name: "Parasect", types: ["bug", "grass"] },
  { id: 48, name: "Venonat", types: ["bug", "poison"] },
  { id: 49, name: "Venomoth", types: ["bug", "poison"] },
  { id: 50, name: "Diglett", types: ["ground"] },
  { id: 51, name: "Dugtrio", types: ["ground"] },
  { id: 52, name: "Meowth", types: ["normal"] },
  { id: 53, name: "Persian", types: ["normal"] },
  { id: 54, name: "Psyduck", types: ["water"] },
  { id: 55, name: "Golduck", types: ["water"] },
  { id: 56, name: "Mankey", types: ["fighting"] },
  { id: 57, name: "Primeape", types: ["fighting"] },
  { id: 58, name: "Growlithe", types: ["fire"] },
  { id: 59, name: "Arcanine", types: ["fire"] },
  { id: 60, name: "Poliwag", types: ["water"] },
  { id: 61, name: "Poliwhirl", types: ["water"] },
  { id: 62, name: "Poliwrath", types: ["water", "fighting"] },
  { id: 63, name: "Abra", types: ["psychic"] },
  { id: 64, name: "Kadabra", types: ["psychic"] },
  { id: 65, name: "Alakazam", types: ["psychic"] },
  { id: 66, name: "Machop", types: ["fighting"] },
  { id: 67, name: "Machoke", types: ["fighting"] },
  { id: 68, name: "Machamp", types: ["fighting"] },
  { id: 69, name: "Bellsprout", types: ["grass", "poison"] },
  { id: 70, name: "Weepinbell", types: ["grass", "poison"] },
  { id: 71, name: "Victreebel", types: ["grass", "poison"] },
  { id: 72, name: "Tentacool", types: ["water", "poison"] },
  { id: 73, name: "Tentacruel", types: ["water", "poison"] },
  { id: 74, name: "Geodude", types: ["rock", "ground"] },
  { id: 75, name: "Graveler", types: ["rock", "ground"] },
  { id: 76, name: "Golem", types: ["rock", "ground"] },
  { id: 77, name: "Ponyta", types: ["fire"] },
  { id: 78, name: "Rapidash", types: ["fire"] },
  { id: 79, name: "Slowpoke", types: ["water", "psychic"] },
  { id: 80, name: "Slowbro", types: ["water", "psychic"] },
  { id: 81, name: "Magnemite", types: ["electric"] },
  { id: 82, name: "Magneton", types: ["electric"] },
  { id: 83, name: "Farfetch'd", types: ["normal", "flying"] },
  { id: 84, name: "Doduo", types: ["normal", "flying"] },
  { id: 85, name: "Dodrio", types: ["normal", "flying"] },
  { id: 86, name: "Seel", types: ["water"] },
  { id: 87, name: "Dewgong", types: ["water", "ice"] },
  { id: 88, name: "Grimer", types: ["poison"] },
  { id: 89, name: "Muk", types: ["poison"] },
  { id: 90, name: "Shellder", types: ["water"] },
  { id: 91, name: "Cloyster", types: ["water", "ice"] },
  { id: 92, name: "Gastly", types: ["ghost", "poison"] },
  { id: 93, name: "Haunter", types: ["ghost", "poison"] },
  { id: 94, name: "Gengar", types: ["ghost", "poison"] },
  { id: 95, name: "Onix", types: ["rock", "ground"] },
  { id: 96, name: "Drowzee", types: ["psychic"] },
  { id: 97, name: "Hypno", types: ["psychic"] },
  { id: 98, name: "Krabby", types: ["water"] },
  { id: 99, name: "Kingler", types: ["water"] },
  { id: 100, name: "Voltorb", types: ["electric"] },
  { id: 101, name: "Electrode", types: ["electric"] },
  { id: 102, name: "Exeggcute", types: ["grass", "psychic"] },
  { id: 103, name: "Exeggutor", types: ["grass", "psychic"] },
  { id: 104, name: "Cubone", types: ["ground"] },
  { id: 105, name: "Marowak", types: ["ground"] },
  { id: 106, name: "Hitmonlee", types: ["fighting"] },
  { id: 107, name: "Hitmonchan", types: ["fighting"] },
  { id: 108, name: "Lickitung", types: ["normal"] },
  { id: 109, name: "Koffing", types: ["poison"] },
  { id: 110, name: "Weezing", types: ["poison"] },
  { id: 111, name: "Rhyhorn", types: ["ground", "rock"] },
  { id: 112, name: "Rhydon", types: ["ground", "rock"] },
  { id: 113, name: "Chansey", types: ["normal"] },
  { id: 114, name: "Tangela", types: ["grass"] },
  { id: 115, name: "Kangaskhan", types: ["normal"] },
  { id: 116, name: "Horsea", types: ["water"] },
  { id: 117, name: "Seadra", types: ["water"] },
  { id: 118, name: "Goldeen", types: ["water"] },
  { id: 119, name: "Seaking", types: ["water"] },
  { id: 120, name: "Staryu", types: ["water"] },
  { id: 121, name: "Starmie", types: ["water", "psychic"] },
  { id: 122, name: "Mr. Mime", types: ["psychic"] },
  { id: 123, name: "Scyther", types: ["bug", "flying"] },
  { id: 124, name: "Jynx", types: ["ice", "psychic"] },
  { id: 125, name: "Electabuzz", types: ["electric"] },
  { id: 126, name: "Magmar", types: ["fire"] },
  { id: 127, name: "Pinsir", types: ["bug"] },
  { id: 128, name: "Tauros", types: ["normal"] },
  { id: 129, name: "Magikarp", types: ["water"] },
  { id: 130, name: "Gyarados", types: ["water", "flying"] },
  { id: 131, name: "Lapras", types: ["water", "ice"] },
  { id: 132, name: "Ditto", types: ["normal"] },
  { id: 133, name: "Eevee", types: ["normal"] },
  { id: 134, name: "Vaporeon", types: ["water"] },
  { id: 135, name: "Jolteon", types: ["electric"] },
  { id: 136, name: "Flareon", types: ["fire"] },
  { id: 137, name: "Porygon", types: ["normal"] },
  { id: 138, name: "Omanyte", types: ["rock", "water"] },
  { id: 139, name: "Omastar", types: ["rock", "water"] },
  { id: 140, name: "Kabuto", types: ["rock", "water"] },
  { id: 141, name: "Kabutops", types: ["rock", "water"] },
  { id: 142, name: "Aerodactyl", types: ["rock", "flying"] },
  { id: 143, name: "Snorlax", types: ["normal"] },
  { id: 144, name: "Articuno", types: ["ice", "flying"] },
  { id: 145, name: "Zapdos", types: ["electric", "flying"] },
  { id: 146, name: "Moltres", types: ["fire", "flying"] },
  { id: 147, name: "Dratini", types: ["dragon"] },
  { id: 148, name: "Dragonair", types: ["dragon"] },
  { id: 149, name: "Dragonite", types: ["dragon", "flying"] },
  { id: 150, name: "Mewtwo", types: ["psychic"] },
  { id: 151, name: "Mew", types: ["psychic"] },
];

// Type effectiveness — attacker -> list of types it's super effective against
export const TYPE_CHART: Record<PokeType, PokeType[]> = {
  normal: [],
  fire: ["grass", "ice", "bug"],
  water: ["fire", "ground", "rock"],
  electric: ["water", "flying"],
  grass: ["water", "ground", "rock"],
  ice: ["grass", "ground", "flying", "dragon"],
  fighting: ["normal", "ice", "rock"],
  poison: ["grass", "bug"],
  ground: ["fire", "electric", "poison", "rock"],
  flying: ["grass", "fighting", "bug"],
  psychic: ["fighting", "poison"],
  bug: ["grass", "psychic"],
  rock: ["fire", "ice", "flying", "bug"],
  ghost: ["psychic", "ghost"],
  dragon: ["dragon"],
};

export function isSuperEffective(attacker: PokeEntry, defender: PokeEntry): boolean {
  for (const aType of attacker.types) {
    for (const dType of defender.types) {
      if (TYPE_CHART[aType]?.includes(dType)) return true;
    }
  }
  return false;
}

export function spriteUrl(id: number, back = false): string {
  const dir = back ? "back" : "";
  return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dir ? "back/" : ""}${id}.png`;
}

export function findPokemonByName(name: string): PokeEntry | undefined {
  const n = name.trim().toLowerCase();
  return GEN1_POKEMON.find((p) => p.name.toLowerCase() === n);
}

export function searchPokemon(query: string, limit = 8): PokeEntry[] {
  if (!query.trim()) return GEN1_POKEMON.slice(0, limit);
  const q = query.toLowerCase();
  return GEN1_POKEMON.filter((p) => p.name.toLowerCase().includes(q)).slice(0, limit);
}
