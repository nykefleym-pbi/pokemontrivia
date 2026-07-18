const BASE = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items";

export const spriteIconUrl = (slug: string) => `${BASE}/${slug}.png`;

export const dreamWorldIconUrl = (slug: string) => `${BASE}/dream-world/${slug}.png`;
