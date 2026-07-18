// Live PvP Phase 4b: run the offline verifier against real production
// shadow-log data (see src/engine/pvp-shadow-verify.ts for the actual
// verification logic and rationale; this file is just the DB-fetching CLI
// shell around it).
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY -- the shadow-log
// table deliberately has no authenticated grants (see
// 20260718110000_pvp_live_answer_shadow_log.sql), so this can only be run
// with the project's service-role secret (not committed, not present in a
// sandboxed dev environment -- run this from wherever that secret lives).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     npx vite-node -c scripts/balance-sim/vite.config.ts scripts/pvp-shadow-verify/run.ts
import { createClient } from "@supabase/supabase-js";
import { verifyMatchSide, type ShadowLogRow } from "../../src/engine/pvp-shadow-verify";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY -- see this file's header comment.",
  );
  process.exit(1);
}

interface Row {
  id: number;
  match_id: string;
  question_index: number;
  side: "host" | "guest";
  verified_correct: boolean;
  runtime_snapshot: ShadowLogRow["runtimeSnapshot"];
  client_report: ShadowLogRow["clientReport"];
}

async function main() {
  const supabase = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!);

  const { data, error } = await supabase
    .from("pvp_live_answer_shadow_log")
    .select("*")
    .order("match_id", { ascending: true })
    .order("side", { ascending: true })
    .order("question_index", { ascending: true });

  if (error) {
    console.error("Failed to read pvp_live_answer_shadow_log:", error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as Row[];
  const groups = new Map<string, ShadowLogRow[]>();
  for (const r of rows) {
    const key = `${r.match_id}:${r.side}`;
    const shadowRow: ShadowLogRow = {
      id: r.id,
      matchId: r.match_id,
      questionIndex: r.question_index,
      side: r.side,
      verifiedCorrect: r.verified_correct,
      runtimeSnapshot: r.runtime_snapshot,
      clientReport: r.client_report,
    };
    const list = groups.get(key) ?? [];
    list.push(shadowRow);
    groups.set(key, list);
  }

  let total = 0;
  let matched = 0;
  let knownGap = 0;
  let mismatched = 0;
  const mismatches: unknown[] = [];

  for (const groupRows of groups.values()) {
    for (const result of verifyMatchSide(groupRows)) {
      total += 1;
      if (result.match) {
        matched += 1;
      } else if (result.knownGap) {
        knownGap += 1;
      } else {
        mismatched += 1;
        mismatches.push({
          matchId: result.row.matchId,
          side: result.row.side,
          questionIndex: result.row.questionIndex,
          expectedDmgSet: result.expectedDmgSet,
          reportedDmg: result.reportedDmg,
        });
      }
    }
  }

  console.log(`matches (${groups.size} match/side pairs, ${total} answers):`);
  console.log(`  matched:     ${matched}`);
  console.log(`  known gap:   ${knownGap} (Sword of Ruin arming not yet logged)`);
  console.log(`  MISMATCHED:  ${mismatched}`);
  if (mismatches.length > 0) {
    console.log("\nFirst 20 mismatches:");
    console.log(JSON.stringify(mismatches.slice(0, 20), null, 2));
  }
  process.exit(mismatched > 0 ? 1 : 0);
}

void main();
