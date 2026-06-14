## Root cause

The previous turn diagnosed the crash but never actually applied the code fix — only `.env`/`package.json`/`bun.lockb` were touched. So users with a partner saved under the old schema (no `evolvesToIds`, `evolvesFromId`, `evolutionStage` fields) still hit `pokemon.evolvesToIds.map(...)` in `getEvolutionTargets`, which throws on the Profile page.

The "tabs return to Battle" symptom is a knock-on effect: Profile crashes → the router's `DefaultErrorComponent` renders with a "Go home" link to `/` → `src/routes/index.tsx` redirects onboarded users to `/battle`. Shop and Pokédex don't actually crash, but if the user lands on the error screen first they'll be bounced.

## Fix (3 small edits, no schema bump, no gameplay change)

### 1. `src/lib/pokemon-data.ts` — defensive helpers

Make the evolution helpers tolerate partial/legacy entries, and add a one-shot rehydrator that re-syncs a persisted partner against the current `ALL_POKEMON` table.

```ts
export function getEvolutionTargets(p: PokeEntry): PokeEntry[] {
  return (p?.evolvesToIds ?? [])
    .map((id) => findPokemon(id))
    .filter(Boolean) as PokeEntry[];
}

export function canEvolve(p: PokeEntry): boolean {
  return (p?.evolvesToIds?.length ?? 0) > 0;
}

/** Re-sync a persisted partner with the current ALL_POKEMON entry so
 *  legacy saves pick up new fields (evolvesToIds, evolvesFromId,
 *  evolutionStage, etc.). Falls back to safe defaults if the id is gone. */
export function rehydratePokemon(p: PokeEntry | null): PokeEntry | null {
  if (!p) return p;
  const fresh = findPokemon(p.id);
  if (fresh) return { ...fresh };
  return {
    ...p,
    types: p.types ?? [],
    evolvesFromId: p.evolvesFromId ?? null,
    evolvesToIds: p.evolvesToIds ?? [],
    evolutionStage: p.evolutionStage ?? 1,
  };
}
```

### 2. `src/lib/store.ts` — upgrade legacy saves once on load

In the `persist` config's `merge`, run the restored partner through `rehydratePokemon` so old payloads are corrected on first load (no version bump, no localStorage rewrite needed — Zustand will rewrite on next set).

```ts
import { rehydratePokemon } from "./pokemon-data";
// ...
return {
  ...current,
  ...p,
  pokemon: rehydratePokemon(p.pokemon ?? null),
  flags: p.flags ?? [],
  // ...rest unchanged
};
```

### 3. `src/routes/profile.tsx` — belt-and-braces guard

Already calls `getEvolutionTargets(pokemon)` via `useMemo`. After fix 1 it's safe, but also guard the inline `pokemon.types.map(...)` reads with `(pokemon.types ?? []).map(...)` so a malformed entry can't crash the render path either.

## Out of scope

- No store schema/version bump
- No gameplay, data, or visual changes
- No changes to Shop / Pokédex / Battle screen
- No changes to error boundary or index redirect (the tab-rebound symptom disappears once Profile stops crashing)

## Verification

After applying, load Profile with the existing stale localStorage. It should render the partner card, the evolution targets section, and tabs to Shop / Dex / Profile should all work normally without bouncing back to Battle.