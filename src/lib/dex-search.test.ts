import { describe, it, expect } from "vitest";
import { parseDexQuery, matchesDexQuery, isEmptyDexQuery } from "@/lib/dex-search";

const bulbasaur = { id: 1, name: "Bulbasaur", types: ["grass", "poison"] as const };
const charmander = { id: 4, name: "Charmander", types: ["fire"] as const };
const pikachu = { id: 25, name: "Pikachu", types: ["electric"] as const };

const none = { caught: false, seen: false, shiny: false };
const caught = { caught: true, seen: false, shiny: false };
const shiny = { caught: true, seen: false, shiny: true };

describe("parseDexQuery", () => {
  it("treats an unrecognised word as a name fragment", () => {
    expect(parseDexQuery("pika")).toMatchObject({ text: "pika", types: [], ids: [], gen: null });
  });

  it("reads a type name as a type filter", () => {
    expect(parseDexQuery("grass")).toMatchObject({ types: ["grass"], text: "" });
  });

  it("reads a region name as a generation", () => {
    expect(parseDexQuery("kanto").gen).toBe(1);
    expect(parseDexQuery("johto").gen).toBe(2);
    expect(parseDexQuery("paldea").gen).toBe(9);
  });

  it("reads caught / seen / shiny as status filters", () => {
    expect(parseDexQuery("caught").statuses).toEqual(["caught"]);
    expect(parseDexQuery("seen").statuses).toEqual(["seen"]);
    expect(parseDexQuery("shiny").statuses).toEqual(["shiny"]);
  });

  it("reads a bare number and a zero-padded one as the same dex id", () => {
    expect(parseDexQuery("2").ids).toEqual([2]);
    expect(parseDexQuery("002").ids).toEqual([2]);
  });

  it("keeps 0 as text — there is no dex number zero", () => {
    expect(parseDexQuery("0")).toMatchObject({ ids: [], text: "0" });
  });

  it("combines axes from one string", () => {
    expect(parseDexQuery("fire kanto caught")).toMatchObject({
      types: ["fire"],
      gen: 1,
      statuses: ["caught"],
      text: "",
    });
  });

  it("does not eat a name that merely starts with a type word", () => {
    // "dragon" is a type; "dragonite" is a Pokemon. Whole-token matching is
    // what keeps the two apart.
    expect(parseDexQuery("dragonite")).toMatchObject({ types: [], text: "dragonite" });
    expect(parseDexQuery("dragon")).toMatchObject({ types: ["dragon"], text: "" });
  });

  it("is case-insensitive", () => {
    expect(parseDexQuery("KANTO Fire")).toMatchObject({ gen: 1, types: ["fire"] });
  });

  it("reports an empty query", () => {
    expect(isEmptyDexQuery(parseDexQuery(""))).toBe(true);
    expect(isEmptyDexQuery(parseDexQuery("   "))).toBe(true);
    expect(isEmptyDexQuery(parseDexQuery("fire"))).toBe(false);
  });
});

describe("matchesDexQuery", () => {
  const q = parseDexQuery;

  it("matches a name substring, not only a prefix", () => {
    expect(matchesDexQuery(q("chu"), pikachu, none)).toBe(true);
    expect(matchesDexQuery(q("pika"), pikachu, none)).toBe(true);
    expect(matchesDexQuery(q("chu"), charmander, none)).toBe(false);
  });

  it("matches a dex number", () => {
    expect(matchesDexQuery(q("004"), charmander, none)).toBe(true);
    expect(matchesDexQuery(q("4"), charmander, none)).toBe(true);
    expect(matchesDexQuery(q("4"), pikachu, none)).toBe(false);
  });

  it("matches either type of a dual-type Pokemon", () => {
    expect(matchesDexQuery(q("grass"), bulbasaur, none)).toBe(true);
    expect(matchesDexQuery(q("poison"), bulbasaur, none)).toBe(true);
    expect(matchesDexQuery(q("fire"), bulbasaur, none)).toBe(false);
  });

  it("ORs within an axis and ANDs across axes", () => {
    // Two types: either will do.
    expect(matchesDexQuery(q("fire grass"), charmander, none)).toBe(true);
    expect(matchesDexQuery(q("fire grass"), pikachu, none)).toBe(false);
    // A type AND a status: both must hold.
    expect(matchesDexQuery(q("fire caught"), charmander, caught)).toBe(true);
    expect(matchesDexQuery(q("fire caught"), charmander, none)).toBe(false);
  });

  it("filters on caught / shiny state", () => {
    expect(matchesDexQuery(q("caught"), charmander, caught)).toBe(true);
    expect(matchesDexQuery(q("caught"), charmander, none)).toBe(false);
    expect(matchesDexQuery(q("shiny"), charmander, shiny)).toBe(true);
    expect(matchesDexQuery(q("shiny"), charmander, caught)).toBe(false);
  });

  it("matches everything on an empty query", () => {
    expect(matchesDexQuery(q(""), bulbasaur, none)).toBe(true);
    expect(matchesDexQuery(q(""), pikachu, shiny)).toBe(true);
  });

  it("ignores the region token when matching a species — that moves the grid", () => {
    // `gen` is applied by switching the visible generation, not by rejecting
    // rows, so a region on its own must not filter anything out here.
    expect(matchesDexQuery(q("kanto"), pikachu, none)).toBe(true);
  });
});
