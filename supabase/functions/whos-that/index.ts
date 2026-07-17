// server-first-refactor Phase 4 — Who's That Pokémon.
//
// Round generation (which Pokémon, mode, reward item, shiny roll) and the
// reward grant currently happen ENTIRELY client-side (whos-that-pokemon.tsx's
// makeRound() + direct addXp/grantItem/recordPokedexCapture store calls) with
// no server involvement at all. Unlike Daily Quest/Mega Raid, the "answer"
// itself isn't really secret — a Pokémon's name/types are public bundled
// data keyed by the id the client needs anyway to render the silhouette
// sprite/cry — so hiding the round from the client buys nothing. The actual
// trust gap this closes is the same shape as every other mode: a client can
// currently pick its own favorable reward, force isShiny=true every time, or
// grant itself the reward without ever answering correctly, and nothing
// server-side enforces "one round per hour". This function makes itself the
// SOLE place a round is generated (via the same makeRound() the client used
// to call, now moved server-side) and the sole place a reward is granted.
//
// whos_that_rounds' own (user_id, hour_key) unique constraint IS the hourly
// gate — same "no separate ledger" precedent as daily_runs.
//
// Reward scope mirrors the established precedent from Mega/Daily: XP and the
// specific reward ITEM (the "currency"-like grants) are applied here,
// server-side, via the same additive optimistic-concurrency retry loop
// against `saves.state`. Pokédex-capture bookkeeping and the level-up
// cascade (rollLevelUpRewards' bonus coins/items/eggs) remain applied
// client-side from this function's confirmed result, exactly like
// MegaLeaderboard.claimReward() and daily-screen.tsx already do — those
// aren't farmable-for-advantage the way XP/items are.
//
// BUILD: run `node scripts/bundle-edge-function.mjs whos-that` and deploy
// the produced bundle — never hand-edit it, edit this file and re-bundle.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { WHOS_THAT_XP } from "../../../src/lib/rewards";
import { makeRound, checkGuess, HOUR, type WhosThatRound } from "../../../src/lib/whos-that";

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

interface RoundRow {
  id: string;
  mon_id: number;
  name: string;
  types: unknown;
  mode: string;
  is_shiny: boolean;
  reward_id: string;
  reward_name: string;
  reward_icon: string;
  crop_back: boolean;
  crop_dx: number;
  crop_dy: number;
  choices: unknown;
  resolved: boolean;
  correct: boolean | null;
}

function toRound(row: RoundRow): WhosThatRound {
  return {
    monId: row.mon_id,
    name: row.name,
    types: row.types as WhosThatRound["types"],
    mode: row.mode as WhosThatRound["mode"],
    isShiny: row.is_shiny,
    rewardId: row.reward_id as WhosThatRound["rewardId"],
    rewardName: row.reward_name,
    rewardIcon: row.reward_icon,
    cropBack: row.crop_back,
    cropDX: row.crop_dx,
    cropDY: row.crop_dy,
    choices: row.choices as string[],
  };
}

interface StartOp {
  op: "start";
}
interface SubmitActionOp {
  op: "submit_action";
  roundId: string;
  guess: { guessText?: string; guessTypes?: string[]; guessChoice?: string };
}
type Body = StartOp | SubmitActionOp;

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

  if (body.op === "start") {
    const hourKey = Math.floor(Date.now() / HOUR);

    const { data: existing, error: existingErr } = await anon
      .from("whos_that_rounds")
      .select(
        "id, mon_id, name, types, mode, is_shiny, reward_id, reward_name, reward_icon, crop_back, crop_dx, crop_dy, choices, resolved, correct",
      )
      .eq("user_id", userId)
      .eq("hour_key", hourKey)
      .maybeSingle();
    if (existingErr) return err("db_error", existingErr.message, 500);

    if (existing) {
      if (existing.resolved) {
        return json({ ok: true, data: { locked: true, msToNextHour: HOUR - (Date.now() % HOUR) } });
      }
      return json({ ok: true, data: { locked: false, roundId: existing.id, round: toRound(existing) } });
    }

    const round = makeRound();
    const { data: inserted, error: insErr } = await anon
      .from("whos_that_rounds")
      .insert({
        user_id: userId,
        hour_key: hourKey,
        mon_id: round.monId,
        name: round.name,
        types: round.types,
        mode: round.mode,
        is_shiny: round.isShiny,
        reward_id: round.rewardId,
        reward_name: round.rewardName,
        reward_icon: round.rewardIcon,
        crop_back: round.cropBack,
        crop_dx: round.cropDX,
        crop_dy: round.cropDY,
        choices: round.choices,
      })
      .select("id")
      .single();
    if (insErr) {
      // 23505 = unique_violation: a concurrent "start" already created this
      // hour's row — re-read and return that one instead of erroring.
      if (insErr.code === "23505") {
        const { data: raced, error: racedErr } = await anon
          .from("whos_that_rounds")
          .select(
            "id, mon_id, name, types, mode, is_shiny, reward_id, reward_name, reward_icon, crop_back, crop_dx, crop_dy, choices, resolved, correct",
          )
          .eq("user_id", userId)
          .eq("hour_key", hourKey)
          .maybeSingle();
        if (racedErr) return err("db_error", racedErr.message, 500);
        if (raced) {
          if (raced.resolved) {
            return json({ ok: true, data: { locked: true, msToNextHour: HOUR - (Date.now() % HOUR) } });
          }
          return json({ ok: true, data: { locked: false, roundId: raced.id, round: toRound(raced) } });
        }
      }
      return err("db_error", insErr.message, 500);
    }
    return json({ ok: true, data: { locked: false, roundId: inserted.id, round } });
  }

  if (body.op === "submit_action") {
    if (typeof body.roundId !== "string" || body.roundId.length === 0) {
      return err("bad_request", "roundId is required", 400);
    }
    const { data: row, error: selErr } = await anon
      .from("whos_that_rounds")
      .select(
        "id, mon_id, name, types, mode, is_shiny, reward_id, reward_name, reward_icon, crop_back, crop_dx, crop_dy, choices, resolved, correct",
      )
      .eq("id", body.roundId)
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr) return err("db_error", selErr.message, 500);
    if (!row) return err("not_found", "no round with that id", 404);

    if (row.resolved) {
      return json({
        ok: true,
        data: {
          correct: row.correct ?? false,
          alreadyGranted: true,
          reward: null,
          monId: row.mon_id,
          name: row.name,
          isShiny: row.is_shiny,
        },
      });
    }

    const round = toRound(row);
    const correct = checkGuess(round, body.guess ?? {});

    const { data: updatedRows, error: updErr } = await anon
      .from("whos_that_rounds")
      .update({ resolved: true, correct })
      .eq("id", row.id)
      .eq("resolved", false)
      .select("id");
    if (updErr) return err("db_error", updErr.message, 500);
    if (!updatedRows || updatedRows.length === 0) {
      // Lost a race to a concurrent submit for this same round — treat as
      // already granted rather than double-granting.
      return json({
        ok: true,
        data: { correct, alreadyGranted: true, reward: null, monId: row.mon_id, name: row.name, isShiny: row.is_shiny },
      });
    }

    if (!correct) {
      return json({
        ok: true,
        data: { correct: false, reward: null, monId: row.mon_id, name: row.name, isShiny: row.is_shiny },
      });
    }

    // Apply additively to saves.state, retrying a bounded number of times on
    // a concurrent write — same pattern as daily-run/mega-reward-claim.
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: existingSave, error: readErr } = await anon
        .from("saves")
        .select("version, state")
        .eq("user_id", userId)
        .maybeSingle();
      if (readErr) return err("db_error", readErr.message, 500);
      if (!existingSave) {
        return json({
          ok: true,
          data: {
            correct: true,
            reward: { xp: WHOS_THAT_XP, itemId: row.reward_id, itemQty: 1 },
            monId: row.mon_id,
            name: row.name,
            isShiny: row.is_shiny,
            save: null,
          },
        });
      }

      const state = existingSave.state as Record<string, unknown>;
      const currentInventory = (state.inventory as Record<string, number> | undefined) ?? {};
      const nextState = {
        ...state,
        xp: ((state.xp as number | undefined) ?? 0) + WHOS_THAT_XP,
        inventory: { ...currentInventory, [row.reward_id]: (currentInventory[row.reward_id] ?? 0) + 1 },
      };

      const { data: updatedSaveRows, error: saveUpdErr } = await anon
        .from("saves")
        .update({ version: existingSave.version + 1, state: nextState })
        .eq("user_id", userId)
        .eq("version", existingSave.version)
        .select("version, state");
      if (saveUpdErr) return err("db_error", saveUpdErr.message, 500);
      if (updatedSaveRows && updatedSaveRows.length > 0) {
        return json({
          ok: true,
          data: {
            correct: true,
            reward: { xp: WHOS_THAT_XP, itemId: row.reward_id, itemQty: 1 },
            monId: row.mon_id,
            name: row.name,
            isShiny: row.is_shiny,
            save: { version: updatedSaveRows[0].version, state: updatedSaveRows[0].state },
          },
        });
      }
      // Conflict — another write raced us; loop and retry with a fresh read.
    }

    return err("conflict", "too many concurrent writes to this save; try again", 409);
  }

  return err("bad_op", "op must be start or submit_action", 400);
});
