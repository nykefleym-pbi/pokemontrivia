// server-first-refactor P3 — battle-solo (02-architecture.md P3 scope).
//
// CRUD scaffold only: `start` creates a server-seeded solo_battles row,
// `get` reads one back. Both are owner-scoped via the caller's forwarded JWT
// (never service-role), same as save-sync — RLS is the real authority.
//
// `submit_action` intentionally returns `unimplemented`: validating a client
// action against server state needs engine/turn.ts's `reduce()`, which isn't
// built yet (see that file's own comment on why porting solo battle's ~50
// per-ability damage special cases needs a regression harness first, not a
// guess). Accepting actions without that would mean either trusting
// client-reported damage/HP outright, or silently getting the battle math
// wrong for every player — this function does neither until reduce() exists.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

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
    if (body.cfg == null) return err("bad_request", "cfg is required", 400);
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
    return err(
      "unimplemented",
      "submit_action requires engine/turn.ts's reduce(), not yet built",
      501,
    );
  }

  return err("bad_op", "op must be start, get, or submit_action", 400);
});
