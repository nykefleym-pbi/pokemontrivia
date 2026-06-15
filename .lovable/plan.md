## Fixes

### 1. Quest tiles — stop label/title wrapping on mobile
File: `src/routes/battle.tsx` (Daily Quest + Weekly League buttons)

- Add `whitespace-nowrap` to the `DAILY QUEST` and `WEEKLY LEAGUE` pixel labels so they stay on one line.
- Reduce sprite from `h-[60px] w-[60px]` → `h-[52px] w-[52px]` and use negative right margin `-mr-1` so it sits flush without stealing text width.
- Tighten tile padding `p-4` → `p-3` and gap `gap-2` → `gap-1`.
- Allow the headline to use up to 2 lines naturally (remove `truncate` on weekly headline so "Gym: Misty" fits; keep `leading-tight`).
- Keep height `h-[112px]`.

### 2. Pokéball + "Summoning..." should only react to Find Match
File: `src/routes/battle.tsx` (Battle card block)

Currently the `PokeballSpinner` uses `spinning={loading}` and the headline reads "Summoning..." whenever `loading` is true — including when Daily/Weekly was pressed.

- Gate both on `loading && pending === null`:
  - `<PokeballSpinner size={56} spinning={loading && pending === null} />`
  - Headline: `{loading && pending === null ? "Summoning..." : "Up for a battle?"}`
- Button text/disabled already use this condition from the previous change.

### Out of scope
No changes to other routes, nav, or logic.
