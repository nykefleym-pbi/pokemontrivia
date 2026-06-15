## Battle Home + Bottom Nav Polish

### 1. Bottom nav — Battle tab matches Shop/Dex/Profile
File: `src/components/bottom-nav.tsx`

- Remove the elevated `-mt-8` pokéball treatment.
- Make Battle a 4th `NavCell` using the same active/inactive pattern as Shop/Dex/Profile.
  - Active → red circle (`bg-primary`) with a small pokéball icon (`h-[18px] w-[18px]`) inside, matching the other tabs' visual weight.
  - Inactive → bold "Battle" text (`text-[13px] text-poke-dark/60`).
- Keep the `PokeballGlyph` SVG, just resize it to fit inside the 36×36 circle.
- Drop the special-case `battleActive` block and the centered grid slot; collapse to a single `TABS.map` with Battle as the first entry.

### 2. Sprite alignment in Daily Quest / Weekly League
File: `src/routes/battle.tsx` (lines 386–429)

Per reference screenshot, Rotom and the weekly Pokémon sit on the right side **vertically centered with the headline row**, not anchored bottom-right.

- Change each tile from `relative h-[112px] p-4 text-left` to a flex layout:
  - Wrap text block (`DAILY QUEST` label, headline, subtext) in a `flex-1 min-w-0` column.
  - Wrap sprite in a `shrink-0 self-center` container.
  - Outer button: `flex items-center gap-2`.
- Remove the absolute-positioned sprite wrappers (`absolute -right-0.5 -bottom-0.5`).
- Sprite size stays `h-[60px] w-[60px]`.

### 3. Press feedback — pulse pressed tile, freeze the rest
Files: `src/routes/battle.tsx`, optionally `src/styles.css`

Current behavior: while `loading` is true (after pressing Daily/Weekly), the Find Match button gets `disabled:opacity-60` and the daily/weekly buttons use `active:scale-[0.98]`. The user wants:

- The Battle card / Find Match button must **not** change visual state when a quest is pressed.
  - Remove the `disabled` prop dependency on `loading` for Find Match? No — keep functional disable but remove the `disabled:opacity-60` visual change so it looks stationary. Use a local `dailyPending` / `weeklyPending` state in `BattleHome` to distinguish which button triggered loading.
  - Replace `disabled={loading}` on Find Match with `disabled={loading && !dailyPending && !weeklyPending}` style logic, and drop `disabled:opacity-60` on it.
- Remove `active:scale-[0.98]` from the daily/weekly buttons.
- When a quest button is pressed (its own pending flag true), apply an animated pulse:
  - Tailwind: `animate-pulse` plus a subtle ring (`ring-2 ring-white/60` for weekly, `ring-2 ring-[oklch(0.35_0.06_80)]/40` for daily).
  - Or a custom `@keyframes` `quest-pulse` in `src/styles.css` scaling opacity 1 → 0.85 → 1 over 900ms infinite, applied via `animate-[quest-pulse_900ms_ease-in-out_infinite]`.
- Wrap the `onStartDaily` / `onStartWeekly` handlers passed in so they set the local pending flag before delegating, and clear it on phase change back to `home` (reset via `useEffect` on `loading`).

### Out of scope
No changes to battle logic, routing, or other screens.
