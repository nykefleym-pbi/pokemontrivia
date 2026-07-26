// Round model + pure round-generation/answer-checking logic for "Who's That
// Pokémon?". Lives in lib (no React/Supabase/store imports) so both the route
// component and the whos-that Edge Function can import the SAME functions —
// mirrors src/lib/rewards' role for dailyReward/battleReward.
// Deliberately NOT importing from ./pokemon-data or ./game-data: those pull
// in the full generated roster's evolution chains/slugs/trainer data this
// module never uses, and this is the one lib module the whos-that Edge
// Function bundles too — bundling the full ~195kb roster just to read
// id/name/types would make it by far the largest function in the codebase.
import { ALL_POKEMON_SLIM } from "./pokemon-data.slim.generated";
import type { PokeType } from "./pokemon-data.generated";
import { isLegendaryOrMythical } from "./legendary-data";
import { ITEM_LIST } from "../content/items";
import type { ItemId } from "../content/items/item-def";

const ALL_POKEMON = ALL_POKEMON_SLIM;

export type WhosThatMode = "1A" | "1B" | "2" | "3" | "4" | "5";
export interface WhosThatRound {
  monId: number;
  name: string;
  types: PokeType[];
  mode: WhosThatMode;
  isShiny: boolean;
  rewardId: ItemId;
  rewardName: string;
  rewardIcon: string;
  cropBack: boolean;
  cropDX: number;
  cropDY: number;
  choices: string[];
}

export const HOUR = 3_600_000;
export const SHINY_RATE = 1 / 20;

// Exclude premium and Nearby-Battle-only berries from the mini-game reward pool.
const REWARD_POOL = ITEM_LIST.filter((i) => !i.premium && !i.pvpOnly);

// Legendary/Mythical Pokémon are Poké-Egg exclusive — never a round's answer,
// since a correct guess here grants a Pokédex capture.
const ROUND_POOL = ALL_POKEMON.filter((p) => !isLegendaryOrMythical(p.id));

export function normalizeName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findByNorm(input: string) {
  const n = normalizeName(input);
  if (!n) return undefined;
  return ALL_POKEMON.find((p) => normalizeName(p.name) === n);
}

export function sameTypes(a: PokeType[], b: PokeType[]): boolean {
  if (a.length !== b.length) return false;
  return [...a].sort().join(",") === [...b].sort().join(",");
}

function sample<T>(arr: T[], n: number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

export function makeRound(): WhosThatRound {
  const mon = ROUND_POOL[Math.floor(Math.random() * ROUND_POOL.length)];
  const reward = REWARD_POOL[Math.floor(Math.random() * REWARD_POOL.length)];
  const mode = (["1A", "1B", "2", "3", "4", "5"] as WhosThatMode[])[Math.floor(Math.random() * 6)];
  const others = sample(
    ALL_POKEMON.filter((p) => p.id !== mon.id),
    3,
  ).map((p) => p.name);
  return {
    monId: mon.id,
    name: mon.name,
    types: mon.types,
    mode,
    isShiny: Math.random() < SHINY_RATE,
    rewardId: reward.id,
    rewardName: reward.name,
    rewardIcon: reward.iconUrl,
    cropBack: mon.id <= 649 ? Math.random() < 0.5 : false,
    cropDX: Math.round((Math.random() - 0.5) * 56),
    cropDY: Math.round((Math.random() - 0.5) * 56),
    choices: sample([mon.name, ...others], 4),
  };
}

export interface WhosThatGuess {
  guessText?: string;
  guessTypes?: PokeType[];
  guessChoice?: string;
}

// Consolidates whos-that-pokemon.tsx's submit()'s mode-branching validation
// into one pure function so the Edge Function can check a guess the exact
// same way the route always has, against its OWN held round (not a
// client-supplied one).
export function checkGuess(round: WhosThatRound, guess: WhosThatGuess): boolean {
  if (round.mode === "1B") {
    return sameTypes(guess.guessTypes ?? [], round.types);
  }
  if (round.mode === "3") {
    return guess.guessChoice === round.name;
  }
  if (round.mode === "4") {
    const m = findByNorm(guess.guessText ?? "");
    return !!m && sameTypes(m.types, round.types);
  }
  return normalizeName(guess.guessText ?? "") === normalizeName(round.name);
}

/** Redaction shown in place of the answer's name in a Pokédex hint. */
export const NAME_MASK = "???";

/** Words that are also a species-name token but far too common in English to
 *  redact wholesale — masking these would shred the entry ("Type: Null"). */
const UNMASKABLE_TOKENS = new Set(["type", "null", "max", "eternal", "zen", "ash"]);

/** Any token this long or longer is masked on its own, so a form name still
 *  hides its base ("Alolan Raichu" must also hide a bare "RAICHU"). */
const MIN_TOKEN_LEN = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Hide a Pokémon's name inside text that is meant to be a HINT about it.
 *
 * Pokédex flavor text routinely names the species outright — older entries in
 * block capitals ("PIKACHU has small electric sacs...") — which hands over the
 * whole answer in the one mode built around reading the entry (owner report
 * 2026-07-26). PokeAPI is the source, so this cannot be fixed upstream; the
 * text has to be redacted at the point of display.
 *
 * Matching is deliberately loose, because the entry's spelling of a name and
 * the roster's often differ:
 *  - case-insensitive, and accent-insensitive via NFKD (Flabébé / FLABEBE);
 *  - separators are flexible, so "Ho-Oh" also catches "HO OH" and "HoOh", and
 *    "Mr. Mime" catches "MR MIME";
 *  - each long token is masked individually, so a form's base name is caught
 *    too ("Alolan Raichu" hides a bare "RAICHU");
 *  - a trailing possessive or plural is swallowed, so "PIKACHU's" does not
 *    leave a dangling "???'s".
 *
 * Short tokens are left alone: masking "Ho" or "Z" would redact ordinary words.
 * The full-name pattern covers those species instead.
 */
export function maskSpeciesName(text: string, name: string): string {
  if (!text || !name) return text;

  // Compare on a form that ignores accents, so the pattern can be built from
  // the plain-ASCII shape while still matching the accented original.
  const deaccent = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const asciiText = deaccent(text);
  const asciiName = deaccent(name);

  // Longest first: mask "Alolan Raichu" before its parts, so the multi-word
  // form is replaced once rather than becoming "??? ???".
  const tokens = asciiName
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t.length >= MIN_TOKEN_LEN && !UNMASKABLE_TOKENS.has(t.toLowerCase()));
  const patterns = [asciiName, ...tokens].sort((a, b) => b.length - a.length);

  // Work on the de-accented copy so indices line up with the patterns; the
  // de-accented form is what gets rendered, which is acceptable for a hint and
  // avoids a fragile index mapping back onto the original.
  let out = asciiText;
  for (const p of patterns) {
    // Flexible separators between the name's own parts — but only the
    // punctuation that actually occurs INSIDE names. Allowing any non-alphanumeric
    // run here let "Ho-Oh" match across the comma in "Ho, oh my!" and redact
    // ordinary prose.
    const body = escapeRegExp(p).replace(/[^A-Za-z0-9]+/g, "[-.'\u2019: ]*");
    // Trailing 's / s is swallowed; leading/trailing boundaries keep the match
    // from firing inside a longer unrelated word.
    const re = new RegExp(`(?<![A-Za-z0-9])${body}(?:'?s)?(?![A-Za-z0-9])`, "gi");
    out = out.replace(re, NAME_MASK);
  }
  // Collapse "??? ???" runs left by a name the entry repeats back to back.
  return out.replace(new RegExp(`(?:${escapeRegExp(NAME_MASK)}[ ]?){2,}`, "g"), `${NAME_MASK} `).trim();
}
