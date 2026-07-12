# Session Hand-off — Pokémon Trivia Battle

_Last updated: 2026-07-10_

## ⚠️ START-OF-SESSION REQUIREMENT — connect MCP servers first

The next task needs live MCP access that a running session **cannot** hot-attach —
MCP connections bind at session startup. So before doing anything else:

1. Ensure these connectors are connected/authorized (claude.ai connector settings,
   or `claude mcp` / `/mcp` for the hosted servers):
   - **Supabase** — read/query the `feedback` table, run migrations, inspect data.
   - **Vercel** — check deployments / prod alias after pushing to `main`.
   - **GitHub** — repo/PR/issue access (also currently needs authorization).
2. **Start a FRESH Claude Code session** after connecting — a session already
   running will never see a newly-connected server.
3. Verify in the new session by asking Claude to list connected MCP servers
   before starting work.

> In the session that produced this hand-off, only `powerbi-modeling` was
> connected; Supabase/Vercel/GitHub were all absent, which blocked the task below.

## 🎯 Pending task — resolve Feedback table items

**Goal:** Inspect the Supabase `feedback` table and resolve each issue / suggestion.

- Table: `public.feedback` — columns: `id, user_id, trainer_name, category
  ('suggestion'|'bug'), message, contact, app_version, created_at`.
- RLS is **insert-only, no select policy** — it can ONLY be read via the Supabase
  dashboard or an MCP/service-role connection. The anon key in `.env` returns 0
  rows (RLS filters everything). This is why the connector is required.
- Migration: `supabase/migrations/20260703000001_feedback_table.sql`.
- There is a `feedback-to-issue` edge function + trigger
  (`supabase/migrations/20260707111000_feedback_to_issue_trigger.sql`,
  `supabase/functions/feedback-to-issue/index.ts`) — feedback may already fan out
  to GitHub issues, so cross-check GitHub too.
- Fallback if MCP still unavailable: Paul pastes the rows from the Supabase
  dashboard and Claude triages/fixes against the code with no connector needed.

## ✅ Recently completed (already deployed to prod)

Nearby Battle / Training combat-FX toast + UX polish, two rounds:
- Round 1 (`11ddb3a`): staggered one-by-one toasts, <10-word wording, gated
  ability announcements to after the 3-2-1 countdown.
- Round 2 (`6e4e875`): grouped ability toasts (title + effect in one), ≥1.2s
  spacing, info **ⓘ** popover on each combat panel's ability chip, answer
  haptics, Regular-battle-consistent confusion wording, removed the status icons
  under the HP bar, dropped start-of-battle "in play" announcements.
- Open decision flagged to Paul: per-stat-change toasts ("Your Attack rose!")
  were removed for consistency with Regular battle — restore on request.

Key files: `src/hooks/useBattleFxCues.ts`,
`src/lib/training-battle-fx-types.ts`,
`src/components/live-pvp-battle-screen.tsx`.

## Workflow reminders

- **Commit straight to `main` and push** — `main` auto-deploys to Vercel prod
  (~40s). No PRs / gated merges.
- Verify before pushing: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`.
- Commit messages with quotes/newlines: write to a scratchpad file and use
  `git commit -F <file>` (inline `-m` breaks under PowerShell/git arg parsing).
- Don't pipe git stderr through `2>&1` in PowerShell — it wraps success output
  as a NativeCommandError even on exit 0.

## References

- Supabase project: `dvdorceiasaipdvyfhil` (https://dvdorceiasaipdvyfhil.supabase.co)
- Local repo: `C:\Users\PaulCan\pokemontrivia-git`
- Prod: https://pokemontriviabattle.vercel.app
