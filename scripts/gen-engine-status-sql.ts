/**
 * Generate the `engine_status` catalog rows for the M4 migration straight from
 * the TS catalog, so the DB and the client can never drift.
 *
 * Every engine row carrying `engine.status` needs a matching server row: the
 * client only reports that the trigger fired, the SERVER rolls the chance and
 * applies the status. Run: npx tsx scripts/gen-engine-status-sql.ts
 */
import { SIGNATURE_ABILITIES } from "../src/lib/signature-abilities";

const lines: string[] = [];
for (const ability of Object.values(SIGNATURE_ABILITIES)) {
  const statuses = ability.engine?.status;
  if (!statuses?.length) continue;
  statuses.forEach((s, i) => {
    const payload: Record<string, unknown> = {
      status: s.status,
      chance: s.chance,
      questions: s.questions,
    };
    if (s.ifOpponentSpeciesAny) payload.ifOpponentSpeciesAny = s.ifOpponentSpeciesAny;
    lines.push(
      `  (${ability.pokemonId}, ${80 + i}, 'engine_status', '${s.target}', 'status', '${JSON.stringify(payload)}'::jsonb),`,
    );
  });
}
console.log(lines.join("\n"));
console.error(`engine_status rows: ${lines.length}`);
