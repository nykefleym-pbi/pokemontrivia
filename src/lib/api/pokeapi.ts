export const POKEAPI_BASE = "https://pokeapi.co/api/v2";
export const pokeApiUrls = {
  species: (id: number | string) => `${POKEAPI_BASE}/pokemon-species/${id}`,
  pokemon: (id: number | string) => `${POKEAPI_BASE}/pokemon/${id}`,
};
