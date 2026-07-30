import { describe, expect, it } from "vitest";
import { findPokemon, STARTING_PARTNERS, type PokeEntry } from "@/lib/pokemon-data";
import { TYPE_CHART } from "@/lib/type-chart";
import {
  matchesPartnerFilters,
  matchesPartnerSearch,
  partnerTypeOptions,
} from "@/lib/partner-filter";

/** Real entries, not fixtures — the point is that these predicates behave on the
 *  actual Pokédex the pickers hand them. */
const charmander = findPokemon(4)!;
const squirtle = findPokemon(7)!;
const bulbasaur = findPokemon(1)!;

describe("matchesPartnerSearch", () => {
  it("matches on a name prefix, as the name-only search always did", () => {
    expect(matchesPartnerSearch(charmander, "char")).toBe(true);
    expect(matchesPartnerSearch(charmander, "Char")).toBe(true);
    expect(matchesPartnerSearch(squirtle, "char")).toBe(false);
  });

  it("matches on a type prefix, which is the new half", () => {
    expect(matchesPartnerSearch(charmander, "fire")).toBe(true);
    expect(matchesPartnerSearch(charmander, "fir")).toBe(true);
    expect(matchesPartnerSearch(squirtle, "wat")).toBe(true);
    expect(matchesPartnerSearch(squirtle, "fire")).toBe(false);
  });

  it("matches a SECONDARY type, not just the badge shown on the card", () => {
    // Bulbasaur is grass/poison and the grid only renders types[0]. Searching
    // "poison" still has to find it, or the filter contradicts itself.
    expect(bulbasaur.types).toContain("poison");
    expect(bulbasaur.types[0]).not.toBe("poison");
    expect(matchesPartnerSearch(bulbasaur, "poison")).toBe(true);
  });

  it("an empty or whitespace query matches everything", () => {
    expect(matchesPartnerSearch(charmander, "")).toBe(true);
    expect(matchesPartnerSearch(charmander, "   ")).toBe(true);
  });
});

describe("matchesPartnerFilters", () => {
  it("requires the chosen type AND the text, not either", () => {
    // "char" alone finds Charmander; pinned to water it must not.
    expect(matchesPartnerFilters(charmander, "char", null)).toBe(true);
    expect(matchesPartnerFilters(charmander, "char", "water")).toBe(false);
    expect(matchesPartnerFilters(squirtle, "squir", "water")).toBe(true);
  });

  it("a chosen type with no text returns that whole type", () => {
    expect(matchesPartnerFilters(charmander, "", "fire")).toBe(true);
    expect(matchesPartnerFilters(squirtle, "", "fire")).toBe(false);
  });

  it("a secondary type satisfies the chip, matching what the search does", () => {
    expect(matchesPartnerFilters(bulbasaur, "", "poison")).toBe(true);
  });
});

describe("partnerTypeOptions", () => {
  it("offers only types present in the pool", () => {
    const pool: PokeEntry[] = [charmander, squirtle];
    expect(partnerTypeOptions(pool)).toEqual(["fire", "water"]);
  });

  it("is empty for an empty pool, so the chip row hides itself", () => {
    expect(partnerTypeOptions([])).toEqual([]);
  });

  it("dedupes and returns canonical order, not encounter order", () => {
    // squirtle before charmander in the pool; fire still precedes water because
    // that is TYPE_CHART's order.
    const order = Object.keys(TYPE_CHART);
    const opts = partnerTypeOptions([squirtle, charmander, squirtle]);
    expect(opts).toEqual(["fire", "water"]);
    expect(order.indexOf("fire")).toBeLessThan(order.indexOf("water"));
  });

  it("covers the real onboarding pool without inventing a type", () => {
    const opts = partnerTypeOptions(STARTING_PARTNERS);
    expect(opts.length).toBeGreaterThan(1);
    for (const t of opts) expect(Object.keys(TYPE_CHART)).toContain(t);
    // Every option must actually return at least one partner, or a chip leads to
    // an empty grid.
    for (const t of opts) {
      expect(STARTING_PARTNERS.some((p) => matchesPartnerFilters(p, "", t))).toBe(true);
    }
  });
});
