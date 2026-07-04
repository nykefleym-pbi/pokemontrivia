// Core Web Push sender. Not directly exposed as an open broadcast endpoint —
// each `kind` has its own authorization check so an authenticated user can
// only trigger notifications tied to an action they actually just performed;
// broadcast/reminder kinds require the shared cron secret instead of a user
// JWT (this function has verify_jwt disabled so it can decide the auth path
// itself; see CRON_SECRET check below).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const CRON_SECRET = Deno.env.get("PUSH_CRON_SECRET");
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:support@pokemontriviabattle.app";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

type Kind = "friend_request" | "friend_accepted" | "daily_promo" | "mode_reminder" | "broadcast";

interface Body {
  kind: Kind;
  title: string;
  body: string;
  url?: string;
  toUserId?: string; // required for friend_request / friend_accepted
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function getCallerId(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return null;
  const token = authHeader.replace("Bearer ", "");
  const anon = createClient(SUPABASE_URL, ANON_KEY);
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

async function authorize(req: Request, payload: Body): Promise<string | null> {
  if (payload.kind === "daily_promo" || payload.kind === "mode_reminder" || payload.kind === "broadcast") {
    const secret = req.headers.get("X-Cron-Secret");
    if (!CRON_SECRET || secret !== CRON_SECRET) return "unauthorized: bad cron secret";
    return null;
  }

  // friend_request / friend_accepted: caller must be authenticated, and the
  // underlying relationship must actually exist — prevents an authenticated
  // user from pushing arbitrary notifications to arbitrary other users.
  const callerId = await getCallerId(req);
  if (!callerId) return "unauthorized: no valid session";
  if (!payload.toUserId) return "toUserId required";

  if (payload.kind === "friend_request") {
    const { data } = await admin
      .from("friend_requests")
      .select("id")
      .eq("from_id", callerId)
      .eq("to_id", payload.toUserId)
      .eq("status", "pending")
      .limit(1);
    if (!data || data.length === 0) return "no matching pending friend request";
  }

  if (payload.kind === "friend_accepted") {
    const { data } = await admin
      .from("friends")
      .select("owner_id")
      .eq("owner_id", callerId)
      .eq("friend_id", payload.toUserId)
      .limit(1);
    if (!data || data.length === 0) return "no matching friendship";
  }

  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  if (!payload.kind || !payload.title || !payload.body) {
    return json({ error: "kind, title, body required" }, 400);
  }

  const authError = await authorize(req, payload);
  if (authError) return json({ error: authError }, 403);

  let query = admin.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth");
  if (payload.kind === "friend_request" || payload.kind === "friend_accepted" || payload.kind === "mode_reminder") {
    query = query.eq("user_id", payload.toUserId!);
  }
  const { data: subs, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const notificationPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/",
  });

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  await Promise.all(
    (subs ?? []).map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          notificationPayload,
        );
        sent++;
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) staleIds.push(sub.id);
      }
    }),
  );

  if (staleIds.length > 0) {
    await admin.from("push_subscriptions").delete().in("id", staleIds);
  }

  return json({ sent, failed, pruned: staleIds.length });
});
