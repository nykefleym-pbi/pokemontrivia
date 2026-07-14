// server-first-refactor P2 — save-sync (02-architecture.md §6.3/§6.4).
//
// The versioned replacement for the client's localStorage-persisted save.
// Auth: verify_jwt is on (see supabase/config.toml), so the platform already
// rejects a missing/invalid token before this function runs; we still call
// auth.getUser() ourselves to get a verified user id rather than trust a
// hand-decoded JWT claim.
//
// Every query runs through a supabase-js client built with the CALLER's own
// JWT (never the service-role key), so `saves` RLS (owner-only) is the real
// authority here — this function is a thin, auth-forwarding wrapper around it,
// not a bypass.
//
// `replay` (the offline-queue op in the frozen contract) is intentionally not
// implemented yet: it needs engine/turn.ts's `replay()` (turn reducer), which
// doesn't exist until a later phase. Requesting it returns `unimplemented`
// rather than silently accepting battle logs it can't verify.
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

interface PullOp {
  op: "pull";
}
interface PushOp {
  op: "push";
  baseVersion: number;
  save: unknown;
}
interface ReplayOp {
  op: "replay";
  battles: { cfg: unknown; seed: string; log: unknown[] }[];
}
type Body = PullOp | PushOp | ReplayOp;

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

  if (body.op === "pull") {
    const { data, error } = await supabase
      .from("saves")
      .select("version, state")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return err("db_error", error.message, 500);
    if (!data) return json({ ok: true, data: { save: null, version: 0 } });
    return json({ ok: true, data: { save: data.state, version: data.version } });
  }

  if (body.op === "push") {
    if (typeof body.baseVersion !== "number" || body.save == null) {
      return err("bad_request", "baseVersion and save are required", 400);
    }

    const { data: existing, error: readErr } = await supabase
      .from("saves")
      .select("version")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return err("db_error", readErr.message, 500);

    if (!existing) {
      if (body.baseVersion !== 0) return json({ ok: true, data: { conflict: true } });
      const { data: inserted, error: insErr } = await supabase
        .from("saves")
        .insert({ user_id: userId, version: 1, state: body.save })
        .select("version")
        .single();
      if (insErr) {
        // 23505 = unique_violation: another push raced us and inserted first.
        if (insErr.code === "23505") return json({ ok: true, data: { conflict: true } });
        return err("db_error", insErr.message, 500);
      }
      return json({ ok: true, data: { version: inserted.version } });
    }

    if (existing.version !== body.baseVersion) {
      return json({ ok: true, data: { conflict: true } });
    }

    // The extra `.eq("version", ...)` re-checks the version at write time, so
    // a second push racing between our read and write above can't silently
    // overwrite it — it will affect 0 rows and we report a conflict instead.
    const { data: updatedRows, error: updErr } = await supabase
      .from("saves")
      .update({ version: existing.version + 1, state: body.save })
      .eq("user_id", userId)
      .eq("version", body.baseVersion)
      .select("version");
    if (updErr) return err("db_error", updErr.message, 500);
    if (!updatedRows || updatedRows.length === 0) return json({ ok: true, data: { conflict: true } });
    return json({ ok: true, data: { version: updatedRows[0].version } });
  }

  if (body.op === "replay") {
    return err("unimplemented", "replay requires engine/turn.ts's replay(), not yet built", 501);
  }

  return err("bad_op", "op must be pull, push, or replay", 400);
});
