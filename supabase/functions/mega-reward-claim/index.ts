// server-first-refactor Phase 2 — mega-reward-claim.
//
// Closes MegaLeaderboard.tsx's `claimReward()` trust gap: today, a claim is
// guarded only by the client-persisted `claimedMegaRewards` array (a store
// slice cleared by reinstall, wiped storage, or a second device) before
// directly calling `addXp`/`addCoins`/`addTrainingPoints` — nothing stops a
// player from claiming the same event's reward repeatedly. This function
// makes the CORE reward (XP/coins/Training Points, scaled by
// `megaRankScale(rank)` — the part every participant earns, not just the
// champion) a real, idempotent, server-computed grant instead.
//
// Idempotency reuses the EXISTING `grants` ledger (see
// p2_saves_and_grants.sql) rather than a new table — a Mega reward claim is
// exactly the same shape (one grant per user per event, ever) as an
// achievement/badge/level grant already is; only the CHECK constraint needed
// extending (see p2_mega_reward_grants.sql) to add the `mega_reward` kind.
// `rewards-grant`'s own Edge Function is NOT reused directly: it deliberately
// only records the fact of a grant and never computes/applies a payout (see
// its module doc) — this function needs to do both, so it owns its own
// grants-table insert instead, using the same service-role write rewards-
// grant uses (grants has no INSERT policy for `authenticated`).
//
// `rank` is computed HERE, server-side, via the existing get_mega_leaderboard
// RPC — never trusted from the client — before scaling the reward.
//
// SCOPE (deliberately narrow, same discipline as save-sync's "battles only"
// note): only the universal XP/coins/TP slice is made idempotent+server-
// applied here. The champion-only bonuses (10 random items, a Poké Egg, a
// Pokédex capture, the champion trophy, and any level-up cascade) still
// apply from the client in MegaLeaderboard.tsx's claimReward() — porting
// those needs several more store-slice shapes (inventory/eggs/pokedex/
// trophies/level-rewards) individually verified, which is out of scope for
// this pass. Not yet wired into MegaLeaderboard.tsx at all — see the plan's
// UI-wiring step.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Hand-duplicated from src/lib/mega/schedule.ts: that module imports the
// browser Supabase client and uses React hooks, so it can't be imported here
// without pulling non-isomorphic code into the bundle — the exact mistake
// already caught (and fixed) in engine/mega-replay.ts for MEGA_BOSS_HP. Keep
// these two in sync with schedule.ts's MEGA_REWARD/megaRankScale by hand.
const MEGA_REWARD = { xp: 2500, coins: 2500, tp: 1000 } as const;
function megaRankScale(rank: number): number {
  if (rank === 1) return 1;
  if (rank === 2) return 0.5;
  if (rank === 3) return 0.3;
  return 0.05;
}

type Envelope<T> = { ok: true; data: T } | { ok: false; error: { code: string; msg: string } };

function json<T>(body: Envelope<T>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(code: string, msg: string, status: number) {
  return json({ ok: false, error: { code, msg } }, status);
}

interface Body {
  eventId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
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
  if (typeof body.eventId !== "string" || body.eventId.length === 0) {
    return err("bad_request", "eventId is required", 400);
  }

  const { data: event, error: eventErr } = await anon
    .from("mega_events")
    .select("id, ends_at")
    .eq("id", body.eventId)
    .maybeSingle();
  if (eventErr) return err("db_error", eventErr.message, 500);
  if (!event) return err("not_found", "no such Mega event", 404);
  if (Date.now() < Date.parse(event.ends_at)) {
    return err("event_not_ended", "this event hasn't ended yet", 409);
  }

  const { data: run, error: runErr } = await anon
    .from("mega_runs")
    .select("user_id")
    .eq("user_id", userId)
    .eq("event_id", body.eventId)
    .maybeSingle();
  if (runErr) return err("db_error", runErr.message, 500);
  if (!run) return err("no_run", "you didn't complete a run in this event", 409);

  const { data: board, error: boardErr } = await anon.rpc("get_mega_leaderboard", {
    p_event_id: body.eventId,
    p_limit: 1000,
  });
  if (boardErr) return err("db_error", boardErr.message, 500);
  const rows = (board ?? []) as { user_id: string }[];
  const idx = rows.findIndex((r) => r.user_id === userId);
  const rank = idx >= 0 ? idx + 1 : rows.length + 1;

  // Idempotency guard — service role, since `grants` has no authenticated
  // INSERT policy (mirrors rewards-grant/index.ts exactly).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error: grantErr } = await admin
    .from("grants")
    .insert({ user_id: userId, kind: "mega_reward", ref_id: body.eventId });
  if (grantErr) {
    // 23505 = unique_violation: already claimed (by this call or a concurrent one).
    if (grantErr.code === "23505") {
      return json({ ok: true, data: { granted: false, alreadyGranted: true, rank, save: null } });
    }
    return err("db_error", grantErr.message, 500);
  }

  const scale = megaRankScale(rank);
  const xp = Math.round(MEGA_REWARD.xp * scale);
  const coins = Math.round(MEGA_REWARD.coins * scale);
  const tp = Math.round(MEGA_REWARD.tp * scale);
  const reward = { xp, coins, tp };

  // Apply additively to saves.state, retrying a bounded number of times on a
  // concurrent write — same pattern as save-sync's `replay` op. `saves` RLS
  // lets the owner update their own row directly, so this uses the caller's
  // own JWT (`anon`), not the service-role client.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: existing, error: readErr } = await anon
      .from("saves")
      .select("version, state")
      .eq("user_id", userId)
      .maybeSingle();
    if (readErr) return err("db_error", readErr.message, 500);
    if (!existing) {
      // No server save exists for this user on ANY device yet — same
      // precedent as rewards-grant/save-sync's `save: null`: the grant is
      // already recorded (irreversibly — see the insert above), the caller
      // must not read this as "no reward".
      return json({ ok: true, data: { granted: true, rank, reward, save: null } });
    }

    const state = existing.state as Record<string, unknown>;
    const partnerId = (state.pokemon as { id?: number } | null)?.id;
    const currentTp = (state.trainingPoints as Record<string, number> | undefined) ?? {};
    const nextTp =
      partnerId != null ? { ...currentTp, [partnerId]: (currentTp[partnerId] ?? 0) + tp } : currentTp;
    const nextState = {
      ...state,
      xp: ((state.xp as number | undefined) ?? 0) + xp,
      coins: ((state.coins as number | undefined) ?? 0) + coins,
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
          granted: true,
          rank,
          reward,
          save: { version: updatedRows[0].version, state: updatedRows[0].state },
        },
      });
    }
    // Conflict — another write raced us; loop and retry with a fresh read.
  }

  return err("conflict", "too many concurrent writes to this save; try again", 409);
});
