# COMMON_RULES — shared contract for every agent

Every agent reads this once and obeys it. It exists so agents don't re-explain
standards to each other and so context stays small. Stack: React + TanStack Start,
TypeScript, Tailwind v4 + shadcn/ui, Zustand, Supabase, Vite/Vitest, Vercel.

---

## 1. The handoff artifact (token backbone)

Agents do **not** brief each other by re-reading the whole repo. Each agent
leaves a small, structured file that the next agent reads instead of the source.

- Location: `docs/handoffs/<feature-slug>/`
- Files by stage: `01-spec.md`, `02-architecture.md`, `03-*-report.md`, etc.
- Every handoff ends with a **Handoff block**:

```md
## Handoff
- Status: done | blocked | needs-review
- Produced: <files/paths this agent created or changed>
- Next agent: <agent-name>
- Context the next agent needs: <3–7 bullet points, paths + decisions only>
- Open questions / risks: <bullets or "none">
```

Rule: **a downstream agent reads the upstream Handoff block first, and only
opens source files the block points it to.** No speculative repo-wide reads.

---

## 2. Coding standards

- **Language:** TypeScript everywhere; `strict` on. No `any` without a `// reason:` note.
- **React:** function components + hooks only; one component per file. TanStack Start —
  use route `loader`s for initial data and `src/routes/api.*.ts` server routes for
  mutations; no Next.js RSC / `"use client"` directives (this isn't Next).
- **Async:** always handle rejection; no unhandled promises; no floating awaits.
- **Errors:** never swallow; surface user-safe messages (sonner toasts), log internal detail.
- **Imports:** use the repo's path alias; group std → external → internal.
- **Formatting/lint:** Prettier + ESLint are authoritative (`eslint.config.js`); never hand-fight them.
- **Comments:** explain *why*, not *what*; match surrounding density.
- **No dead code, no commented-out blocks, no `console.log` in committed code.**

## 3. Naming conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Files (components) | PascalCase | `SavedSearchRow.tsx` |
| Files (hooks/utils) | camelCase | `useSavedSearches.ts` |
| File routes | TanStack dotted | `src/routes/api.saved-searches.ts` |
| Variables/functions | camelCase | `getUserById` |
| Types/interfaces/components | PascalCase | `type SavedSearch` |
| Constants | UPPER_SNAKE | `PVP_BASE_TIMER_MS` |
| DB tables/columns | snake_case | `saved_searches`, `created_at` |
| SQL migrations | `YYYYMMDDHHMMSS_verb_noun.sql` | `20260709160000_protect_training_bot.sql` |
| Branches | `type/feature-slug` | `feat/saved-searches` |
| Env vars | `VITE_*` (client) / server-only | `VITE_SUPABASE_URL` |

## 4. Git workflow

- One feature = one branch = one PR. Never commit to `main` directly.
- Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `perf:`, `refactor:`.
- Small, reviewable PRs; each PR links its spec (`docs/handoffs/<slug>/`) and issue.
- Never `--no-verify`, never force-push shared branches, never skip hooks.
- Migrations are additive/reversible; never edit a migration that has shipped.
- CI must be green before Code Reviewer approves; DevOps owns the merge to `main`.
- Repo standing rule: after verified work, apply the Supabase migration and merge the
  PR to `main`, then confirm the Vercel production deploy picked up the commit.

## 5. Security & data baseline (all agents)

- Validate every server input (zod) — client validation is UX only.
- Every Supabase table has RLS enabled; deny by default. SECURITY DEFINER RPCs are least-privilege.
- Secrets only in env/secret stores; the Supabase service-role key is server-only, never in the client bundle or logs.
- Parameterized queries / the Supabase client only; never string-concatenate SQL.
- Sanitize any user content rendered as HTML.

## 6. Boundaries (single responsibility)

Each agent's file lists **What it owns** and **What it must never modify**.
If a task falls outside your ownership, **stop and escalate** (write a Handoff
with `Status: blocked`, `Next agent: <owner>`) instead of reaching across.

## 7. Token discipline (all agents)

- Read the Handoff block, not the repo. Open a file only when a task needs it.
- Prefer `grep`/symbol search over full-file reads; read the section, not the file.
- Never paste large files back into your output; reference `path:line`.
- Keep responses to decisions + diffs + the Handoff block. No recaps.
- Start a fresh session per major stage; don't carry one long context across the pipeline.

## 8. Definition of Done (global — each agent adds specifics)

Requirements met · matches existing architecture · no new duplication · lint +
typecheck (`tsc`) + Vitest pass · security & a11y considered · Handoff block written ·
docs updated when behavior changed.

> Env note (this machine): behind the SRG proxy, prefix npm/tsc/vitest with
> `$env:NODE_OPTIONS="--use-system-ca"`; portable git/gh under `~/.local` must be on PATH.
