## Goal

Make the app actually read curated questions from the new external Supabase project `dvdorceiasaipdvyfhil` (the curated wiring in code is already correct, but `.env` is currently pointing back at the old Lovable-managed project `omhlpjvimtrzdmeyzreq`).

## Current state

- `supabase/config.toml` → `dvdorceiasaipdvyfhil` ✅
- `.env` (both `SUPABASE_*` and `VITE_SUPABASE_*`) → still `omhlpjvimtrzdmeyzreq` ❌ (the earlier repoint got reverted)
- `src/lib/curated-questions.ts` reads `verified=true` rows from `curated_questions` via the browser supabase client. No code changes needed.
- New project's `curated_questions` table: schema present, **0 rows** (you confirmed "just verify wiring" — no seeding).

## Changes

1. **`.env`** — overwrite all four Supabase entries to point at the new project:
   - `SUPABASE_PROJECT_ID` / `VITE_SUPABASE_PROJECT_ID` → `dvdorceiasaipdvyfhil`
   - `SUPABASE_URL` / `VITE_SUPABASE_URL` → `https://dvdorceiasaipdvyfhil.supabase.co`
   - `SUPABASE_PUBLISHABLE_KEY` / `VITE_SUPABASE_PUBLISHABLE_KEY` → `sb_publishable_4xsV56UPyHng1xGrKAM8mQ_meXNg3sH`

2. **No code changes.** `curated-questions.ts`, `api.trivia-batch.ts`, `api.trivia-elite.ts`, and `src/integrations/supabase/client.ts` already read from env; they will automatically hit the new project once `.env` is updated.

3. **No migration, no seeding** — table is intentionally left empty per your choice. Until rows with `verified=true` exist, the curated fetch returns `[]` and trivia batches fall back to 100% AI (existing behavior).

## Verification

After the edit:
- `rg "omhlpjvimtrzdmeyzreq" .env src/` returns nothing.
- `bun run build` succeeds.
- A quick browser-side fetch from the running preview to `curated_questions` against the new URL returns `0` rows with no permission error (confirms the "Public can read verified curated questions" policy + GRANT are reachable on the new project).

## Caveat

The previous repoint was reverted between sessions, which suggests something (Lovable Cloud sync, or a prior turn) may rewrite `.env` back to the managed project. If `.env` flips back after this edit, that's an environment-level issue — the fix is the same edit, but you may need to keep the new project's keys out of any auto-sync.

## Non-goals

- No seeding curated_questions (you chose "just verify wiring").
- No schema changes.
- No changes to game logic, AI fallback, or UI.
