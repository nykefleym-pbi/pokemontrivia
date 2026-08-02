import { useEffect, useState } from "react";
import { pokeApiUrls } from "@/lib/api/pokeapi";

/**
 * Everything the Pokédex detail screen shows that the bundled roster does not
 * carry: the flavour text, the genus ("Seed Pokémon"), height, weight and the
 * abilities. All of it from PokéAPI, all of it through this one hook.
 *
 * `pokemon-data.generated.ts` is deliberately slim — it ships in the bundle and
 * is loaded on every screen — so these are fetched at open time instead.
 *
 * ## One fetch, not two
 *
 * The flavour text used to be fetched by a second component that hit
 * `/pokemon-species/{id}` on its own, so opening a Pokémon made TWO identical
 * requests for the same document, with two independent failure modes. Worse,
 * that component rendered `null` both while loading and when the fetch failed,
 * so a slow or failed request left the Pokédex Entry card silently empty with
 * nothing to distinguish "still loading" from "gave up".
 *
 * Both endpoints are now read here, once, cached per id for the session, and
 * the result carries an explicit `status` so the screen can tell those two
 * states apart and say so.
 *
 *   /pokemon-species/{id}   flavour text, genus
 *   /pokemon/{id}           height, weight, abilities
 */
export interface SpeciesDetail {
  /**
   * `loading` until the round trip settles. `error` means BOTH endpoints failed
   * — a partial result is `ready`, because a species with no genus is still
   * worth its height.
   */
  status: "loading" | "ready" | "error";
  /** The Pokédex entry itself, newlines flattened. */
  flavor: string | null;
  /** Metres. PokéAPI stores decimetres. */
  heightM: number | null;
  /** Kilograms. PokéAPI stores hectograms. */
  weightKg: number | null;
  /** "Seed Pokémon" — already carries the word "Pokémon" in English. */
  genus: string | null;
  /**
   * Visible abilities only. The hidden ability is deliberately dropped (owner
   * ruling): it is a competitive-play detail this game never uses, and it made
   * the row read as two equally-weighted facts when only one of them is real
   * here.
   */
  abilities: string[];
}

const LOADING: SpeciesDetail = {
  status: "loading",
  flavor: null,
  heightM: null,
  weightKg: null,
  genus: null,
  abilities: [],
};

const FAILED: SpeciesDetail = { ...LOADING, status: "error" };

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
  flavor_text_entries?: {
    flavor_text: string;
    language: { name: string };
    version: { name: string };
  }[];
}

interface PokemonResponse {
  height?: number;
  weight?: number;
  abilities?: { ability: { name: string }; is_hidden: boolean }[];
}

/**
 * Newest games first. PokéAPI returns an entry per game and they differ — the
 * modern ones are written as prose, several of the oldest are clipped to fit a
 * Game Boy text box. Any English entry beats none, so this is a preference
 * order rather than a filter.
 */
const PREFERRED_VERSIONS = [
  "scarlet",
  "violet",
  "sword",
  "shield",
  "ultra-sun",
  "sun",
  "x",
  "black-2",
  "platinum",
];

function pickFlavor(entries: SpeciesResponse["flavor_text_entries"]): string | null {
  if (!entries) return null;
  const english = entries.filter((e) => e.language?.name === "en");
  const best =
    PREFERRED_VERSIONS.map((v) => english.find((e) => e.version?.name === v)).find(Boolean) ??
    english[0];
  // The soft hyphens and form feeds are line-break hints for the original text
  // box, not part of the sentence.
  return best
    ? best.flavor_text
        .replace(/[\n\f\r­]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : null;
}

/** `fetch` resolves for a 404, and `.json()` on the error body succeeds — so the
 *  status has to be checked or a missing species reads as a species with no
 *  fields, which is indistinguishable from a real one that happens to be bare. */
async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function load(id: number): Promise<SpeciesDetail> {
  // Settled, not `all`: one endpoint 404ing — synthetic forme ids have no
  // species row — must not blank the other.
  const [speciesRes, pokemonRes] = await Promise.allSettled([
    getJson<SpeciesResponse>(pokeApiUrls.species(id)),
    getJson<PokemonResponse>(pokeApiUrls.pokemon(id)),
  ]);

  if (speciesRes.status === "rejected" && pokemonRes.status === "rejected") return FAILED;

  const species = speciesRes.status === "fulfilled" ? speciesRes.value : null;
  const pokemon = pokemonRes.status === "fulfilled" ? pokemonRes.value : null;
  const height = pokemon?.height;
  const weight = pokemon?.weight;

  return {
    status: "ready",
    flavor: pickFlavor(species?.flavor_text_entries),
    heightM: typeof height === "number" ? height / 10 : null,
    weightKg: typeof weight === "number" ? weight / 10 : null,
    genus: species?.genera?.find((g) => g.language?.name === "en")?.genus ?? null,
    abilities: (pokemon?.abilities ?? [])
      .filter((a) => !a.is_hidden)
      .map((a) => titleCase(a.ability.name)),
  };
}

export function useSpeciesDetail(id: number | null): SpeciesDetail {
  const [detail, setDetail] = useState<SpeciesDetail>(() =>
    id != null ? (cache.get(id) ?? LOADING) : LOADING,
  );

  useEffect(() => {
    if (id == null) return;
    const hit = cache.get(id);
    if (hit) {
      setDetail(hit);
      return;
    }
    // Back to loading rather than keeping the previous species' numbers on
    // screen — stale facts under a new name are worse than a spinner.
    setDetail(LOADING);
    let cancelled = false;
    let pending = inflight.get(id);
    if (!pending) {
      pending = load(id).catch(() => FAILED);
      inflight.set(id, pending);
    }
    pending
      .then((d) => {
        inflight.delete(id);
        // A failure is not cached: the next open should try again rather than
        // showing the error for the rest of the session.
        if (d.status === "ready") cache.set(id, d);
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
