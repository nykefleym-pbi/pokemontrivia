# 03-frontend — Match-scoped Chat client wiring (PR-5)

**Feature slug:** `global-chat`
**Author:** Frontend Engineer
**Date:** 2026-07-19
**Status:** done — implements the frozen `02-architecture.md` §4 client plan against the
already-merged backend (PR-1..4).

---

## Files created

| File | Purpose |
|---|---|
| `src/lib/pvp-chat-types.ts` | Frozen interfaces (`ChatMessage`, `SendChatError`, `SendResult`, `ReportResult`, `ChatState`) reproduced verbatim from the architecture doc's stub. |
| `src/lib/pvp-chat.ts` | Data layer mirroring `pvp-live.ts`'s shape: `sendChatMessage`, `reportChatMessage`, `fetchRecentChatMessages`, `getChatState`, `subscribeToMatchChat`. Uses the typed `supabase.rpc(...)` / `.from(...)` path directly (types.ts already has all three RPCs + the table — no loose cast needed, unlike the pre-regen precedent in `pvp-live.ts`/`social.ts`). |
| `src/routes/pvp.chat.$matchId.tsx` | Full-screen file route. `ensureSession` → `getLivePvpMatch` (opponent id/status) → `getProfileById` (opponent name) → `fetchRecentChatMessages` backfill + `getChatState` in parallel → `subscribeToMatchChat` for the live stream (de-duped by `id` against the backfill). Renders `loading` / `not_found` / `ready` states. |
| `src/components/match-chat-screen.tsx` | Presentational screen: header (back chevron + "VS {opponentName}" pixel eyebrow + "Match Chat" title), message list (sprite + `font-pixel-xs` name tag + `rounded-3xl shadow-card` bubble, `bg-primary/10` for my messages vs `bg-card` for the opponent's, empty state when no messages), composer (`Input` + send `Button`, 300-char client cap, disabled+explanatory banner when `ChatState` says not `enabled`/`banned`/`!nameClaimed`/`!windowOpen`), per-opponent-message "⋯ Report" (`DropdownMenu`) wired to `reportChatMessage`, `sonner` toast mapping for every `SendChatError` code. No numeric badge anywhere in this component (only the caller-side quiet dot, see below). |

## Files edited

| File | Change |
|---|---|
| `src/routes/pvp.live.$matchId.tsx` | `PvpResultScreen` gets an optional `onChat?: () => void` prop, rendering a "Chat" `Button` beside "Back to Profile" in both the victory and defeat/tie/forfeit branches. Route wires it to `navigate({to: "/pvp/chat/$matchId", params: {matchId}})`. Also added a lightweight `subscribeToMatchChat` subscription (independent of the chat route's own backfill) that flips a local `hasUnseenChat` boolean whenever the OPPONENT sends a message; passed to `LivePvpBattleScreen` as `hasUnseenChat` + `onOpenChat` (which also clears the flag before navigating). Resets naturally on remount when the player returns from `/pvp/chat/$matchId` back to `/pvp/live/$matchId` (different route id ⇒ TanStack Router unmounts/remounts, no manual reset plumbing needed). |
| `src/components/live-pvp-battle-screen.tsx` | Added optional `onOpenChat?: () => void` and `hasUnseenChat?: boolean` props. Restructured the top badge row's right side into a `flex gap-2` group (was a single conditional chip) so a chat icon button (`MessageCircle`, `lucide-react`) sits next to the existing signature-payload chip without disrupting its layout. The icon renders only when `onOpenChat` is provided; the unseen indicator is a plain 2×2 dot (`bg-destructive`), never a numeric badge, per spec. |

## States handled

- **Route (`pvp.chat.$matchId.tsx`):** `loading` (spinner) → `not_found` (match/session missing, "Back to Profile") → `ready` (renders `MatchChatScreen`).
- **Screen composer:** enabled/typing, disabled with an inline reason banner (kill switch / ban / name-claim / window-closed — `ChatState` is UX-only, the send RPC re-verifies all four regardless), sending (button disabled mid-flight), and the empty message list state ("No messages yet — say gg or ask for a rematch!").
- **Send errors:** every `SendChatError` variant (`no_session`, `chat_disabled`, `not_found`, `forbidden`, `chat_closed`, `banned`, `name_required`, `empty`, `too_long`, `rate_limited`, `duplicate`, `blocked`, `network`) maps to a distinct `sonner` toast.
- **Report:** success (fresh vs. already-reported wording from the RPC's `duplicate` flag), failure toast; the reported set is tracked client-side per screen-mount to greys out/disable re-tapping the same message (server is idempotent regardless via the `(message_id, reporter_id)` unique constraint).

## Deviations from the architecture doc

None required. Everything the doc assumed matched the actual code:
- `types.ts` already had `pvp_chat_messages`, `send_pvp_chat_message`, `report_pvp_chat_message`, `get_pvp_chat_state` fully typed (confirmed by reading the file directly) — so `pvp-chat.ts` uses the **typed** `supabase.rpc()`/`.from()` path throughout, not the loose `as unknown as {...}` cast `pvp-live.ts`/`social.ts` use for their pre-regen RPCs. This is a strict improvement, not a deviation from behavior.
- `getLivePvpMatch` existed exactly as the doc assumed (`src/lib/pvp-live.ts`), reused as-is for the opponent id/status lookup.
- `PvpResultScreen`'s `onBack` destination (`/profile`) and `LivePvpBattleScreen`'s top badge row (`~line 2020`, `QUESTION n/N` + signature chip) were both exactly where the doc said.
- The new route resolved to `/pvp/chat/$matchId` (file `pvp.chat.$matchId.tsx`), confirmed by regenerating `src/routeTree.gen.ts` via `npx vite build` and checking the emitted route id — matches the doc's assumed path exactly, so `navigate({to: "/pvp/chat/$matchId", params: {matchId}})` typechecks.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint .` — 38 warnings, 0 errors (unchanged from the pre-change baseline; no new warnings introduced).
- `npx vitest run` — 588/588 passing (unchanged; this PR added no new tests per the architecture doc's DoD, which defers full behavioral verification to a live two-account check on the Vercel preview).
- Did not touch anything under `supabase/`, run migrations, or deploy edge functions — client-only, as scoped.

---

## Handoff

- **Status:** done — ready for the live two-account Vercel-preview verification called out in `01-spec.md`'s Definition of Done (the one check this PR cannot self-verify: RLS/rate-limit/kill-switch bypass resistance and cross-client realtime delivery timing).
- **Produced:** `src/lib/pvp-chat-types.ts`, `src/lib/pvp-chat.ts`, `src/routes/pvp.chat.$matchId.tsx`, `src/components/match-chat-screen.tsx`; edits to `src/routes/pvp.live.$matchId.tsx` and `src/components/live-pvp-battle-screen.tsx`.
- **Next agent:** Integration / owner — manual two-account check on the Vercel preview (Story 1–4 acceptance criteria in `01-spec.md`), then this can ship as part of M1.
- **Context the next agent needs:** the composer's disabled reasons and every toast string live in `src/components/match-chat-screen.tsx` (`sendErrorMessage`/`disabledReason`) if wording needs a pass; the unseen-chat dot's state lives in `src/routes/pvp.live.$matchId.tsx` (`hasUnseenChat`), not in the chat route itself.
- **Open items:** none blocking from the frontend side. UI/UX visual polish (spacing/animation/typography refinement) is still open per the architecture doc's own owner split ("UI/UX Engineer: own the visual layer of `match-chat-screen.tsx`") — the component built here is functionally complete and follows the app's existing pixel-UI vocabulary but has not had a dedicated UI/UX pass.
