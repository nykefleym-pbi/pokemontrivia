# Architecture

## Project structure

- `src/routes/` — file-based TanStack Start routes. Page entries (`index.tsx`, `battle.tsx`, `profile.tsx`, `shop.tsx`, `pokedex.tsx`, `whos-that-pokemon.tsx`) and API server routes under `src/routes/api.*.ts`.
- `src/lib/` — pure logic and data: `game-data.ts` (XP curves, streak math, item defs, TP economy), `store.ts` (Zustand global state), `pokemon-data.ts`, `social.ts`, `trivia-core.ts`, `elite-four.ts`, `gym-leaders.ts`, `achievements.ts`, `abilities.ts`, and the `mega/` subfolder (`schedule.ts`, `questions.ts`, `runs.ts`).
- `src/components/` — React UI. Battle (`battle-screen.tsx`), Mega Raid (`mega/*`), shared dialogs (`share-card-dialog.tsx`, `NameReclaimPrompt.tsx`, `FriendRequestInbox.tsx`), and the `ui/` shadcn primitives.
- `src/integrations/supabase/` — generated client + auth middleware (do not edit).
- Tests live next to source as `*.test.ts` and run under Vitest in a node environment.

## Refactor plan

- **Phase 0 — safety scaffold (this PR).** Add Vitest, regression tests for pure helpers, surface unused-var lint warnings, document architecture. No runtime changes.
- **Phase 1 — rewards module.** Extract XP/Coin/TP math from `battle-screen.tsx` and `MegaLeaderboard.tsx` into `src/lib/rewards/` with unit tests.
- **Phase 2 — centralized API client.** Consolidate Supabase RPC/server-fn call sites behind `src/lib/api/` with typed wrappers and a single retry policy.
- **Phase 3 — design tokens & shared UI.** Replace inline hex/Tailwind arbitrary values with theme tokens defined in `src/styles.css`; lift repeated patterns into shared components.
- **Phase 4 — store slices.** Split `src/lib/store.ts` into themed slices (profile, battle, shop, mega, engagement) composed into one Zustand store.
- **Phase 5 — screen splits.** Break large screen files (`battle-screen.tsx`, `MegaRaidScreen.tsx`, `profile.tsx`) into per-phase subcomponents.

## Conventions

- **Rewards.** Reward formulas live in `src/lib/rewards/` (`battleReward` for regular/weekly/elite battles, `dailyReward` for the Daily Quest, `WHOS_THAT_XP` for Who's That Pokémon). Mega Raid rewards live in `src/lib/mega/schedule.ts` (`MEGA_REWARD` + `megaRankScale`). Components call these helpers — never inline the arithmetic.
- **API calls.** Supabase and server-function calls will route through `src/lib/api/`. Components should not import `supabase` directly once Phase 2 lands.
- **Styling.** Use Tailwind theme tokens defined in `src/styles.css` (`bg-card`, `text-primary`, etc.). Do not hardcode hex values or `text-white`/`bg-black` in components — they bypass theming and break dark mode.
- **Tests.** Pure functions in `src/lib/` should have `*.test.ts` regression coverage. UI tests are out of scope for now.
- **No behavior change in refactors.** Each refactor phase keeps observable behavior identical; tests guard the invariants.
