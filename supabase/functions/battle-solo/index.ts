// server-first-refactor P3 — battle-solo (02-architecture.md P3 scope).
//
// submit_action is now real: it replays the battle's whole action log
// through engine/turn.ts's applyAnswer/applyRoundStart (via
// engine/solo-battle-replay.ts) to derive the authoritative next state,
// instead of trusting a client-reported HP/damage number. The question set
// (with correct answers) lives in `cfg`, embedded once at `start` — the
// client already has the questions loaded to display them, so handing them
// to the server once needs no new plumbing to a second database the rest of
// the game keeps separate from this function. See
// src/engine/solo-battle-config.ts's SoloBattleCfg for the exact shape and
// why it holds raw facts (pokemon ids, ability, level) rather than
// pre-computed matchup booleans a client could otherwise fake.
//
// player-identifying fields in cfg (playerPokemonId/abilityId/level/
// trainingPoints) are accepted as given by the authenticated caller and NOT
// cross-checked against their saved profile in this pass — same trust level
// the rest of the client-authoritative game already has, and orthogonal to
// why solo battles are being made server-authoritative (consistent, replayable
// battle MATH, not anti-cheat on the player's own single-player stats).
//
// BUILD: this file is NOT what gets deployed directly. Deno can't resolve its
// relative imports into src/engine/** without the whole repo present on the
// deploy target, and Supabase's deploy tool takes a flat file list, not a
// directory. Run `node scripts/bundle-edge-function.mjs battle-solo` to
// produce a single self-contained ESM file, and deploy THAT. Never hand-edit
// the bundle — edit this file and re-bundle.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { applyNextAction, SoloBattleActionError } from "../../../src/engine/solo-battle-replay";
import { isValidSoloBattleCfg } from "../../../src/engine/solo-battle-config";
import { isValidBattleAction, type BattleAction } from "../../../src/engine/turn";

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
  cfg: unknown;
}
interface GetOp {
  op: "get";
  battleId: string;
}
interface SubmitActionOp {
  op: "submit_action";
  battleId: string;
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
    if (!isValidSoloBattleCfg(body.cfg)) return err("bad_request", "cfg is missing or malformed", 400);
    const seed = crypto.randomUUID();
    const { data, error } = await supabase
      .from("solo_battles")
      .insert({ user_id: userId, seed, cfg: body.cfg })
      .select("id, seed")
      .single();
    if (error) return err("db_error", error.message, 500);
    return json({ ok: true, data: { battleId: data.id, seed: data.seed } });
  }

  if (body.op === "get") {
    if (typeof body.battleId !== "string" || body.battleId.length === 0) {
      return err("bad_request", "battleId is required", 400);
    }
    const { data, error } = await supabase
      .from("solo_battles")
      .select("id, seed, cfg, log, status, result")
      .eq("id", body.battleId)
      .maybeSingle();
    if (error) return err("db_error", error.message, 500);
    if (!data) return err("not_found", "no battle with that id", 404);
    return json({ ok: true, data });
  }

  if (body.op === "submit_action") {
    if (typeof body.battleId !== "string" || body.battleId.length === 0) {
      return err("bad_request", "battleId is required", 400);
    }
    if (!isValidBattleAction(body.action)) return err("bad_request", "action is missing or malformed", 400);

    const { data: row, error: selError } = await supabase
      .from("solo_battles")
      .select("id, seed, cfg, log, status")
      .eq("id", body.battleId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selError) return err("db_error", selError.message, 500);
    if (!row) return err("not_found", "no battle with that id", 404);
    if (!isValidSoloBattleCfg(row.cfg)) return err("corrupt_row", "this battle's cfg is malformed", 500);

    const existingLog = (row.log ?? []) as BattleAction[];
    let result;
    try {
      result = applyNextAction(row.cfg, existingLog, row.seed, body.action as BattleAction);
    } catch (e) {
      if (e instanceof SoloBattleActionError) return err(e.code, e.message, 409);
      throw e;
    }

    const newLog = [...existingLog, body.action];
    const ended = result.state.phase !== "in_progress";
    const newResult = ended
      ? {
          won: result.state.phase === "won",
          maxStreak: result.state.maxStreak,
          correctCount: result.state.correctCount,
        }
      : null;

    const { error: updError } = await supabase
      .from("solo_battles")
      .update({ log: newLog, status: result.state.phase, result: newResult })
      .eq("id", body.battleId);
    if (updError) return err("db_error", updError.message, 500);

    return json({ ok: true, data: { state: result.state, events: result.lastEvents } });
  }

  return err("bad_op", "op must be start, get, or submit_action", 400);
});
