// Turns an in-app feedback submission (suggestion / bug) into a GitHub issue
// so the team can triage it from the repo's Issues list like any other backlog
// item. Invoked by a DB trigger on INSERT into public.feedback via pg_net; the
// call is authenticated with a shared secret (this function has verify_jwt
// disabled so it can check the secret itself — mirrors send-push's cron path).
//
// Required Edge Function secrets (set via `supabase secrets set`, not a
// migration):
//   FEEDBACK_WEBHOOK_SECRET  – must match the header the DB trigger sends
//   GITHUB_TOKEN             – fine-grained PAT with Issues: Read & Write on the repo
//   GITHUB_REPO              – optional, defaults to nykefleym-pbi/pokemontrivia

const WEBHOOK_SECRET = Deno.env.get("FEEDBACK_WEBHOOK_SECRET");
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN");
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "nykefleym-pbi/pokemontrivia";
const GITHUB_API = "https://api.github.com";

interface FeedbackRow {
  id?: string;
  category?: string; // 'suggestion' | 'bug'
  message?: string;
  trainer_name?: string | null;
  contact?: string | null;
  app_version?: string | null;
  created_at?: string | null;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const LABELS: Record<string, { color: string; description: string }> = {
  "player-feedback": { color: "0e8a16", description: "Auto-filed from in-app feedback" },
  suggestion: { color: "a2eeef", description: "Player suggestion / feature request" },
  bug: { color: "d73a4a", description: "Something isn't working" },
};

async function gh(path: string, init: RequestInit = {}) {
  return fetch(`${GITHUB_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "pokemontrivia-feedback-bot",
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
  if (!WEBHOOK_SECRET || req.headers.get("x-feedback-secret") !== WEBHOOK_SECRET) {
    return json({ error: "unauthorized" }, 401);
  }
  if (!GITHUB_TOKEN) return json({ error: "github_token_not_configured" }, 500);

  let row: FeedbackRow;
  try {
    const payload = await req.json();
    // Accept either the raw row or a Supabase-webhook-style { record } envelope.
    row = payload.record ?? payload;
  } catch {
    return json({ error: "bad_json" }, 400);
  }

  const category = row.category === "bug" ? "bug" : "suggestion";
  const message = (row.message ?? "").trim();
  if (!message) return json({ error: "empty_message" }, 400);

  const prefix = category === "bug" ? "Bug" : "Suggestion";
  const title = `[${prefix}] ${truncate(message, 70)}`;
  const meta = [
    `**Category:** ${category}`,
    row.trainer_name ? `**Trainer:** ${row.trainer_name}` : null,
    row.app_version ? `**App version:** ${row.app_version}` : null,
    row.contact ? `**Contact:** ${row.contact}` : null,
    row.created_at ? `**Submitted:** ${row.created_at}` : null,
    row.id ? `**Feedback id:** \`${row.id}\`` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const body = `${message}\n\n---\n${meta}\n\n_Auto-filed from in-app feedback._`;
  const labels = ["player-feedback", category];

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
