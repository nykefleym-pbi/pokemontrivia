import type { PokeEntry, PokeType } from "./pokemon-data";
import { TYPE_CHART } from "./type-chart";

/**
 * Filtering for the two partner pickers — onboarding ("Choose your partner") and
 * Profile's "Change partner". A partner's type is what grants its battle
 * ability, so "show me the Water ones" is the question players actually have, and
 * neither picker could answer it before.
 *
 * The 18 types come from TYPE_CHART's keys rather than a fresh array. This repo
 * already carries seven constants declared twice (see docs/REPO_MAP.md); a
 * nineteenth list of type names, free to drift from the canonical one, is exactly
 * that bug waiting to happen.
 */
const TYPE_ORDER = Object.keys(TYPE_CHART) as PokeType[];

/**
 * The types actually present in a pool, in canonical order.
 *
 * Derived from the pool rather than fixed, because Profile's pool is only the
 * Pokémon the player has captured: a fixed row of 18 chips would leave most of
 * them returning nothing, which reads as a broken filter rather than as an empty
 * Pokédex.
 */
export function partnerTypeOptions(pool: PokeEntry[]): PokeType[] {
  const present = new Set<PokeType>();
  for (const p of pool) for (const t of p.types) present.add(t);
  return TYPE_ORDER.filter((t) => present.has(t));
}

/**
 * Name-or-type text match, prefix-based like the pickers' original name-only
 * search.
 *
 * Typing "wat" matches Water Pokémon as well as Wartortle, so the feature works
 * whether the player reaches for the chips or just types the type in — the chips
 * are the discoverable path, this is the one people try first.
 */
export function matchesPartnerSearch(p: PokeEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return p.name.toLowerCase().startsWith(q) || p.types.some((t) => t.startsWith(q));
}

/** A pool entry passes when it matches the text box AND carries the chosen type. */
export function matchesPartnerFilters(p: PokeEntry, query: string, type: PokeType | null): boolean {
  if (type && !p.types.includes(type)) return false;
  return matchesPartnerSearch(p, query);
}
