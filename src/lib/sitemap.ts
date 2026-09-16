import { canonicalFor, isNoindex, PAGES } from "./seo";

/** XML text nodes must escape these five, and a title or path containing one
 *  would otherwise produce a sitemap that fails to parse — silently, since
 *  nothing fetches it in CI. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Pages worth listing: those with a priority, minus anything noindexed.
 *
 *  The `isNoindex` filter is belt and braces — a page should never have both a
 *  priority and a noindex prefix — but listing a noindexed URL in a sitemap is
 *  a contradiction that Search Console reports as an error, so it is worth
 *  making structurally impossible rather than relying on the table being
 *  written correctly. */
export function sitemapEntries() {
  return PAGES.filter((p) => p.priority !== undefined && !isNoindex(p.path));
}

export function buildSitemap(): string {
  const urls = sitemapEntries()
    .map(
      (p) =>
        `  <url>\n` +
        `    <loc>${escapeXml(canonicalFor(p.path))}</loc>\n` +
        `    <changefreq>weekly</changefreq>\n` +
        `    <priority>${p.priority!.toFixed(1)}</priority>\n` +
        `  </url>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
