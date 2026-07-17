// server-first-refactor P2/P3 — save-sync (02-architecture.md §6.3/§6.4).
//
// The versioned replacement for the client's localStorage-persisted save.
// Auth: verify_jwt is on (see supabase/config.toml), so the platform already
// rejects a missing/invalid token before this function runs; we still call
// auth.getUser() ourselves to get a verified user id rather than trust a
// hand-decoded JWT claim.
//
// Every query runs through a supabase-js client built with the CALLER's own
// JWT (never the service-role key), so `saves`/`solo_battles` RLS
// (owner-only) is the real authority here — this function is a thin,
// auth-forwarding wrapper around it, not a bypass.
//
// `replay`: battles fought fully OFFLINE never get mirrored into
// solo_battles live (battle-solo's start/submit_action need a network round
// trip per action). This op lets the client submit a completed offline
// battle's whole {cfg, seed, log} — the same shape solo_battles already
// stores — once it's back online, get its reward computed AUTHORITATIVELY
// (not trusted from the client's own local reward math), and folded
// additively into whatever server save exists.
//
// SCOPE (deliberately narrow — "battles only", not full multi-device save
// reconciliation): this only reconciles the battle-reward slice of a save
// (xp/coins/trainingPoints). Every other field (inventory, roster, pokedex,
// purchases, ...) still resolves purely through `push`'s last-write-wins
// optimistic concurrency, same as before this op existed — documented here
// as a real limitation, not silently absent. A client with no server save
// yet (this account never pushed from ANY device) gets `save: null` back,
// same precedent as rewards-grant's own "reward computed, nothing to patch
// yet" case — callers must not read that as "no reward happened."
//
// Idempotency: each battle in the request carries a client-generated `id` —
// this is an intentional, minimal extension of this op's originally-stubbed
// shape (which had no per-battle id), needed because solo_battles.id is the
// idempotency key here. Inserting a battle whose id already exists in
// solo_battles (23505 unique-violation) means it was already recorded —
// either by a previous replay call, or because it was ALSO mirrored live via
// battle-solo — and its reward is not granted again. This reuses
// solo_battles as the existence-record rather than introducing a second
// ledger table.
//
// Validation reuses `applyNextAction` (battle-solo's own live-submission
// path) rather than a bare `replayBattle` — walking the whole log through it
// one action at a time enforces the exact same rules a live submit_action
// call would (no skipping/reordering/duplicating questions, no acting past
// battle end), so an offline log gets no less scrutiny than an online one.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { applyNextAction, SoloBattleActionError } from "../../../src/engine/solo-battle-replay";
import { isValidSoloBattleCfg, type SoloBattleCfg } from "../../../src/engine/solo-battle-config";
import { isValidBattleAction, type BattleAction, type BattleState } from "../../../src/engine/turn";
import { battleReward, type BattleRewardMode } from "../../../src/lib/rewards";

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
interface OfflineBattle {
  id: string;
  cfg: unknown;
  seed: string;
  log: unknown[];
}
interface ReplayOp {
  op: "replay";
  battles: OfflineBattle[];
}
type Body = PullOp | PushOp | ReplayOp;

type BattleResultStatus = "recorded" | "already_recorded" | "invalid" | "incomplete";

/** Walks `log` through `applyNextAction` one action at a time from an empty
 *  log — the exact validation a live submit_action call would apply to each
 *  action — rather than trusting the whole log at face value. */
function replayAndValidateLog(
  cfg: SoloBattleCfg,
  log: BattleAction[],
  seed: string,
): { ok: true; state: BattleState } | { ok: false; error: string } {
  let currentLog: BattleAction[] = [];
  let state: BattleState | null = null;
  for (const action of log) {
    try {
      const result = applyNextAction(cfg, currentLog, seed, action);
      state = result.state;
    } catch (e) {
      if (e instanceof SoloBattleActionError) return { ok: false, error: e.message };
      throw e;
    }
    currentLog = [...currentLog, action];
  }
  if (!state || state.phase === "in_progress") {
    return { ok: false, error: "log doesn't reach a natural battle end" };
  }
  return { ok: true, state };
}

const MODE_FOR_REWARD: Record<SoloBattleCfg["mode"], BattleRewardMode> = {
  battle: "regular",
  elite: "elite",
  weekly: "weekly",
};

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
    if (!Array.isArray(body.battles)) return err("bad_request", "battles must be an array", 400);

    const results: Array<{ id: string; status: BattleResultStatus; error?: string }> = [];
    let totalXp = 0;
    let totalCoins = 0;
    const tpByPokemon: Record<string, number> = {};

    for (const raw of body.battles) {
      const b = raw as Partial<OfflineBattle> | null;
      const id = b?.id;
      if (!b || typeof id !== "string" || id.length === 0) {
        results.push({ id: typeof id === "string" ? id : "", status: "invalid", error: "id is required" });
        continue;
      }
      if (!isValidSoloBattleCfg(b.cfg)) {
        results.push({ id, status: "invalid", error: "cfg is missing or malformed" });
        continue;
      }
      if (typeof b.seed !== "string" || b.seed.length === 0) {
        results.push({ id, status: "invalid", error: "seed is required" });
        continue;
      }
      if (!Array.isArray(b.log) || !b.log.every(isValidBattleAction)) {
        results.push({ id, status: "invalid", error: "log is missing or malformed" });
        continue;
      }
      const cfg = b.cfg;
      const log = b.log as BattleAction[];

      const replayed = replayAndValidateLog(cfg, log, b.seed);
      if (!replayed.ok) {
        results.push({ id, status: "incomplete", error: replayed.error });
        continue;
      }

      const { error: insErr } = await supabase.from("solo_battles").insert({
        id,
        user_id: userId,
        seed: b.seed,
        cfg,
        log,
        status: replayed.state.phase,
        result: {
          won: replayed.state.phase === "won",
          maxStreak: replayed.state.maxStreak,
          correctCount: replayed.state.correctCount,
        },
      });
      if (insErr) {
        if (insErr.code === "23505") {
          results.push({ id, status: "already_recorded" });
          continue;
        }
        results.push({ id, status: "invalid", error: insErr.message });
        continue;
      }

      const reward = battleReward({
        mode: MODE_FOR_REWARD[cfg.mode],
        won: replayed.state.phase === "won",
        level: cfg.level,
        maxStreak: replayed.state.maxStreak,
      });
      totalXp += reward.xp;
      totalCoins += reward.coins;
      const pokeKey = String(cfg.playerPokemonId);
      tpByPokemon[pokeKey] = (tpByPokemon[pokeKey] ?? 0) + reward.tp;
      results.push({ id, status: "recorded" });
    }

    const grantedAnything = totalXp > 0 || totalCoins > 0 || Object.keys(tpByPokemon).length > 0;
    if (!grantedAnything) {
      return json({ ok: true, data: { results, reward: null, save: null } });
    }
    const reward = { xp: totalXp, coins: totalCoins, trainingPoints: tpByPokemon };

    // Apply additively to saves.state, retrying a bounded number of times if
    // a concurrent write races us — unlike push (client-driven, safe to just
    // report a conflict and let the caller retry), this is server-computed
    // reward application; silently dropping an already-earned reward on a
    // race would be worse than a few retries.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: existing, error: readErr } = await supabase
        .from("saves")
        .select("version, state")
        .eq("user_id", userId)
        .maybeSingle();
      if (readErr) return err("db_error", readErr.message, 500);

      if (!existing) {
        // No server save exists for this user on ANY device yet — nothing to
        // fold these rewards into. Same precedent as rewards-grant's
        // `save: null`: the caller must not read this as "no reward".
        return json({ ok: true, data: { results, reward, save: null } });
      }

      const state = existing.state as Record<string, unknown>;
      const currentTp = (state.trainingPoints as Record<string, number> | undefined) ?? {};
      const nextTp = { ...currentTp };
      for (const [pokeId, tp] of Object.entries(tpByPokemon)) {
        nextTp[pokeId] = (nextTp[pokeId] ?? 0) + tp;
      }
      const nextState = {
        ...state,
        xp: ((state.xp as number | undefined) ?? 0) + totalXp,
        coins: ((state.coins as number | undefined) ?? 0) + totalCoins,
        trainingPoints: nextTp,
      };

      const { data: updatedRows, error: updErr } = await supabase
        .from("saves")
        .update({ version: existing.version + 1, state: nextState })
        .eq("user_id", userId)
        .eq("version", existing.version)
        .select("version, state");
      if (updErr) return err("db_error", updErr.message, 500);
      if (updatedRows && updatedRows.length > 0) {
        return json({
          ok: true,
          data: { results, reward, save: { version: updatedRows[0].version, state: updatedRows[0].state } },
        });
      }
      // Conflict — another write raced us; loop and retry with a fresh read.
    }

    return err("conflict", "too many concurrent writes to this save; try again", 409);
  }

  return err("bad_op", "op must be pull, push, or replay", 400);
});
