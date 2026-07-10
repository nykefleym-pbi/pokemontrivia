# 02-architecture — Global Chat with moderation (PLAN ONLY)

**Feature slug:** `global-chat`
**Author:** Solution Architect
**Date:** 2026-07-10
**Status:** Plan only — **not implemented** this cycle (owner decision 2026-07-10).
**Source:** feedback #2 (TurboAce74): "Add a Global Chat. Ensure profanities or
incorrect behavior is banned." See `docs/handoffs/feedback-triage/01-spec.md`.

---

## Grounding — what the repo already provides

- **Identity:** anonymous Supabase sessions (`ensureSession` in `src/lib/social.ts`);
  every user has `public.profiles` (`id = auth.uid()`, `trainer_name`,
  `trainer_sprite`, `level`, `friend_code`) with RLS `profiles_read_all`
  (`select … using (true)`). Reuse directly — no new user model.
- **Realtime:** `postgres_changes` INSERT streaming — canonical example
  `subscribeToLivePvpEffects` in `src/lib/pvp-live.ts`. Tables must be added to the
  `supabase_realtime` publication + `replica identity full`
  (`supabase/migrations/20260704030000_pvp_live_matches.sql:42-43`).
- **Trusted writes:** `security definer` RPCs returning `jsonb {ok, error}` with
  `set search_path = public` (`start_live_pvp_match`, `submit_live_pvp_result`).
  Rate-limit precedent:
  `20260706090116_pvp_signature_effect_ownership_and_post_answer_ratelimit.sql`.
- **DB-trigger → edge function:** `public.feedback` +
  `feedback_to_issue()` (`20260707111000_…`) uses `net.http_post` (pg_net) into the
  `feedback-to-issue` edge function, authed by a shared `X-Feedback-Secret`
  (`__FEEDBACK_WEBHOOK_SECRET__` placeholder substituted at apply). Reuse for report
  escalation.
- **UI:** TanStack file routes; Zustand `useGameStore`; `sonner` toasts; shadcn/ui in
  `src/components/ui` (`Sheet`, `ScrollArea`, `Input`, `Button`); global overlays
  mounted once in `src/routes/__root.tsx`; bottom nav is a fixed 4-tab grid
  (`src/components/bottom-nav.tsx`); feedback UI is a bottom `Sheet` in
  `src/routes/profile.tsx` with a 60s client rate-limit ref.
- **Types:** `src/integrations/supabase/types.ts` is generated; `pvp-live.ts` uses a
  `supabase as unknown as { from }` loose cast until regen — follow that.
- **No role system exists** — `is_admin`/moderator must be added.
- **Migration naming:** `YYYYMMDDHHMMSS_snake_description.sql`; today → `202607101…`.

---

## Data model

Tables: `chat_messages`, `chat_bans`, `chat_reports`, `chat_banned_words`, plus a
`profiles.is_moderator` flag. **RPC-only writes** (no direct INSERT policy on
`chat_messages`) so profanity + rate-limit + ban checks are authoritative — mirrors
the `pvp_live_matches` write model.

- `chat_messages(id, user_id=auth.uid(), trainer_name, trainer_sprite, body
  check 1..300, flagged, hidden, created_at)`; partial index on `created_at desc
  where hidden=false`; index `(user_id, created_at desc)`; RLS select `hidden=false`;
  added to `supabase_realtime` + `replica identity full`.
- `chat_bans(user_id pk, reason, banned_by, expires_at null=perm, created_at)`; RLS:
  user reads only their own ban.
- `chat_reports(id, message_id, reporter_id=auth.uid(), reason, created_at,
  unique(message_id, reporter_id))`; RLS insert-own.
- `chat_banned_words(word pk lowercase, severity 'mask'|'block')`; **no client
  grants** — enforcement server-side only.

Migrations (staged):
`20260710120000_global_chat.sql` (tables + RLS + realtime),
`20260710120100_global_chat_rpcs.sql`
(`send_chat_message`, `moderate_chat` gated on `is_moderator`, `is_chat_banned`,
report-threshold trigger, wordlist seed),
`20260710120200_chat_report_webhook.sql` (pg_net escalation, only if edge-notify at
launch).

## Realtime delivery

MVP: `postgres_changes` INSERT on `chat_messages` (mirrors
`subscribeToLivePvpEffects`) + a `select … order by created_at desc limit 50`
backfill. Scale option (Stage 3): migrate the hot path to **Realtime Broadcast**,
keeping the table for history. `src/lib/chat.ts` exposes `subscribeToChat` returning
an unsubscribe (`supabase.removeChannel`).

## Moderation (core requirement)

- **(a) Profanity — two layers.** Client pre-filter (UX only) via the
  [`obscenity`](https://www.npmjs.com/package/obscenity) TS lib (handles
  leetspeak/spacing). Server authoritative: `send_chat_message(_body)` normalizes
  (lowercase, strip separators/diacritics, collapse repeats) and checks tokens vs
  `chat_banned_words` — `block` → reject, `mask` → `***` + `flagged=true`, still
  stored. Deterministic, no external call in the hot path. Optional Stage-3 AI
  re-scoring edge function (`chat-moderate`) for `flagged` rows → auto-`hidden`.
- **(b) Rate limit / spam.** Inside `send_chat_message` via `(user_id, created_at)`
  index: reject &lt;~2s since last, &gt;~5/10s, or identical-to-last (dup-flood). Keep the
  client ref for instant feedback.
- **(c) Ban / mute.** `send_chat_message` rejects if an active `chat_bans` row exists
  (`expires_at is null or > now()`). Auto-ban trigger on `chat_reports`: past N
  distinct reporters → insert temp ban + `hidden=true`. Manual bans via service_role
  (dashboard) or `moderate_chat` (moderator-gated).
- **(d) Reporting.** `reportMessage(messageId, reason)` inserts `chat_reports`
  (RLS insert-own, one per user per message). Threshold trigger
  `chat_report_escalate()` mirrors `feedback_to_issue()` (pg_net →
  `chat-report` edge fn with `__CHAT_WEBHOOK_SECRET__`). Auto-hide/ban happen in-DB so
  they survive webhook failure.

## UI

Overlay pattern (bottom nav is a fixed 4-tab grid, no free slot):
- `src/lib/chat.ts` — data layer mirroring `pvp-live.ts` (`sendChatMessage`,
  `subscribeToChat`, `fetchRecentMessages`, `reportMessage`, types; loose cast).
- `src/components/GlobalChat.tsx` — `ScrollArea` list (sprite + name + body, ⋯ Report)
  + composer (`Input` + send) with `obscenity` pre-filter + client rate-limit ref;
  app vocabulary (`rounded-3xl`, `bg-card`, `shadow-pop`, `font-display`).
- `src/components/GlobalChatSheet.tsx` — bottom `Sheet` wrapper (like
  `NearbyBattleSheet`), mounted once in `src/routes/__root.tsx`, opened via a floating
  chat button / entry in `battle-home.tsx`. Optional `src/routes/chat.tsx` for
  deep-linking. `sonner` toasts map `blocked`/`rate_limited`/`banned`.

## Staged rollout

1. **MVP:** `…120000` (chat_messages + RLS + realtime) + minimal `…120100`
   `send_chat_message` (ban + rate-limit + small wordlist seed) so launch isn't
   unmoderated; regenerate types; `src/lib/chat.ts`, `GlobalChat*`, mount in root,
   add `obscenity`.
2. **Moderation hardening:** finalize bans/reports/wordlist/`is_moderator`; full
   mask/block + report-threshold auto-hide/ban; `moderate_chat` + minimal mod surface;
   wire `reportMessage`.
3. **Scale & AI:** `…120200` webhook + `chat-report` edge fn; optional
   `chat-moderate`; Broadcast migration; retention `pg_cron` (precedent
   `20260703120100_push_cron_jobs.sql`).

## Risks & open product decisions (owner)

1. **Anonymous accounts undercut bans** — clearing storage yields a fresh
   `auth.uid()`, evading bans. Biggest weakness. Decide: accept for v1, gate chat
   behind a claimed name / min `level`, or edge heuristics.
2. **Guests** (`isGuest` in `social.ts`) — may they post at all?
3. **Wordlist maintenance / false positives** (Scunthorpe) — owner tunes list +
   severity; English-only to start (i18n later).
4. **No moderator tooling** — MVP leans on dashboard/service_role for bans/takedowns.
5. **Legal/child-safety** — public chat in a game appealing to minors →
   COPPA/child-safety, reporting/appeal flow, code-of-conduct/ToS. Resolve before launch.
6. **Realtime cost/scaling** — `postgres_changes` fan-out + per-row RLS; set the
   concurrency ceiling that triggers the Broadcast migration.
7. **Chat scope** — confirm one global room (this plan) vs friends-only/regional
   (`room_id` reshape).

---

## Handoff
- **Status:** needs-review (plan only; awaiting owner go/no-go + decisions 1–7)
- **Produced:** `docs/handoffs/global-chat/02-architecture.md`
- **Next agent:** product-owner (resolve decisions 1–7) → database-engineer (Stage 1
  migrations) when approved.
- **Context the next agent needs:** reuse `profiles` identity + `pvp-live.ts` realtime
  + `feedback_to_issue` webhook patterns; RPC-only writes; no role system exists;
  bottom nav is full (use an overlay `Sheet`).
- **Open questions / risks:** decisions 1–7 above; #1 (ban evasion) and #5 (child
  safety) are blockers for a real launch.
