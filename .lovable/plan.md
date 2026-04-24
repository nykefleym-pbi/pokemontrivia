
# Adjustments

Five focused tweaks to the existing app — no new screens.

## 1. Pokéball spinner colors (red top / white bottom)

Update `PokeballSpinner` in `src/components/game-ui.tsx` so the top half is solid red and the bottom is white, with the classic black band and white center button (matching a real Poké Ball).

## 2. Trainer selection during onboarding

In `src/routes/index.tsx` (`TrainerCreate`):

- Add a third step to onboarding: **Name → Trainer Avatar → Pokémon**.
- Show a searchable grid of trainer sprites pulled from `https://play.pokemonshowdown.com/sprites/trainers/{id}.png`.
- Curate ~30 popular trainer IDs (red, blue, ethan, lyra, brendan, may, lucas, dawn, hilbert, hilda, calem, serena, elio, selene, victor, gloria, florian, juliana, misty, brock, erika, sabrina, blaine, giovanni, lance, cynthia, steven, oak, n, cheren, etc.).
- Add `trainerSprite: string` to the game store (persisted).
- Use the chosen trainer sprite as the avatar on the Battle home and Profile screens (replacing the Pokémon-as-avatar in the profile identity card; Pokémon sprite still appears as the starter).
- In Profile, allow editing the trainer sprite the same way the starter is edited (separate "Change Trainer" picker dialog).

## 3. Pre-fetch 20 unique questions per battle

Goal: zero network wait between questions, no repeats within a battle.

- Add a new server route `src/routes/api.trivia-batch.ts` (POST) that accepts `{ difficulty, count: 20 }` and returns `{ questions: Trivia[] }`.
  - Calls Lovable AI **once** with a tool that returns an array of 20 trivia objects.
  - System prompt enforces: all 20 must be **distinct** (different topics, no paraphrases, no overlapping correct answers), spread across the 10 categories, and factually accurate.
  - Server-side de-duplication pass: normalize question text (lowercase, strip punctuation), drop any near-duplicate (Jaccard similarity > 0.6 on token sets); top-up from the fallback bank if fewer than 20 unique remain.
  - Returns 429 / 402 passthrough as today.
- Update `src/routes/battle.tsx`:
  - When user clicks **Find a Battle**, show a brief "Preparing battle…" loading state with the spinning Poké Ball.
  - Fetch the batch of 20, store in component state, then mount `BattleScreen` with `questions` as a prop.
- Update `src/components/battle-screen.tsx`:
  - Remove the per-question `fetch("/api/trivia")` call.
  - Take `questions: Trivia[]` as a prop, advance through them sequentially via `questionIdx`.
  - Battle ends naturally when HP hits 0 (already handled); if all 20 are used without a KO, declare the battle won (player outlasted the trainer).
- Keep the legacy `api.trivia.ts` for safety as a single-question fallback if the batch call fails.

## 4. Real PokéMart item icons

Update `src/lib/game-data.ts`:

- Add `iconUrl: string` to each item using `https://play.pokemonshowdown.com/sprites/itemicons/{slug}.png`:
  - Potion → `potion.png`
  - Revive → `revive.png`
  - X Attack → `x-attack.png`
  - Escape Rope → `escape-rope.png`
  - Rare Candy → `rare-candy.png`
  - Lucky Egg → `lucky-egg.png`
  - Scope Lens → `scope-lens.png`
  - X Accuracy → `x-accuracy.png`

Replace the emoji `<div>` with `<img src={iconUrl} className="sprite h-10 w-10">` in:
- `src/routes/shop.tsx` (item tile)
- `src/components/battle-screen.tsx` (item bag sheet + toast message)
- `src/routes/profile.tsx` (inventory grid)

Keep the `emoji` field as a fallback in case the image fails to load (`onError` swap).

## 5. Remove dark mode

- `src/lib/store.ts`: remove `darkMode`, `toggleDark`, the `onRehydrateStorage` dark class toggle, and `darkMode` from `partialize`.
- `src/routes/__root.tsx`: drop the `darkMode` import and the `useEffect` that toggles `.dark`.
- `src/routes/profile.tsx`: remove the entire dark-mode toggle row (and `Moon`/`Sun` imports).
- `src/styles.css`: delete the `.dark { … }` block and the `.dark .bg-battle-field` override (light theme only).

## Technical Notes

- Showdown trainer sprite IDs are lowercase slugs (e.g., `https://play.pokemonshowdown.com/sprites/trainers/red.png`). Image errors fall back to a generic Poké Ball icon.
- AI batch call uses tool-calling with `questions: { type: "array", minItems: 20, maxItems: 20 }` for structured output. One ~3–5s call replaces 20 sequential calls.
- "Preparing battle…" loader prevents the user from entering the battle UI before questions are ready, so the in-battle experience is fully offline-feeling.
- No new dependencies.
