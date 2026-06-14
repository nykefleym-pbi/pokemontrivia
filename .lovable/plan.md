# Profile hub redesign (Profile + Achievements + Trophies + Badges + Settings)

Bring `/profile` in line with the Pokédex/Shop GO-style: cream hero strip, `font-display-xl` title, soft pill chrome, `font-pixel-xs` only as accent labels. Visual-only — no store, route, or gameplay changes.

## Audit of prior passes

- Pokédex: hero + ring + sticky filters + type popover + detail flavor — all applied ✓
- Shop: hero + featured rail + segmented tabs + buy pill + purchase sheet — all applied ✓
- Profile → Inventory tab: 2-col cards + empty-state "Visit PokéMart" — applied ✓
- Gap: Profile header still uses `font-pixel text-base` title; tabs are a 4-col grid of 7 pixel triggers (overflows / wraps weirdly); Trophies/Badges/Settings still pre-redesign. Address below.

## Files touched

- `src/routes/profile.tsx` — header, partner card chrome, tabs strip, Trophies/Badges/Abilities/Battles/Settings tab content, Stat helper restyle, BadgeCell silhouette polish.

## 1. Hero strip (replaces current `<h1>` + gradient card)

- `bg-poke-hero` strip matching Pokédex/Shop. `font-pixel-xs` `TRAINER` label, `font-display-xl` `Profile`.
- Avatar: 88px white circular tile with `shadow-pop`, edit pencil chip bottom-right; tappable to open trainer picker.
- Right side: progress ring (same SVG pattern as Pokédex) showing XP-in-level `%`, with `LV {n}` text inside.
- Below: two soft white pill chips — name (editable, pencil affordance) and rank line `{rank}` in `font-pixel-xs`.
- XP bar kept under the chips as a thin pill (`h-1.5 rounded-full`) — gradient yellow→primary.

## 2. Partner card

- Keep `PartnerCard` logic; restyle shell to `rounded-3xl bg-card p-4 shadow-card`.
- Replace `font-pixel text-[9px] PARTNER` with `font-pixel-xs PARTNER`.
- TP bar wrapper becomes soft cream pill (`bg-poke-yellow/10 rounded-2xl`).
- Evolve button: full-width pill, no pixel font — `font-semibold text-sm`, sparkle icon.
- "Fully evolved" becomes a small `bg-poke-yellow/20` pill, `font-pixel-xs`.

## 3. Tabs

Current: 7 triggers in a 4-col grid → wraps 4+3 with cramped pixel labels.

New: 2-row segmented pill, 4+3 layout but visually intentional. Each `TabsTrigger` is a `rounded-full` chip, `font-semibold text-xs` (not pixel), active = `bg-card text-poke-dark shadow-card`, inactive = `text-poke-dark/60`. Container: `bg-poke-dark/10 p-1 rounded-3xl`. Two rows wrapped manually:

```text
[ Stats ] [ Inventory ] [ Trophies ] [ Badges ]
[ Abilities ] [ Battles ] [ Settings ]
```

Use two `TabsList` rows sharing one `Tabs` parent (shadcn allows multiple TabsLists).

## 4. Stats tab

Mostly fine. Touch-ups:
- Restyle `Stat` to `rounded-2xl bg-card p-3 shadow-card`, value in `text-xl font-extrabold text-poke-dark` (drop pixel font on numbers), label `font-pixel-xs text-poke-dark/50`.
- Heatmap header label → `font-pixel-xs`.

## 5. Trophies tab

- Header row → `font-pixel-xs` labels, `text-poke-dark/60` muted.
- Progress bar wrapped in a `rounded-3xl bg-card p-3 shadow-card` container with the bar inside.
- Trophy grid: cards inside cream `bg-poke-yellow/10` for unlocked, `bg-muted/40` for locked. Larger emoji (`text-3xl`), name on 2 lines max, `text-[10px] font-semibold`. Locked uses `opacity-40 grayscale`.

## 6. Badges tab

- Header pill row + progress bar matched to Trophies.
- Per-region card: `rounded-3xl bg-card p-3 shadow-card`, region title `font-pixel-xs text-poke-dark/60`.
- `BadgeCell`: bigger badge (`h-12 w-12`), unearned uses `badge-silhouette` (CSS filter on existing img), no extra silhouette work. Name `text-[10px] font-semibold`, sub-line removed for owned/locked to reduce noise; show only the leader name for owned, `???` for locked.

## 7. Abilities tab

- 2-col `rounded-3xl bg-card p-3 shadow-card` cards. Name `font-display-md`, type badge top-right, description `text-[11px] text-poke-dark/60 leading-snug`.

## 8. Battles tab

- Empty: cream card with Pokéball glyph + "No battles yet" + pill button `Start a battle` → navigates to `/battle`.
- List: each entry becomes a `rounded-2xl bg-card px-3 py-2 shadow-card flex` row. WIN/LOSS chip pill (`bg-hp-good/15` / `bg-destructive/15`), opponent name normal weight, `+{xp}` pill in primary.

## 9. Settings tab

- Sound row → `rounded-3xl bg-card p-4 shadow-card` (drop `border-2`).
- Add a sub-label `font-pixel-xs SOUND` and supporting text `Toggle SFX & music`.
- Reset row → `rounded-3xl bg-card p-4 shadow-card text-destructive` with destructive icon tile (`h-10 w-10 rounded-2xl bg-destructive/10`).

## Out of scope

- 7-tab single-row layout (not feasible at 390px). Two-row segmented pill is the chosen pattern.
- No new sprite assets for badges — using `.badge-silhouette` CSS filter on the already-wired `leader.badgeIconUrl`.
- Picker dialogs (`Change partner`, `Change trainer`) untouched in this pass.
- Evolution screen, share card — separate passes.

## Verification

- `tsc --noEmit` clean.
- Visual pass at 390×844: hero ring fills with XP progress; each tab renders without horizontal scroll; locked badges silhouette correctly; empty Battles shows CTA; Reset confirm still works.
- `font-pixel-xs` only on accent labels (7–10px); no `font-pixel` at base size anywhere on the screen.
