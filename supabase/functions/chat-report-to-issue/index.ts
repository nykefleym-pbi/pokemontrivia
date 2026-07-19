// Turns a player's report of a pvp_chat_messages row (public.pvp_chat_reports
// INSERT) into a labeled GitHub issue so a human can triage it — same shape as
// feedback-to-issue, just for chat moderation instead of in-app feedback.
// Invoked by a DB trigger on INSERT into public.pvp_chat_reports via pg_net;
// the call is authenticated with a shared secret (this function has
// verify_jwt disabled so it can check the secret itself — mirrors
// feedback-to-issue / send-push's cron path).
//
// The trigger only has the NEW row of pvp_chat_reports (report_id, message_id,
// reporter_id, reason, created_at) — no join to the reported message or its
// match. So this function re-reads the message body/match_id/sender itself,
// via the service-role key, so the filed issue has real content for a human
// to act on (e.g. manually ban the sender via pvp_chat_bans) instead of an
// opaque message_id.
//
// Required Edge Function secrets (set via `supabase secrets set`, not a
// migration):
//   CHAT_REPORT_WEBHOOK_SECRET  – must match the header the DB trigger sends
//   GITHUB_TOKEN                – fine-grained PAT with Issues: Read & Write on the repo
//   GITHUB_REPO                 – optional, defaults to nykefleym-pbi/pokemontrivia
//
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-provided to every Edge
// Function — not secrets this function needs configured itself.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const WEBHOOK_SECRET = Deno.env.get("CHAT_REPORT_WEBHOOK_SECRET");
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "nykefleym-pbi/pokemontrivia";
const GITHUB_API = "https://api.github.com";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

interface ChatReportRow {
  report_id?: string;
  message_id?: string;
  reporter_id?: string;
  reason?: string | null;
  created_at?: string | null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const LABELS: Record<string, { color: string; description: string }> = {
  "chat-report": { color: "b60205", description: "Player-reported chat message" },
};

async function gh(path: string, init: RequestInit = {}) {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pokemontrivia-chat-report-bot",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
  });
}

// Create each label if it doesn't already exist (idempotent — a 422 means it's
// already there). Keeps issue creation from failing on an unknown label.
async function ensureLabels(names: string[]) {
  for (const name of names) {
    const meta = LABELS[name];
    if (!meta) continue;
    const res = await gh(`/repos/${GITHUB_REPO}/labels`, {
      method: "POST",
      body: JSON.stringify({ name, color: meta.color, description: meta.description }),
    });
    if (!res.ok && res.status !== 422) {
      console.error(`label "${name}" create failed`, res.status, await res.text());
    }
  }
}

function truncate(s: string, n: number) {
  const clean = s.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!WEBHOOK_SECRET || req.headers.get("x-chat-report-secret") !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!GITHUB_TOKEN) return json({ error: "github_token_not_configured" }, 500);

  let row: ChatReportRow;
  try {
    const payload = await req.json();
    // Accept either the raw row or a Supabase-webhook-style { record } envelope.
    row = payload.record ?? payload;
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  if (!row.message_id) return json({ error: "missing_message_id" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: message, error: messageErr } = await admin
    .from("pvp_chat_messages")
    .select("body, match_id, user_id, trainer_name")
    .eq("id", row.message_id)
    .maybeSingle();

  if (messageErr) {
    console.error("message lookup failed", messageErr);
    return json({ error: "message_lookup_failed" }, 502);
  }

  const messageBody = (message?.body ?? "").trim();
  const title = `[Chat Report] ${truncate(messageBody || "(message not found)", 70)}`;
  const meta = [
    message?.trainer_name ? `**Sender:** ${message.trainer_name}` : null,
    message?.user_id ? `**Sender user id:** \`${message.user_id}\`` : null,
    message?.match_id ? `**Match id:** \`${message.match_id}\`` : null,
    row.reason ? `**Report reason:** ${row.reason}` : null,
    row.reporter_id ? `**Reporter id:** \`${row.reporter_id}\`` : null,
    row.report_id ? `**Report id:** \`${row.report_id}\`` : null,
    row.created_at ? `**Reported at:** ${row.created_at}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const quoted = messageBody
    ? messageBody
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n")
    : "> _(message not found — may have already been deleted)_";

  const body = `${quoted}\n\n---\n${meta}\n\n_Auto-filed from a player chat report. If warranted, ban the sender via the pvp_chat_bans table._`;
  const labels = ["chat-report"];

  await ensureLabels(labels);

  const res = await gh(`/repos/${GITHUB_REPO}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("issue create failed", res.status, detail);
    return json({ error: "issue_create_failed", status: res.status, detail }, 502);
  }

  const issue = await res.json();
  return json({ ok: true, issue_number: issue.number, url: issue.html_url });
});
