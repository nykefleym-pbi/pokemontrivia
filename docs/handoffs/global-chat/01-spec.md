# 01-spec — Chat (v1): post-match, not global

**Feature slug:** `global-chat` (retained for traceability; v1 scope is no longer
literally global — see below)
**Author:** Product Owner, revised after a Fable design-critique pass
**Date:** 2026-07-18 (revision 2)
**Source:** Player feedback (`public.feedback`, TurboAce74, suggestion, 2026-07-09):
"Add a Global Chat. Ensure profanities or incorrect behavior is banned."
**History:**
- `02-architecture.md` (2026-07-10) — first pass, global lobby room, stopped at
  "plan only" pending 7 owner decisions.
- Revision 1 (2026-07-18, superseded by this doc) — resolved all 7 decisions but
  kept the global-room shape.
- **This revision** — a Fable UI/UX+product critique of revision 1 pushed back on
  the global-room framing itself (see "Why the re-scope" below) and its
  recommendation is adopted here as the v1 plan.

---

## Why the re-scope

The original feedback's own justification, and this spec's own problem statement,
say the gap is *"players have no way to talk to each other outside a live 1:1
match."* That is a relationship gap — talk to the person I just played, talk to my
friends — not a broadcast gap. Every existing social surface in this app is paired
and contextual (friend codes, friend requests, PvP invites, Nearby Battle's
face-to-face QR handshake). A global, server-wide room is the one shape that:

- serves that actual want worst (a public firehose isn't "talk to my opponent"),
- is emptiest most of the time in a small-population, short-session game (battles
  run 2–5 minutes; nobody idles in a lobby) — and an empty global chat reads
  worse than no chat at all,
- and maximizes exactly the moderation/legal exposure (public text input, a game
  that plausibly attracts minors) that revision 1 had flagged as "open, not
  blocking" — backwards, since a paired/consenting surface mostly dissolves that
  risk instead of requiring it be solved up front.

**v1 is re-scoped to chat scoped to a single completed/active `pvp_live_matches`
row** (Nearby Battle, human-vs-human only — Training-vs-bot has no
`pvp_live_matches` row and is out of scope by construction, since there's no one
on the other end to talk to). A true global lobby is not cancelled, just deferred
to a possible M3, gated on real usage data plus the moderation tooling and legal
review a public room actually needs.

---

## In scope (v1)

- Chat scoped to one `pvp_live_matches` row — both participants (`host_id`,
  `guest_id`) of that specific Nearby Battle can message each other, during the
  match and for a bounded window after it ends.
- Server-side **authoritative** profanity filtering (reject on send).
- Rate limiting and message-length caps.
- Posting gated on having a **claimed `trainer_name`** (same rule as before —
  guests can still play Nearby Battle, but must claim a name before they can
  chat).
- **Report-message**, in M1 (moved up from M2 — see "Moderation" below).
- **A kill switch**: a single server-checked flag that instantly disables all new
  chat sends app-wide if abuse shows up, without needing a deploy.
- Manual ban capability via existing service-role/dashboard access.

## Out of scope (v1 — explicitly deferred)

- **A server-wide global lobby room** — this is the M3 candidate, not v1. Revisit
  only after M1/M2 data shows real demand and only alongside real moderation
  tooling + a completed legal/child-safety review.
- Friends-only always-on chat / DMs outside of a shared match.
- Chat for Training (bot) matches, Mega Raid, Daily Quest, Who's That Pokémon —
  none of these have a second human to talk to.
- In-app moderator dashboard / mute-ban UI.
- Auto-hide-on-report-threshold automation.
- Mask-vs-block nuance (v1 is block-only: a flagged message is rejected, never
  stored/shown).
- Message edit/delete, reactions, rich media, presence/typing indicators.
- Multi-language wordlist / i18n moderation.
- Device-level anti-evasion (fingerprinting, phone verification, etc.).

---

## Resolved decisions

1. **Ban evasion** — Still possible (clear storage, reclaim a fresh name), but
   materially lower-stakes than the global-room version: a ban only removes
   someone from chatting with people they're matched against, not from a shared
   public square. Accepted as a known v1 limitation.
2. **Guests** — Can play Nearby Battle as guests today; must claim a
   `trainer_name` before they can send a chat message in a match (read-along
   without posting is fine, matching the original gate's spirit).
3. **Wordlist maintenance** — **Reviewed and blessed as intentional v1 policy
   (2026-07-19), not a provisional placeholder.** The 14-word block-only list
   (6 English + 8 Tagalog/Filipino, seeded across two migrations) is right-sized
   for this scope: match-scoped 1:1 chat between already-matched, consenting
   players, backed by report + kill-switch + manual-ban. Confirmed policy:
   - Stay in the "obvious profanity, no slurs" tier — slurs are a distinct
     harassment/hate-speech category needing dedicated, deliberately-owned
     handling (ideally with legal input), not a rider on a generic swear
     filter.
   - Block-only stays for v1 — no masking/severity tiers. Masking would need a
     schema/RPC change for a UX benefit that doesn't matter much 1:1 (the
     recipient just re-asks); block is also strictly safer (nothing bad is
     ever stored/shown).
   - **Additions/new languages are reactive, not proactive**: the trigger for
     adding a word or a third language is a real report that got through, not
     guessing at what someone might type — proactive guessing is how a
     wordlist balloons with false-positive risk and drifts from real player
     behavior.
   - Spot-checked all 14 words against Pokémon/move names and ordinary
     trivia-chat vocabulary — no false-positive collisions found; whole-word
     matching after normalization already avoids the classic Scunthorpe
     substring problem.
   - Ownership stays PO-via-migration (as already practiced) — no admin UI for
     v1, correctly out of scope at this volume.
   - **Backlog, not blocking**: the normalizer doesn't collapse repeated
     letters (`fuuuck` → `fuck`), the most common real evasion pattern for
     this kind of filter. Not required for v1 — report/manual-ban catches
     what slips through — but worth a Database/Architect follow-up later.
4. **No moderator tooling** — Acceptable for v1 *because* scope is now paired
   matches, not a public room: the blast radius of one bad actor is one
   opponent, not everyone online. Report → GitHub issue (mirrors
   `feedback_to_issue`) for human triage; kill switch for an emergency stop; bans
   applied manually via dashboard.
5. **Legal/child-safety** — Substantially de-risked by the re-scope (paired,
   mutually-matched participants, not an open public room), but not eliminated —
   still flagged as a business question before any future M3 global room, not
   before shipping M1.
6. **Realtime cost/scaling** — A non-issue at this scope: fan-out is bounded to
   exactly the two participants of a match (RLS-scoped to `host_id`/`guest_id`),
   not a global broadcast. No scaling design needed for v1.
7. **Chat scope** — **Resolved: scoped to a single `pvp_live_matches` row.** No
   global room in v1.

---

## User stories & acceptance criteria

### Story 1 — Chat during/after a Nearby Battle (Must, M1)
As a player in (or who just finished) a Nearby Battle, I want to message my
opponent, so I can say gg, ask a rematch, or just talk to the person I played.
- **Given** I'm a participant in a `pvp_live_matches` row, **When** I open that
  match's chat, **Then** I see the messages exchanged in that match, live,
  without a refresh.
- **Given** I am not a participant in that match, **Then** I cannot read or post
  to it (RLS-enforced, not just UI-hidden).
- **Given** the match ends, **Then** chat for that match remains open for a
  bounded grace window (exact duration is the Architect's call) before it's
  retired — not indefinitely.

### Story 2 — Post a message (Must, M1)
As a match participant with a claimed trainer name, I want to send a message that
reaches my opponent in near-real-time.
- **Given** I have a claimed `trainer_name`, **When** I send a valid message,
  **Then** it appears on both clients within a couple seconds.
- **Given** I have not claimed a trainer name, **When** I try to send, **Then**
  I'm blocked with a message pointing at the existing name-claim flow.
- **Given** my message exceeds the length cap, **Then** it's rejected
  client-side before it reaches the server.

### Story 3 — Authoritative filtering, rate-limit, and kill switch (Must, M1)
As the product, I want abuse blocked server-side and a way to shut chat off
instantly if something's wrong.
- **Given** a message contains a blocked-list term (after normalization), **When**
  submitted, **Then** the server rejects it outright — never stored, never sent.
- **Given** I send faster than the allowed rate, or repeat an identical message,
  **Then** the extra sends are rejected with a clear "slow down" response.
- **Given** I am under an active ban, **Then** every send attempt is rejected
  regardless of client-side state.
- **Given** the kill switch is flipped, **Then** every send attempt everywhere is
  rejected immediately, with no deploy required.

### Story 4 — Report a message (Must, M1 — moved up from M2)
As a player who sees a message that slipped past filtering, I want to report it
so a human can act, without waiting on a later milestone.
- **Given** I report a message, **When** submitted, **Then** it's recorded once
  per (message, reporter) pair and reaches a person for triage (reuse
  `feedback_to_issue`'s webhook pattern).
- **Given** I've already reported a message, **Then** I can't report it again
  from the same account.

---

## UI/UX (folds in the Fable critique directly)

- **No floating button, no bottom `Sheet`.** The bottom nav already suppresses
  itself during battles and has no free slot; a persistent chat FAB would fight
  that suppression logic and tax screens where chat is irrelevant (Shop, Dex,
  Profile). A `Sheet` is also the wrong container for sustained chat + an
  on-screen keyboard inside this app's `h-[100dvh] overflow-hidden` shell — the
  keyboard eats a bottom sheet fast.
- **Entry point:** a "Chat" action on `PvpResultScreen`
  (`src/routes/pvp.live.$matchId.tsx`) next to the existing `onBack` action, and
  (if the match is still active) a header icon inside `LivePvpBattleScreen`
  itself — not a global always-present control.
- **Surface:** a full-screen route (e.g. `src/routes/pvp.chat.$matchId.tsx`),
  matching how every other mode in this app already works (its own route gets
  keyboard handling, back behavior, and BGM-per-route for free — no new overlay
  plumbing needed in `__root.tsx`).
- **Visual treatment:** lean into the game's own vocabulary instead of a
  generic avatar/name/body message list, which would read as a bolted-on
  Discord widget. Trainer sprite + `font-pixel-xs` name tag + `rounded-3xl
  bg-card shadow-card` speech-bubble rows, a pixel eyebrow label (e.g. "VS
  {opponentName}", matching `NearbyBattleSheet`'s "FACE TO FACE" pattern).
- **No numeric unread badge.** At most a quiet dot on the entry point if there
  are unseen messages in an active match's chat — a message counter would tax
  attention against the core trivia/battle loop.

---

## Data model implications (conceptual — Architect's call on exact shape)

- **Messages**: author (`user_id`), `match_id` referencing `pvp_live_matches(id)`,
  body, created_at. RLS: select/insert only if `auth.uid()` is that match's
  `host_id` or `guest_id` — mirrors the existing `pvp_live_matches` row policy
  directly, no separate room-membership concept needed.
- **No RLS on a "who can read this room" join is needed at all** (unlike the
  global-room design) — match participancy already answers it.
- **Reports**: message id, reporter id, one-row-per-(message, reporter).
- **Kill switch**: a single boolean/config row (or reuse an existing app-config
  pattern if one exists) checked inside the send RPC.
- **Bans**: who, since when, optional expiry, applied manually for v1.
- **Retention**: bounded to match lifetime + a short grace window — trivially
  boundable and prunable (existing `pg_cron` precedent), unlike an
  ever-growing global log.
- **Writes are RPC-only**, mirroring `pvp_live_matches`'s own write model — no
  direct client INSERT policy.

## Priority (MoSCoW)

- **Must:** Stories 1–4 (all of M1 — reporting and the kill switch are no longer
  deferred).
- **Should:** client-side pre-filter for instant typing feedback (never a
  substitute for the server check).
- **Could:** message-hide propagation to already-open clients on moderation,
  extending match-scoped chat to other paired contexts (friend-to-friend outside
  a match) if requested later.
- **Won't (this cycle):** a global lobby room (M3 candidate only), DMs outside a
  shared match, edit/delete, reactions, rich media, i18n wordlist, in-app
  moderator dashboard.

## Milestone breakdown

- **M1 — Match-scoped chat, fully moderated:** Stories 1–4 together (chat,
  filter/rate-limit, report, kill switch). Ships as one coherent, safe-by-default
  slice — splitting reporting into a later PR was the part revision 1 got wrong.
- **M2 — Polish:** propagate moderation hides to already-open clients on
  reconnect; UI refinement from real usage.
- **M3 (not committed — Could-tier, gated):** a true global lobby room, only if
  M1/M2 usage data shows real demand for it, and only alongside actual moderator
  tooling and a completed legal/child-safety review.

## Definition of Done

- Every Must story's acceptance criteria verified on the Vercel preview with two
  real accounts in an actual Nearby Battle match.
- RLS independently verified: a non-participant cannot read or write to another
  match's chat, even by calling the write path directly.
- Server-side filter, rate-limit, and kill switch cannot be bypassed by calling
  the write path directly.
- Guests can play Nearby Battle; a guest posting attempt without a claimed name
  is cleanly rejected with actionable messaging.
- `tsc` + ESLint + Vitest green.
- Retention/grace-window pruning in place before merge.

## Open questions (flagged, not blocking M1)

1. Exact grace-window duration after a match ends before its chat closes —
   Architect's call.
2. Whether/when to revisit M3 (global room) — only after M1/M2 ships with real
   usage data, and only alongside a legal review that doesn't gate M1.

---

## Handoff
- **Status:** done — re-scoped after design critique; ready for architecture
  re-validation.
- **Produced:** `docs/handoffs/global-chat/01-spec.md` (this doc, revision 2)
- **Next agent:** solution-architect — produce the migration/RPC/component plan
  for match-scoped chat (reusing `pvp_live_matches` RLS precedent directly).
  **Not started — awaiting owner go-ahead to proceed past scoping.**
- **Context the next agent needs:** reuse `pvp_live_matches`'s own
  `host_id = auth.uid() or guest_id = auth.uid()` RLS pattern
  (`supabase/migrations/20260704030000_pvp_live_matches.sql:40`) directly for
  chat-row access — no separate room/membership table needed; entry points are
  `PvpResultScreen` and `LivePvpBattleScreen`
  (`src/routes/pvp.live.$matchId.tsx`), not a global overlay; reuse
  `feedback_to_issue` for report escalation.
- **Open questions / risks:** the two flagged above.
