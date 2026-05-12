# Pass 3 — Visual & UX Redesign

This is a large refactor with no business-logic changes. Localstorage shape, AI endpoints, store actions, and game math stay untouched. To keep edits reviewable and avoid regressions, ship in 4 atomic phases.

---

## Phase A — Foundation (nav, routing, tokens, motion)

Sets up shared primitives every later phase depends on. No visible change to existing screens yet.

1. **`src/components/bottom-nav.tsx`** (new) — 4 tabs (Battle, Shop, Profile, Dex), fixed `bottom-0`, `max-w-[480px]` centered, `h-16`, safe-area padding. Active = pixel label in primary, 2px top accent, icon `scale-110`. Inactive = muted. `active:scale-95` on press.
2. **`src/routes/__root.tsx`** — replace existing `BottomNav` with new component. Render only when `hasOnboarded` AND path matches `/battle|/shop|/profile|/pokedex`. Hide on `/` and during in-battle phases (read `useGameStore` phase from store; or hide via a CSS class set by battle screen).
3. **`src/routes/pokedex.tsx`** (new route) — extract `PokedexSection` from `profile.tsx` into this route. Profile keeps everything else.
4. **`src/styles.css`** — add `.dark` token overrides; add `.bg-poke-challenge` (yellow→red) gradient; add `.bg-elite-victory` gradient; document typography scale in comments only (no class changes here).
5. **`src/lib/use-reduced-motion.ts`** (new) — re-export framer-motion's `useReducedMotion` plus a helper `motionSafe(variants, fallback)` for use across components.
6. **`src/lib/theme.ts`** (new) — `getTheme()`, `setTheme('light'|'dark'|'system')`, applies `.dark` class to `<html>`, persists to localStorage key `pokemon-theme`. Initialize in `__root.tsx` mount.

## Phase B — Battle screens (home + active battle + result)

The biggest visual lift; isolate to `battle.tsx` + `battle-screen.tsx` + a few new sub-components.

7. **Battle home (`src/routes/battle.tsx`)**
   - Hero strip: trainer (left, 56pt) + XP/rank center + partner Pokémon (right, 80pt). Tappable avatars open existing pickers.
   - Segmented action card: pill switcher Battle | Daily (✓ when done). Drop the "type advantage" tip card.
   - Drop the 3-stat row (Battles/Wins/Streak) — shown in profile only.
   - Elite-pending = full-screen takeover (`bg-elite-arena`, large sprite, quote, "Challenge {Name}", "More info" sheet). Skip everything else when active.
8. **Battle screen (`src/components/battle-screen.tsx`)**
   - Battlefield zone: `h-[42vh]` with absolutely-positioned sprites + overlaid translucent HP boxes (enemy top-left, player bottom-right). Type badges inline in HP boxes.
   - Remove dialog band entirely. Add 1-line `BattleLog` strip (`max-h-8`, fades) for system messages only (super-effective, elite intro).
   - Question card: `rounded-t-3xl`, fills remaining ~55% of screen, taller option buttons (`py-4`).
   - Replace "Set 1 · Q3/5" textual progress with 20 dots (filled/hollow/empty/pulsing).
   - Category pill colors via `CATEGORY_COLORS` map.
   - Super-effective telegraph: 1.5s overlay before first question if `isSuperEffective(player, enemy)`.
9. **Result screen** (within `battle-screen.tsx`)
   - Chained reveal sequence (0/300/800/1200/1500/1800/2200/2400ms) using `motion` + `animate` for XP count-up.
   - "View battle stats" link → drawer with accuracy / fastest / slowest / SE bonuses / damage totals (data already tracked in store).
   - Elite victory variant: gold gradient, "ELITE 4 DEFEATED!", trainer-vs-elite layout, 5 rewards stagger-in.

## Phase C — Profile, Pokédex, Shop, Daily, Splash

10. **Profile (`src/routes/profile.tsx`)** — slim hero card + separate partner card + 4 tabs (Stats/Trophies/Battles/Settings). Stats tab adds 7-day activity heatmap (derive from existing `recent` battle log timestamps). Trophies adds top progress bar. Battles adds sprite icons. Settings holds sound toggle, theme toggle, reset progress.
11. **Pokédex route (`src/routes/pokedex.tsx`)** — hero stats strip (captured/total, shinies, % bar), sticky filters (search + type chips + captured-only toggle), gen tabs, 5-col grid with silhouettes for uncaptured, detail sheet on tap. Paginate by gen so no virtualization needed yet.
12. **Shop (`src/routes/shop.tsx`)** — currency header, 1-2 daily featured items with rotating ribbon (seed by UTC date), 4 category tabs (HEALING/BATTLE/UTILITY/PREMIUM), 2-col grid per tab, confirm-purchase sheet, "stocked trainer" empty state.
13. **Daily polish** — `battle-screen.tsx` mode="daily" branch: warm gradient bg, flame "DAILY · DAY {N}" header, hide HP/sprites, larger question card. Result share image: client-side canvas → PNG → clipboard.
14. **Splash (`src/routes/index.tsx`)** — 2-line lockup ("POKéMON TRIVIA" / "⚔️ BATTLE ⚔️"). Onboarding adds Step 3 = 3-question tutorial mini-battle (reuses existing battle pipeline with hardcoded questions, awards no XP). "Begin Adventure" → Pokéball-throw transition before navigation.

## Phase D — Cross-cutting polish

15. **Universal `active:scale-95`** — patch button variants in `src/components/ui/button.tsx` and primary CTAs in custom buttons.
16. **Skeleton loaders** — replace "Preparing battle..." spinner with skeleton card layout matching question shape.
17. **Reduced-motion** — apply `useReducedMotion()` to all motion variants in battle-screen, result, splash transitions.
18. **Haptic patterns** — extend `triggerHaptic()` helper in `src/lib/audio.ts` (or new `src/lib/haptics.ts`) with `streak`, `superEffective`, `battleEnd` patterns.
19. **Sound layering** — upgrade existing oscillator SFX in `src/lib/audio.ts` to layer tone + harmonic + decay envelope per cue.
20. **Typography sweep** — replace ad-hoc `text-[8px]` / mixed pixel sizes across all touched files with the documented scale. No new classes; just normalize.

---

## Technical notes

- **No store changes.** All new screens read existing fields. The 7-day heatmap derives from `recent[].timestamp` (already stored). Theme is a separate localStorage key, not in `useGameStore`.
- **Routing:** add `pokedex.tsx` to `src/routes/` — TanStack auto-regenerates `routeTree.gen.ts`. Don't hand-edit it.
- **Bottom-nav hiding during fights:** read `phase` from store inside `BottomNav`; if `phase === 'fighting' | 'daily' | 'elite'` and path is `/battle`, render null. Cleaner than prop-drilling.
- **Elite takeover & full-screen daily** still mount inside the `max-w-[480px]` shell — they're full-card-stack replacements, not html-level fullscreen.
- **Canvas share image** is plain `<canvas>` + `toBlob` + `navigator.clipboard.write`; no new deps.
- **Tutorial mini-battle** uses 3 hardcoded easy MCQs in `src/lib/tutorial.ts`; the existing battle component accepts an injected question deck via a new optional prop, no AI call.

## Out of scope (explicit)

- The "new question kinds" (silhouette/cry/lore/media) from the previous Pass 3 plan — superseded by this redesign request.
- Server-side leaderboards, server-side OG image generation.
- Localization, accessibility audit beyond reduced-motion.
- Migrating SFX to MP3 samples (kept on oscillator-layer route).

## Acceptance check before handoff

- Build passes, types clean.
- Manual: nav appears on the 4 listed routes, hidden during fights and onboarding.
- Manual: battle home shows ONE action card; elite-pending fully replaces it.
- Manual: battle screen has overlaid HP boxes and no dialog band.
- Manual: profile fits in ~1 viewport at 480×900.
- Manual: dark mode toggles via Settings and respects `prefers-color-scheme` on first load.
- Manual: localStorage payload unchanged (diff before/after).
