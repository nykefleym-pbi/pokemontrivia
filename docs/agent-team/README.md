# AI Software Engineering Team

A modular, single-responsibility team of Claude Code sub-agents for this repo's
stack: **GitHub · Supabase · Vercel · TypeScript · React + TanStack Start · Tailwind v4 · Vite · Vitest**.

Each agent owns exactly one domain, receives only the minimum context it needs,
and hands work to the next agent through small written artifacts — so context
stays small, reasoning is never duplicated, and independent agents run in parallel.

The agents live in `.claude/agents/` (repo root) and are auto-discovered by Claude
Code. These guide docs live in `docs/agent-team/`.

---

## The team at a glance

| # | Agent | Model | Access | One-line role |
|---|-------|-------|--------|---------------|
| 1 | Product Owner | sonnet | docs only | Turns requests into specs, stories, DoD |
| 2 | Solution Architect | opus | docs only | Designs the plan before anyone codes |
| 3 | Database Engineer | sonnet | SQL/migrations | Schema, RLS, indexes, migrations |
| 4 | Backend Engineer | sonnet | server code | Business logic, `api.*.ts` routes, RPCs, authz |
| 5 | Frontend Engineer | sonnet | client code | Components, file routes, hooks, Zustand |
| 6 | UI/UX Engineer | sonnet | styles/markup | Layout, shadcn/Tailwind, a11y, motion |
| 7 | Security Engineer | opus | read-only | Security review report |
| 8 | Performance Engineer | sonnet | read-only | Performance review report |
| 9 | Integration Engineer | sonnet | glue code | Wires modules together, resolves conflicts |
| 10 | QA Engineer | sonnet | tests only | Vitest/Playwright + QA checklist |
| 11 | Code Reviewer | opus | read-only | Maintainability/architecture review |
| 12 | DevOps Engineer | sonnet | CI/CD/config | Actions, Vercel, secrets, releases |
| 13 | Documentation Engineer | haiku | docs only | README, CLAUDE.md, API/DB docs, changelog |

## Stack mapping (how the generic roles apply here)

| Generic concept | This repo |
|-----------------|-----------|
| API routes | `src/routes/api.*.ts` (TanStack Start server routes) + Supabase RPCs |
| Pages/routing | `src/routes/*.tsx` file routes + loaders |
| State | Zustand stores (local state first) |
| Styling | Tailwind v4 + shadcn/ui, tokens in `src/styles.css` |
| DB | Supabase `dvdorceiasaipdvyfhil`, migrations in `supabase/migrations/`, RLS + RPCs |
| Tests | Vitest (unit/integration), Playwright (e2e) |
| Build/deploy | Vite build → Vercel (preview per PR, prod from `main`) |
| Env vars | `VITE_*` (client), server-only for service role |

## Use it

Invoke an agent directly in Claude Code:

```
@product-owner draft a spec for a new feature
@solution-architect plan it from 01-spec.md
@database-engineer / @backend-engineer / @frontend-engineer / @ui-ux-engineer  (parallel)
@integration-engineer → @security-engineer → @performance-engineer → @qa-engineer → @code-reviewer → @devops-engineer → @documentation-engineer
```

Agents pass work through `docs/handoffs/<feature-slug>/`. See
[COMMON_RULES.md](COMMON_RULES.md) for the shared contract and
[ORCHESTRATION.md](ORCHESTRATION.md) for the full pipeline, parallel-execution
rules, context hygiene, and GitHub/Supabase/Vercel integration.
