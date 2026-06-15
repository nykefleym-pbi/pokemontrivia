# Onboarding 2/3 — Pick Your Avatar Redesign

Scope: only the `substep === "trainer"` block inside `TrainerCreate` in `src/routes/index.tsx`. No changes to step 1, step 3, store, navigation, background, or trainer data.

## Changes

1. **All sprites pickable**
   - Replace the current `.slice(0, 6)` cap. Source = full `TRAINER_SPRITES` (minus `brokenTrainerIds`), sorted alphabetically by `name`.

2. **Search bar (starts-with filter)**
   - Add a rounded search input above the grid, styled to match step 3's search (pill, `Search` icon left, `bg-card`, `shadow-pop`).
   - Reuse local state (rename existing `query` use — currently only used in step 3 — to a step-scoped `trainerQuery` to avoid collision).
   - Filter: `t.name.toLowerCase().startsWith(query.trim().toLowerCase())`.

3. **Initial list = 9 sprites alphabetically**
   - When search is empty → show first 9 alphabetically.
   - When search has text → show all matches (also alphabetical), so users can find any trainer.

4. **Grid cards (match reference)**
   - 3-col grid, `gap-2.5`, cards: `rounded-[20px] bg-card p-2.5`, `shadow-pop`, sprite `h-16 w-16`, name `text-[13px] font-bold`.
   - Selected: `border-[2.5px] border-primary`; unselected: `border-2 border-transparent`.
   - Selected check badge: `-top-2 -right-2 h-[26px] w-[26px] rounded-full bg-primary` with white `Check`.

5. **Blurb card**
   - Replace the trainer's quote/blurb with a single line: `"{Name} is now ready for battle."` (italic, same styled card).
   - Keep header line: `RED · PALLET TOWN` style (`font-pixel text-[10px] uppercase text-primary`). Town still pulled from `TRAINER_BLURBS` (fallback "Unknown Town").
   - Card style: `rounded-[20px] bg-primary/[0.07] border-[1.5px] border-primary/25 p-3.5`, sprite `h-[58px] w-[58px]`.

6. **Heading + progress**
   - Heading already matches (`text-3xl font-extrabold` → adjust to `text-[30px] font-extrabold tracking-tight`), subtitle unchanged.
   - Progress bars already styled in step 1 work; no change needed.

7. **Bottom button**
   - Keep "Next: Choose Pokémon", restyle to `h-[58px] rounded-full bg-primary text-[17px] font-bold shadow-pop`.

## Out of scope

- Trainer data file, sprite URLs, `TRAINER_BLURBS` entries.
- Steps 1 and 3, splash, store/navigation.

## Verification

`tsc --noEmit`; visual check at 390×844 of step 2 — search filters correctly, 9 sprites shown initially, selecting updates blurb text.
