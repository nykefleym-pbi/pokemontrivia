// server-first-refactor Phase 3 — daily-run.
//
// Closes DailyScreen.tsx's trust gap: today the client is handed the day's
// full question set (INCLUDING the correct answer index, via
// api.daily-challenge.ts), self-grades locally, and directly applies
// dailyReward()'s XP/TP to the store — nothing server-side validates the
// client's self-reported correct/total, or stops it from claiming the
// reward more than once per day (dailyDone/recordDaily are client-only
// store state).
//
// This function is the SOLE write path for a Daily Quest run: the client
// submits its full answer log for TODAY (server's own clock — the request
// carries no date, precisely so a client can't replay an old date's
// still-public daily_questions row to farm the reward for days it never
// played) in one call, once the run is finished. There's no per-question
// mirroring or resumable attempt state (unlike battle-solo/mega-run) because
// Daily Quest has no HP/early-termination mechanic — the client either
// completes all N questions or nothing is ever submitted, matching today's
// existing behavior exactly.
//
// Idempotency: daily_runs' own (user_id, date) unique constraint is the
// guard (insert first) — no separate ledger table needed since recording
// the run and granting the reward happen together, atomically, in this one
// call. Both `daily_runs` and `saves` grant the authenticated caller RLS
// access to their own row, so this function only ever uses the caller's own
// JWT client — no service-role key needed (unlike mega-reward-claim, where
// `grants` has no authenticated insert policy).
//
// `dailyReward` is imported directly from src/lib/rewards rather than hand-
// duplicated: that module has no React/Supabase/store imports and is already
// proven safe to bundle here — save-sync's own Edge Function already imports
// `battleReward` from this same file.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { dailyReward } from "../../../src/lib/rewards";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; msg: string } };

function json<T>(body: Envelope<T>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function err(code: string, msg: string, status: number) {
  return json({ ok: false, error: { code, msg } }, status);
}

function todayUTC(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface Body {
  picks: Array<number | null>;
  timeMs: number;
}

interface DailyQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return err("method_not_allowed", "POST only", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("unauthorized", "missing Authorization header", 401);

  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const token = authHeader.replace(/^Bearer /, "");
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData.user) return err("unauthorized", "no valid session", 401);
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return err("bad_json", "invalid JSON body", 400);
  }
  if (!Array.isArray(body.picks) || body.picks.length === 0) {
    return err("bad_request", "picks is required", 400);
  }
  if (typeof body.timeMs !== "number" || body.timeMs < 0) {
    return err("bad_request", "timeMs is required", 400);
  }

  const date = todayUTC();
  const { data: dq, error: dqErr } = await anon
    .from("daily_questions")
    .select("questions")
    .eq("date", date)
    .maybeSingle();
  if (dqErr) return err("db_error", dqErr.message, 500);
  if (!dq) return err("not_found", "no daily question set for today", 404);

  const questions = dq.questions as DailyQuestion[];
  const total = questions.length;
  if (body.picks.length !== total) {
    return err("bad_request", `picks must have exactly ${total} entries`, 400);
  }
  for (const p of body.picks) {
    if (p !== null && (!Number.isInteger(p) || p < 0 || p > 3)) {
      return err("bad_request", "each pick must be null or an integer 0-3", 400);
    }
  }

  const correct = body.picks.reduce(
    (n, pick, i) => n + (pick !== null && pick === questions[i].correct ? 1 : 0),
    0,
  );

  // Idempotency guard — a second submit for a date already recorded hits the
  // (user_id, date) unique constraint.
  const { error: runErr } = await anon.from("daily_runs").insert({
    user_id: userId,
    date,
    correct,
    total,
    time_ms: Math.round(body.timeMs),
  });
  if (runErr) {
    // 23505 = unique_violation: already submitted today.
    if (runErr.code === "23505") {
      return json({ ok: true, data: { correct, total, alreadyGranted: true, reward: null, save: null } });
    }
    return err("db_error", runErr.message, 500);
  }

  // dailyReward()'s own 6-correct floor: run recorded (blocks a second
  // submit today) regardless, but there's nothing to grant — no need to
  // even read `saves` for this branch, since the floor doesn't depend on
  // level.
  if (correct < 6) {
    return json({ ok: true, data: { correct, total, reward: null, save: null } });
  }

  // Apply additively to saves.state, retrying a bounded number of times on a
  // concurrent write — same pattern as save-sync's `replay` op and
  // mega-reward-claim.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing, error: readErr } = await anon
      .from("saves")
      .select("version, state")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return err("db_error", readErr.message, 500);
    if (!existing) {
      // No server save exists for this user on ANY device yet — same
      // precedent as mega-reward-claim/save-sync's `save: null`: the run is
      // already recorded (irreversibly — see the insert above), the caller
      // must not read this as "no reward". Level defaults to 1 (the store's
      // own default for a fresh player).
      const reward = dailyReward({ correct, total, level: 1 });
      return json({ ok: true, data: { correct, total, reward, save: null } });
    }

    const state = existing.state as Record<string, unknown>;
    const level = (state.level as number | undefined) ?? 1;
    const reward = dailyReward({ correct, total, level });
    const partnerId = (state.pokemon as { id?: number } | null)?.id;
    const currentTp = (state.trainingPoints as Record<string, number> | undefined) ?? {};
    const nextTp =
      partnerId != null
        ? { ...currentTp, [partnerId]: (currentTp[partnerId] ?? 0) + reward.tp }
        : currentTp;
    const nextState = {
      ...state,
      xp: ((state.xp as number | undefined) ?? 0) + reward.xp,
      trainingPoints: nextTp,
    };

    const { data: updatedRows, error: updErr } = await anon
      .from("saves")
      .update({ version: existing.version + 1, state: nextState })
      .eq("user_id", userId)
      .eq("version", existing.version)
      .select("version, state");
    if (updErr) return err("db_error", updErr.message, 500);
    if (updatedRows && updatedRows.length > 0) {
      return json({
        ok: true,
        data: {
          correct,
          total,
          reward,
          save: { version: updatedRows[0].version, state: updatedRows[0].state },
        },
      });
    }
    // Conflict — another write raced us; loop and retry with a fresh read.
  }

  return err("conflict", "too many concurrent writes to this save; try again", 409);
});
