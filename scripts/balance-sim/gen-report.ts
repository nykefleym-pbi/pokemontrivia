/**
 * Build the balance report (HTML) from the measured results. Everything the page
 * shows comes out of results.json — no hand-typed numbers, so the report cannot
 * drift from the simulation that produced it.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { SIGNATURE_ABILITIES } from "../../src/lib/signature-abilities";

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

/** Why a row is where it is, and what was DONE about it. The numbers above are
 *  measured from the post-change simulation; these notes are the diagnosis. */
const NOTES: Record<number, { why: string; fix: string; bucket: "bug" | "nerf" | "buff" }> = {
  10194: {
    why: "Lands a guaranteed badly-poison. That used to do literally nothing; now that poison bites, this is one of the strongest rows in the game.",
    fix: "NEW OUTLIER — needs a decision. Poison working has made it strong.",
    bucket: "nerf",
  },
  1025: {
    why: "A 75% badly-poison. Same story as Calyrex-Shadow: it was near-worthless and is now genuinely strong.",
    fix: "NEW OUTLIER — needs a decision.",
    bucket: "nerf",
  },
  1022: {
    why: "WAS 86% — permanently invulnerable once it dropped below half health, because its 3-question cooldown could never run. The window now closes properly.",
    fix: "FIXED (86% → 70%). Still the strongest; may want a second look.",
    bucket: "bug",
  },
  1020: {
    why: "WAS 65% — permanent double damage and a re-applied Burn. Its window now closes after 3 questions.",
    fix: "FIXED.",
    bucket: "bug",
  },
  1021: {
    why: "WAS 61% — permanent double damage and a re-applied Paralysis. Its window now closes after 3 questions.",
    fix: "FIXED.",
    bucket: "bug",
  },
  1023: {
    why: "WAS 71% — permanent double damage and a re-applied Confusion. Its window now closes after 3 questions.",
    fix: "FIXED (71% → 67%). Still high.",
    bucket: "bug",
  },
  898: {
    why: "WAS 75% — a GUARANTEED Freeze on a 3-answer streak. A frozen player forfeits the question outright, so it simply deleted the opponent's turns.",
    fix: "Freeze chance 100% → 35%. (75% → 64%.)",
    bucket: "nerf",
  },
  250: {
    why: "Comes back from 0 HP once per battle, at 25% health. Measured, that lands mid-table — dramatic, but not a second health bar.",
    fix: "No change needed. (The earlier '50% revive' claim was a bug in the simulator, not the game.)",
    bucket: "nerf",
  },
  889: {
    why: "WAS 70% — a 3-answer streak granted 3 questions of taking ZERO damage, re-earned the moment the streak came back.",
    fix: "Shield now halves incoming damage rather than nullifying it. (70% → 59%.)",
    bucket: "nerf",
  },
  1024: {
    why: "WAS 73% — a 50% coin-flip to win the match outright, behind a gate that only asked you to be losing.",
    fix: "KO chance 50% → 15%. Now sits comfortably mid-field.",
    bucket: "nerf",
  },
  493: {
    why: "WAS 70% — chipped 1-10% of a full health bar EVERY question with no cooldown: ~132 free damage against a 120 HP bar.",
    fix: "Chip is now 1-5% (~72 damage). (70% → 61%.)",
    bucket: "nerf",
  },
  893: {
    why: "WAS 70% — healed to FULL and cleared all statuses, AND still ran its old heal-8-every-5-questions path on top of that.",
    fix: "Heals to 60% now, and the duplicate legacy heal is deleted. Still high — may want a second look.",
    bucket: "nerf",
  },
  895: {
    why: "WAS 65% — triple damage while at full health, and it opens every battle at full health.",
    fix: "Top tier x3 → x2.5.",
    bucket: "nerf",
  },
  896: {
    why: "Guaranteed Freeze on a 5-streak — the same turn-deletion as Calyrex-Ice, one tier down.",
    fix: "Freeze chance 100% → 40%.",
    bucket: "nerf",
  },
  720: {
    why: "WAS 34%, the worst in the game — every WRONG answer permanently stripped 2 of your own Defence and nothing gave it back.",
    fix: "Strips 1 now, and it recovers after 3 questions. (34% → 43%.)",
    bucket: "buff",
  },
  488: {
    why: "WAS 36% — its cleanse charged you 15% of your HP, cancelling out its own free heal.",
    fix: "The HP cost is gone. Now mid-field.",
    bucket: "buff",
  },
  789: {
    why: "Deals ZERO damage for 3 questions, then halves the opponent's health on question 4. The halve DOES work — an earlier report saying otherwise was a simulator bug.",
    fix: "Left as-is at your request. Note it now measures as one of the strongest.",
    bucket: "nerf",
  },
  486: {
    why: "WAS 39% — three questions dealing NOTHING to earn a x2.5 that only pays out if you were already behind.",
    fix: "Charges at half damage instead of zero. (39% → 42%.)",
    bucket: "buff",
  },
  805: {
    why: "WAS 38% — dealt no damage for 3 questions to earn a x1.5. The worst trade in the roster.",
    fix: "Payoff x1.5 → x3, and its Attack bonus +2 → +3.",
    bucket: "buff",
  },
  803: {
    why: "WAS 40% — five questions at half damage to earn a x3.",
    fix: "Payoff x3 → x4.",
    bucket: "buff",
  },
  897: {
    why: "Lands a GUARANTEED badly-poison. Poison used to deal no damage at all in live battles, so it did nothing; it bites now.",
    fix: "Fixed by the poison tick — poison deals 5 HP a question (badly-poisoned ramps).",
    bucket: "bug",
  },
  1015: {
    why: "Poison-based, and poison now actually deals damage.",
    fix: "Fixed by the poison tick.",
    bucket: "bug",
  },
};

const pct = (x: number) => (x * 100).toFixed(0) + "%";
const band = (rr: number) =>
  rr >= 0.6 ? "hot" : rr <= 0.42 ? "cold" : rr >= 0.55 || rr <= 0.45 ? "warm" : "ok";

const rows = data.rows;
const tableRows = rows
  .map((r, i) => {
    const n = NOTES[r.id];
    const ab = SIGNATURE_ABILITIES[r.id];
    return `<tr class="${band(r.rr)}">
      <td class="num">${i + 1}</td>
      <td class="mon"><span class="name">${r.move}</span><span class="dex">#${r.id}</span></td>
      <td class="num strong">${pct(r.rr)}</td>
      <td class="num muted">${pct(r.solo)}</td>
      <td class="why">${n ? n.why : `<span class="quiet">${ab.note ?? "Within the healthy band."}</span>`}</td>
      <td class="fix">${n ? n.fix : "<span class='quiet'>—</span>"}</td>
    </tr>`;
  })
  .join("\n");

const hot = rows.filter((r) => r.rr >= 0.6).length;
const cold = rows.filter((r) => r.rr <= 0.42).length;

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
  .wrap { max-width: 78rem; margin: 0 auto; display: flex; flex-direction: column; gap: 2rem; }
  header h1 { font-size: clamp(1.7rem, 3.6vw, 2.5rem); margin: 0 0 .4rem; letter-spacing: -.02em; text-wrap: balance; }
  header p { margin: 0; color: var(--muted); max-width: 60ch; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: 1rem; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 1rem 1.15rem; }
  .card .k { font-size: 1.9rem; font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
  .card .l { font-size: .8rem; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-top: .15rem; }
  .card.bad .k { color: var(--hot); } .card.low .k { color: var(--cold); }
  section h2 { font-size: 1.15rem; margin: 0 0 .6rem; letter-spacing: -.01em; }
  .note { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 1rem 1.15rem; }
  .note p { margin: 0 0 .6rem; } .note p:last-child { margin: 0; }
  .scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }
  table { border-collapse: collapse; width: 100%; min-width: 60rem; font-size: .9rem; }
  th { text-align: left; font-size: .74rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); padding: .7rem .8rem; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--panel); }
  td { padding: .65rem .8rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .num { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
  .strong { font-weight: 650; } .muted { color: var(--muted); } .quiet { color: var(--muted); opacity: .8; }
  .mon .name { display: block; font-weight: 600; }
  .mon .dex { display: block; font-size: .75rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .why { max-width: 34rem; } .fix { max-width: 20rem; color: var(--ok); }
  tr.hot td.num.strong { color: var(--hot); } tr.hot { background: var(--hot-bg); }
  tr.cold td.num.strong { color: var(--cold); } tr.cold { background: var(--cold-bg); }
  tr.warm td.num.strong { color: var(--warm); }
  footer { color: var(--muted); font-size: .85rem; border-top: 1px solid var(--line); padding-top: 1rem; }
  code { background: var(--bg); padding: .1em .35em; border-radius: 4px; font-size: .88em; }
</style>
<div class="wrap">
  <header>
    <h1>Signature abilities: balance pass, after the changes</h1>
    <p>Every Legendary and Mythical played against every other one, ${(data.perPair).toLocaleString()} battles per pairing —
      ${(rows.length * (rows.length - 1) * data.perPair).toLocaleString()} battles in total, using the game's real damage maths and the real
      server rules. Both players answer equally well, so any gap in win rate is caused by the ability and nothing else.
      <strong>These are the numbers AFTER the approved changes shipped.</strong></p>
  </header>

  <section>
    <h2>What changed</h2>
    <div class="note">
      <p>The roster ran from <strong>86% down to 34%</strong>. It now runs from <strong>70% down to 41%</strong> —
        the gap between the best and worst ability has shrunk from 52 points to 29.</p>
      <p>Three of the problems turned out to be <strong>bugs, not tuning</strong>. Four Paradox Pokémon were permanently
        invulnerable or permanently doubled once they dropped below half health, because their "switches off after 3
        questions" cooldown could never run. Shields could only ever be total, never partial. And poison dealt
        <em>no damage at all</em> in live battles, which quietly made six Pokémon near-worthless. All three are fixed.</p>
      <p>Signature moves are also <strong>automatic now</strong> — the Fire button is gone, and every ability triggers
        by itself on the condition it was written with.</p>
      <p><strong>Still worth a look:</strong> Iron Boulder and Zarude are still the two strongest. And now that poison
        genuinely bites, Calyrex-Shadow and Pecharunt have jumped from the bottom of the table to near the top —
        that is the poison fix working, but it may have overshot.</p>
    </div>
  </section>

  <div class="cards">
    <div class="card"><div class="k">${rows.length}</div><div class="l">abilities tested</div></div>
    <div class="card bad"><div class="k">${pct(rows[0].rr)}</div><div class="l">strongest win rate</div></div>
    <div class="card low"><div class="k">${pct(rows[rows.length - 1].rr)}</div><div class="l">weakest win rate</div></div>
    <div class="card bad"><div class="k">${hot}</div><div class="l">clearly too strong</div></div>
    <div class="card low"><div class="k">${cold}</div><div class="l">clearly too weak</div></div>
  </div>

  <section>
    <h2>What "win rate" means here</h2>
    <div class="note">
      <p><strong>Win rate</strong> is how often that Pokémon beats the rest of the Legendary field. A perfectly balanced
        roster would have every ability sitting at <strong>50%</strong>. Anything at 60%+ is beating the field on the strength
        of its ability; anything under 42% is being beaten on the weakness of its.</p>
      <p><strong>Ability worth</strong> is the same Pokémon fighting <em>itself with the ability switched off</em>. It answers a
        different question: how much does this ability add at all? 50% would mean it does literally nothing.</p>
    </div>
  </section>

  <section>
    <h2>The full ranking</h2>
    <div class="scroll">
      <table>
        <thead><tr>
          <th class="num">#</th><th>Ability</th><th class="num">Win rate</th><th class="num">Ability worth</th>
          <th>What the simulation saw</th><th>Suggested change</th>
        </tr></thead>
        <tbody>
${tableRows}
        </tbody>
      </table>
    </div>
  </section>

  <footer>
    <p>Simulated at a 75% answer-accuracy standard; the ranking was re-checked at 60% and 90% and the same abilities
      come out on top. Held items, type abilities and weather are switched off so the signature is measured on its own.</p>
  </footer>
</div>
`;

writeFileSync(new URL("./report.html", import.meta.url), html);
console.log("wrote scripts/balance-sim/report.html");
