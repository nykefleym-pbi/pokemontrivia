// Run with: bun scripts/clean-trainers.ts
import { readFileSync, writeFileSync } from "node:fs";

interface TrainerSprite { id: string; name: string; url: string; gen: 3 | 4 | 5 | "masters"; }

const raw: TrainerSprite[] = JSON.parse(readFileSync("src/lib/trainer-data.generated.json", "utf8"));

const noBacks = raw.filter((t) => {
  const n = t.name.toLowerCase();
  if (/\bback\b/.test(n)) return false;
  if (n.includes("portrait")) return false;
  if (/\bbeta\b/.test(n)) return false;
  if (/\bproto\b/.test(n)) return false;
  if (/\bsygna\b/.test(n)) return false;
  if (/\bjp\b/.test(n)) return false;
  if (/_jp$/i.test(t.id)) return false;
  if (n.includes("aura")) return false;
  if (n.includes("classic")) return false;
  if (n.includes("alt")) return false;
  return true;
});

const isBaseMaster = (t: TrainerSprite) => {
  if (t.gen !== "masters") return true;
  const tail = t.id.replace(/^masters-/, "");
  if (/[-_]\d+$/.test(tail)) return false;
  const events = ["ex", "sygna", "holiday", "palentines", "palentine", "anniversary",
                  "special-costume", "champion", "alt", "academy", "fall", "summer",
                  "spring", "new-year", "kimono", "dojo-uniform", "arc"];
  for (const e of events) {
    if (tail.endsWith(`-${e}`) || tail.includes(`-${e}-`)) return false;
  }
  return true;
};
const noMastersDupes = noBacks.filter(isBaseMaster);

const GEN_PRIORITY: Record<string, number> = {
  "masters": 100,
  "b2w2": 90, "bw": 80,
  "hgss": 70, "pt": 60, "dp": 50,
  "frlg": 40, "e": 30, "rs": 20,
};

const PREFIX_RE = /^(masters|b2w2|bw|hgss|pt|dp|frlg|e|rs)\s+/i;

const groupKey = (name: string) =>
  name.replace(PREFIX_RE, "").trim().toLowerCase();

const groups = new Map<string, TrainerSprite[]>();
for (const t of noMastersDupes) {
  const key = groupKey(t.name);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key)!.push(t);
}

const dedupedRaw: TrainerSprite[] = [];
for (const [, list] of groups) {
  list.sort((a, b) => {
    const pa = GEN_PRIORITY[String(a.gen)] ?? 0;
    const pb = GEN_PRIORITY[String(b.gen)] ?? 0;
    return pb - pa;
  });
  dedupedRaw.push(list[0]);
}

const cleaned = dedupedRaw.filter((t) => {
  if (!t.url || !t.url.startsWith("https://archives.bulbagarden.net/")) return false;
  if (t.url.includes("%25C3%25A9")) return false;
  return true;
});

const final = cleaned.map((t) => ({
  ...t,
  name: t.name.replace(PREFIX_RE, "").trim(),
}));

final.sort((a, b) => a.name.localeCompare(b.name));

writeFileSync("src/lib/trainer-data.generated.json", JSON.stringify(final));
console.log(`Cleaned: ${raw.length} → ${final.length} trainers`);
