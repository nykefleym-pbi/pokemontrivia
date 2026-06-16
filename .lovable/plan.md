## Goal
Source curated trivia from the external Supabase project `dvdorceiasaipdvyfhil` while keeping Lovable Cloud (`omhlpjvimtrzdmeyzreq`) as the linked backend for auth, profiles, and server functions.

## Why the previous attempt reverted
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env` are auto-managed by Lovable Cloud and re-pinned to the linked project on every sync. We must not touch them. Instead, add **separate** vars for the curated read-only source.

## Changes

### 1. Add new public env vars (won't collide with managed ones)
In `.env`, append:
```
VITE_CURATED_SUPABASE_URL="https://dvdorceiasaipdvyfhil.supabase.co"
VITE_CURATED_SUPABASE_PUBLISHABLE_KEY="sb_publishable_4xsV56UPyHng1xGrKAM8mQ_meXNg3sH"
```
Leave all `VITE_SUPABASE_*` / `SUPABASE_*` vars pointing at `omhlpjvimtrzdmeyzreq` untouched.

### 2. Create a dedicated curated client
New file `src/lib/curated-client.ts`:
- `createClient(import.meta.env.VITE_CURATED_SUPABASE_URL, import.meta.env.VITE_CURATED_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'curated-ro' } })`
- Separate `storageKey` so it never conflicts with the main client's session storage.
- Read-only usage (table has only a public SELECT policy on `verified = true`).

### 3. Rewire `src/lib/curated-questions.ts`
- Replace the existing `import { supabase } from '@/integrations/supabase/client'` with `import { curatedSupabase } from './curated-client'`.
- All `.from('curated_questions').select(...)` reads use `curatedSupabase`.
- The `increment_curated_served` / `increment_curated_correct` RPCs: those functions exist on `dvdorceiasaipdvyfhil` too, so call them via `curatedSupabase.rpc(...)`. If the external project rejects anonymous RPC writes, wrap the calls in try/catch so a failure doesn't break gameplay (stats are best-effort).

### 4. Leave everything else alone
- `src/integrations/supabase/client.ts` (managed) — untouched.
- Server functions, auth, profiles — keep using the linked Lovable Cloud project.
- Server routes (`api.trivia-batch.ts`, etc.) that mix curated reads with AI: if any read curated server-side, they should also import the new curated client (browser-safe `createClient` is fine in server fns too — no service role needed for verified reads).

## Verification
1. Restart dev server, hard-refresh preview.
2. In browser devtools Network tab, start a Regular Battle → confirm a request to `dvdorceiasaipdvyfhil.supabase.co/rest/v1/curated_questions?verified=eq.true` returns 200 with rows.
3. Confirm no request to `dvdorceiasaipdvyfhil` for auth/profiles (those stay on the linked project).
4. Confirm `.env` `VITE_SUPABASE_URL` still equals `omhlpjvimtrzdmeyzreq` after the next platform sync.

## Out of scope
- Migrating auth/profiles to `dvdorceiasaipdvyfhil` (would require unlinking the Lovable Cloud backend — not doable via code).
- Writes to `curated_questions` (table is locked to public SELECT only).
