## Onboarding redesign

Rework the `TrainerCreate` flow in `src/routes/index.tsx` to match the three reference screens. No iOS frame, no new routes, no logic changes — only layout/visual changes to the existing 3 substeps (`name`, `trainer`, `pokemon`).

### Shared screen shell

- Full-height column with `safe-area` top + bottom padding.
- **Top bar**: circular white back button (left) with `<` chevron, and `STEP n/3` label (right) in small pixel font.
- **Progress**: 3 equal-width segments under the top bar; completed = primary red, current = primary red, future = muted gray. (Replaces current thin track.)
- **Sticky bottom CTA**: full-width pill button pinned in the thumb zone (`mt-auto`, `pb-[calc(env(safe-area-inset-bottom)+1rem)]`), `h-14`, large label. Disabled state stays.
- Replace the small "← back" text link with the circular back button.

### Step 1 — "What should we call you?"

- Large centered headline `text-3xl font-extrabold` wrapping to 2 lines.
- Centered trainer sprite (~96px) of the currently selected avatar (defaults to Red) above a white speech-style card.
- Speech card: white rounded-2xl, soft shadow, contains "PROF. OAK" tag (red, uppercase, pixel font) and welcome line "Welcome, challenger! Every great trainer's story starts with a name."
- "TRAINER NAME" uppercase label, then existing `Input` styled as red-bordered rounded pill.
- Helper text under input: "Max 16 characters · shown to opponents".
- CTA: **Next: Choose Avatar** (disabled until name).

### Step 2 — "Pick your avatar"

- Headline `Pick your avatar` + subline `Tap a trainer to read their story.`
- Remove search input (not in reference). Show the existing trainer grid as 3-col cards, white rounded with sprite + name; selected card gets red border + small red check badge top-right.
- Below grid: a peach/cream info card showing selected trainer's name + hometown tag + a short flavor blurb. Use a static map of blurbs for the trainers we have (Red, Lyra, Ethan, May, Brendan, Dawn, …); fallback line for others.
- CTA: **Next: Choose Pokémon**.

### Step 3 — "Choose your partner"

- Headline `Choose your partner` + subline `Your partner's type grants a battle ability.`
- Keep search input, restyled as rounded white pill with leading magnifier.
- 3-col grid of partner cards: sprite, name, single type badge under name (use first type). Selected card has red border + red check badge.
- Below grid: peach ability card showing the selected Pokémon's ability icon (circle with type color), ability name, and description from `getAbility(p.types)`.
- CTA: **Start Adventure** (disabled until pick).

### Implementation notes

- All changes scoped to `src/routes/index.tsx`. No data, store, or route changes.
- Add small local `TRAINER_BLURBS` record and an `AbilityCard` helper inside the file.
- Reuse existing tokens (`bg-poke-hero`, `text-poke-dark`, `shadow-pop`, primary red). No new colors needed; the peach info card uses `bg-primary/10`.
- Sticky CTA achieved by making each substep a flex column with `flex-1` scroll area + `mt-auto` button wrapper.
