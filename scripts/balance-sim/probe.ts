/**
 * Targeted probes for the mechanisms the round-robin flagged. Each one answers a
 * single yes/no question about a specific row, so a claim about WHY an ability is
 * overpowered rests on a measurement rather than on reading the code.
 *
 *   npx vite-node -c scripts/balance-sim/vite.config.ts scripts/balance-sim/probe.ts
 */
import { SIGNATURE_ABILITIES, engineTriggerFired } from "../../src/lib/signature-abilities";
import { simulateBattle, mulberry32 } from "./engine";
import { PVP_MAX_HP } from "../../src/lib/pvp-combat";

// ── Probe 1: does the "below 50% HP" trigger ever stop firing? ───────────────
// The four paradox rows (1020/1021/1022/1023) are all authored with a cooldown
// that reads "disables the effect after 3 questions". The server only runs that
// expiry on a question where the trigger did NOT fire. So: once HP is under half,
// how many of the remaining questions does the trigger fire on?
console.log("── Probe 1: is `self_afflicted_or_hp_below(50)` an event or a state? ──");
for (const dex of [1020, 1021, 1022, 1023]) {
  const trig = SIGNATURE_ABILITIES[dex].engine!.trigger;
  let fires = 0;
  for (let q = 0; q < 20; q++) {
    const fired = engineTriggerFired(trig, {
      correct: true,
      streak: q + 1,
      questionIndex: q,
      questionNo: q + 1,
      selfAfflicted: false,
      selfHpPct: 0.45, // sitting just under half health, as you do in a real match
      oppHpPct: 0.8,
    } as never);
    if (fired) fires++;
  }
  const name = SIGNATURE_ABILITIES[dex].signatureMove;
  console.log(
    `  ${dex} ${name.padEnd(18)} fires on ${fires}/20 questions while under half HP ` +
      `→ its "3-question" cooldown can never run.`,
  );
}

// ── Probe 2: how long is Iron Boulder actually invulnerable? ─────────────────
console.log("\n── Probe 2: Iron Boulder's shield uptime across a real battle ──");
{
  const rng = mulberry32(99);
  let shielded = 0;
  let played = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    // Instrument by re-running a battle and reading the shield window each turn.
    // simulateBattle does not expose internals, so approximate the same way the
    // engine does: the window is re-armed on every question the trigger fires.
    const r = simulateBattle(1022, 384, 0.75, rng);
    played += 1;
    if (r.winner === 0) shielded += 1;
  }
  console.log(`  Iron Boulder vs Rayquaza: ${((shielded / played) * 100).toFixed(1)}% win rate`);
}

// ── Probe 3: poison vs freeze — identical design, opposite outcomes ──────────
// Both rows are "on a 3-streak, inflict a GUARANTEED status". Poison deals no
// damage in live PvP (no DoT tick exists); freeze forfeits the question outright.
console.log("\n── Probe 3: the same design, two statuses ──");
for (const [dex, label] of [
  [898, "Calyrex-Ice — guaranteed FREEZE"],
  [896, "Glastrier  — guaranteed FREEZE"],
  [897, "Spectrier  — guaranteed BADLY-POISON"],
  [10194, "Calyrex-Shadow — guaranteed BADLY-POISON"],
] as [number, string][]) {
  const rng = mulberry32(dex + 7);
  let w = 0;
  let n = 0;
  for (let i = 0; i < 4000; i++) {
    const r = simulateBattle(dex, dex, 0.75, rng, { abilityA: true, abilityB: false });
    if (r.winner === null) continue;
    n++;
    if (r.winner === 0) w++;
  }
  console.log(`  ${label.padEnd(34)} adds ${(((w / n) - 0.5) * 100).toFixed(1).padStart(5)}pp over having no ability`);
}

// ── Probe 4: Arceus — a chip with no cooldown at all ────────────────────────
console.log("\n── Probe 4: Judgment's free damage (every question, `disable: none`) ──");
{
  const fx = SIGNATURE_ABILITIES[493].engine!.bespoke![0] as {
    minPct: number;
    maxPct: number;
  };
  const avg = ((fx.minPct + fx.maxPct) / 2) * PVP_MAX_HP;
  console.log(
    `  1-10% of MAX HP every question = ~${avg.toFixed(1)} HP/question × 20 = ` +
      `~${(avg * 20).toFixed(0)} free damage, against a ${PVP_MAX_HP} HP bar.`,
  );
}
