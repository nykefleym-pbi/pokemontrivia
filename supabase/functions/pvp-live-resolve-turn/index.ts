// Live PvP Phase 4/5 cutover, slice 4: the actual hot-path Edge Function --
// deployed DARK in this slice (not yet called by the client; the old
// submit_pvp_live_answer/submit_bot_pvp_move RPCs keep their `authenticated`
// grant untouched, so nothing about production behavior changes until a
// later, separate client-cutover PR switches callers over).
//
// Computes ability-modified damage server-side via `resolvePvpAnswer`
// (engine/pvp-live-answer.ts) for BOTH the human's own answer (op: "answer")
// and the Training bot's mirrored turn (op: "bot_turn"), then calls the
// matching new service-role-only apply RPC
// (apply_pvp_live_answer_v2 / apply_bot_pvp_move_v2) to write it atomically
// under that RPC's existing `for update` lock.
//
// Unlike battle-solo/mega-run/daily-run/whos-that, this function switches to
// a SERVICE-ROLE client after authenticating the caller: the whole point is
// that the client must not be able to reach the apply RPC directly with its
// own numbers (that RPC's grant is service_role-only, see
// 20260718160000_pvp_live_resolve_turn_apply_rpcs.sql) -- an anon+JWT client
// would simply be refused by Postgres's own grant, so this function is the
// ONLY caller that can ever succeed.
//
// BUILD: this file is NOT what gets deployed directly -- see battle-solo's
// header comment for why. Run
// `node scripts/bundle-edge-function.mjs pvp-live-resolve-turn` and deploy
// the produced `.bundle.ts`. Never hand-edit the bundle.
//
// NOTE: this bundle is ~220kb (vs. 6-63kb for every other Edge Function here)
// because resolvePvpAnswer's dependency surface pulls in the full
// signature-abilities/pokemon-data/pvp-type-abilities catalogs -- confirmed
// via `node scripts/bundle-edge-function.mjs pvp-live-resolve-turn`
// (produces a clean bundle, single `Deno.serve`, no unresolved imports) in
// this same slice. Actually running `supabase functions deploy` (or this
// repo's Supabase-MCP deploy tool) from THIS session wasn't possible: passing
// a 220kb artifact through this session's tool-call path isn't practical --
// same kind of environment limitation already documented for
// scripts/pvp-shadow-verify/run.ts (missing SUPABASE_SERVICE_ROLE_KEY). The
// bundle step itself is verified reproducible; the deploy step is the one
// remaining manual action, from wherever the Supabase CLI/service credentials
// actually live.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { buildAnswerTurn, rollBotTurn, resolve, toastNotices, type PvpLiveTurnContext, type PvpLiveSideState } from "../../../src/engine/pvp-live-turn";
import { pvpEngineStateToRow } from "../../../src/engine/pvp-live-answer";
import type { BotProfile } from "../../../src/lib/pvp-bot";
import { createRng } from "../../../src/engine/rng";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Approximation, matching engine/pvp-shadow-verify.ts's documented gap:
// speed-stage/opponent-timer-squeeze scaling isn't threaded through here yet
// -- it only affects `speedRatio` (a crit-threshold nuance), never damage
// magnitude directly, so this is an acceptable first-pass value rather than
// a silently-ignored one.
const PERSONAL_TIMER_MS = 15000;

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

interface MatchRow {
  id: string;
  host_id: string;
  guest_id: string;
  status: string;
  is_bot_match: boolean | null;
  questions: { question: string; options: string[]; correct: number; category: string }[];
  host_hp: number;
  guest_hp: number;
  host_stages: PvpLiveSideState["stages"];
  guest_stages: PvpLiveSideState["stages"];
  host_statuses: PvpLiveSideState["statuses"];
  guest_statuses: PvpLiveSideState["statuses"];
  host_partner_id: number | null;
  guest_partner_id: number | null;
  host_transform_id: number | null;
  guest_transform_id: number | null;
  host_ability_id: string | null;
  guest_ability_id: string | null;
  host_sig_runtime: PvpLiveSideState["sigRuntime"];
  guest_sig_runtime: PvpLiveSideState["sigRuntime"];
  host_suppressed_until: number;
  guest_suppressed_until: number;
  host_streak_live: number;
  guest_streak_live: number;
  host_wrong_streak_live: number;
  guest_wrong_streak_live: number;
  host_confused_ticks_live: number;
  guest_confused_ticks_live: number;
  host_sig_latched: boolean;
  guest_sig_latched: boolean;
  host_moxie_stacks: number;
  guest_moxie_stacks: number;
  host_wrong_count: number;
  guest_wrong_count: number;
  host_had_wrong: boolean;
  guest_had_wrong: boolean;
  host_sturdy_used: boolean;
  guest_sturdy_used: boolean;
  host_prev_correct: boolean;
  guest_prev_correct: boolean;
  host_prev_answer_elapsed_ms: number;
  guest_prev_answer_elapsed_ms: number;
  host_sword_of_ruin_charges: number;
  guest_sword_of_ruin_charges: number;
  host_correct_live: number;
  guest_correct_live: number;
  guest_bot_profile: BotProfile | null;
}

function resolveDex(partnerId: number | null, transformId: number | null): number | null {
  return partnerId === 151 ? transformId : partnerId;
}

function sideState(
  row: MatchRow,
  side: "host" | "guest",
  pokedexCount: number,
): PvpLiveSideState {
  const p = side === "host" ? row.host_partner_id : row.guest_partner_id;
  const t = side === "host" ? row.host_transform_id : row.guest_transform_id;
  return {
    dex: resolveDex(p, t),
    partnerId: p,
    hp: side === "host" ? row.host_hp : row.guest_hp,
    stages: side === "host" ? row.host_stages : row.guest_stages,
    statuses: side === "host" ? row.host_statuses : row.guest_statuses,
    abilityId: side === "host" ? row.host_ability_id : row.guest_ability_id,
    sigRuntime: (side === "host" ? row.host_sig_runtime : row.guest_sig_runtime) ?? {},
    suppressedUntil: side === "host" ? row.host_suppressed_until : row.guest_suppressed_until,
    pokedexCount,
    engineState: {
      streakLive: side === "host" ? row.host_streak_live : row.guest_streak_live,
      correctLive: side === "host" ? row.host_correct_live : row.guest_correct_live,
      wrongStreakLive: side === "host" ? row.host_wrong_streak_live : row.guest_wrong_streak_live,
      confusedTicksLive: side === "host" ? row.host_confused_ticks_live : row.guest_confused_ticks_live,
      swordOfRuinCharges: side === "host" ? row.host_sword_of_ruin_charges : row.guest_sword_of_ruin_charges,
      sigLatched: side === "host" ? row.host_sig_latched : row.guest_sig_latched,
      moxieStacks: side === "host" ? row.host_moxie_stacks : row.guest_moxie_stacks,
      wrongCount: side === "host" ? row.host_wrong_count : row.guest_wrong_count,
      hadWrong: side === "host" ? row.host_had_wrong : row.guest_had_wrong,
      sturdyUsed: side === "host" ? row.host_sturdy_used : row.guest_sturdy_used,
      prevCorrect: side === "host" ? row.host_prev_correct : row.guest_prev_correct,
      prevAnswerElapsedMs: side === "host" ? row.host_prev_answer_elapsed_ms : row.guest_prev_answer_elapsed_ms,
    },
  };
}

interface AnswerOp {
  op: "answer";
  matchId: string;
  questionIndex: number;
  selectedIndex: number | null;
  elapsedMs: number;
}
interface BotTurnOp {
  op: "bot_turn";
  matchId: string;
  questionIndex: number;
}
type Body = AnswerOp | BotTurnOp;

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
  if (typeof body.matchId !== "string" || body.matchId.length === 0) {
    return err("bad_request", "matchId is required", 400);
  }
  if (!Number.isInteger(body.questionIndex) || body.questionIndex < 0 || body.questionIndex >= 20) {
    return err("bad_request", "questionIndex out of range", 400);
  }

  // Service-role client for everything past identity verification: the apply
  // RPCs are granted to service_role only, so this is the only client that
  // can ever reach them. A service-role session has no request.jwt.claims, so
  // auth.uid() inside those RPCs is always null -- they take _caller_id
  // instead, set to the userId already verified above via the caller's own JWT.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: row, error: selError } = await admin
    .from("pvp_live_matches")
    .select("*")
    .eq("id", body.matchId)
    .maybeSingle();
  if (selError) return err("db_error", selError.message, 500);
  if (!row) return err("not_found", "no match with that id", 404);
  const match = row as MatchRow;
  if (match.status !== "active") return err("not_active", "match is not active", 409);

  if (body.op === "answer") {
    if (userId !== match.host_id && userId !== match.guest_id) {
      return err("forbidden", "not a participant in this match", 403);
    }
    const iAmHost = userId === match.host_id;
    const selfSide = iAmHost ? "host" : "guest";
    const oppSide = iAmHost ? "guest" : "host";

    const { data: profile } = await admin
      .from("profiles")
      .select("pokedex_count")
      .eq("id", userId)
      .maybeSingle();
    const pokedexCount = (profile?.pokedex_count as number | undefined) ?? 0;

    const ctx: PvpLiveTurnContext = {
      self: sideState(match, selfSide, pokedexCount),
      opp: sideState(match, oppSide, 0),
      question: match.questions[Math.max(0, body.questionIndex)],
      questionIndex: body.questionIndex,
    };

    const rng = createRng(crypto.randomUUID()).next;
    const { input, state } = buildAnswerTurn(ctx, {
      selectedIndex: body.selectedIndex,
      answerElapsedMs: Math.max(0, body.elapsedMs ?? 0),
      personalTimerMs: PERSONAL_TIMER_MS,
      rng,
    });
    const outcome = resolve(input, state);

    const { data: applied, error: rpcError } = await admin.rpc("apply_pvp_live_answer_v2", {
      _match_id: body.matchId,
      _question_index: body.questionIndex,
      _selected_index: body.selectedIndex,
      _time_ms: Math.round(input.answerElapsedMs),
      _edge_dmg: Math.round(outcome.dmg),
      _edge_self_dmg: Math.round(outcome.selfDmg),
      _confusion_missed: outcome.confusionMissed,
      _next_state: pvpEngineStateToRow(outcome.state),
      _caller_id: userId,
    });
    if (rpcError) return err("db_error", rpcError.message, 500);
    const notices = toastNotices(input, state, outcome);
    return json({
      ok: true,
      data: {
        ...(applied as Record<string, unknown>),
        correct: input.correct,
        dmg: outcome.dmg,
        selfDmg: outcome.selfDmg,
        confusionMissed: outcome.confusionMissed,
        triggerFired: outcome.triggerFired,
        streak: outcome.state.streak,
        correctCount: outcome.state.correctCount,
        wrongStreak: outcome.state.selfWrongStreak,
        confusedTicks: outcome.state.confusedTicks,
        ...notices,
      },
    });
  }

  if (body.op === "bot_turn") {
    if (userId !== match.host_id) return err("forbidden", "not the host of this match", 403);
    if (!match.is_bot_match) return err("not_bot_match", "match is not a bot match", 409);
    if (!match.guest_bot_profile) return err("no_profile", "bot profile not rolled for this match", 500);

    const ctx: PvpLiveTurnContext = {
      self: sideState(match, "guest", 0),
      opp: sideState(match, "host", 0),
      question: match.questions[Math.max(0, body.questionIndex)],
      questionIndex: body.questionIndex,
    };

    const rng = createRng(crypto.randomUUID()).next;
    const { input, state, correct, answerElapsedMs } = rollBotTurn(ctx, match.guest_bot_profile, {
      personalTimerMs: PERSONAL_TIMER_MS,
      rng,
    });
    const outcome = resolve(input, state);

    const { data: applied, error: rpcError } = await admin.rpc("apply_bot_pvp_move_v2", {
      _match_id: body.matchId,
      _question_index: body.questionIndex,
      _correct: correct,
      _dmg: Math.round(outcome.dmg),
      _self_dmg: Math.round(outcome.selfDmg),
      _time_ms: Math.round(answerElapsedMs),
      _next_state: pvpEngineStateToRow(outcome.state),
      _caller_id: userId,
    });
    if (rpcError) return err("db_error", rpcError.message, 500);
    const notices = toastNotices(input, state, outcome);
    return json({
      ok: true,
      data: {
        ...(applied as Record<string, unknown>),
        correct,
        dmg: outcome.dmg,
        selfDmg: outcome.selfDmg,
        timeMs: answerElapsedMs,
        confusionMissed: outcome.confusionMissed,
        triggerFired: outcome.triggerFired,
        streak: outcome.state.streak,
        correctCount: outcome.state.correctCount,
        wrongStreak: outcome.state.selfWrongStreak,
        confusedTicks: outcome.state.confusedTicks,
        ...notices,
      },
    });
  }

  return err("bad_op", "op must be answer or bot_turn", 400);
});
