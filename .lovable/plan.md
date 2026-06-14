# Finish remaining screen redesigns

Primary screens (Splash, Onboarding, Battle Home, Battle gameplay, Pokédex, Shop, Profile, Bottom Nav, Error) are done. This pass redesigns the remaining secondary/overlay screens so the whole game reads as one system.

## Scope

1. **Victory / Defeat result screen** — `ResultScreen` in `src/components/battle-screen.tsx` (~L1256)
2. **Daily Challenge result screen** — `DailyResultScreen` in `src/components/battle-screen.tsx` (~L1515)
3. **Evolution cutscene** — `src/components/evolution-screen.tsx`
4. **Share Card dialog** — `src/components/share-card-dialog.tsx`
5. **Tutorial overlay** — `src/components/tutorial-overlay.tsx`
6. **Weekly League card + result card** — `src/components/weekly-league-card.tsx`

No gameplay, store, or routing logic changes — visual layer only.

## Design language to apply consistently

- Cards: `rounded-3xl bg-card shadow-card`, hero strips use `bg-poke-hero`
- Type tone tokens: `bg-victory` keeps gradient; defeat softens to `bg-poke-dark/85` (less harsh red)
- Labels: pixel-xs uppercase eyebrow + `font-display-md/xl` heading + body `text-sm text-muted-foreground`
- Buttons: primary `h-12 rounded-full bg-primary text-primary-foreground shadow-pop font-bold`, secondary `border-2 bg-card text-poke-dark`
- Stats: pill rows `rounded-2xl bg-poke-hero/40 px-4 py-3` with label left / `font-display-md` value right (drop `font-pixel` for numeric values; keep pixel only for tiny eyebrow chips)
- Sprites get a soft circular halo `bg-poke-yellow/30 blur-xl` behind them when celebratory

## Per-screen changes

### 1. ResultScreen (Victory / Defeat)
- Replace stacked emoji + pixel block with a hero strip card:
  - Top eyebrow chip `VICTORY` / `DEFEAT` (yellow / red pill, pixel-xs)
  - Large `font-display-xl` "Champion!" / "So close…"
  - Partner sprite center on halo circle, bouncing on win, slumped tint on loss
- Stats card becomes 3 stat tiles in a `grid grid-cols-3 gap-2` row (XP, Streak, TP) with `font-display-md` values and tiny `text-[10px] uppercase` labels — replaces current vertical Row list
- Buttons: primary `Continue` red pill full-width, secondary `Share Victory` (only on win) outlined pill above with pokeball glyph instead of camera emoji
- Confetti / drop shadow stays via existing motion spring

### 2. DailyResultScreen
- Eyebrow `DAILY CHALLENGE · {date}` pixel chip on yellow
- Big medal SVG (Pokéball+ribbon) centered instead of 🏅 emoji
- Stat tiles row: Score / Time / Streak (3-col, matches Result style)
- `PokeballPattern` rendered inside its own `rounded-2xl bg-card shadow-card` block with `TODAY'S PATTERN` eyebrow above
- Back button → outlined pill `border-2 bg-card`, plus a primary `See Leaderboard*` placeholder kept disabled if no nav target (skip if not wired — confirm in build)

### 3. EvolutionScreen
- Backdrop: switch from `bg-poke-dark/95 backdrop-blur` to deep radial `bg-[radial-gradient(circle_at_center,_var(--color-poke-blue)_0%,_var(--color-poke-dark)_70%)]` for a Pokémon-cutscene feel
- Intro text uses `font-display-md text-poke-yellow` + italicized "is evolving!"
- Glow halo recolored to white→yellow gradient with stronger bloom (`blur-3xl`)
- Reveal card: cream `rounded-3xl`, eyebrow `EVOLUTION COMPLETE`, names use `font-display-lg`, Continue button red pill full-width
- Drop the `border-2 border-poke-dark` look from the card (matches new system)

### 4. ShareCardDialog
- DialogContent: `rounded-3xl bg-card p-5 max-w-md` (no default chrome)
- Title pill eyebrow `SHARE YOUR VICTORY` + `font-display-md` subtitle
- "How to save" tip becomes a `rounded-2xl bg-poke-hero/50 p-3` card with pokéball icon
- Buttons: Close = outlined pill, Save = primary red pill with download icon — full-width on mobile, side-by-side desktop
- Loading state uses larger `PokeballSpinner size={64}` centered in a `min-h-[300px]` placeholder shaped like the eventual image so layout doesn't jump

### 5. TutorialOverlay
- Backdrop softer: `bg-poke-dark/70` (not pure black)
- Card: drop the heavy `border-2 border-poke-dark`; switch to `rounded-3xl bg-card shadow-pop`
- Header: progress dots `● ○ ○` (3 dots, primary fill for current) instead of pixel `Tutorial · n/3` chip
- Title `font-display-md`, body `text-sm`
- Footer: Skip becomes a left-aligned muted pill button, primary `Got it` becomes red pill `h-11 rounded-full px-6 font-bold`
- On the last step the primary label changes to `Start battling`

### 6. WeeklyLeagueCard + ResultCard
- Card body: full strip with `bg-gradient-to-br from-poke-blue/15 to-poke-yellow/20 rounded-3xl p-5`
- Eyebrow chip: blue `WEEKLY LEAGUE` (matches Battle Home tile)
- Trainer + signature pokémon laid out as two halos with `vs` chip between them (instead of just side-by-side)
- Leader name `font-display-md`, type pill below
- Quote in italic, single-line, with quote marks as `“ ”` decorative
- Reward line becomes a chip: `rounded-full bg-poke-yellow/30 px-3 py-1 font-bold text-poke-dark` with badge icon
- CTA button: drop the yellow→primary gradient, use solid `bg-primary` red pill consistent with Find Match button
- `WeeklyLeagueResultCard`: trophy/heart inside a halo circle, status uses `font-display-md`, "Next challenge" line in `rounded-2xl bg-card/60 px-3 py-2`

## Out of scope

- `partner-picker.tsx`, `game-ui.tsx` shared primitives (already in use across redesigned screens)
- `pwa-register.tsx` (no UI)
- Onboarding, Battle Home, Battle gameplay, Pokédex, Shop, Profile, Bottom Nav, Error (done in prior passes)
- Logic, audio, timers — untouched

## Verification

- `tsc --noEmit` clean
- Walk each surface at 390×844:
  - Trigger a battle to win → ResultScreen + ShareCardDialog
  - Trigger a battle to lose → ResultScreen (defeat)
  - Complete Daily → DailyResultScreen
  - Trigger evolution via dev path → EvolutionScreen full cycle
  - First-battle tutorial → TutorialOverlay all 3 steps
  - Battle Home → Weekly League tile + (when finished) result card
- Confirm no horizontal scroll, no leftover `font-pixel` numeric stats, and buttons use new pill system
