// Scans profiles for stale last_* activity timestamps and sends one combined
// "here's what's ready" push per eligible user (capped to roughly once/day
// via last_reminder_sent). Invoked by pg_cron every few hours; requires the
// same X-Cron-Secret as send-push, and delegates the actual sending to it.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PUSH_CRON_SECRET")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const REMINDER_COOLDOWN = 20 * HOUR;

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function startOfUtcWeek(now: Date): Date {
  const day = startOfUtcDay(now);
  const dow = day.getUTCDay(); // 0 = Sunday
  const daysSinceMonday = (dow + 6) % 7;
  day.setUTCDate(day.getUTCDate() - daysSinceMonday);
  return day;
}

function readyModes(
  p: {
    last_daily_claim: string | null;
    last_weekly_attempt: string | null;
    last_whos_that_played: string | null;
    last_mega_played: string | null;
    last_gift_claim: string | null;
  },
  now: Date,
  megaEventActive: boolean,
): string[] {
  const modes: string[] = [];
  const dayStart = startOfUtcDay(now).getTime();
  const weekStart = startOfUtcWeek(now).getTime();

  if (!p.last_daily_claim || new Date(p.last_daily_claim).getTime() < dayStart) {
    modes.push("Daily Quest");
  }
  if (!p.last_weekly_attempt || new Date(p.last_weekly_attempt).getTime() < weekStart) {
    modes.push("Weekly League");
  }
  if (!p.last_whos_that_played || now.getTime() - new Date(p.last_whos_that_played).getTime() > HOUR) {
    modes.push("Who's That Pokémon");
  }
  if (megaEventActive && (!p.last_mega_played || new Date(p.last_mega_played).getTime() < dayStart)) {
    modes.push("Mega Raid");
  }
  if (!p.last_gift_claim || now.getTime() - new Date(p.last_gift_claim).getTime() > DAY) {
    modes.push("your free gift");
  }
  return modes;
}

Deno.serve(async (req) => {
  const secret = req.headers.get("X-Cron-Secret");
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 403 });
  }

  const now = new Date();

  const { data: activeEvents } = await admin
    .from("mega_events")
    .select("id")
    .lte("starts_at", now.toISOString())
    .gte("ends_at", now.toISOString())
    .limit(1);
  const megaEventActive = (activeEvents?.length ?? 0) > 0;

  const cooldownCutoff = new Date(now.getTime() - REMINDER_COOLDOWN).toISOString();
  const { data: profiles, error } = await admin
    .from("profiles")
    .select(
      "id, last_daily_claim, last_weekly_attempt, last_whos_that_played, last_mega_played, last_gift_claim, last_reminder_sent",
    )
    .or(`last_reminder_sent.is.null,last_reminder_sent.lt.${cooldownCutoff}`);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  // A hatchable Poké Egg is the only route to a Legendary, and it was visible
  // nowhere but a small badge on the Pokédex tab — nothing told a player it had
  // filled. Egg progress lives in the save blob rather than a profile column,
  // so it is read from there; a missing or malformed save just means no egg.
  const eggReady = new Map<string, boolean>();
  const ids = (profiles ?? []).map((p) => p.id);
  if (ids.length > 0) {
    const { data: saves } = await admin.from("saves").select("user_id, state").in("user_id", ids);
    for (const row of saves ?? []) {
      const eggs = (row.state as { pokeEggs?: { progress?: number; required?: number }[] } | null)
        ?.pokeEggs;
      if (!Array.isArray(eggs)) continue;
      eggReady.set(
        row.user_id as string,
        eggs.some((e) => (e?.progress ?? 0) >= (e?.required ?? Infinity)),
      );
    }
  }

  let notified = 0;
  for (const p of profiles ?? []) {
    const modes = readyModes(p, now, megaEventActive);
    // Named first: it is the rarest and most valuable thing in the list.
    if (eggReady.get(p.id)) modes.unshift("a Poké Egg");
    if (modes.length === 0) continue;

    const body =
      modes.length === 1
        ? `${modes[0]} is ready — jump back in!`
        : `${modes.slice(0, -1).join(", ")} and ${modes[modes.length - 1]} are ready — jump back in!`;

    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Cron-Secret": CRON_SECRET },
      body: JSON.stringify({
        kind: "mode_reminder",
        toUserId: p.id,
        title: "Pokémon Trivia Battle",
        body,
      }),
    });
    if (res.ok) {
      notified++;
      await admin.from("profiles").update({ last_reminder_sent: now.toISOString() }).eq("id", p.id);
    }
  }

  return new Response(JSON.stringify({ scanned: profiles?.length ?? 0, notified }), {
    headers: { "Content-Type": "application/json" },
  });
});
