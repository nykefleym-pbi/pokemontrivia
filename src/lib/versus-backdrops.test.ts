// The catalogue is hand-maintained against files on disk, and every way it can
// drift from them is silent at runtime: a typo'd filename is a 404 that falls
// back to a gradient, a duplicate id makes one backdrop unreachable, and a
// saved preference pointing at a removed entry would draw nothing at all.
import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import {
  VERSUS_BACKDROPS,
  DEFAULT_VERSUS_BACKDROP_ID,
  versusBackdrop,
  versusBackdropSrc,
} from "@/lib/versus-backdrops";

const onDisk = readdirSync("public/versus").filter((f) => f.endsWith(".webp"));

describe("the backdrop catalogue", () => {
  it("names files that actually exist", () => {
    const missing = VERSUS_BACKDROPS.filter((b) => !onDisk.includes(b.file));
    expect(missing.map((b) => b.file)).toEqual([]);
  });

  it("lists every backdrop in the folder — a file nobody can pick is dead weight", () => {
    const listed = new Set(VERSUS_BACKDROPS.map((b) => b.file));
    expect(onDisk.filter((f) => !listed.has(f))).toEqual([]);
  });

  it("has unique ids", () => {
    const ids = VERSUS_BACKDROPS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes the default", () => {
    expect(VERSUS_BACKDROPS.some((b) => b.id === DEFAULT_VERSUS_BACKDROP_ID)).toBe(true);
  });
});

describe("versusBackdrop", () => {
  it("falls back to Forest when the player has never picked", () => {
    expect(versusBackdrop(null).label).toBe("Forest");
    expect(versusBackdrop(undefined).label).toBe("Forest");
  });

  it("falls back to Forest for an id whose art has since been removed", () => {
    expect(versusBackdrop("a-backdrop-that-was-deleted").id).toBe(DEFAULT_VERSUS_BACKDROP_ID);
  });

  it("returns the chosen one otherwise", () => {
    expect(versusBackdrop("under-the-sea").label).toBe("Under the Sea");
  });
});

describe("versusBackdropSrc", () => {
  it("encodes the spaces and apostrophes the filenames carry", () => {
    expect(versusBackdropSrc("dragons-nest")).toBe("/versus/Dragon's%20Nest.webp");
    expect(versusBackdropSrc(null)).toBe("/versus/Forest.webp");
  });

  it("produces a path that survives a round trip back to a real file", () => {
    for (const b of VERSUS_BACKDROPS) {
      const file = decodeURIComponent(versusBackdropSrc(b.id)).replace("/versus/", "");
      expect(onDisk).toContain(file);
    }
  });
});
