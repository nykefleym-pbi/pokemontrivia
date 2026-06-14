# Battle / In-Battle / Elite Four UI Refresh

Pure presentational changes. No gameplay, store, route, or data changes. All three screens already exist; this redesigns their layout to match the attached references.

Files touched:
- `src/routes/battle.tsx` — `BattleHome` + `ElitePendingTakeover`
- `src/components/battle-screen.tsx` — `BattleMode` (top bar, combat arena chrome, question card)

---

## 1. Battle Home (image 1)

Replace the 3-tab segmented control with a flat, scrollable layout.

**Header (cream `bg-poke-hero`)**
- Left: circular framed trainer sprite with red ring + small "LV 23" pill badge at the bottom.
- Middle: small red pixel label `POKé MANIAC` (rank), large bold name `Ash`, XP bar (`xpProg.current / xpProg.need`), thin caption `2,140 / 3,300 XP to Lv 24`.
- Right: partner Pokémon sprite floating (no halo card).

**Stat row** — 3 equal white rounded cards with soft shadow:
- `STREAK` (pixel label) · big number + flame emoji
- `XP` · big bold number (uses `xp`)
- `TP ×{mult}` · big bold blue number (uses `partnerTp`)

**Primary action card** (white, large rounded, `shadow-card`)
- Left: Pokeball icon (static, ~56px). When `loading`, swap for `PokeballSpinner spinning`.
- Right column: `Up for a battle?` headline, sub-line `20 questions · difficulty scales with your level`.
- Full-width red pill button below: ★ `Find Match` (calls `onStart`). Shows `Summoning…` while loading.

**Secondary row** — 2 cards side-by-side:
- `DAILY QUEST` card (poke-yellow): `Beat Rotom`, `10 fast questions`, small Rotom sprite. Tap → `onStartDaily`. When `dailyDone`, swap copy to `Done · {correct}/{total}` and disable.
- `WEEKLY LEAGUE` card (blue): `Gym: {leader.name}`, small leader/Pokémon sprite. Tap → `onStartWeekly`. When status is `won/lost`, route through existing `WeeklyLeagueResultCard` inside a sheet/modal-less inline swap (reuse current component when expanded — same behavior, only the entry tile changes).

Remove `tab` state, segmented control, and `rotomShaking` shake (tap the card directly). Keep all existing handlers and gating (`pendingElite` takeover, weekly init, etc.).

---

## 2. In-Battle Screen (image 2)

Edits inside `BattleMode` render only.

**Top bar**
- Left: existing back button (unchanged).
- Center → move to left: white pill `ROUND {set}/5` (replaces the `Set X · Qy/5` chip).
- Right: red pill `STREAK ×{streak}` when `streak >= 1`; otherwise show nothing. Elite keeps the existing `ELITE · region` pill in place of round.
- Bag button moves to a small floating button at the right edge of the question card header (Backpack icon) — still opens the existing Sheet with no behavior change.

**Combat arena** — keep diagonal layout, restyle panels:
- Enemy panel (top-left): trainer title in tiny pixel caps, bold enemy name, single type badge under name, thin HP bar with numeric HP on the right. White card with soft shadow.
- A red `-{dmg}` chip floats above the enemy sprite on hit (already exists as `floatDmg`; restyle as solid red rounded pill).
- Player panel (mid-right): bold partner name + ability tag (e.g. `⚡ STATIC`) in the top-right corner of the card, type badge, HP bar with HP number. Same card style as enemy.
- Grass platforms remain.

**Timer pill** — circular SVG ring + `{timer}s` text inside a white pill, floated centered just above the question card (overlapping the top edge by ~50%). Color shifts red and pulses when `timer <= 5`.

**Question card** (white sheet pinned to bottom, no change to height logic)
- Tiny pixel caps category line (`trivia.category`, e.g. `TYPE MATCH-UPS`).
- Question text — larger, semibold.
- Answer buttons:
  - Default: light gray pill, no border.
  - Correct (feedback): green border + green text + check icon on the right.
  - User's wrong pick: red border + red text + small `YOUR PICK ×` chip on the right.
  - Revealed-wrong (Scope): muted + strikethrough (current behavior).
- Bottom row inside the card: 3 item shortcut bubbles (top 3 owned items from `inventory`) with count badge in upper-right. Tapping calls existing `tryUseItem`. Bag button still available for the full list.

Keep explanation banner, streak banner, intro banner, tutorial overlay, and all state/logic untouched.

---

## 3. Elite Four Takeover (image 3)

Edits to `ElitePendingTakeover` only.

- Keep dark gradient background and crown header `ELITE FOUR`.
- Sprite block: elite trainer + signature Pokémon side-by-side (already in place), drop the yellow halo radius slightly.
- Below sprites:
  - Pixel caps subtitle `{title.toUpperCase()}` (e.g. `DRAGON MASTER`) in yellow.
  - Huge yellow display name `{elite.name}`.
  - Single line in muted yellow: `{region} · {type} specialist · 200 HP boss`.
  - Italic quote `"{elite.quote}"`.
  - Reward pills row (centered, 2 dark pills with yellow border):
    - `🏅 Region unlock`
    - `+1,000 XP`
- Remove the "More info" toggle and the expandable info box.
- Bottom: large yellow pill `👑 Challenge {elite.name}` pinned with `mt-auto` for thumb reach. Loading state shows existing Skeleton.
- Caption below button: `REGULAR BATTLES LOCKED UNTIL VICTORY` in tiny pixel font (kept).

---

## Technical notes

- All colors via existing tokens (`bg-poke-hero`, `poke-yellow`, `poke-dark`, `primary`, `hp-good`, `destructive`, `card`, `muted`). No new tokens.
- Reuse `PokeballSpinner`, `XpBar`, `PokemonSprite`, `TypeBadge`, `HpBar`, `WeeklyLeagueCard`, `WeeklyLeagueResultCard`, `Sheet`, `AlertDialog` — no new dependencies.
- No changes to `src/lib/store.ts`, route definitions, server functions, or trivia/elite logic.
- Verify after build: `/battle` home renders without tabs; starting a battle still works; Elite takeover button still triggers `startElite`; daily and weekly entries still gate on `dailyDone` / weekly status.
