# 02-architecture — Match-scoped Chat with moderation (PLAN ONLY)

**Feature slug:** `global-chat` (retained for traceability; v1 is match-scoped, not global)
**Author:** Solution Architect
**Date:** 2026-07-18 (revision 2)
**Status:** Plan only — not implemented; awaiting owner go-ahead past scoping.

> **This document SUPERSEDES the 2026-07-10 draft** (global lobby room), the same way
> `01-spec.md` revision 2 superseded the global-room spec after the Fable UX/product
> critique. The old draft's *techniques* (RLS shape, RPC-only writes, Realtime
> publication setup, pg_net webhook, migration naming, generated `types.ts`) are all
> reused verbatim below; only the *shape* changes — from one global room to per-`pvp_live_matches`-row
> chat. That re-scope deletes the entire "who can read this room" membership problem
> and the Realtime-Broadcast scaling escape hatch, because match participancy already
> answers "who may read/write" and fan-out is at most 2 recipients.

---

## Grounding — repo facts this plan is built on

| Concern | Precedent in repo | Reuse |
|---|---|---|
| Participant-scoped RLS | `pvp_live_matches_select_own`: `host_id = auth.uid() or guest_id = auth.uid()` (`20260704030000_pvp_live_matches.sql:38`) | Chat rows re-check the SAME two ids via an `exists` join on the parent match |
| Trusted writes | `security definer … set search_path = public` RPCs returning `jsonb {ok, error}`, `select … for update` lock, defense-in-depth (`apply_pvp_signature_effect` re-checks ownership/rate-limit/idempotency itself — `20260706090116…`) | All chat writes are plain RPCs, no direct INSERT policy |
| Report → human triage | `feedback_to_issue()` trigger → `net.http_post` (pg_net) → `feedback-to-issue` edge fn, authed by `__FEEDBACK_WEBHOOK_SECRET__` placeholder substituted at apply (`20260707111000…`) | Copy pattern for report escalation |
| Scheduled pruning | `push_cron_jobs.sql` uses `pg_cron` `cron.schedule(...)` (`20260703120100…`) | Nightly retention prune |
| Realtime | `postgres_changes` INSERT stream + table added to `supabase_realtime` publication + `replica identity full` (`pvp_live_matches.sql:42-43`); client via `supabase.channel(...).on("postgres_changes", {filter:"match_id=eq…"})` then `removeChannel` (`pvp-live.ts:subscribeToLivePvpEffects`) | Chat messages ride the identical channel shape |
| Identity / name gate | `ensureSession`, `claimTrainerName`, `getMyTrainerName` (`social.ts`); name lives in `profiles.trainer_name` | Post-gate re-checks `profiles.trainer_name` server-side |
| Loose typing pre-regen | `supabase as unknown as { rpc }` / `{ from }` casts until `types.ts` regenerates (`pvp-live.ts:254`, `social.ts:10`) | `pvp-chat.ts` follows it |
| Generated types | `src/integrations/supabase/types.ts` — "automatically generated. Do not edit." | New tables ⇒ **regen step called out** in PR-1 |
| Migration naming | `YYYYMMDDHHMMSS_snake_description.sql`; **latest is `20260719000000`**, so new files must sort AFTER it | Timestamps below start `20260719120000…` |
| **Kill switch / config** | **No `app_config` / feature-flag / settings table exists anywhere** (grep of all migrations: no match) | Introduce a minimal `app_config` table |

**Open question #1 resolved here:** grace window = **24 h from the match's `created_at`**
(matches auto-expire in ≤30 min, so this is ~23.5 h of post-match chat), enforced by the
send RPC and reclaimed nightly by `pg_cron`. Simple, bounded, self-pruning.

---

## 1. Data model

Four new tables + one config table. **RPC-only writes** on every one (no client INSERT
policy) so profanity/rate-limit/ban/kill checks are authoritative. All added to the
`authenticated` SELECT grant + `service_role` ALL grant, mirroring `pvp_live_matches`.

### `pvp_chat_messages`
```
id          uuid pk default gen_random_uuid()
match_id    uuid not null references public.pvp_live_matches(id) on delete cascade
user_id     uuid not null references public.profiles(id) on delete cascade   -- = auth.uid() at write
trainer_name    text not null      -- snapshotted at send (denormalized like pvp_live_effects)
trainer_sprite  text not null
body        text not null check (char_length(body) between 1 and 300)
created_at  timestamptz not null default now()
```
- Index `(match_id, created_at)` for the ordered backfill; index `(match_id, user_id, created_at desc)` for the rate-limit lookup.
- Added to `supabase_realtime` publication + `replica identity full`.
- **RLS (near-identical to the parent's own policy):**
  ```sql
  create policy "pvp_chat_messages_select_participant" on public.pvp_chat_messages
    for select to authenticated
    using (exists (
      select 1 from public.pvp_live_matches m
      where m.id = match_id and (m.host_id = auth.uid() or m.guest_id = auth.uid())
    ));
  ```
  No INSERT/UPDATE/DELETE policy → all writes go through the security-definer RPC.
  (block-only per spec: a flagged message is *rejected*, never stored — so there is no
  `flagged`/`hidden`/`mask` column, unlike the old draft.)

### `pvp_chat_reports`
```
id          uuid pk default gen_random_uuid()
message_id  uuid not null references public.pvp_chat_messages(id) on delete cascade
reporter_id uuid not null references public.profiles(id) on delete cascade
reason      text
created_at  timestamptz not null default now()
unique (message_id, reporter_id)   -- one report per (message, reporter)
```
RPC-only insert; no select grant needed client-side (fire-and-forget). Its INSERT is what
the escalation trigger fires on.

### `pvp_chat_bans`
```
user_id     uuid pk references public.profiles(id) on delete cascade
reason      text
banned_by   uuid                       -- service_role/dashboard actor, nullable
expires_at  timestamptz                -- null = permanent
created_at  timestamptz not null default now()
```
- RLS: user may `select` only their own row (`user_id = auth.uid()`) — lets the client
  gray out the composer; the authoritative check is in the send RPC regardless.
- Populated **manually** via dashboard/service_role for v1 (no auto-ban trigger — the
  re-scope makes one bad actor's blast radius a single opponent, per spec decision 4).

### `chat_banned_words`
```
word        text primary key           -- stored lowercase, normalized
created_at  timestamptz not null default now()
```
- **No grant to `authenticated`** — enforcement is server-side only inside the send RPC.
- PO owns the seed list (spec decision 3); English-only v1.

### `app_config` (NEW — kill switch lives here)
```
key         text primary key
value       jsonb not null default 'null'
updated_at  timestamptz not null default now()
```
- Seed row: `('chat_enabled', 'true'::jsonb)`. Flip to `false` via the Supabase dashboard
  → all sends rejected instantly, **no deploy** (spec Story 3).
- **No grant to `authenticated`** — read only through the security-definer RPCs, so the
  flag can't be probed or spoofed. Generic key/value so future flags reuse it.

### Retention / pruning
- Send window and readability are both bounded to `created_at + interval '24 hours'` of the
  parent match. `on delete cascade` from `pvp_live_matches` already reclaims chat when a
  match row is deleted; the cron adds a time-based sweep independent of match deletion:
  ```sql
  -- in 20260719123000_pvp_chat_retention_cron.sql, via pg_cron (precedent: push_cron_jobs)
  select cron.schedule('pvp-chat-prune', '30 3 * * *', $$
    delete from public.pvp_chat_messages m
    using public.pvp_live_matches pm
    where pm.id = m.match_id and pm.created_at < now() - interval '24 hours';
  $$);
  ```
  Reports cascade-delete with their message.

---

## 2. RPC surface (frozen)

All `security definer`, `set search_path = public`, return `jsonb`, `grant execute … to authenticated`.
Each independently re-checks everything (defense-in-depth, mirroring `apply_pvp_signature_effect`).

### `send_pvp_chat_message(_match_id uuid, _body text) → jsonb`
Ordered guards (each returns `{ok:false, error:<code>}`):
1. `auth.uid()` present → else `no_session`.
2. `app_config` `chat_enabled` is true → else `chat_disabled`  *(kill switch — checked first-ish so a killed chat rejects even banned/nameless users cheaply)*.
3. `select … from pvp_live_matches where id=_match_id for update`; found → else `not_found`.
4. `auth.uid() in (host_id, guest_id)` → else `forbidden` (RLS-equivalent, re-checked).
5. `now() < match.created_at + interval '24 hours'` → else `chat_closed`.
6. No active `pvp_chat_bans` row (`expires_at is null or > now()`) → else `banned`.
7. `profiles.trainer_name` for the caller is non-null/non-empty → else `name_required` (the claimed-name gate, re-checked server-side — Story 2).
8. `char_length(trim(_body))` in 1..300 → else `too_long` / `empty`.
9. **Rate limit** — read caller's most recent message in this match `(match_id,user_id) order by created_at desc limit 1`: reject if `< 2s` ago (`rate_limited`) or identical trimmed body (`duplicate`).
10. **Profanity** — normalize `_body` (lowercase, strip diacritics/separators, collapse repeats), tokenize, reject if any token ∈ `chat_banned_words` (`blocked`). Deterministic, in-DB, no external call.
Then `insert` the row (snapshotting `trainer_name`/`trainer_sprite` from `profiles`) and return `{ok:true}`.

### `report_pvp_chat_message(_message_id uuid, _reason text) → jsonb`
- `no_session` guard; verify the message exists AND the caller is a participant of that
  message's match (join through `pvp_live_matches`) → else `forbidden`.
- `insert into pvp_chat_reports … on conflict (message_id, reporter_id) do nothing`; treat a
  no-op insert as `{ok:true, duplicate:true}` (Story 4: can't report twice). The INSERT
  fires the escalation trigger (§3.b).

### `get_pvp_chat_state(_match_id uuid) → jsonb`  *(UX-only, non-authoritative)*
Returns `{ enabled, banned, nameClaimed, windowOpen }` so the client can disable the
composer with the right message before a user types. **Not a security boundary** — the send
RPC re-checks all four. Cheap single-row reads.

### Tier decision — plain RPC, not Edge Function (with one exception)
The repo reserves **Edge Functions** for logic that needs server-only secrets or must
re-derive an outcome the client can never be trusted to supply — e.g. `pvp-live-resolve-turn`
recomputes answer correctness from the immutable `questions` column. Chat's send path has
**neither**: profanity is a deterministic wordlist lookup in the DB, and rate-limit/ban/kill
are row reads. It therefore belongs on the same tier as `apply_pvp_signature_effect` — a
security-definer **RPC**. The **only** piece needing the Edge tier is the report → GitHub
escalation, because it holds a secret (`GITHUB_TOKEN`) and calls an external API — and that
is exactly the `feedback_to_issue` shape: a DB trigger + pg_net, out-of-band and async, so a
webhook failure never blocks the report insert.

---

## 3. Realtime delivery

- **`postgres_changes` INSERT on `pvp_chat_messages`, filtered `match_id=eq.<id>`, RLS-scoped
  — sufficient, full stop.** This is the meaningful simplification the re-scope buys: fan-out
  is at most the 2 match participants (the RLS select policy is the delivery gate), so the old
  draft's Stage-3 **Realtime Broadcast** escape hatch is **not needed and is dropped**. Same
  channel shape as `subscribeToLivePvpEffects`.
- Requires the table in the `supabase_realtime` publication + `replica identity full` (both in PR-1).
- Client backfill on mount: `select … where match_id=eq order by created_at asc limit 100`,
  then subscribe for new inserts (identical to how the battle screen backfills then streams).

### (a) escalation trigger + edge function
```sql
-- 20260719122000_pvp_chat_report_webhook.sql — copy of feedback_to_issue()
create or replace function public.pvp_chat_report_to_issue() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform net.http_post(
    url := 'https://dvdorceiasaipdvyfhil.supabase.co/functions/v1/chat-report-to-issue',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'X-Chat-Report-Secret','__CHAT_REPORT_WEBHOOK_SECRET__'),
    body := jsonb_build_object('report_id', new.id, 'message_id', new.message_id,
                               'reporter_id', new.reporter_id, 'reason', new.reason,
                               'created_at', new.created_at)
  );
  return new;
end; $$;
create trigger pvp_chat_report_to_issue_trg
  after insert on public.pvp_chat_reports
  for each row execute function public.pvp_chat_report_to_issue();
```
- **`supabase/functions/chat-report-to-issue/index.ts`** — clone of `feedback-to-issue`:
  `verify_jwt` disabled, checks `X-Chat-Report-Secret` against a `CHAT_REPORT_WEBHOOK_SECRET`
  env secret, re-reads the reported message body via service-role, opens a labeled GitHub
  issue (`chat-report` label) for human triage. Secrets set via `supabase secrets set`, never
  committed (same as feedback/push).

---

## 4. Client / UI plan

**Emphasis: file/component boundaries.** Visual treatment per spec §UI (full-screen route,
dialog-box vocabulary) — no FAB, no bottom `Sheet`.

| File | New? | Contents |
|---|---|---|
| `src/lib/pvp-chat-types.ts` | new (**Architect stub, interfaces only**) | `ChatMessage`, `ChatState`, `SendResult`, `ReportResult` — see stub below |
| `src/lib/pvp-chat.ts` | new (Frontend) | Data layer mirroring `pvp-live.ts`: `sendChatMessage`, `reportChatMessage`, `fetchRecentChatMessages`, `getChatState`, `subscribeToMatchChat`. Loose `supabase as unknown as {rpc}` / `{from}` cast until types regen |
| `src/routes/pvp.chat.$matchId.tsx` | new (Frontend) | Full-screen file route. Loads `ensureSession` + `getLivePvpMatch(matchId)` for the opponent header, backfills, subscribes, renders `<MatchChatScreen>`. `onBack` → `navigate({to:"/pvp/live/$matchId", params})` or `/profile`. Gets keyboard/back/BGM handling for free like every other route |
| `src/components/match-chat-screen.tsx` | new (Frontend + UI/UX) | Message list (dialog-box/speech-bubble rows: trainer sprite + `font-pixel-xs` name tag + `rounded-3xl bg-card shadow-card` bubble; "VS {opponentName}" pixel eyebrow à la `NearbyBattleSheet`) + composer (`Input` + send, client length cap + optional pre-filter) + per-row "⋯ Report". `sonner` toasts map error codes (`blocked`/`rate_limited`/`banned`/`name_required`/`chat_disabled`/`chat_closed`) |
| `src/routes/pvp.live.$matchId.tsx` | edit (Frontend) | `PvpResultScreen`: add an optional `onChat?: () => void` prop; render a "Chat" `Button` beside the existing `onBack` "Back to Profile" button. Route wires `onChat={() => navigate({to:"/pvp/chat/$matchId", params:{matchId}})}` |
| `src/components/live-pvp-battle-screen.tsx` | edit (Frontend) | Add an optional `onOpenChat?: () => void` prop; render a small chat icon button in the existing top badge row (`live-pvp-battle-screen.tsx:~2020`, next to the QUESTION n/N + signature chips), with a quiet unread dot (no numeric badge, per spec). Only shown when `onOpenChat` is provided |

**Entry-point wiring lives in the route** (`pvp.live.$matchId.tsx`), which already holds
`matchId`, `myId`, and `opponentProfile` — both screens just receive a callback, keeping them
presentational.

### Architect stub — `src/lib/pvp-chat-types.ts` (interfaces only, compiles as-is)
```ts
export interface ChatMessage {
  id: string;
  matchId: string;
  userId: string;
  trainerName: string;
  trainerSprite: string;
  body: string;
  createdAt: string;
}

export type SendChatError =
  | "no_session" | "chat_disabled" | "not_found" | "forbidden"
  | "chat_closed" | "banned" | "name_required" | "empty" | "too_long"
  | "rate_limited" | "duplicate" | "blocked" | "network";

export type SendResult =
  | { ok: true; message: ChatMessage }
  | { ok: false; error: SendChatError };

export type ReportResult =
  | { ok: true; duplicate?: boolean }
  | { ok: false; error: string };

/** UX-only mirror of the send RPC's gates; never a security boundary. */
export interface ChatState {
  enabled: boolean;      // app_config chat_enabled
  banned: boolean;       // active pvp_chat_bans row for caller
  nameClaimed: boolean;  // profiles.trainer_name present
  windowOpen: boolean;   // now < match.created_at + 24h
}
```

---

## 5. Staged PR sequence (all land as M1 — safe-by-default before any client can post)

| PR | Migration / file | Contents | Owner |
|---|---|---|---|
| **PR-1 — schema** | `20260719120000_pvp_chat_schema.sql` | 4 tables + `app_config` (seed `chat_enabled=true`), indexes, RLS, publication + `replica identity full`, grants. **+ regenerate `src/integrations/supabase/types.ts`.** No RPCs yet → nothing is postable | Database |
| **PR-2 — RPCs** | `20260719121000_pvp_chat_rpcs.sql` | `send_pvp_chat_message`, `report_pvp_chat_message`, `get_pvp_chat_state`; `chat_banned_words` seed from PO. Ships the full filter/rate-limit/ban/kill/name logic in one reviewable unit | Database |
| **PR-3 — report webhook** | `20260719122000_pvp_chat_report_webhook.sql` + `supabase/functions/chat-report-to-issue/index.ts` | Trigger + pg_net + edge fn (clone of feedback path); `CHAT_REPORT_WEBHOOK_SECRET` set out-of-band | Database + Backend |
| **PR-4 — retention** | `20260719123000_pvp_chat_retention_cron.sql` | `pg_cron` nightly prune | Database |
| **PR-5 — client** | `pvp-chat-types.ts` (from stub), `pvp-chat.ts`, `pvp.chat.$matchId.tsx`, `match-chat-screen.tsx`, edits to `pvp.live.$matchId.tsx` + `live-pvp-battle-screen.tsx` | Data layer, route, UI, entry points | Frontend + UI/UX |

PR-1→4 are backend-only and can land/verify (via dashboard RPC calls) before any UI exists —
matching how every other feature here shipped schema→RPC→client. PR-5 is gated on PR-1's types
regen. Everything merges together as M1 (reporting + kill switch included, not deferred).

---

## Risks
1. **Ban evasion** — clearing storage yields a fresh `auth.uid()`. Accepted v1 limitation
   (spec decision 1); blast radius is one opponent, not a public square.
2. **Wordlist false positives (Scunthorpe)** — PO tunes the seed; block-only means a false
   positive is a rejected send, recoverable by rephrasing (no stored damage).
3. **`app_config` is a new shared surface** — keep it un-granted to `authenticated` and only
   ever read via security-definer RPCs so it can't become a client-writable flag store.
4. **Snapshotted `trainer_name`/`trainer_sprite`** can go stale vs a later rename — acceptable
   for an ephemeral 24 h chat; avoids a per-render profile join.

---

## Handoff

- **Status:** plan only — not implemented; awaiting owner go-ahead.
- **Produced:** `docs/handoffs/global-chat/02-architecture.md` (this doc, revision 2; supersedes 2026-07-10 draft).
- **Next agents:** **Database Engineer** (PR-1..4 migrations + RPCs) → **Backend Engineer**
  (PR-3 edge function `chat-report-to-issue`) → **Frontend Engineer** (PR-5 data layer, route,
  entry points) → **UI/UX Engineer** (dialog-box/speech-bubble treatment in `match-chat-screen.tsx`).
- **Context needed:** reuse `pvp_live_matches` RLS shape (`20260704030000…:38`) via an `exists`
  join; RPC-only writes like `apply_pvp_signature_effect` (`20260706090116…`); report webhook
  clones `feedback_to_issue` (`20260707111000…`) + `feedback-to-issue/index.ts`; prune cron
  clones `push_cron_jobs` (`20260703120100…`); regenerate the generated `types.ts` after PR-1;
  entry points are `PvpResultScreen` (add `onChat`) and `LivePvpBattleScreen` (add `onOpenChat`)
  in `src/routes/pvp.live.$matchId.tsx`, not a global overlay; name gate re-checks
  `profiles.trainer_name` (`social.ts` claim flow).
- **Frozen contracts:** the three RPC signatures (§2) and `pvp-chat-types.ts` (§4). Contract
  changes route through the Architect.
- **Open questions:** #1 (grace window) resolved = 24 h. #2 (M3 global room) remains a deferred
  business question, out of M1.

### Handoff — Database Engineer
Own PR-1..4. Tables/RLS/grants/publication + `app_config` seed (PR-1); the three RPCs +
wordlist seed (PR-2); report trigger (PR-3, coordinate secret with Backend); prune cron (PR-4).
Mirror `pvp_live_matches` grants exactly (SELECT→authenticated, ALL→service_role, no INSERT policy).

### Handoff — Backend Engineer
Own `supabase/functions/chat-report-to-issue/index.ts` (PR-3): clone `feedback-to-issue`,
swap secret to `CHAT_REPORT_WEBHOOK_SECRET`, label issues `chat-report`, re-read message body
via service-role. `verify_jwt` disabled; secret checked in-function.

### Handoff — Frontend Engineer
Own PR-5 minus pixel styling: instantiate `pvp-chat-types.ts` from the stub, build `pvp-chat.ts`
(mirror `pvp-live.ts` loose-cast + error mapping), the `pvp.chat.$matchId.tsx` route (session +
match load + backfill + `subscribeToMatchChat`), and the `onChat`/`onOpenChat` entry-point edits.

### Handoff — UI/UX Engineer
Own the visual layer of `match-chat-screen.tsx`: speech-bubble rows (sprite + `font-pixel-xs`
name tag + `rounded-3xl bg-card shadow-card`), "VS {opponentName}" pixel eyebrow, composer, and
the quiet unread dot (no numeric badge) on the battle-screen entry point.
