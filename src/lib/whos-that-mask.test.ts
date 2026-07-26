// Name redaction for the Pokédex-entry hint mode.
//
// The bug (owner report 2026-07-26): mode 5 shows PokeAPI flavor text verbatim,
// and that text routinely names the species — older entries in block capitals —
// so the one mode built around READING the entry handed over the answer. PokeAPI
// is the source, so it has to be redacted at display time.
import { describe, expect, it } from "vitest";
import { maskSpeciesName, NAME_MASK } from "@/lib/whos-that";

describe("maskSpeciesName", () => {
  it("hides the name in the block-capitals style old entries use", () => {
    const out = maskSpeciesName(
      "When several of these POKéMON gather, their electricity could build and cause lightning storms. PIKACHU has small electric sacs.",
      "Pikachu",
    );
    expect(out).not.toMatch(/pikachu/i);
    expect(out).toContain(NAME_MASK);
  });

  it("hides the name in ordinary sentence case", () => {
    expect(maskSpeciesName("Bulbasaur can be seen napping in bright sunlight.", "Bulbasaur")).toBe(
      `${NAME_MASK} can be seen napping in bright sunlight.`,
    );
  });

  it("swallows a possessive so no dangling ???'s is left", () => {
    const out = maskSpeciesName("Charizard's wings can carry it close to 4,600 feet.", "Charizard");
    expect(out).toBe(`${NAME_MASK} wings can carry it close to 4,600 feet.`);
  });

  it("swallows a plural", () => {
    expect(maskSpeciesName("Groups of Zubats roost in caves.", "Zubat")).toBe(
      `Groups of ${NAME_MASK} roost in caves.`,
    );
  });

  it("matches across the name's own punctuation, however the entry writes it", () => {
    for (const written of ["Ho-Oh", "HO-OH", "HO OH", "HoOh"]) {
      expect(maskSpeciesName(`Legends say ${written} lives atop a tower.`, "Ho-Oh")).not.toMatch(
        /ho.?oh/i,
      );
    }
  });

  it("handles a name with a period and a space", () => {
    // Note "pantomime" must survive: only the standalone name is a leak.
    expect(maskSpeciesName("MR. MIME is a master of pantomime.", "Mr. Mime")).toBe(
      `${NAME_MASK} is a master of pantomime.`,
    );
  });

  it("is accent-insensitive both ways", () => {
    expect(maskSpeciesName("FLABEBE floats on the wind.", "Flabébé")).not.toMatch(/flabebe/i);
    expect(maskSpeciesName("Flabébé rides the breeze.", "Flabébé")).not.toMatch(/flab/i);
  });

  it("also hides a bare base name when the answer is a regional form", () => {
    // The roster name is the form, but the entry text uses the base species.
    const out = maskSpeciesName("RAICHU can gather static electricity.", "Alolan Raichu");
    expect(out).not.toMatch(/raichu/i);
  });

  it("leaves short tokens alone rather than shredding ordinary words", () => {
    // "Ho" and "Oh" must not be masked as standalone words.
    const out = maskSpeciesName("Ho, oh my! It soars above the clouds.", "Ho-Oh");
    expect(out).toContain("oh my");
  });

  it("does not redact the common words in Type: Null", () => {
    const out = maskSpeciesName(
      "A Pokémon of a type that no other shares, it was built for battle.",
      "Type: Null",
    );
    expect(out).toContain("type");
    expect(out).not.toContain(NAME_MASK);
  });

  it("does not fire inside a longer unrelated word", () => {
    // "Rattata" must not be masked out of a word that merely contains it.
    expect(maskSpeciesName("It nibbles constantly.", "Rat")).toBe("It nibbles constantly.");
  });

  it("collapses a repeated name into one mask rather than a run", () => {
    const out = maskSpeciesName("EEVEE EEVEE has unstable genes.", "Eevee");
    expect(out).toBe(`${NAME_MASK} has unstable genes.`);
  });

  it("passes empty input through untouched", () => {
    expect(maskSpeciesName("", "Pikachu")).toBe("");
    expect(maskSpeciesName("Some entry.", "")).toBe("Some entry.");
  });
});
