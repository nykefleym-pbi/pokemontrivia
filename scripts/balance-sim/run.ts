/**
 * Balance run: measure every Legendary/Mythical signature against every other.
 *
 *   npx vite-node scripts/balance-sim/run.ts -- [battlesPerPair] [skill]
 *
 * Two measurements, because they answer different questions:
 *   1. vs-NEUTRAL — the same species with its signature switched OFF. This is
 *      "how much does the ability itself add?", free of matchup noise. 50% = the
 *      ability does nothing at all.
 *   2. ROUND-ROBIN — every legendary against every other legendary, which is the
 *      population players actually face and the one Paul's "no legendary should
 *      be overpowered over another" is about.
 */
import { SIGNATURE_ABILITIES, signatureMoveName } from "../../src/lib/signature-abilities";
import { simulateBattle, mulberry32 } from "./engine";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2).filter((a) => a !== "--");
const PER_PAIR = Number(args[0] ?? 60);
const SKILL = Number(args[1] ?? 0.75);
const VS_NEUTRAL = 4000;

const IDS = Object.keys(SIGNATURE_ABILITIES)
  .map(Number)
  .sort((a, b) => a - b);

console.log(
  `Simulating ${IDS.length} Legendary/Mythical rows — skill ${SKILL}, ${PER_PAIR} battles/pair ` +
    `(${(IDS.length * (IDS.length - 1) * PER_PAIR).toLocaleString()} round-robin battles)`,
);

// ── 1. vs-neutral: ability ON vs the SAME species with ability OFF ───────────
const solo: Record<number, number> = {};
for (const id of IDS) {
  const rng = mulberry32(id * 7919 + 13);
  let wins = 0;
  let games = 0;
  for (let i = 0; i < VS_NEUTRAL; i++) {
    const r = simulateBattle(id, id, SKILL, rng, { abilityA: true, abilityB: false });
    if (r.winner === null) continue;
    games++;
    if (r.winner === 0) wins++;
  }
  solo[id] = games ? wins / games : 0.5;
}

// ── 2. round-robin ───────────────────────────────────────────────────────────
const wins: Record<number, number> = {};
const games: Record<number, number> = {};
const worst: Record<number, { opp: number; wr: number }> = {};
for (const id of IDS) {
  wins[id] = 0;
  games[id] = 0;
}

for (let i = 0; i < IDS.length; i++) {
  for (let j = i + 1; j < IDS.length; j++) {
    const a = IDS[i];
    const b = IDS[j];
    const rng = mulberry32(a * 100003 + b);
    let aw = 0;
    let n = 0;
    for (let k = 0; k < PER_PAIR; k++) {
      // Alternate seats so any first-mover effect cancels.
      const r = k % 2 === 0 ? simulateBattle(a, b, SKILL, rng) : simulateBattle(b, a, SKILL, rng);
      const aWon = k % 2 === 0 ? r.winner === 0 : r.winner === 1;
      if (r.winner === null) continue;
      n++;
      if (aWon) aw++;
    }
    if (!n) continue;
    wins[a] += aw;
    games[a] += n;
    wins[b] += n - aw;
    games[b] += n;
    const wrA = aw / n;
    if (!worst[b] || wrA > worst[b].wr) worst[b] = { opp: a, wr: wrA };
    if (!worst[a] || 1 - wrA > worst[a].wr) worst[a] = { opp: b, wr: 1 - wrA };
  }
}

const rows = IDS.map((id) => {
  const ab = SIGNATURE_ABILITIES[id];
  return {
    id,
    move: signatureMoveName(id) ?? "?",
    key: ab.internalKey,
    rarity: ab.rarity,
    rr: games[id] ? wins[id] / games[id] : 0,
    solo: solo[id],
    trigger: ab.engine?.trigger.type ?? ab.trigger.type,
    disable: ab.engine?.disable.kind ?? "—",
    hasEngine: !!ab.engine,
  };
}).sort((a, b) => b.rr - a.rr);

const pct = (x: number) => (x * 100).toFixed(1).padStart(5) + "%";
console.log("\n═══ ROUND-ROBIN (win rate vs the whole Legendary/Mythical field) ═══");
console.log("  rank  dex   win%   solo%  ability                     trigger / cooldown");
rows.forEach((r, i) => {
  const flag = r.rr >= 0.6 ? "  <<< OP" : r.rr <= 0.4 ? "  <<< weak" : "";
  console.log(
    `  ${String(i + 1).padStart(3)}  ${String(r.id).padStart(5)} ${pct(r.rr)} ${pct(r.solo)}  ` +
      `${r.move.padEnd(26)} ${r.trigger} / ${r.disable}${flag}`,
  );
});

const mean = rows.reduce((s, r) => s + r.rr, 0) / rows.length;
const sd = Math.sqrt(rows.reduce((s, r) => s + (r.rr - mean) ** 2, 0) / rows.length);
console.log(
  `\nfield mean ${pct(mean)}  sd ${(sd * 100).toFixed(1)}pp  ` +
    `spread ${pct(rows[0].rr)} … ${pct(rows[rows.length - 1].rr)}`,
);

writeFileSync(
  new URL("./results.json", import.meta.url),
  JSON.stringify({ skill: SKILL, perPair: PER_PAIR, mean, sd, rows }, null, 2),
);
console.log("\nwrote scripts/balance-sim/results.json");
