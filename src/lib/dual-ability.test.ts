import { describe, expect, it } from "vitest";
import type { PokeType } from "./pokemon-data";
import { isLegendaryOrMythical } from "./legendary-data";
import { resolvePvpTypeAbilityId } from "./pvp-type-abilities";
import { signatureAbilityFor } from "./signature-abilities";

/**
 * Story 3 (#3) — Legendary/Mythical partners fire BOTH their signature ability
 * AND their type ability.
 *
 * COVERAGE NOTE: the mutual-exclusivity that this story removes lived in two
 * *component/route* gates (`live-pvp-battle-screen.tsx:~352` "Gate A" and
 * `pvp.live.$matchId.tsx:~113` "Gate B"), each of the form
 * `signature ? null : resolvePvpTypeAbilityId(...)`. Those call sites — and the
 * downstream toast/attribution wiring — are not unit-testable without a live
 * realtime/route harness (see 07-qa.md gaps).
 *
 * What IS unit-testable is the precondition the un-gating relies on: at the DATA
 * layer the two ability sources are independent and BOTH resolve to a non-null
 * value for the same legendary partner. If either returned null the stacked
 * effect could never fire, so this is the closest deterministic assertion that
 * the two are no longer mutually exclusive.
 */

// Real legendary/mythical dex ids paired with a representative primary type
// (types come from `pokemon-data` in production; a valid type is all
// `resolvePvpTypeAbilityId` needs to resolve a type ability).
const LEGENDARY_CASES: { id: number; label: string; types: PokeType[] }[] = [
  { id: 150, label: "Mewtwo (legendary)", types: ["psychic"] },
  { id: 384, label: "Rayquaza (legendary)", types: ["dragon", "flying"] },
  { id: 383, label: "Groudon (legendary)", types: ["ground"] },
  { id: 493, label: "Arceus (mythical)", types: ["normal"] },
  { id: 151, label: "Mew (mythical)", types: ["psychic"] },
];

describe("Story 3 / #3 — legendary partners resolve BOTH abilities at the data layer", () => {
  it.each(LEGENDARY_CASES)(
    "$label yields a non-null type-ability id AND a signature (no longer mutually exclusive)",
    ({ id, types }) => {
      expect(isLegendaryOrMythical(id)).toBe(true);

      const signature = signatureAbilityFor(id);
      const typeAbilityId = resolvePvpTypeAbilityId(types, null);

      // Both sources produce a value simultaneously — neither gates out the other.
      expect(signature).not.toBeNull();
      expect(signature?.pokemonId).toBe(id);
      expect(typeAbilityId).not.toBeNull();
    },
  );

  it("resolves the type-ability id independently of legendary status (same id, sig present or not)", () => {
    // The type-ability resolver never consults the signature system, so a
    // legendary and a non-legendary sharing a primary type resolve the SAME
    // type ability. This is why un-gating simply lets both stack.
    const legendaryPsychicType = resolvePvpTypeAbilityId(["psychic"], null); // Mewtwo-like
    const nonLegendaryPsychicType = resolvePvpTypeAbilityId(["psychic"], null);
    expect(legendaryPsychicType).toBe(nonLegendaryPsychicType);
    expect(legendaryPsychicType).not.toBeNull();
  });

  it("honours a stored ability roll when resolving the type ability", () => {
    // Reports whatever roll is stored, so a legendary's type ability is the one
    // it actually equipped — proves the reported id is meaningful for the server.
    expect(resolvePvpTypeAbilityId(["psychic"], "hex")).toBe("hex");
  });

  it("non-legendary partners still have NO signature (type ability only, unchanged)", () => {
    const pikachu = 25;
    expect(isLegendaryOrMythical(pikachu)).toBe(false);
    expect(signatureAbilityFor(pikachu)).toBeNull();
    // …but still resolve a type ability, exactly as before this change.
    expect(resolvePvpTypeAbilityId(["electric"], null)).not.toBeNull();
  });

  it("no partner id (null) resolves to neither ability", () => {
    expect(signatureAbilityFor(null)).toBeNull();
    expect(resolvePvpTypeAbilityId(undefined, null)).toBeNull();
    expect(resolvePvpTypeAbilityId([], null)).toBeNull();
  });
});
