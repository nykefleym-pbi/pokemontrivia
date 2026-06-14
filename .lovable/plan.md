# Collection screens redesign — Pokédex, Pokédex detail, Shop, Bag

Polish-only pass aligning Pokédex/Shop to the design comp's GO-style cards, soft shadows, big Outfit headings, and pixel font as accents only. No store, route, or gameplay changes. Bag is already implemented as the Inventory tab in `/profile` and as the in-battle sheet — this pass restyles the existing Inventory surface; no new route.

## Files touched

- `src/routes/pokedex.tsx` — hero, sticky filters, grid tiles, detail dialog
- `src/routes/shop.tsx` — header, featured rail, segmented tabs, item cards, purchase sheet
- `src/routes/profile.tsx` — Inventory tab visual only (header chrome + tab layout left for the Profile pass)

## 1. Pokédex (`src/routes/pokedex.tsx`)

Hero strip (`bg-poke-hero`):
- `font-pixel-xs` `POKÉDEX` label, big `font-display-xl` `Pokédex` heading.
- Two soft white stat chips inline: `Caught {n} / 1025` and `Shiny {s}` with sparkles. Right-aligned circular progress ring (GO-style) shows `{pct}%` inside.
- XP-style gradient progress bar removed (replaced by ring).

Sticky filter bar:
- Pill search input `h-11 rounded-full bg-card shadow-card` with magnifier icon.
- Below search, horizontal scrollable chip row for generations (`Gen 1 … Gen 9`) — active chip is `bg-primary text-primary-foreground`, inactive `bg-card text-poke-dark/70 shadow-card`. Replaces the `<select>`.
- Type filter becomes a single trailing chip `+ Type` that opens a small popover with the 18 type chips (use shadcn `Popover` or fall back to a `details/summary` if Popover not present — check before adding deps).
- Caught / Shiny toggles move to the chip row as toggle chips (no `Switch`), using `aria-pressed`.

Grid (3-col mobile, 4-col at min-width 400):
- Tile bg: caught → `bg-card shadow-card` with subtle type-color gradient overlay using the primary type token (`bg-gradient-to-br from-type-{t}/15 to-card`). Uncaught → `bg-muted/40`.
- Larger sprite (`h-16 w-16`) with `sprite-silhouette` if uncaught.
- Name below, `text-[11px] font-bold`. `???` for uncaught.
- Top-right: `×N` defeat count chip in primary; top-left: small ✨ if shiny — both restyled as soft pills.
- Caught entries also show a tiny `font-pixel-xs` type label under name (primary type), GO style.

Detail dialog (`DialogContent` → `max-w-sm rounded-3xl`):
- Header: `font-pixel-xs` `#0025` dex number, `font-display-lg` name (`****` masked for uncaught).
- Big sprite centered (`h-40 w-40`) on a soft type-color radial gradient bg.
- Type badges row.
- Flavor text in a soft cream card (`bg-poke-yellow/10 rounded-2xl p-3 text-sm italic`).
- For caught: 3-col stat strip (Defeated, First seen, Shiny status).
- For uncaught: muted `Not yet captured` with a pixel hint `BATTLE TO UNCOVER`.
- Toggle Shiny button restyled as a full-width pill, only shown when shiny unlocked.

## 2. Shop (`src/routes/shop.tsx`)

Header (replace `AppHeader`):
- Match Pokédex hero pattern: `bg-poke-hero` strip, `font-pixel-xs` `POKÉMART`, `font-display-xl` `Shop`, and an XP balance pill `✨ {xp} XP` right-aligned (white pill, `shadow-card`).

Featured rail:
- Horizontal snap rail (2 cards visible) instead of grid. Each card uses `rounded-3xl bg-gradient-to-br from-poke-yellow/30 to-card border border-poke-yellow/40 shadow-card`, larger icon (`h-14 w-14`) on a white circle, `font-display-md` name, descriptor line, owned count, and a price pill at the bottom-right. `DAILY` ribbon stays but restyled as a soft pill in the top-right.

Category tabs:
- Same pill-segmented control style as Battle Home (`bg-poke-dark/10 p-1 rounded-full`), 4 segments, active = `bg-card text-poke-dark shadow-card`. Labels `Healing / Battle / Utility / Premium` (Title Case, not all caps pixel).

Item grid:
- 2-col, `rounded-3xl bg-card p-4 shadow-card`.
- Icon in `h-14 w-14 rounded-2xl bg-muted` tile. Premium star ribbon moves to a small `★` chip in top-right.
- `font-display-md` name, `text-xs text-muted-foreground` desc (one line truncated), `×{owned} owned` chip.
- Bottom row: full-width pill button `Buy · ✨ {cost}` — primary if affordable, muted-disabled otherwise (replaces the bare price text; makes buy intent explicit).

Purchase sheet:
- Replace pixel title with `font-display-lg`. Icon tile larger (`h-20 w-20 rounded-3xl`). Stat strip cards (`You have / Cost / After`) become 3 soft pill cards. Buttons remain `Cancel` / `Confirm` as full-width pills.

## 3. Bag — Profile Inventory tab (`src/routes/profile.tsx`)

Spec lists Bag as a distinct screen but the app already shows inventory as a Profile tab and inside battle. Don't add a new route. Just restyle the Inventory tab content:

- Replace the existing flat list with a 2-col grid of inventory cards mirroring the Shop item card style (`rounded-3xl bg-card p-4 shadow-card`, icon tile, name, count chip, short description).
- Empty state: cream card with a Pokéball glyph, `Your bag is empty`, and a primary pill `Visit PokéMart` linking to `/shop`.
- Leave the other 6 Profile tabs (Stats / Trophies / Badges / Abilities / Battles / Settings) untouched in this pass — they belong to the next Profile/Achievements batch.

## Out of scope

- Profile header redesign (ring avatar, 7-tab 2-row layout) — saved for the next pass.
- Pokédex search popover for Type filter: if shadcn Popover isn't already in the project, use a simple inline `<details>` to avoid new deps. Verify in `src/components/ui/` first.
- No new components; no changes to `STARTING_PARTNERS`, `ITEMS`, store, or any route definitions.

## Verification

- `tsc --noEmit` clean.
- Visual pass at 390×844 for: Pokédex (empty filter, gen switch, caught toggle, detail open for caught + uncaught), Shop (each category tab + featured + purchase sheet for affordable/unaffordable), Profile Inventory tab (with items and empty).
- `font-pixel` only used at 7–10px (via `.font-pixel-xs` / `.font-pixel-sm`) on the touched screens.
