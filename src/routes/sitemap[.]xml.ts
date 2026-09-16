import { createFileRoute } from "@tanstack/react-router";
import { buildSitemap } from "@/lib/sitemap";

/** Served, not checked in as a static file.
 *
 *  A `public/sitemap.xml` is a second list of routes maintained by hand, and it
 *  goes stale the first time someone adds a page and forgets it. This renders
 *  from `PAGES` in lib/seo.ts — the same table the pages themselves get their
 *  titles from — so a route with metadata is a route in the sitemap, and there
 *  is no way to have one without the other. */
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () =>
        new Response(buildSitemap(), {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            // Crawlers re-fetch this often; a day of caching is plenty and
            // keeps it off the function's critical path.
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
          },
        }),
    },
  },
});
