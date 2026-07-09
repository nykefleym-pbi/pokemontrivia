# ORCHESTRATION — how the team works together

Covers: the pipeline & handoffs, parallel execution, context hygiene, and
integration with GitHub / Supabase / Vercel. Stack: React + TanStack Start, Supabase
(`dvdorceiasaipdvyfhil`), Vercel, Vitest.

---

## 1. The pipeline

```
Feature Request
   │
   ▼
Product Owner ──────────► 01-spec.md (stories, acceptance criteria, DoD)
   │
   ▼
Solution Architect ─────► 02-architecture.md (plan, contracts, file map, task split)
   │
   ▼
┌───────────────── PARALLEL BUILD (independent branches) ─────────────────┐
│  Database Engineer   Backend Engineer   Frontend Engineer   UI/UX Engineer │
│  03-db.md            03-backend.md       03-frontend.md      03-ui.md       │
└──────────────────────────────┬──────────────────────────────────────────┘
   ▼
Integration Engineer ───► 04-integration.md (wire modules, resolve conflicts, verify contracts)
   │
   ▼
Security Engineer ──────► 05-security-report.md   (review only)
   │
   ▼
Performance Engineer ───► 06-performance-report.md (review only)
   │
   ▼
QA Engineer ────────────► 07-tests + qa-checklist.md
   │
   ▼
Code Reviewer ──────────► 08-review.md  (approve / request changes)
   │
   ▼
DevOps Engineer ────────► CI green, merge to main, deploy, preview URL
   │
   ▼
Documentation Engineer ─► README / CLAUDE.md / API / DB docs / CHANGELOG updated
```

Each arrow is a **Handoff block** (see COMMON_RULES §1). A downstream agent reads
the upstream handoff, not the whole repo.

### Handoff contract summary

| From | To | Passes forward |
|------|----|----------------|
| Product Owner | Architect | Scope, stories, acceptance criteria, DoD |
| Architect | 4 builders | API contracts, data model, file map, per-agent task list |
| Builders | Integration | Branch names, exported symbols, env vars, contract deltas |
| Integration | Security | Merged branch, integration points touched |
| Security | Performance | Confirmed-safe surface + any fixes applied |
| Performance | QA | Hot paths, perf budgets to assert |
| QA | Code Reviewer | Test coverage map, known gaps |
| Code Reviewer | DevOps | Approval + merge readiness |
| DevOps | Docs | Deployed version, env/config changes |

---

## 2. Parallel execution (token & wall-clock savings)

The four builders operate on **disjoint file sets** defined by the Architect, so
they never touch the same code and never need each other's context.

- **DB Engineer:** `supabase/migrations/**`, `supabase/**` only.
- **Backend Engineer:** `src/routes/api.*.ts`, `supabase/functions/**`, server-side `src/lib/*-service.ts`.
- **Frontend Engineer:** `src/routes/*.tsx` route logic, `src/components/**`, `src/hooks/**`, Zustand stores.
- **UI/UX Engineer:** styling/markup within components, `src/styles.css`, tokens, `src/components/ui/**`.

Rules that make parallelism safe:
1. The Architect publishes **frozen API contracts + a type stub file**
   (`src/lib/<feature>-types.ts`) first. Builders code against the stub, not each other.
2. Each builder works on its **own branch** off the same base.
3. Reviewers (Security, Performance) also run in parallel with each other once
   Integration is done — both are read-only and independent.
4. Integration Engineer is the **only** serialization point; it merges the four
   branches and owns conflict resolution.

Token effect: each builder loads ~1/4 of the surface + the contract stub, instead
of the whole feature. No builder re-derives another's reasoning.

---

## 3. Context hygiene (keep sessions small, start fresh often)

- **One stage = one session.** Finish Product Owner, close it. Start the Architect
  fresh with only `01-spec.md` in context.
- **Feed handoffs, not history.** A new session's first read is the relevant
  handoff file(s), never the previous transcript.
- **Compact at stage boundaries**, not mid-task.
- **Reviewers get read-only tools** so they can't wander into edits that bloat context.
- **Never fan a single agent across domains** — that's what the 13 roles prevent.
- If a session's context is >50% full and the stage isn't done, write a partial
  Handoff, stop, and resume in a new session from that handoff.

Rule of thumb: if you're about to paste a file you already read, you've kept the
session too long — checkpoint to a handoff and restart.

---

## 4. Tooling integration

### GitHub (Issues & PRs)
- **Product Owner** output maps 1:1 to a GitHub Issue (title = story, body =
  acceptance criteria + DoD, labels = priority/area).
- Each builder branch → **draft PR** early; PR description links the issue and the
  `docs/handoffs/<slug>/` folder.
- **Security / Performance / Code Reviewer** post their reports as PR review
  comments (use the `/security-review` and `/code-review` skills in this repo).
- **DevOps** owns the `main` merge; branch protection requires green CI + reviewer approval.
- GitHub Actions run ESLint, `tsc`, Vitest, and `supabase db diff` on every PR.
- gh CLI auth doesn't persist across sessions here — re-auth (or use the GitHub MCP once connected).

### Supabase (migrations, RLS, RPCs, Edge Functions)
- **DB Engineer** is the only author of `supabase/migrations/*.sql`; migrations are
  additive and reversible; RLS enabled on every new table in the same migration.
- Prefer verifying on a Supabase **branch/preview DB** first; apply to prod (project
  `dvdorceiasaipdvyfhil`) via MCP `apply_migration` per the repo standing rule.
- **Backend Engineer** owns `supabase/functions/*` and RPC callers; the service-role
  key is server-only; secrets via `supabase secrets set`, never in code.
- **Security Engineer** explicitly checks: RLS present & correct, SECURITY DEFINER
  RPCs locked down, no service-role key reaching the client bundle.

### Vercel (previews & prod)
- Every PR gets a **Vercel Preview Deployment**; the preview URL is the artifact
  QA and the Product Owner sign off against.
- **DevOps** owns env vars per environment (Preview vs Production) and promotes to
  Production only after merge to `main` (auto-deploy from `main`).
- **Performance Engineer** reads Core Web Vitals / Vite build output from the preview.

### End-to-end for one feature
1. PO writes spec → opens Issue.
2. Architect writes plan + type stub → opens tracking PR.
3. Four builders branch, build against the stub, open draft PRs → each gets a Vercel preview.
4. Integration merges builder branches, applies migration to a preview DB, verifies contracts.
5. Security + Performance review the integrated preview (parallel) → reports on PR.
6. QA writes/runs Vitest + Playwright against the preview.
7. Code Reviewer approves.
8. DevOps merges to `main` → Production deploy + prod migration (`apply_migration`).
9. Docs Engineer updates README/CLAUDE.md/CHANGELOG/API/DB docs.

---

## 5. Adding or scaling agents

- New domain? Add one file in `.claude/agents/` with the 15-section template;
  give it a disjoint file-ownership set so parallelism holds.
- Large feature? Shard builders by area (e.g. two Frontend Engineers on
  non-overlapping route groups) — the disjoint-file rule still guarantees safety.
- Keep the pipeline shape; only widen the parallel band.
