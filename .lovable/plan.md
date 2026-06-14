# Pokémon Trivia Battle — Priority 1+2 UI Redesign

Goal: align the existing app to the attached HTML design comp for the Onboarding flow and the Core Battle loop, plus the global chrome (nav + design tokens) that those screens depend on. No gameplay, store, route, or backend changes.

## Files touched

- `src/styles.css` — design tokens
- `src/components/bottom-nav.tsx` — floating pill nav
- `src/routes/__root.tsx` — bottom padding only if nav height changes
- `src/routes/index.tsx` — Splash + Onboarding (Name → Avatar → Partner) polish to spec
- `src/routes/battle.tsx` — Battle Home + Elite Four takeover polish
- `src/components/battle-screen.tsx` — in-battle FRLG diagonal layout, Victory / Defeat result cards

Out of scope this pass: Pokédex, Pokédex detail, Shop, Bag, Purchase confirm, Profile tabs, Achievements, Trophies, Badges, Settings, Evolution, Share card, dark variants. Will return for those in a follow-up.

---

## 1. Global tokens (`src/styles.css`)

- Soften `--shadow-card` to `0 10px 30px -12px oklch(0.5 0.15 250 / 0.18)` (comp uses a much softer drop than today).
- Add `--shadow-float: 0 16px 40px -16px oklch(0.22 0.04 260 / 0.28)` for the floating nav and hero CTAs.
- Add a `--radius-pill: 999px` alias and bump `--radius` default usage on hero cards toward `1.25rem` via utility classes (no token rename — just consistent class usage on the touched screens).
- Add `.font-display-xl` (`Outfit`, 32px/1, weight 800, letter-spacing −0.03em), `.font-display-lg` (28px, 800, −0.02em), `.font-display-md` (22px, 700, −0.01em) utilities for headings.
- Constrain pixel font to accent sizes: add `.font-pixel-xs` (8px) and `.font-pixel-sm` (10px); audit the touched screens to ensure `font-pixel` only appears at 7–10px.
- Bump `--bottom-nav-height` to `4.5rem` and `--bottom-nav-total` accordingly so the new floating pill has clearance.

No color token changes — existing `poke-*`, `hp-*`, type tokens stay.

## 2. Floating pill bottom nav (`src/components/bottom-nav.tsx`)

Replaces the current flat 4-tab bar.

- Container: `fixed bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] left-1/2 -translate-x-1/2 w-[min(440px,calc(100%-1.5rem))]`, pill shape, white bg, `shadow-float`, 1px border `border-border/60`, `backdrop-blur-xl`, height 64px.
- Layout: 4 evenly-spaced icon+label cells. The Battle cell is the visual center: rendered as an elevated 64×64 red Pokéball-style circle that floats `-translate-y-5` above the pill, with `bg-primary text-primary-foreground shadow-pop`, white inner ring, and a tiny pixel `BATTLE` cap below the pill (inside the bar).
- Other 3 cells (Shop / Dex / Profile): icon top, `font-pixel-xs` label below, active state gets a primary-colored dot under the icon (no top underline bar anymore).
- Hide rules unchanged: hidden on `/`, hidden in active battle on `/battle`.
- Bottom padding utility `.pb-nav` keeps content above the floating pill via the updated `--bottom-nav-total`.

## 3. Splash (`src/routes/index.tsx`)

Already close. Tighten to spec:

- Background: `bg-poke-hero`.
- Center stack: bouncing Pokémon-sprite bubbles (kept), Pokémon logo (kept), oversized `TRIVIA BATTLE` `.font-display-xl` (already enlarged — keep).
- Primary CTA `New Trainer` becomes a full-width pill `h-14 rounded-full bg-primary text-primary-foreground shadow-pop`, pinned in the thumb zone (`mb-[calc(env(safe-area-inset-bottom)+1.5rem)]`).
- Secondary `Play as Guest` becomes a ghost text button under it.
- Tiny pixel tagline `.font-pixel-xs` `POKÉMON TRIVIA · CATCH 'EM ALL` above the CTA stack.

## 4. Onboarding — Name → Avatar → Partner (`src/routes/index.tsx`)

Three-step flow (already implemented). Polish only:

- Header row: small `‹ Back` chevron left, stepper dots center (`● ● ○` etc.), step counter pixel cap right (`STEP 1/3`).
- Name step: large display heading `What's your name, trainer?`, helper line, large rounded input (`h-14 rounded-2xl text-lg`), 16-char counter on the right inside the input.
- Avatar step: same header pattern, 3-col grid of trainer tiles with soft cards (`rounded-2xl shadow-card`), selected tile gets primary ring + `Check` badge. Below the grid: cream flavor card showing hometown/blurb pulled from existing `TRAINER_BLURBS`.
- Partner step: search input pinned under the header, scrollable 3-col Pokémon grid (only stage-1, already filtered), each tile shows sprite + name + single type badge. Selected pick reveals an ability flavor card using `getAbility(types)` with type-colored circle from existing `TYPE_BG`.
- Bottom CTA on every step: full-width `h-14 rounded-full bg-primary` pinned in thumb zone, disabled until step is valid; copy: `Next` / `Next` / `Start Adventure`.

## 5. Battle Home (`src/routes/battle.tsx`)

Replaces today's single-flat scroll with the spec's 3-tab segmented control + hero card.

- Top: trainer hero card (white, soft shadow). Circular avatar with progress ring around it (XP-to-next via `xpProg`), name `.font-display-lg`, rank pixel cap, XP caption. Partner sprite floats right.
- Stat strip below the hero card: 3 equal soft cards — Streak (flame), XP, TP×mult.
- Segmented control (`bg-muted` pill, 3 segments): `Battle` / `Daily` / `Weekly`. State lifted into local `tab` — no store changes.
- Content per segment:
  - Battle: hero card with `PokeballSpinner`, headline `Up for a battle?`, sub copy, full-width red pill CTA `Find Match` (calls existing `onStart`).
  - Daily: Rotom card (poke-yellow), `Beat Rotom`, `10 fast questions`, CTA `Start Daily Quest`. When `dailyDone`, shows `Done · {correct}/{total}` and disables.
  - Weekly: existing `WeeklyLeagueCard` / `WeeklyLeagueResultCard` reused; entry tile restyled to match the soft-card pattern.

## 6. Elite Four takeover (`src/routes/battle.tsx`, `ElitePendingTakeover`)

Polish-only on existing component:

- Dark `bg-elite-arena` background, crown pixel cap `ELITE FOUR` at top.
- Sprite block: elite + signature Pokémon, no halo.
- Pixel subtitle `{title}` in yellow, huge yellow display name, single muted-yellow line `{region} · {type} specialist · 200 HP boss`, italic quote.
- 2 reward pills (`🏅 Region unlock`, `+1,000 XP`) centered.
- Pinned bottom pill CTA `👑 Challenge {elite.name}` (yellow, `h-14`, `rounded-full`, thumb-zone). Caption `REGULAR BATTLES LOCKED UNTIL VICTORY` in `.font-pixel-xs`.
- Remove the More info expander.

## 7. Battle screen — FRLG diagonal (`src/components/battle-screen.tsx`)

Restructure the combat arena to the spec's diagonal:

- Background `bg-battle-field` (existing) with two grass platforms (existing ellipse style — keep).
- Enemy panel: top-left, ~40% width, white soft card with name, single type badge, short HP bar, HP number. Enemy sprite positioned top-right on the upper grass platform. Floating `-{dmg}` red pill on hit.
- Player sprite: lower-left on the lower grass platform. Player panel: mid-right, ~40% width, same card style with name, ability tag (`⚡ STATIC` etc.) in the top-right corner, type badge, HP bar with number.
- Top chrome: `‹` back left, `ROUND {set}/5` white pill, `STREAK ×{streak}` red pill (when ≥1), Elite gets `ELITE · region` instead of round. Bag becomes a floating Backpack icon button anchored to the right edge of the question card.
- Floating timer pill: circular SVG ring + `{timer}s`, white pill overlapping the top edge of the question card by ~50%. Pulses red when `timer ≤ 5`.
- Question card pinned at the bottom of the safe area with 16px horizontal + bottom margin (not flush). White, `rounded-3xl`, `shadow-float`.
  - Tiny pixel cap category line.
  - Question text, `.font-display-md`.
  - Answer pills: default `bg-muted`, correct → `border-2 border-hp-good text-hp-good` + check, user-wrong → `border-2 border-destructive text-destructive` + `YOUR PICK` chip, revealed-wrong (Scope) muted+strikethrough.
  - Bottom row: 3 quick-item bubbles (top 3 from inventory) with count badges; existing `tryUseItem` handler. Full Bag still opens from the floating button.

All existing state, gameplay, audio, tutorial overlay, banners, refs untouched.

## 8. Victory / Defeat result screens (`src/components/battle-screen.tsx`)

Polish the existing post-battle states:

- Victory: `bg-victory` (existing). Big display heading `VICTORY!`, summary card with correct/total, XP gained, TP gained, items dropped, then full-width pill `Continue` + secondary `Share` (opens existing share dialog). Elite/Weekly wins additionally show a `Share milestone` highlighted CTA.
- Defeat: `bg-defeat`. `OOPS!` heading, summary card with what tripped you up + suggested item, primary `Try Again` pill + secondary `Back to Battle Home`.

No new logic; reuses existing state machine results and the existing `share-card-dialog`.

---

## Verification

- `tsc --noEmit` clean (build runs automatically).
- Visual pass at 390×844: Splash, all 3 onboarding steps, Battle Home (all 3 tabs), in-battle (round 1 with timer, after a correct answer, after a wrong answer), Elite takeover, Victory, Defeat.
- Nav: hidden on `/`, hidden in active battle, visible elsewhere, center Battle button elevated and routes to `/battle`.
- `font-pixel` only appears at 7–10px on the touched screens (grep check).
- No store, route table, server function, or schema changes.

## Follow-up (not in this pass)

Priority 3–5: Pokédex, Pokédex detail, Shop, Purchase confirm, Bag, Profile tabs, Achievements, Trophies, Badges, Settings, Evolution, Share card visual refresh, dark Battle Home variant.
