# Battle home + nav + background polish

## 1. Battle home (`src/routes/battle.tsx` — `BattleHome`)
Bring layout in line with the reference mock:

- **Level pill**: switch from `font-pixel-xs` (which can wrap "LV 23" awkwardly on narrow screens) to a fixed pixel-size pill with `whitespace-nowrap`, `text-[8px]`, tighter padding (`px-2 py-[2px]`). Keep dark background / yellow text.
- **Hero spacing**: reduce hero card padding so it isn't dominated by the Find Match card. Use `rounded-3xl` battle card with `p-5` (already) but tighten the section above (Hero ring + stats). Keep current overall structure.
- **Daily Quest / Weekly League tiles**: shrink the two action tiles to match the mock.
  - Container height: `h-[112px]` (currently `h-32` = 128px) and `p-4` padding.
  - Use gradients matching mock:
    - Daily: `bg-gradient-to-br from-[oklch(0.9_0.13_95)] to-[oklch(0.85_0.17_80)]`
    - Weekly: `bg-gradient-to-br from-[oklch(0.62_0.16_250)] to-[oklch(0.5_0.18_270)]`
  - Title row: pixel label `text-[9px]`, then `font-display-md` (~16px) heading, then small subtitle `text-[11px]`.
  - Sprites: shrink from `h-20 w-20` to `h-[60px] w-[60px]`, position `bottom-1 right-1`.
  - Remove the "10 fast questions" / reset-date second line only if it doesn't fit at the smaller height — keep one line of subtitle.

## 2. Bottom nav (`src/components/bottom-nav.tsx`)
Make it a true 4-tab pill: **Battle, Shop, Dex, Profile** with the Battle slot using the elevated pokéball button (no extra spacer):

- Use `grid-cols-4` instead of the current asymmetric flex with right spacer.
- Tab order left→right: Battle (elevated center-style button in slot 1, raised with `-mt-8`), Shop, Dex, Profile.
- Each text tab shows **label text when inactive** and **icon when active**:
  - Shop → `ShoppingBag` (lucide)
  - Dex → `BookOpen`
  - Profile → `User`
- Active icon: red circle background (`bg-primary text-primary-foreground`), `h-9 w-9 rounded-full`, with subtle shadow. Inactive label uses current `text-poke-dark/60 font-bold text-[13px]`.
- Remove the bottom dot indicator (icon swap replaces it).
- Keep the floating pill styling (`rounded-full`, `bg-card/95`, blur, shadow).

Note: design mock places Battle button on the left of the pill (matching the iOS reference). Implement exactly that order.

## 3. Cream background for the four main screens
Reference mock uses a soft cream radial:
```
background:
  radial-gradient(circle at 80% 0%, oklch(0.9 0.12 95 / 0.5) 0%, transparent 38%),
  oklch(0.985 0.012 95);
```

- Add a new utility class `.bg-poke-cream` in `src/styles.css` with the above.
- Replace `bg-poke-hero` on the top wrappers of:
  - `src/routes/battle.tsx` (`BattleHome` outer div)
  - `src/routes/shop.tsx` (line 103 outer hero wrapper — and the page root if needed so it extends behind list)
  - `src/routes/pokedex.tsx` (line 84)
  - `src/routes/profile.tsx` (line 149)
- Ensure the cream extends behind the scroll content (apply to the page root, not just the header band).

## Out of scope
- No changes to onboarding, battle screen, evolution, or any business logic.
- No changes to existing card/stat styling beyond the items listed above.
