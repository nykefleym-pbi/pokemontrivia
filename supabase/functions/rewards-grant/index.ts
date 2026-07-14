// server-first-refactor P2 — rewards-grant (02-architecture.md §6.3/§6.4).
//
// Idempotent grant ledger. A grant (achievement/badge/level) can only ever be
// recorded once per (user, kind, ref_id) — the `grants` table's primary key
// is the idempotency guarantee, so calling this twice for the same reward is
// always safe.
//
// SCOPE: this endpoint owns recording that a grant happened, not computing
// what it's worth. Turning a grant into actual XP/coins/items requires the
// achievement/level reward definitions living in src/content (not migrated
// yet — see 02-architecture.md §7 domain 9) and a patched `saves.state`. Until
// that lands, a successful grant returns `save: null`; callers must not treat
// that as "no reward" — it means "reward computation isn't wired up yet".
// Faking a payout here would be worse than admitting it's not built.
//
// Auth: verify_jwt is on, so the platform already rejects a missing/invalid
// token. `grants` RLS is owner-read-only — no INSERT policy exists for
// `authenticated` — so this function uses the service-role key to write,
// which is exactly the "definer write" the table's RLS comment describes.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

const VALID_KINDS = new Set(["achievement", "badge", "level"]);

interface Body {
  kind: string;
  id: string;
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

  if (!VALID_KINDS.has(body.kind)) {
    return err("bad_request", `kind must be one of: ${[...VALID_KINDS].join(", ")}`, 400);
  }
  if (typeof body.id !== "string" || body.id.length === 0) {
    return err("bad_request", "id is required", 400);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: existing, error: readErr } = await admin
    .from("grants")
    .select("granted_at")
    .eq("user_id", userId)
    .eq("kind", body.kind)
    .eq("ref_id", body.id)
    .maybeSingle();
  if (readErr) return err("db_error", readErr.message, 500);

  if (existing) {
    return json({ ok: true, data: { granted: false, alreadyGranted: true, save: null } });
  }

  const { error: insErr } = await admin
    .from("grants")
    .insert({ user_id: userId, kind: body.kind, ref_id: body.id });
  if (insErr) {
    // 23505 = unique_violation: a concurrent call already recorded this grant.
    if (insErr.code === "23505") {
      return json({ ok: true, data: { granted: false, alreadyGranted: true, save: null } });
    }
    return err("db_error", insErr.message, 500);
  }

  return json({ ok: true, data: { granted: true, save: null } });
});
