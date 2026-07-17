// server-first-refactor Phase 2 — mega-run (closing Mega Raid's trust gap).
//
// submit_action replays the attempt's whole action log through
// engine/mega-replay.ts's applyMegaAnswer/applyMegaPotion/applyMegaXAttack/
// applyMegaForfeit (via engine/mega-battle-replay.ts) to derive the
// authoritative boss/player HP trajectory, instead of trusting the client's
// self-scored final tally. An `answer` action's correctness is resolved
// EXACTLY ONCE per question, via the existing `reveal_mega_answer` RPC
// (already SECURITY DEFINER, already the only way anything reads
// mega_event_questions' answer key) — never re-derived on replay, see
// mega-battle-replay.ts's module doc for why. Once a run concludes, this
// function calls the EXISTING `submit_mega_run` RPC with the REPLAYED
// accuracy/correct/total/time_ms — reusing its already-correct active-window
// check, 2-attempt cap, and keep-best logic unchanged, per the plan's
// explicit instruction not to redesign what's already correct there.
//
// BUILD: this file is NOT what gets deployed directly — same reason as
// battle-solo/index.ts (Deno can't resolve relative imports into src/engine/**
// on Supabase's flat deploy target). Run
// `node scripts/bundle-edge-function.mjs mega-run` to produce a single
// self-contained ESM file, and deploy THAT. Never hand-edit the bundle —
// edit this file and re-bundle.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import {
  applyNextMegaAction,
  isValidMegaRaidAction,
  MegaRaidActionError,
  type MegaRaidAction,
  type StoredMegaRaidAction,
} from "../../../src/engine/mega-battle-replay";

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

interface StartOp {
  op: "start";
  eventId: string;
}
interface GetOp {
  op: "get";
  attemptId: string;
}
interface SubmitActionOp {
  op: "submit_action";
  attemptId: string;
  action: unknown;
}
type Body = StartOp | GetOp | SubmitActionOp;

Deno.serve(async (req) => {
  if (req.method !== "POST") return err("method_not_allowed", "POST only", 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return err("unauthorized", "missing Authorization header", 401);

  const supabase = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace(/^Bearer /, "");
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData.user) return err("unauthorized", "no valid session", 401);
  const userId = userData.user.id;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return err("bad_json", "invalid JSON body", 400);
  }

  if (body.op === "start") {
    if (typeof body.eventId !== "string" || body.eventId.length === 0) {
      return err("bad_request", "eventId is required", 400);
    }
    const { data: event, error: eventErr } = await supabase
      .from("mega_events")
      .select("id, starts_at, ends_at")
      .eq("id", body.eventId)
      .maybeSingle();
    if (eventErr) return err("db_error", eventErr.message, 500);
    if (!event) return err("not_found", "no such Mega event", 404);
    const now = Date.now();
    if (now < Date.parse(event.starts_at) || now >= Date.parse(event.ends_at)) {
      return err("event_inactive", "this Mega event isn't currently active", 409);
    }

    // Resume an in-progress attempt if one already exists.
    const { data: existing, error: existingErr } = await supabase
      .from("mega_attempts")
      .select("id, total, log, status")
      .eq("user_id", userId)
      .eq("event_id", body.eventId)
      .maybeSingle();
    if (existingErr) return err("db_error", existingErr.message, 500);
    if (existing && existing.status === "in_progress") {
      return json({ ok: true, data: { attemptId: existing.id, total: existing.total, log: existing.log } });
    }

    const { data: questions, error: qErr } = await supabase.rpc("get_mega_questions_public", {
      p_event_id: body.eventId,
    });
    if (qErr) return err("db_error", qErr.message, 500);
    const total = Array.isArray(questions) ? questions.length : 0;
    if (total === 0) return err("no_questions", "this event's question set isn't ready yet", 409);

    // Clear a stale finished row (shouldn't normally exist — submit_action
    // deletes on conclusion — but don't let one block a rematch).
    if (existing) await supabase.from("mega_attempts").delete().eq("id", existing.id);

    const { data: inserted, error: insErr } = await supabase
      .from("mega_attempts")
      .insert({ user_id: userId, event_id: body.eventId, total, log: [] })
      .select("id")
      .single();
    if (insErr) return err("db_error", insErr.message, 500);
    return json({ ok: true, data: { attemptId: inserted.id, total, log: [] } });
  }

  if (body.op === "get") {
    if (typeof body.attemptId !== "string" || body.attemptId.length === 0) {
      return err("bad_request", "attemptId is required", 400);
    }
    const { data, error } = await supabase
      .from("mega_attempts")
      .select("id, event_id, total, log, status")
      .eq("id", body.attemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return err("db_error", error.message, 500);
    if (!data) return err("not_found", "no attempt with that id", 404);
    return json({ ok: true, data });
  }

  if (body.op === "submit_action") {
    if (typeof body.attemptId !== "string" || body.attemptId.length === 0) {
      return err("bad_request", "attemptId is required", 400);
    }
    if (!isValidMegaRaidAction(body.action)) return err("bad_request", "action is missing or malformed", 400);
    const action = body.action as MegaRaidAction;

    const { data: row, error: selErr } = await supabase
      .from("mega_attempts")
      .select("id, event_id, total, log, status")
      .eq("id", body.attemptId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr) return err("db_error", selErr.message, 500);
    if (!row) return err("not_found", "no attempt with that id", 404);
    if (row.status !== "in_progress") return err("battle_ended", "this run has already ended", 409);

    let stored: StoredMegaRaidAction;
    if (action.type === "answer") {
      const { data: revealed, error: revealErr } = await supabase.rpc("reveal_mega_answer", {
        p_event_id: row.event_id,
        p_q_index: action.questionIdx,
      });
      if (revealErr) return err("db_error", revealErr.message, 500);
      const r = revealed as { ok?: boolean; correct_index?: number } | null;
      if (!r || !r.ok || typeof r.correct_index !== "number") {
        return err("reveal_failed", "couldn't resolve this question's answer — try again", 502);
      }
      stored = {
        type: "answer",
        questionIdx: action.questionIdx,
        choiceIdx: action.choiceIdx,
        correct: action.choiceIdx !== null && action.choiceIdx === r.correct_index,
      };
    } else {
      stored = action;
    }

    const existingLog = (row.log ?? []) as StoredMegaRaidAction[];
    let result;
    try {
      result = applyNextMegaAction(row.total, existingLog, stored);
    } catch (e) {
      if (e instanceof MegaRaidActionError) return err(e.code, e.message, 409);
      throw e;
    }

    const ended = result.state.phase !== "in_progress";
    const { error: updErr } = await supabase
      .from("mega_attempts")
      .update({ log: result.log, status: result.state.phase })
      .eq("id", body.attemptId);
    if (updErr) return err("db_error", updErr.message, 500);

    if (!ended) {
      return json({ ok: true, data: { state: result.state, ended: false } });
    }

    const { data: createdAtRow } = await supabase
      .from("mega_attempts")
      .select("created_at")
      .eq("id", body.attemptId)
      .maybeSingle();
    const timeMs = createdAtRow ? Date.now() - Date.parse(createdAtRow.created_at) : 0;
    const accuracy = Math.round((result.state.correctCount / row.total) * 100);

    const { data: submitData, error: submitErr } = await supabase.rpc("submit_mega_run", {
      p_event_id: row.event_id,
      p_accuracy: accuracy,
      p_correct: result.state.correctCount,
      p_total: row.total,
      p_time_ms: timeMs,
    });

    // The attempt concluded either way — clear it so a rematch starts fresh.
    await supabase.from("mega_attempts").delete().eq("id", body.attemptId);

    if (submitErr) {
      return json({
        ok: true,
        data: { state: result.state, ended: true, submit: { ok: false, error: submitErr.message } },
      });
    }
    return json({
      ok: true,
      data: { state: result.state, ended: true, submit: { ok: true, row: submitData } },
    });
  }

  return err("bad_op", "op must be start, get, or submit_action", 400);
});
