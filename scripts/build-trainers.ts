// Scrape Bulbagarden trainer sprite categories (Gen III/IV/V only).
// One pass: fetch + filter + dedupe + write.
// Run with: bun scripts/build-trainers.ts
import { writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const AVATAR_DIR = "public/trainers/avatar";

const CATEGORIES: { url: string; gen: 3 | 4 | 5 }[] = [
  { url: "https://archives.bulbagarden.net/wiki/Category:Generation_III_Trainer_sprites", gen: 3 },
  { url: "https://archives.bulbagarden.net/wiki/Category:Generation_IV_Trainer_sprites", gen: 4 },
  { url: "https://archives.bulbagarden.net/wiki/Category:Generation_V_Trainer_sprites", gen: 5 },
];

const GAME_PREFIX_RE = /^(B2W2|HGSS|FRLG|BW|B2|W2|DP|Pt|RS|FR|LG|B|W|E)_(.+)$/i;
const PREFIX_PRIORITY: Record<string, number> = {
  B2W2: 100, HGSS: 90, BW: 85, B2: 80, W2: 79,
  PT: 70, DP: 65, FRLG: 50, FR: 45, LG: 44,
  E: 30, RS: 20, B: 10, W: 9, "": 0,
};

interface Raw { prefix: string; displayName: string; url: string; }

function normalize(filename: string): string {
  // Strip .png and normalize spaces → underscores so all subsequent checks are uniform.
  return filename.replace(/\.png$/i, "").replace(/\s+/g, "_");
}

function shouldSkip(filename: string): boolean {
  const base = normalize(filename).replace(/^Spr_/i, "");
  if (/(^|_)back(_|$)/i.test(base)) return true;
  if (/_AGB-001(_|$)/i.test(base)) return true;
  if (/_DOL-\w+/i.test(base)) return true;
  if (/_NDS(_|$)/i.test(base)) return true;
  if (/_GBA(_|$)/i.test(base)) return true;
  if (/_\d+(_|$)/.test(base)) return true;
  if (/(^|_)(beta|proto|prototype|old|unused)(_|$)/i.test(base)) return true;
  if (/(^|_)JP(_|$)/i.test(base)) return true;
  if (/portrait/i.test(base)) return true;
  if (/(^|_)OD(_|$)/i.test(base)) return true;
  if (/(^|_)(Alt|EX|Sygna|Holiday|Palentines|Anniversary|Special|Costume|Champion|Kimono|Academy)(_|$)/i.test(base)) return true;
  return false;
}

function parseSprite(filename: string): Raw | null {
  let base = normalize(filename).replace(/^Spr_/i, "");
  const m = base.match(GAME_PREFIX_RE);
  let prefix = "";
  if (m) {
    prefix = m[1].toUpperCase();
    base = m[2];
  }
  const displayName = base.replace(/_/g, " ").trim();
  if (!displayName) return null;
  return { prefix, displayName, url: "" };
}

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 trainer-roster-builder" } });
  return res.text();
}

async function scrapeCategory(startUrl: string): Promise<Raw[]> {
  const out: Raw[] = [];
  const seen = new Set<string>();
  let url: string | null = startUrl;
  let page = 0;
  while (url && page < 20) {
    const html = await fetchPage(url);
    const re = /<img alt="" src="(https:\/\/archives\.bulbagarden\.net\/media\/upload\/[^"]+\.png)"[^>]*>[\s\S]*?title="File:([^"]+\.png)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const fullUrl = m[1].replace("/media/upload/thumb/", "/media/upload/").replace(/\/\d+px-[^/]+$/, "");
      const filename = m[2];
      if (seen.has(filename)) continue;
      seen.add(filename);
      if (shouldSkip(filename)) continue;
      const parsed = parseSprite(filename);
      if (!parsed) continue;
      parsed.url = fullUrl;
      out.push(parsed);
    }
    const nextMatch = html.match(/<a href="([^"]+)"[^>]*>next page<\/a>/i);
    url = nextMatch ? nextMatch[1].replace(/&amp;/g, "&") : null;
    if (url && url.startsWith("/")) url = `https://archives.bulbagarden.net${url}`;
    page++;
    console.log(`  page ${page}: ${out.length} sprites total`);
  }
  return out;
}

async function main() {
  console.log(`Scraping ${CATEGORIES.length} categories...`);
  const allRaw: Raw[] = [];
  for (const c of CATEGORIES) {
    console.log(`Scraping gen ${c.gen}...`);
    const items = await scrapeCategory(c.url);
    allRaw.push(...items);
  }

  // Dedupe by lowercased display name; keep highest-priority prefix.
  const groups = new Map<string, Raw[]>();
  for (const r of allRaw) {
    const key = r.displayName.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  const final: { id: string; name: string; url: string }[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (PREFIX_PRIORITY[b.prefix] ?? 0) - (PREFIX_PRIORITY[a.prefix] ?? 0));
    const chosen = list[0];
    const id = chosen.displayName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    if (!id) continue;
    if (!chosen.url || !chosen.url.startsWith("https://archives.bulbagarden.net/")) continue;
    final.push({ id, name: chosen.displayName, url: chosen.url });
  }

  // Dedupe by id (ascii-stripped names can collide)
  const byId = new Map<string, { id: string; name: string; url: string }>();
  for (const t of final) if (!byId.has(t.id)) byId.set(t.id, t);
  const list = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));

  writeFileSync("src/lib/trainer-data.generated.json", JSON.stringify(list));
  const body =
`// AUTO-GENERATED by scripts/build-trainers.ts. Do not edit.
import data from "./trainer-data.generated.json";
export interface TrainerSprite {
  id: string;
  name: string;
  url: string;
}
export const TRAINER_SPRITES: TrainerSprite[] = data as TrainerSprite[];
`;
  writeFileSync("src/lib/trainer-data.generated.ts", body);
  console.log(`wrote ${list.length} trainers`);
}

main().catch((e) => { console.error(e); process.exit(1); });
