import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
  canonicalFor,
  findPage,
  isNoindex,
  NOINDEX_PREFIXES,
  OG_IMAGE,
  PAGES,
  pageHead,
  SITE_URL,
} from "./seo";
import { buildSitemap, sitemapEntries } from "./sitemap";

/** Derives the router's page paths from the routes directory — the same input
 *  the route-tree generator reads. Excludes server routes and dynamic ones. */
function routerPagePaths(): string[] {
  return readdirSync(join(__dirname, "..", "routes"))
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => f.replace(/\.tsx$/, ""))
    .filter((n) => !n.includes(".test") && n !== "__root")
    .filter((n) => !n.startsWith("api."))
    .filter((n) => !n.includes("$")) // dynamic: one URL per match, never indexed
    .map((n) => (n === "index" ? "/" : `/${n.replace(/\./g, "/")}`));
}

describe("every page the router serves has its own metadata", () => {
  it("has an entry for each page route", () => {
    for (const path of routerPagePaths()) {
      // A route with no entry silently inherits the home page's title and
      // description, which is what made six URLs look like duplicates of one.
      expect(findPage(path), `no PAGES entry for ${path}`).toBeDefined();
    }
  });

  it("gives every page a distinct title and description", () => {
    const titles = PAGES.map((p) => p.title);
    const descriptions = PAGES.map((p) => p.description);
    expect(new Set(titles).size, "two pages share a title").toBe(titles.length);
    expect(new Set(descriptions).size, "two pages share a description").toBe(descriptions.length);
  });

  it("keeps descriptions short enough to survive the results page", () => {
    for (const p of PAGES) {
      // Google truncates around 155-160 characters; past that the tail is
      // written for nobody.
      expect(p.description.length, `${p.path} description is ${p.description.length} chars`)
        .toBeLessThanOrEqual(160);
      expect(p.title.length, `${p.path} title is ${p.title.length} chars`).toBeLessThanOrEqual(70);
    }
  });
});

describe("canonical URLs", () => {
  it("are absolute and on the canonical origin", () => {
    for (const p of PAGES) {
      const url = canonicalFor(p.path);
      expect(url.startsWith(`${SITE_URL}/`), `${p.path} -> ${url}`).toBe(true);
    }
  });

  it("gives the home page a trailing slash and no double slash anywhere", () => {
    expect(canonicalFor("/")).toBe(`${SITE_URL}/`);
    for (const p of PAGES) {
      expect(canonicalFor(p.path).replace(/^https:\/\//, "")).not.toContain("//");
    }
  });

  it("emits exactly one canonical link per page", () => {
    const head = pageHead("/pokedex");
    expect(head.links.filter((l) => l.rel === "canonical")).toHaveLength(1);
    expect(head.links[0]!.href).toBe(`${SITE_URL}/pokedex`);
  });
});

describe("noindex is applied where it belongs and nowhere else", () => {
  it("covers per-match, personal and referral URLs including their children", () => {
    expect(isNoindex("/pvp")).toBe(true);
    expect(isNoindex("/pvp/abc123")).toBe(true);
    expect(isNoindex("/pvp/live/abc123")).toBe(true);
    expect(isNoindex("/profile")).toBe(true);
    expect(isNoindex("/refer")).toBe(true);
  });

  it("never touches a page meant to rank", () => {
    // The whole point of the exercise is that these ARE indexable.
    for (const path of ["/", "/battle", "/pokedex", "/arena", "/shop", "/whos-that-pokemon"]) {
      expect(isNoindex(path), `${path} must stay indexable`).toBe(false);
    }
  });

  it("does not match a path that merely starts with the same letters", () => {
    // `/profiles` is not `/profile`, and a prefix check written with a bare
    // startsWith would have said it was.
    expect(isNoindex("/profiles-of-champions")).toBe(false);
    expect(isNoindex("/pvp-guide")).toBe(false);
  });

  it("puts a robots tag on a noindexed page and none on an indexable one", () => {
    const hidden = pageHead("/profile").meta.find((m) => m.name === "robots");
    expect(hidden?.content).toBe("noindex, follow");
    expect(pageHead("/pokedex").meta.find((m) => m.name === "robots")).toBeUndefined();
  });
});

describe("sitemap", () => {
  it("lists only indexable pages", () => {
    const paths = sitemapEntries().map((p) => p.path);
    for (const prefix of NOINDEX_PREFIXES) {
      expect(paths.some((p) => p.startsWith(prefix)), `${prefix} leaked into the sitemap`).toBe(
        false,
      );
    }
    expect(paths).toContain("/");
    expect(paths).toContain("/pokedex");
  });

  it("emits well-formed XML with absolute URLs", () => {
    const xml = buildSitemap();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml.trimEnd().endsWith("</urlset>")).toBe(true);
    // Relative URLs in a sitemap are rejected outright.
    for (const loc of xml.match(/<loc>([^<]+)<\/loc>/g) ?? []) {
      expect(loc).toContain("https://");
    }
    expect((xml.match(/<url>/g) ?? []).length).toBe(sitemapEntries().length);
  });

  it("matches the count of pages carrying a priority", () => {
    expect(sitemapEntries().length).toBe(PAGES.filter((p) => p.priority !== undefined).length);
  });
});

describe("share image", () => {
  it("is served from this site, not a third party", () => {
    // It used to point at the Lovable prototype's R2 bucket — infrastructure
    // nobody here controls, which would take every social preview with it if it
    // went away.
    expect(OG_IMAGE.startsWith(SITE_URL)).toBe(true);
    expect(OG_IMAGE).not.toContain("r2.dev");
    expect(OG_IMAGE).not.toContain("lovable");
  });
});
