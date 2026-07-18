# 01-spec — Global Chat (v1)

**Feature slug:** `global-chat`
**Author:** Product Owner
**Date:** 2026-07-18
**Source:** Player feedback (`public.feedback`, TurboAce74, suggestion, 2026-07-09):
"Add a Global Chat. Ensure profanities or incorrect behavior is banned."
**Supersedes:** the "awaiting owner decisions 1–7" gate in `02-architecture.md`
(2026-07-10) — this spec resolves those decisions so the plan can proceed.

---

## Problem statement

Players have no way to talk to each other outside a live 1:1 match. The request is
for a shared space to chat, with an explicit (and correct) worry that public text
input in a game invites abuse. v1 must ship a genuinely useful chat surface without
shipping an unmoderated firehose.

## In scope (v1)

- One single, server-wide **global lobby chat room** — not per-match, not
  per-friend-group, not regional.
- Server-side **authoritative** profanity filtering (reject on send), not just
  client-side cosmetic filtering.
- Rate limiting and message-length caps.
- Posting gated on having a **claimed `trainer_name`** (read is open to everyone,
  including guests).
- A basic **report-message** action that reaches a human (reuse the
  `feedback_to_issue` webhook pattern).
- Manual ban capability via existing service-role/dashboard access (no new admin UI
  required for v1).

## Out of scope (v1 — explicitly deferred)

- Per-match chat (attached to a live Nearby Battle) and friend-only/DM chat —
  separate features, not this one.
- In-app moderator dashboard / mute-mute-ban UI.
- Auto-hide-on-report-threshold automation.
- Mask-vs-block nuance (v1 is block-only: a flagged message is rejected, never
  stored/shown).
- Message edit/delete by the author, reactions, rich media, presence/typing
  indicators.
- Multi-language wordlist / i18n moderation.
- Any anti-evasion beyond "must have a claimed name" (device fingerprinting, phone
  verification, etc.).
- Full legal/child-safety review (COPPA-style, ToS, code-of-conduct enforcement) —
  flagged as an open question, not resolved here.

---

## Resolved decisions (supersedes `02-architecture.md` §"Risks & open product decisions", items 1–7)

1. **Ban evasion via anonymous accounts** — *Accepted risk for v1.* Posting requires
   a claimed `trainer_name`, a real (if imperfect) deterrent since it's the same
   public identity used for friends/leaderboards. Clearing storage and reclaiming a
   fresh name still evades a ban — documented as a known v1 limitation, not a
   blocker.
2. **Guests** — May **read** the global chat freely. May **not post** until they've
   claimed a trainer name. Concrete gate for decision 1.
3. **Wordlist maintenance** — Product Owner owns the initial word list and
   block/severity tuning as a living doc, not engineering. English-only for v1;
   i18n explicitly deferred.
4. **No moderator tooling** — Acceptable for v1. Reports escalate to a GitHub issue
   (mirrors `feedback_to_issue`) for human triage; bans applied manually via
   Supabase dashboard/service-role in the interim. In-app mod surface is a later
   milestone, not required for v1 DoD.
5. **Legal/child-safety** — Not resolved by this spec; flagged as an **open
   question requiring a business/legal call**, not an engineering one. Mitigation
   shipped in v1: a one-time "be kind / community guidelines" acknowledgment shown
   on first chat open. Full compliance review should happen before any broad
   marketing push, not before shipping to the Vercel preview for internal
   validation.
6. **Realtime cost/scaling** — Deferred to the Solution Architect; no numeric SLA
   fixed by product. Requirement: normal usage must not visibly degrade the
   existing PvP realtime experience.
7. **Chat scope** — **Resolved: one single global lobby room in v1.** Per-match and
   friend-group scoping are real future asks but not this slice.

---

## User stories & acceptance criteria

### Story 1 — Read the global chat (Must, M1)
As any player (including a guest), I want to see recent global chat messages, so
that I can follow the conversation before deciding to join in.
- **Given** I open the chat surface, **When** it loads, **Then** I see the most
  recent messages (bounded backfill, e.g. last 50) ordered oldest→newest, and new
  messages arrive live without a refresh.
- **Given** a message has been rejected by moderation or hidden, **Then** I never
  see it (not a redacted placeholder — it simply isn't there).
- **Given** I am a guest with no claimed name, **Then** I can still read; nothing
  prompts me to sign up just to look.

### Story 2 — Post to the global chat (Must, M1)
As a player with a claimed trainer name, I want to send a message that appears to
everyone in near-real-time, so that I can participate.
- **Given** I have a claimed `trainer_name`, **When** I send a valid message,
  **Then** it appears in my view and every other open client's view within a
  couple seconds, attributed to my trainer name/sprite.
- **Given** I have **not** claimed a trainer name (guest), **When** I try to send,
  **Then** I'm blocked with a clear message pointing at the existing name-claim
  flow — not a silent failure.
- **Given** my message exceeds the length cap, **Then** it's rejected
  client-side before it ever reaches the server.

### Story 3 — Messages are filtered and rate-limited authoritatively (Must, M1)
As the product, I want profanity and spam blocked server-side regardless of what
client sent the request, so that a modified/bypassed client can't post anything
the official app would refuse.
- **Given** a message contains a blocked-list term (after normalization: case,
  separators, repeats), **When** it's submitted, **Then** the server rejects it
  outright — it is never stored, never broadcast.
- **Given** I send messages faster than the allowed rate (e.g. more than one every
  ~2s, or a burst above a short-window cap), **Then** the extra sends are rejected
  with a clear "slow down" response, not silently dropped or queued.
- **Given** I repeat the identical message back-to-back, **Then** the duplicate is
  rejected (basic flood guard).
- **Given** I am under an active ban, **Then** every send attempt is rejected
  regardless of client-side state.

### Story 4 — Report a message (Must, M2)
As a player who sees a message that slipped past filtering (harassment, evasion
spelling, etc.), I want to report it, so that a human can act.
- **Given** I report a message, **When** the report is submitted, **Then** it's
  recorded once per (message, reporter) pair and reaches a person for triage
  (reuse the feedback-to-issue webhook pattern).
- **Given** I've already reported a message, **Then** I can't report it again from
  the same account.
- This story does **not** require automatic hide-on-threshold or an in-app mod UI
  — manual follow-up by a human via existing dashboard access is sufficient for
  v1's DoD.

---

## Data model implications (conceptual — Architect's call on exact shape)

- **Messages** need: an author reference, a **room/scope identifier from day one**
  even though v1 has exactly one room value — so a future per-match or per-group
  room doesn't force a breaking schema change later.
- **Moderation status** is binary in v1: a message either exists (passed
  filtering) or was rejected at send time and was never persisted.
- **Reports** need: which message, who reported, one-row-per-(message, reporter)
  uniqueness.
- **Bans** need: who, since when, optional expiry, applied by whom — v1 only needs
  manual insert/update via dashboard.
- **RLS shape:** read is open (any session including guest); insert is **never**
  direct — must go through a server-side function that enforces
  name-claimed + not-banned + rate-limit + filter, mirroring `pvp_live_matches`.
  No client update/delete policy — messages are immutable once accepted.
- **Retention:** bounded (days or row-count cap — Architect's call); client
  backfill always capped to the most recent ~50 regardless of table depth.

## Priority (MoSCoW)

- **Must:** Stories 1–4.
- **Should:** client-side pre-filter for instant typing feedback (in addition to,
  never instead of, the server check); one-time community-guidelines
  acknowledgment.
- **Could:** mask-vs-block severity tiers, auto-hide on report threshold, in-app
  moderator surface, presence/typing indicators.
- **Won't (this feature cycle):** DMs, per-match/room-scoped chat variants,
  message edit/delete, reactions, rich media, i18n wordlist, device-level
  anti-evasion, full admin dashboard.

## Milestone breakdown (small, independently shippable PRs)

- **M1 — Read & post, moderated:** Stories 1–3. Ships a usable, safe-by-default
  global chat. No reporting yet.
- **M2 — Reporting loop:** Story 4, reusing the `feedback_to_issue` webhook shape.
  Manual bans via dashboard in the meantime.
- **M3 (not committed in this spec, Could-tier):** auto-hide-on-threshold, in-app
  moderator tooling, Realtime scaling migration if needed, wordlist i18n. Only
  pick up if usage/abuse volume post-M2 warrants it.

## Definition of Done

- Every Must story's acceptance criteria verified on the Vercel preview with a
  real (or seeded) second account, not just unit tests.
- Server-side filter and rate-limit cannot be bypassed by calling the write path
  directly (i.e., verified as RPC-enforced, not merely client-enforced).
- Guests can read but a guest posting attempt is cleanly rejected with actionable
  messaging.
- `tsc` + ESLint + Vitest green for each milestone's PR.
- M1 and M2 ship as separate, independently reviewable PRs — no big-bang PR.
- Retention/backfill cap in place before merge (not left as a follow-up).

## Open questions (flagged, not blocking M1/M2)

1. **Legal/child-safety review** — business/legal call, not resolved here;
   recommend completing before any broad public launch push, does not block
   shipping to preview for internal validation.
2. Exact retention window and exact rate-limit numbers — Architect's call within
   the guardrails above.
3. Whether/when usage volume justifies M3 — revisit after M2 ships with real data.

---

## Handoff
- **Status:** done — decisions 1–7 resolved; ready for architecture re-validation.
- **Produced:** `docs/handoffs/global-chat/01-spec.md` (this doc)
- **Next agent:** solution-architect — re-validate/update `02-architecture.md`
  against the resolved decisions above and produce the migration/RPC/component
  plan. **Not started — awaiting owner go-ahead to proceed past scoping.**
- **Context the next agent needs:** reuse `profiles` identity (`ensureSession`,
  `claimTrainerName` in `src/lib/social.ts`) for the post-gate; reuse the
  `pvp_live_matches` realtime + RPC-write pattern
  (`src/routes/pvp.live.$matchId.tsx`) as the precedent for the chat write path;
  reuse `feedback_to_issue`
  (`supabase/migrations/20260707111000_feedback_to_issue_trigger.sql`) as the
  precedent for report escalation. No role/moderator system exists yet — not
  required for v1 DoD.
- **Open questions / risks:** the three flagged above; #1 is the only one with
  real stakes outside engineering.
