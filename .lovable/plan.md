## Battle screen visual fixes

All changes in `src/components/battle-screen.tsx`.

### 1. CombatPanel — drop trainer name, keep gutter from screen edges
- Remove the `trainerName` line in the card body (line 95) and remove the `trainerName` prop from `CombatPanel` (definition + both call sites at the enemy/player zones).
- Card retains only: pokemon name, type badges, HP bar + HP number, and the ability/status pill row.
- Confirm gutter: combat arena wrapper stays `px-5`, and shrink card width slightly to `w-[clamp(8rem,38vw,10.5rem)]` so the cards clearly float inside the safe area like the reference (not edge-to-edge as in image 1).

### 2. ROUND / STREAK pills — smaller
- Top bar pills: reduce to `px-2.5 py-1 text-[9px]` (from `px-3 py-1.5 text-[10px]`). Tighten the back/bag buttons to `h-9 w-9` for proportion. Result matches the slim "ROUND 3/5" and "STREAK ×3" pills in image 2.

### 3. Grass platforms — pure CSS, no PNG/WebP
- Remove the two `<img src="/grass/Basic_Grass*.webp" />` elements behind the sprites.
- Replace each with a CSS oval rendered as a positioned `<div>`:
  ```
  radial-gradient(ellipse at 50% 35%,
    oklch(0.85 0.16 145) 0%,
    oklch(0.72 0.18 145) 55%,
    oklch(0.55 0.16 150) 100%);
  border-radius: 50%;
  box-shadow: 0 8px 14px -6px oklch(0.3 0.1 150 / 0.35);
  ```
  Sized roughly `w-28 h-8` (enemy) and `w-32 h-10` (player), with a couple of small lighter dots overlaid via inset highlights to mimic the speckles in the reference.

### Technical notes
- No prop/type changes leak outside `battle-screen.tsx`; `CombatPanel` is only used in two spots in the same file.
- No changes to game logic, store, or routes.
- Grass image files in `/public/grass/` remain on disk (left alone); they're simply no longer referenced.

### Out of scope
- Question card, timer pill, item bag, and other surfaces already match the reference.
