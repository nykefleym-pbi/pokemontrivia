# Design-reference audit & fixes

Compared every implemented screen against the 8 reference mocks (image, image-2 … image-8). The Pokédex / Shop / Profile screens are NOT in the reference set — they stay as redesigned. Below is what's drifting and what to change.

## Audit summary

| Screen | Ref | Code | Status |
|---|---|---|---|
| Error | image | `src/router.tsx → DefaultErrorComponent` | drift: chrome doesn't match cream/pill style |
| 404 | (none) | `__root.tsx → NotFoundComponent` | OK (no ref, keep) |
| Splash | image-2 | `index.tsx` splash step | mostly aligned, pokeball decoration too loud |
| Onboard 1 — name | image-3 | `index.tsx` name substep | aligned |
| Onboard 2 — avatar | image-4 | `index.tsx` trainer substep | aligned (blurb could be italic) |
| Onboard 3 — partner | image-5 | `index.tsx` pokemon substep | aligned |
| Battle Home | image-6 | `battle.tsx → BattleHome` | **major drift** — layout differs |
| Battle gameplay | image-7 | `battle-screen.tsx → BattleMode` | drift — timer + answers + HP panel |
| Elite/Boss | image-8 | `battle.tsx → ElitePendingTakeover` | aligned |
| Bottom nav | image-6 (inset) | `bottom-nav.tsx` | drift — ref uses text-only labels |
| Pokédex / Shop / Profile | (no ref) | already redesigned | leave as-is |

## Fixes

### 1. Battle Home (`src/routes/battle.tsx → BattleHome`) — restructure to single-page layout

Reference puts all three modes on one screen, no segmented tabs. Remove the `tab` state and `bg-poke-dark/10` segmented control. New stacking:

```text
[ Hero strip on yellow bg ]
   ring + name + LV badge | XP bar | partner sprite floats right
[ 3 stat tiles: STREAK · XP · TP×mult ]
[ Big white card: Pokéball glyph + "Up for a battle?" + Find Match red pill ]
[ 2-col row:
   Yellow "DAILY QUEST · Beat Rotom · 10 fast questions" + Rotom sprite |
   Blue "WEEKLY LEAGUE · Gym: <name>" + signature sprite ]
[ Optional: Weekly result card under, only when finished ]
```

Specifics:
- Drop the outer `rounded-3xl bg-card` wrapper around the hero. Render trainer ring + name + XP bar directly on the `bg-poke-hero` strip; partner sprite floats absolutely to the right (`h-20 w-20`, slight rotate).
- Stat tiles keep `rounded-2xl bg-card shadow-card`. TP tile keeps blue/primary accent on the number.
- Battle card: pokéball icon left, "Up for a battle?" + sub right, full-width red `Find Match` pill below.
- Daily and Weekly cards become a `grid grid-cols-2 gap-3` row of compact tiles (smaller font, sprite tucked bottom-right). Tap = start that mode directly (no "Start Daily" / "Enter League" inner pill — the whole card is the affordance).
- ElitePendingTakeover remains intact.

### 2. Bottom nav (`src/components/bottom-nav.tsx`)

Reference shows text-only side labels ("Shop", "Dex", "Profile") without icons. Two changes:
- Drop `lucide` icons from `NavCell`; render the label centered with `text-sm font-bold`, dot indicator below when active.
- Reorder to match ref left→right: `Shop · Dex · [Battle] · Profile · (balance)` — keep elevated center Pokéball.
- Keep current floating pill + `shadow-float` + safe-area logic.

### 3. Battle gameplay (`src/components/battle-screen.tsx`)

Three targeted refinements (logic untouched):

a. **CombatPanel** — simplify the dense pixel chrome:
   - Drop the inner ability/status row from the visible panel header (keep statuses but render as small chip below sprite, not panel). Reference panel only carries: trainer name (small caps), Pokémon name (bold), type pill, HP bar + single HP number (no `/maxHp`).
   - Replace `font-pixel text-[7-8px]` with `font-pixel-xs` and regular `text-xs`. Use `rounded-2xl bg-card shadow-card` (lose the dark border on HP bar).
   - Damage chip `-18` floats top-right of opposing panel as a red rounded chip; keep current float-up animation.

b. **Timer pill + category label** — move category OUT of the question card and place it under the timer pill, matching ref:
   ```text
       [ ◯ 13s ]            ← floating pill above card
       TYPE MATCH-UPS       ← pixel-xs, centered, below pill
   [ Question card ... ]
   ```
   Make the timer pill larger (`px-4 py-2 text-sm`) with a real SVG ring (not conic-gradient) for crisper rendering. Pulse red when ≤5s.

c. **Answer buttons** — convert to pill-style outlined buttons:
   - `rounded-2xl border-2 bg-card` baseline (white card with subtle border), not `bg-muted` filled.
   - Correct (feedback): `border-hp-good text-hp-good bg-hp-good/5`, check chip on the right.
   - Wrong pick (feedback): `border-destructive text-destructive bg-destructive/5`, small `YOUR PICK ×` text on the right in `text-[10px] font-bold uppercase text-destructive` (not pixel font, smaller).
   - Revealed-wrong (Scope): `opacity-50 line-through` on the baseline pill, no color change.

The Daily mode question UI (`DailyScreen` around line 1467) should mirror these same answer-button + timer changes for consistency.

### 4. Splash (`src/routes/index.tsx`)

- Lower decorative pokeball opacity from `opacity-30 / opacity-20` to `opacity-15 / opacity-10` and reposition slightly off-canvas so they read as outlines, not solid balls.
- Pokémon sprite circles: shrink from `h-20 w-20 / h-14` to `h-16 w-16 / h-12` to match ref's lighter touch.
- No other changes — layout/buttons already match.

### 5. Onboarding avatar blurb (`src/routes/index.tsx → trainer substep`)

- Change the selected-trainer card to italic blurb text (`italic text-poke-dark/80`) to match the speech-card feel.
- Add the trainer's quote marks (`"…"`) around the blurb in render.

No other onboarding changes.

### 6. Error component (`src/router.tsx → DefaultErrorComponent`)

Match the cream + rounded-pill style from `image.png`:
- Container: `bg-background` cream (already), card wrapper `max-w-sm rounded-3xl bg-card p-6 shadow-card` centered.
- Icon: `h-14 w-14 rounded-full bg-destructive/10` with the warning triangle (already in code) — change icon stroke to current red token.
- Heading: `text-2xl font-extrabold text-poke-dark`.
- Error message pill: `rounded-xl bg-poke-blue/10 px-3 py-2 text-xs font-mono text-poke-blue` (purple-ish accent in ref).
- Buttons: BOTH `h-12 rounded-full text-sm font-bold`; "Try again" `bg-primary text-primary-foreground shadow-pop`, "Go home" `border-2 bg-card text-poke-dark`.

## Out of scope

- Battle gameplay arena background — current sky/grass layout already matches ref's vibe; not changing the platform layout.
- Pokédex, Shop, Profile, Evolution, Share Card — no reference mock provided; leaving prior design pass intact.
- Daily / Weekly result cards — keep current visual treatment.
- Bottom nav route order in code (paths unchanged), only visual order.

## Verification

- `tsc --noEmit` clean.
- Visual at 390×844: Battle Home renders all three sections at once with no horizontal scroll; bottom nav labels are text-only; timer pill + category label sit above question card; answer pills use outlined-pill style; error boundary renders cream card with two pill buttons.
- Manually trigger an error (existing dev-mode error pane) to confirm error UI.
- No regressions to onboarding flow, elite takeover, or Daily/Weekly start.
