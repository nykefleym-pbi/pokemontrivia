import { useEffect, useState } from "react";
import { pokeApiUrls } from "@/lib/api/pokeapi";

/**
 * The facts the Pokédex detail screen shows that the bundled roster does not
 * carry: height, weight, the genus ("Seed Pokémon") and the abilities.
 *
 * `pokemon-data.generated.ts` is deliberately slim — it ships in the bundle and
 * is loaded on every screen — so these come from PokéAPI at open time, the same
 * way the flavour text already did. That means the screen has to render
 * perfectly well with `null` here, and it does: each row falls back to an em
 * dash rather than collapsing, so the layout does not jump when the fetch
 * lands.
 *
 * Two endpoints, because the data is split across them:
 *
 *   /pokemon-species/{id}   genus
 *   /pokemon/{id}           height, weight, abilities
 *
 * They are fetched together and cached per id for the session, so walking an
 * evolution line back and forth costs one round trip per species.
 */
export interface SpeciesDetail {
  /** Metres. PokéAPI stores decimetres. */
  heightM: number | null;
  /** Kilograms. PokéAPI stores hectograms. */
  weightKg: number | null;
  /** "Seed Pokémon" — already carries the word "Pokémon" in English. */
  genus: string | null;
  /**
   * Visible abilities only. The hidden ability is deliberately dropped (owner
   * ruling): it is a competitive-play detail that this game never uses, and it
   * made the row read as two equally-weighted facts when only one of them is
   * real here.
   */
  abilities: string[];
}

const EMPTY: SpeciesDetail = { heightM: null, weightKg: null, genus: null, abilities: [] };

const cache = new Map<number, SpeciesDetail>();
const inflight = new Map<number, Promise<SpeciesDetail>>();

/** "wonder-guard" -> "Wonder Guard". PokéAPI only gives the slug on this route. */
function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface SpeciesResponse {
  genera?: { genus: string; language: { name: string } }[];
}

interface PokemonResponse {
  height?: number;
  weight?: number;
  abilities?: { ability: { name: string }; is_hidden: boolean }[];
}

async function load(id: number): Promise<SpeciesDetail> {
  // Settled, not `all`: a species with no genus is still worth its height, and
  // one endpoint 404ing (synthetic forme ids have no species row) must not blank
  // the other.
  const [speciesRes, pokemonRes] = await Promise.allSettled([
    fetch(pokeApiUrls.species(id)).then((r) => r.json() as Promise<SpeciesResponse>),
    fetch(pokeApiUrls.pokemon(id)).then((r) => r.json() as Promise<PokemonResponse>),
  ]);

  const species = speciesRes.status === "fulfilled" ? speciesRes.value : null;
  const pokemon = pokemonRes.status === "fulfilled" ? pokemonRes.value : null;

  const genus = species?.genera?.find((g) => g.language?.name === "en")?.genus ?? null;
  const height = pokemon?.height;
  const weight = pokemon?.weight;

  return {
    heightM: typeof height === "number" ? height / 10 : null,
    weightKg: typeof weight === "number" ? weight / 10 : null,
    genus,
    abilities: (pokemon?.abilities ?? [])
      .filter((a) => !a.is_hidden)
      .map((a) => titleCase(a.ability.name)),
  };
}

export function useSpeciesDetail(id: number | null): SpeciesDetail {
  const [detail, setDetail] = useState<SpeciesDetail>(() =>
    id != null ? (cache.get(id) ?? EMPTY) : EMPTY,
  );

  useEffect(() => {
    if (id == null) return;
    const hit = cache.get(id);
    if (hit) {
      setDetail(hit);
      return;
    }
    // Clear rather than keep the previous species' numbers on screen — stale
    // facts under a new name are worse than a dash.
    setDetail(EMPTY);
    let cancelled = false;
    let pending = inflight.get(id);
    if (!pending) {
      pending = load(id).catch(() => EMPTY);
      inflight.set(id, pending);
    }
    pending
      .then((d) => {
        cache.set(id, d);
        inflight.delete(id);
        if (!cancelled) setDetail(d);
      })
      .catch(() => {
        inflight.delete(id);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return detail;
}
