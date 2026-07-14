# Pokémon Trivia Battle

A vibrant, mobile-first **Pokémon trivia battler** built as an installable PWA. Answer Pokémon questions to battle trainers, earn XP and coins, climb leagues, fill your Pokédex, hatch Legendary/Mythical eggs, and challenge friends in real-time PvP — all wrapped in a retro, GO-inspired UI.

> Trivia questions drive a full RPG combat loop: type effectiveness, abilities, items, status conditions, streaks, evolutions, and stat stages all key off how fast and accurately you answer.

---

## Table of contents

- [What it is](#what-it-is)
- [Features](#features)
- [Game modes](#game-modes)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Backend (Supabase)](#backend-supabase)
- [Documentation](#documentation)
- [Contributing & conventions](#contributing--conventions)

---

## What it is

Pokémon Trivia Battle is a single-page PWA where **trivia is the combat system**. Each battle is a set of multiple-choice Pokémon questions; answering correctly (and quickly) deals damage, builds streaks, and triggers abilities, while wrong answers let the opponent hit back. Progression (levels, ranks, coins, Training Points, Pokédex, badges, trophies) and a shop/item economy sit on top, and a real-time PvP layer lets players battle friends or a bot.

The app is client-heavy: game logic and state live in the browser (Zustand + local persistence), with **Supabase** providing auth, the trivia question bank, social/PvP features, push notifications, and other backend services.

## Features

- **Trivia-driven RPG combat** — type effectiveness, per-type **abilities**, an **item** economy, **status conditions**, answer-speed bonuses, and streak multipliers.
- **Multiple single-player modes** — Regular battles, Daily Quest, Weekly Gym League, Elite Four, Mega Raids, and Who's That Pokémon.
- **Real-time PvP** — async friend battles plus **Nearby Battle**, a live HP-endurance duel started by scanning a friend's QR/battle code, and **Training vs Bot** for solo practice against a computer opponent.
- **Legendary/Mythical system** — a 104-Pokémon roster with data-driven **signature abilities**, egg-only exclusivity, and type-colored partner frames.
- **PvP depth** — Attack/Defense/Speed/Crit stat stages, a shared status-condition system with on-sprite animations, 14 PvP-exclusive **berries**, working in-battle items (potions, Scope Lens, X Accuracy), and per-type abilities that fire in Nearby Battle — with Legendary/Mythical partners running **both** their signature and their type ability.
- **Progression & collection** — XP/level/rank curves, level-up rewards, Pokédex capture, partner selection & evolution, Poké-Egg hatching, trophies and gym badges.
- **Social** — friends, friend-code sharing, referral campaign, and an in-app suggestion/bug form that **auto-files GitHub issues**.
- **PWA** — installable, offline-capable service worker, and real **Web Push** notifications (mode reminders, daily promo, friend/PvP events).
- A curated bank of **~4,000 trivia questions** across dex facts, TCG, mainline games, anime, competitive play, and spin-offs.

See [`WORKLIST.md`](./WORKLIST.md) for the full shipped-features log and backlog, and [`docs/GAME_REFERENCE.md`](./docs/GAME_REFERENCE.md) for the complete mechanics/formulas reference.

## Game modes

| Mode | Where | Summary |
| --- | --- | --- |
| Regular battle | Battle tab → Find Match | Level-scaled trainer battles; the core loop. |
| Daily Quest | Battle tab | One 10-question run per day; XP/TP rewards, perfect-run bonus. |
| Weekly Gym League | Battle tab | Rotating gym-leader challenge. |
| Elite Four | Battle tab | High-difficulty region championship gauntlet. |
| Mega Raid | Battle tab | Scheduled co-op-style raid vs a Mega Pokémon; leaderboard + capture. |
| Who's That Pokémon | Battle tab | Silhouette-guessing mini-game on an hourly rotation. |
| Async PvP | Profile → Friends → Challenge | Turn-a-friend-a-question-set battle via an inbox. |
| Nearby Battle | Profile → PvP → Nearby Battle | Live, real-time HP battle by scanning a friend's battle code. |
| Training vs Bot | Profile → PvP → Training | Live battle against a difficulty-tiered bot opponent (Rookie / Trainer / Ace). |

## Tech stack

- **Framework:** [TanStack Start](https://tanstack.com/start) / TanStack Router (file-based routes) on **React 19** + **Vite 7**, TypeScript.
- **State:** [Zustand](https://github.com/pmndrs/zustand) (sliced store) with `persist` to `localStorage`.
- **Styling:** Tailwind CSS v4 with theme tokens in `src/styles.css`; [shadcn/ui](https://ui.shadcn.com) primitives; [Framer Motion](https://www.framer.com/motion/) for animation.
- **Backend:** [Supabase](https://supabase.com) — Postgres (RLS), Auth, Realtime, Edge Functions, `pg_cron`/`pg_net`.
- **PWA / Push:** `vite-plugin-pwa` (injectManifest service worker) + Web Push (VAPID).
- **PvP QR:** `qrcode` (generate) + `jsqr` (scan).
- **Testing:** Vitest (unit tests colocated as `*.test.ts`).

## Getting started

**Prerequisites:** Node.js 20+ and npm. A Supabase project is required for auth, questions, and social/PvP features (the app expects the environment variables below).

```bash
# 1. Install dependencies
npm install

# 2. Configure environment (see below)
cp .env.example .env   # if present; otherwise create .env with the vars listed below

# 3. Start the dev server
npm run dev            # http://localhost:3000

# 4. Before committing
npm run typecheck && npm run lint && npm run test && npm run build
```

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Start the Vite dev server. |
| `npm run build` | Production build + copy the service worker (`scripts/copy-sw.mjs`). |
| `npm run build:dev` | Development-mode production build. |
| `npm run preview` | Preview the production build. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint over the repo. |
| `npm run format` | Prettier write. |
| `npm run test` | Run the Vitest suite once. |

## Environment variables

**Client (Vite, must be prefixed `VITE_`):**

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key. |
| `VITE_CURATED_SUPABASE_URL` | URL for the curated-questions Supabase (may be the same project). |
| `VITE_CURATED_SUPABASE_PUBLISHABLE_KEY` | Anon key for the curated-questions Supabase. |

**Server / Edge Functions** (set via `supabase secrets set`, never committed): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, the VAPID keys for Web Push (`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`), the push cron secret, and — for the feedback→issues pipeline — `GITHUB_TOKEN` and `FEEDBACK_WEBHOOK_SECRET`.

## Project structure

```
src/
  routes/        file-based routes: index, battle, profile, shop, pokedex,
                 whos-that-pokemon, pvp.*, refer, and api.*.ts server routes
  components/    React UI — battle-screen, live-pvp-battle-screen, mega/*,
                 profile-parts, game-ui, and ui/ (shadcn primitives)
  lib/           pure logic & data:
                   game-data.ts        XP curves, items, berries, statuses, TP
                   rewards/            battle/daily/level reward formulas
                   pvp-combat.ts       PvP damage/stat-stage/crit math
                   signature-abilities.ts / signature-bespoke.ts  (104 abilities)
                   abilities.ts        per-type abilities
                   pokemon-data.ts     Pokédex dataset + type chart
                   legendary-data.ts   Legendary/Mythical roster
                   store.ts + store/slices/   Zustand global state
                   pvp-live.ts, pvp-bot.ts, pvp-weather.ts, social.ts, ...
  integrations/  supabase/ generated client + auth middleware (do not edit)
supabase/
  migrations/    SQL migrations (schema, RLS, RPCs)
  functions/     Edge Functions: send-push, daily-reminders, feedback-to-issue
scripts/         build helpers (copy-sw.mjs, generators)
```

More detail in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

## Backend (Supabase)

- **Postgres + RLS** for all data. Key domains: profiles/friends/friend requests, curated trivia questions, mega runs, referrals, push subscriptions, feedback, and the PvP tables (`pvp_matches` for async, `pvp_live_matches` + `pvp_live_effects` for real-time).
- **Server-authoritative PvP** — live battles resolve through SECURITY DEFINER RPCs (e.g. `submit_pvp_live_answer`, `apply_pvp_signature_effect`, `start_bot_pvp_match` and the bot-move RPCs); damage is clamped and ability/item magnitudes are looked up server-side, never trusted from the client.
- **Edge Functions** — `send-push` (Web Push sender), `daily-reminders` (cron-driven), and `feedback-to-issue` (opens a GitHub issue for each in-app suggestion/bug via a `pg_net` insert trigger).
- **Migrations** live in `supabase/migrations/` and are the source of truth for schema/RPC changes; applied changes are always mirrored there.

## Documentation

- [`docs/GAME_REFERENCE.md`](./docs/GAME_REFERENCE.md) — complete mechanics reference: all formulas (damage/rewards/levels), abilities, signature abilities, items, berries, status conditions, and modes.
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — code structure, conventions, and the refactor plan.
- [`WORKLIST.md`](./WORKLIST.md) — shipped-features log and backlog.
- [`CLAUDE.md`](./CLAUDE.md) — repo-specific agent/orchestration guidance.

## Contributing & conventions

- Reward/damage arithmetic lives in `src/lib/rewards/`, `src/lib/pvp-combat.ts`, and `src/lib/game-data.ts` — call the helpers, never inline the math.
- Style with Tailwind theme tokens from `src/styles.css` (`bg-card`, `text-primary`, …); avoid raw hex / `text-white` so dark mode keeps working.
- Pure functions in `src/lib/` should carry `*.test.ts` coverage.
- Any applied Supabase change must be mirrored as a migration in `supabase/migrations/`.
- Run `typecheck`, `lint`, `test`, and `build` green before opening a PR.
