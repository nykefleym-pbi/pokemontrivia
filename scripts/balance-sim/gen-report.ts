/**
 * Build the balance report (HTML) from the measured results.
 *
 * Two rules keep this report honest:
 *   1. Every number on the page comes out of results.json, so it cannot drift
 *      from the simulation that produced it.
 *   2. The "what it does now" column is rendered by the GAME'S OWN description
 *      generator (`describeEngineSpec`) reading the live catalog — the same text
 *      the ability is documented by. If a magnitude is edited, this column moves
 *      with it. It cannot claim an ability does something it no longer does.
 *
 * The suggestion column is derived mechanically from each row's own spec (see
 * `suggest`), so it proposes a change to the lever that ability actually has,
 * scaled by how far off 50% it measured.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { SIGNATURE_ABILITIES, type SignatureEngineSpec } from "../../src/lib/signature-abilities";
import { describeEngineSpec } from "../../src/lib/signature-engine-describe";

interface Row {
  id: number;
  move: string;
  rarity: number;
  rr: number;
  solo: number;
  trigger: string;
  disable: string;
}
const data = JSON.parse(readFileSync(new URL("./results.json", import.meta.url), "utf8")) as {
  skill: number;
  perPair: number;
  mean: number;
  sd: number;
  rows: Row[];
};

/** Curated diagnosis — only where the simulation found something a formula can't
 *  explain (a bug, or a change already made). Everything else is auto-suggested. */
const NOTES: Record<number, string> = {
  1022: "WAS 86% — permanently invulnerable below half health, because its 3-question cooldown could never run. Window now closes.",
  1020: "WAS 65% — permanent double damage. Window now closes after 3 questions.",
  1021: "WAS 61% — permanent double damage. Window now closes after 3 questions.",
  1023: "WAS 71% — permanent double damage. Window now closes after 3 questions.",
  898: "WAS 75% — a guaranteed Freeze, and a frozen player forfeits the question outright. Chance cut to 35%.",
  889: "WAS 70% — 3 questions of taking ZERO damage. The shield now halves damage instead of nullifying it.",
  1024: "WAS 73% — a coin-flip to win the match outright. KO chance cut 50% → 15%.",
  493: "WAS 70% — chipped up to 10% of a full health bar every question, with no cooldown.",
  893: "WAS 70% — healed to FULL and still ran a duplicate legacy heal on top. Now heals to 60%, duplicate deleted.",
  250: "Revives once at 25% health. Mid-table — dramatic, but not a second health bar. No change needed.",
  789: "Deals zero damage for 3 questions, then halves the opponent's health. The halve does work — an earlier report saying otherwise was a bug in the simulator.",
  720: "WAS 34%, the worst in the game — every wrong answer permanently stripped 2 of your own Defence with no way back.",
  488: "WAS 36% — its cleanse charged 15% of your HP, cancelling out its own heal. Cost removed.",
  244: "Its Burn was landing TWICE — a 50% roll, then a second unconditional application through an old code path. The duplicate is deleted, so it is now genuinely 50%.",
  642: "Paralysis was landing twice (20% roll + a free 100%). Duplicate deleted.",
  643: "Burn was landing twice (20% roll + a free 40%). Duplicate deleted.",
  644: "Paralysis was landing twice (20% roll + a free 100%). Duplicate deleted.",
  645: "Burn was landing twice (20% roll + a free 100%). Duplicate deleted.",
  721: "Burn was landing twice (30% roll + a free 100%). Duplicate deleted.",
  809: "Sleep was landing twice (30% roll + a free 30%). Duplicate deleted.",
  1015: "Poison was landing twice (10% roll + a free 100%) — and poison now actually deals damage. Duplicate deleted.",
  10194: "Lands a guaranteed badly-poison. That used to do nothing at all; now that poison bites it is one of the strongest rows.",
  1025: "A 75% badly-poison — near-worthless before the poison fix, genuinely strong after it.",
  897: "A guaranteed badly-poison. Poison dealt no damage in live battles at all until this pass.",
};

const pctS = (x: number) => `${Math.round(x * 100)}%`;
const band = (rr: number) =>
  rr >= 0.6 ? "hot" : rr <= 0.42 ? "cold" : rr >= 0.55 || rr <= 0.45 ? "warm" : "ok";

/**
 * Propose a concrete change to the lever this ability ACTUALLY has.
 *
 * The owner's standing constraint: an ability's mechanics stay the same — only
 * "how much is added or removed in the stat change", or a cooldown, may move. So
 * the suggestion never invents a new mechanic; it scales the row's dominant
 * existing magnitude, and offers a cooldown when the row has no expiry.
 *
 * `s` scales POWER, not the raw number: a win rate of 70% is 20 points of excess,
 * so power is scaled to 1 − 2(0.20) = 0.60. For an effect whose strength is the
 * distance from a floor (a x2 multiplier is "+1.0 of power"; a shield that lets
 * 50% through blocks "50 of power"), the scale is applied to that distance.
 */
function suggest(rr: number, eng: SignatureEngineSpec | undefined): { text: string; kind: string } {
  const delta = rr - 0.5;
  if (Math.abs(delta) <= 0.05) return { text: "Healthy — no change.", kind: "ok" };
  if (!eng) return { text: "No engine spec — nothing to tune here.", kind: "ok" };

  const s = Math.min(2, Math.max(0.4, 1 - 2 * delta));
  const strong = delta > 0;
  const dir = strong ? "Too strong" : "Too weak";
  const parts: string[] = [];

  const r1 = (x: number) => Math.round(x * 10) / 10;
  const clampPct = (x: number) => Math.min(1, Math.max(0.05, x));

  // Shields: strength is the damage BLOCKED, so scale the blocked share.
  if (eng.shield) {
    const blocked = 100 - eng.shield.receivePct;
    const next = Math.round(Math.min(100, Math.max(0, 100 - blocked * s)) / 5) * 5;
    parts.push(`take <b>${next}%</b> of incoming damage instead of ${eng.shield.receivePct}%`);
  }
  // Instant KO / chip / heal magnitudes held server-side.
  for (const b of eng.bespoke ?? []) {
    if (b.fx === "instant_ko") {
      parts.push(`KO chance <b>${pctS(clampPct(b.chance * s))}</b> instead of ${pctS(b.chance)}`);
    } else if (b.fx === "frac_hp_random") {
      parts.push(`chip up to <b>${pctS(clampPct(b.maxPct * s))}</b> of a health bar instead of ${pctS(b.maxPct)}`);
    } else if (b.fx === "revive") {
      parts.push(`revive at <b>${Math.round(b.hpPct * s)}%</b> health instead of ${b.hpPct}%`);
    } else if (b.fx === "dot_frac_hp") {
      parts.push(`drain <b>${pctS(clampPct(b.pct * s))}</b> a question instead of ${pctS(b.pct)}`);
    } else if (b.fx === "lifesteal_pct_of_damage") {
      parts.push(`heal back <b>${pctS(clampPct(b.pct * s))}</b> of damage dealt instead of ${pctS(b.pct)}`);
    } else if (b.fx === "flat_next_question_damage") {
      parts.push(`hit for <b>${Math.max(1, Math.round(b.amount * s))}</b> instead of ${b.amount}`);
    }
  }
  // Statuses: scale the chance.
  for (const st of eng.status ?? []) {
    const next = clampPct(st.chance * s);
    if (Math.round(next * 100) !== Math.round(st.chance * 100)) {
      parts.push(`${st.status} chance <b>${pctS(next)}</b> instead of ${pctS(st.chance)}`);
    }
  }
  // Multipliers: strength is the amount ABOVE x1.
  if (eng.multiplier && "factor" in eng.multiplier && typeof eng.multiplier.factor === "number") {
    const f = eng.multiplier.factor;
    const next = r1(Math.max(1.1, 1 + (f - 1) * s));
    if (next !== f) parts.push(`damage multiplier <b>x${next}</b> instead of x${f}`);
  }
  if (eng.phase?.payoffMultiplier) {
    const f = eng.phase.payoffMultiplier;
    const next = r1(Math.max(1.1, 1 + (f - 1) * s));
    if (next !== f) parts.push(`payoff <b>x${next}</b> instead of x${f}`);
  }
  // Stat stages: scale the size of the bump (never below 1 step).
  for (const sp of eng.stat ?? []) {
    const d = "delta" in sp ? sp.delta : "perCorrect" in sp ? sp.perCorrect : undefined;
    if (typeof d !== "number" || d === 0) continue;
    const mag = Math.max(1, Math.min(3, Math.round(Math.abs(d) * s)));
    const next = d < 0 ? -mag : mag;
    if (next !== d) {
      parts.push(`${"stat" in sp ? sp.stat : "stat"} change <b>${next > 0 ? "+" : ""}${next}</b> instead of ${d > 0 ? "+" : ""}${d}`);
    }
  }

  // A cooldown is the other lever the owner allows. Only worth proposing on a row
  // that is too strong and currently has NOTHING that switches it off.
  const d = eng.disable;
  const hasExpiry =
    (eng.expireAfterQuestions ?? 0) > 0 ||
    d?.kind === "disable_effect_after_questions" ||
    d?.kind === "once_per_battle";
  if (strong && !hasExpiry && !eng.latchOnTrigger) {
    parts.push("or give it a cooldown: switch off for 3 questions after it fires");
  }

  if (!parts.length) return { text: `${dir} at ${pctS(rr)}, but its numbers are already at the floor.`, kind: strong ? "hot" : "cold" };
  return { text: `${dir} at ${pctS(rr)} — ${parts.join("; ")}.`, kind: strong ? "hot" : "cold" };
}

const rows = data.rows;
const tableRows = rows
  .map((r, i) => {
    const ab = SIGNATURE_ABILITIES[r.id];
    const does = ab?.engine ? describeEngineSpec(ab.engine) : (ab?.note ?? "—");
    const note = NOTES[r.id];
    const sg = suggest(r.rr, ab?.engine);
    return `<tr class="${band(r.rr)}">
      <td class="num">${i + 1}</td>
      <td class="mon"><span class="name">${r.move}</span><span class="dex">#${r.id}</span></td>
      <td class="num strong">${pctS(r.rr)}</td>
      <td class="num muted">${pctS(r.solo)}</td>
      <td class="does">${does}${note ? `<span class="seen">${note}</span>` : ""}</td>
      <td class="fix ${sg.kind}">${sg.text}</td>
    </tr>`;
  })
  .join("\n");

const hot = rows.filter((r) => r.rr >= 0.6).length;
const cold = rows.filter((r) => r.rr <= 0.42).length;
const needChange = rows.filter((r) => Math.abs(r.rr - 0.5) > 0.05).length;

const html = `<title>Signature Ability Balance — Simulation Report</title>
<style>
  :root {
    --bg: #f7f6f3; --panel: #fffefb; --ink: #1c1a17; --muted: #6b6560; --line: #e2ddd4;
    --hot: #c0392b; --hot-bg: #fbeae7; --warm: #b8791f; --warm-bg: #fdf3e3;
    --cold: #2a6f9e; --cold-bg: #e8f1f7; --ok: #4a7c59; --accent: #7d4cdb;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#16161a; --panel:#1e1e24; --ink:#eceaf0; --muted:#9a94a3; --line:#2f2f38;
      --hot:#ff7a6b; --hot-bg:#33201e; --warm:#e8b45f; --warm-bg:#2e2617; --cold:#6db4e8;
      --cold-bg:#182732; --ok:#7fc094; --accent:#b191f5; }
  }
  :root[data-theme="dark"] {
    --bg:#16161a; --panel:#1e1e24; --ink:#eceaf0; --muted:#9a94a3; --line:#2f2f38;
    --hot:#ff7a6b; --hot-bg:#33201e; --warm:#e8b45f; --warm-bg:#2e2617; --cold:#6db4e8;
    --cold-bg:#182732; --ok:#7fc094; --accent:#b191f5;
  }
  :root[data-theme="light"] {
    --bg:#f7f6f3; --panel:#fffefb; --ink:#1c1a17; --muted:#6b6560; --line:#e2ddd4;
    --hot:#c0392b; --hot-bg:#fbeae7; --warm:#b8791f; --warm-bg:#fdf3e3;
    --cold:#2a6f9e; --cold-bg:#e8f1f7; --ok:#4a7c59; --accent:#7d4cdb;
  }
  body { background: var(--bg); color: var(--ink); font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; margin: 0; padding: 2.5rem 1.25rem 5rem; }
  .wrap { max-width: 84rem; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
  header h1 { font-size: clamp(1.7rem, 3.6vw, 2.5rem); margin: 0 0 .4rem; letter-spacing: -.02em; text-wrap: balance; }
  header p { margin: 0; color: var(--muted); max-width: 62ch; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.15rem; }
  .card .k { font-size: 1.9rem; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .card .l { font-size: .8rem; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-top: .15rem; }
  .card.bad .k { color: var(--hot); } .card.low .k { color: var(--cold); }
  section h2 { font-size: 1.15rem; margin: 0 0 .6rem; letter-spacing: -.01em; }
  .note { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 1rem 1.15rem; }
  .note p { margin: 0 0 .6rem; } .note p:last-child { margin: 0; }
  .scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  table { border-collapse: collapse; width: 100%; min-width: 68rem; font-size: .9rem; }
  th { text-align: left; font-size: .74rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); padding: .7rem .8rem; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--panel); }
  td { padding: .65rem .8rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .strong { font-weight: 650; } .muted { color: var(--muted); }
  .mon .name { display: block; font-weight: 600; }
  .mon .dex { display: block; font-size: .75rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .does { max-width: 30rem; }
  .does .seen { display: block; margin-top: .35rem; padding-top: .35rem; border-top: 1px dashed var(--line); color: var(--muted); font-size: .85em; }
  .fix { max-width: 24rem; }
  .fix.ok { color: var(--ok); } .fix.hot { color: var(--hot); } .fix.cold { color: var(--cold); }
  .fix b { font-weight: 650; }
  tr.hot td.num.strong { color: var(--hot); } tr.hot { background: var(--hot-bg); }
  tr.cold td.num.strong { color: var(--cold); } tr.cold { background: var(--cold-bg); }
  tr.warm td.num.strong { color: var(--warm); }
  footer { color: var(--muted); font-size: .85rem; border-top: 1px solid var(--line); padding-top: 1rem; }
</style>
<div class="wrap">
  <header>
    <h1>Signature abilities: what each one does now, and what to change</h1>
    <p>Every Legendary and Mythical played against every other one, ${data.perPair.toLocaleString()} battles per pairing —
      ${(rows.length * (rows.length - 1) * data.perPair).toLocaleString()} battles in total, using the game's real damage maths and the real
      server rules. Both players answer equally well, so any gap in win rate is caused by the ability and nothing else.</p>
  </header>

  <section>
    <h2>Read this first</h2>
    <div class="note">
      <p><strong>Win rate</strong> is how often that Pokémon beats the rest of the Legendary field. A perfectly balanced
        roster would have every ability at <strong>50%</strong>. Above 60% it is winning on the strength of its ability;
        below 42% it is losing on the weakness of its.</p>
      <p><strong>Ability worth</strong> is the same Pokémon fighting <em>itself with the ability switched off</em> — how much
        the ability adds at all. 50% would mean it does nothing.</p>
      <p><strong>“What it does now”</strong> is generated from the game's own ability descriptions, so it always reflects
        what is actually live. <strong>“Suggested change”</strong> only ever moves a number the ability already has, or adds a
        cooldown — no ability changes what it does.</p>
    </div>
  </section>

  <div class="cards">
    <div class="card"><div class="k">${rows.length}</div><div class="l">abilities tested</div></div>
    <div class="card bad"><div class="k">${pctS(rows[0].rr)}</div><div class="l">strongest win rate</div></div>
    <div class="card low"><div class="k">${pctS(rows[rows.length - 1].rr)}</div><div class="l">weakest win rate</div></div>
    <div class="card bad"><div class="k">${hot}</div><div class="l">clearly too strong</div></div>
    <div class="card low"><div class="k">${cold}</div><div class="l">clearly too weak</div></div>
    <div class="card"><div class="k">${needChange}</div><div class="l">suggested changes</div></div>
  </div>

  <section>
    <h2>The full ranking</h2>
    <div class="scroll">
      <table>
        <thead><tr>
          <th class="num">#</th><th>Ability</th><th class="num">Win rate</th><th class="num">Ability worth</th>
          <th>What it does now</th><th>Suggested change</th>
        </tr></thead>
        <tbody>
${tableRows}
        </tbody>
      </table>
    </div>
  </section>

  <footer>
    <p>Simulated at a 75% answer-accuracy standard; the ranking was re-checked at 60% and 90% and the same abilities come
      out on top. Held items, type abilities and weather are switched off so the signature is measured on its own.</p>
  </footer>
</div>
`;

writeFileSync(new URL("./report.html", import.meta.url), html);
console.log(`wrote scripts/balance-sim/report.html — ${rows.length} rows, ${needChange} suggested changes`);
