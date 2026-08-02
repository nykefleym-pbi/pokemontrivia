import { GENERATIONS } from "@/lib/dex-rewards";
import type { PokeType } from "@/lib/pokemon-data";

/** Every type name, lower-case, for keyword matching. */
const TYPE_WORDS: readonly PokeType[] = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
  "fairy",
];

export type DexStatusWord = "caught" | "seen" | "shiny";

/**
 * What a typed query asked for.
 *
 * Every field is additive and every one is optional, so an empty query matches
 * everything and `fire kanto shiny` narrows on three axes at once.
 */
export interface DexQuery {
  /** Words that matched nothing special — matched against the species name. */
  text: string;
  types: PokeType[];
  statuses: DexStatusWord[];
  /** Dex number, when the query is (or contains) a number. */
  ids: number[];
  /** Generation number, when a region was named. */
  gen: number | null;
}

/**
 * Turn a raw search string into the filters it is asking for.
 *
 * The Dex used to search names only, with type / generation / status locked
 * behind five separate chips. Someone who knows what they want types it, so
 * this reads the same vocabulary the chips offer — region names, type names,
 * "caught" / "seen" / "shiny", and dex numbers — and leaves anything it does
 * not recognise as a name fragment.
 *
 * Tokenised on whitespace so the axes compose. A token is tried against each
 * vocabulary in turn and only falls through to `text` if nothing claims it,
 * which is what keeps "dragon" a TYPE filter while "dragonite" stays a name.
 *
 * Numbers are matched as dex ids with leading zeros tolerated, because the grid
 * prints them padded — someone reading "#004" off a card should be able to type
 * what they see. A bare "4" means the same thing.
 */
export function parseDexQuery(raw: string): DexQuery {
  const out: DexQuery = { text: "", types: [], statuses: [], ids: [], gen: null };
  const words: string[] = [];

  for (const token of raw.trim().toLowerCase().split(/\s+/)) {
    if (!token) continue;

    if (/^\d+$/.test(token)) {
      const id = Number(token);
      // 0 is not a dex number; treat it as text so "0" does not silently match
      // nothing at all with no explanation.
      if (id > 0) {
        out.ids.push(id);
        continue;
      }
    }

    const type = TYPE_WORDS.find((t) => t === token);
    if (type) {
      out.types.push(type);
      continue;
    }

    if (token === "caught" || token === "seen" || token === "shiny") {
      out.statuses.push(token);
      continue;
    }

    const region = GENERATIONS.find((g) => g.region.toLowerCase() === token);
    if (region) {
      out.gen = region.gen;
      continue;
    }

    words.push(token);
  }

  out.text = words.join(" ");
  return out;
}

/** True when the query asked for nothing at all. */
export function isEmptyDexQuery(q: DexQuery): boolean {
  return (
    q.text === "" && q.types.length === 0 && q.statuses.length === 0 && q.ids.length === 0 && q.gen === null
  );
}

export interface DexCandidate {
  id: number;
  name: string;
  types: readonly PokeType[];
}

/** What the player's dex knows about one species, reduced to the search axes. */
export interface DexCandidateStatus {
  caught: boolean;
  seen: boolean;
  shiny: boolean;
}

/**
 * Does one species satisfy a parsed query?
 *
 * Axes are ANDed — `fire caught` means both — but the values WITHIN an axis are
 * ORed, so `fire water` finds either. That asymmetry is deliberate: repeating an
 * axis reads as widening ("show me fire or water"), while naming a new axis
 * reads as narrowing.
 *
 * Name matching is a substring rather than a prefix. The old prefix rule meant
 * "chu" found nothing, when the only reason to type it is to find Pikachu.
 */
export function matchesDexQuery(
  q: DexQuery,
  p: DexCandidate,
  status: DexCandidateStatus,
): boolean {
  if (q.text && !p.name.toLowerCase().includes(q.text)) return false;
  if (q.ids.length > 0 && !q.ids.includes(p.id)) return false;
  if (q.types.length > 0 && !q.types.some((t) => p.types.includes(t))) return false;
  if (q.statuses.length > 0) {
    const ok = q.statuses.some((s) =>
      s === "caught" ? status.caught : s === "seen" ? status.seen : status.shiny,
    );
    if (!ok) return false;
  }
  return true;
}
