# Splash screen — match reference placement exactly

Reference: an iconic hand-drawn Pokéball sits ABOVE the Pokémon logo (centered hero), followed by the "Trivia Battle" heading, blurb, and a 4-sprite row with alternating vertical offsets. Three decorative ring-outline pokéballs float in the background. Buttons pinned at the bottom.

The current implementation is close but misses key placement: it has no pokéball above the logo (it shows a spinning pokéball BELOW the sprite row instead), the decorative outlines are full pokéballs not ring outlines, and the sprite row bounces instead of holding a static zig-zag.

## Changes to `src/routes/index.tsx → SplashPage`

### 1. Background — exact gradient stack
Replace `bg-poke-hero` on the splash container with an inline style matching the reference:
```text
radial(15% 12%, yellow 0%, transparent 42%)
+ radial(88% 90%, red/16% 0%, transparent 48%)
+ linear(168deg, cream → soft-blue)
```
Uses existing `--poke-yellow`, `--poke-red`, `--background` tokens. Other onboarding steps keep `bg-poke-hero`.

### 2. Decorative outlines — three ring-only pokéballs
Drop the two `<PokeballSpinner>` decorations. Render three `rounded-full border-[20-26px] border-poke-dark/5` divs:
- Top-right large: `-right-[120px] -top-[80px] h-80 w-80 border-[26px]`
- Top-right small: `right-3 top-[54px] h-[52px] w-[52px] border-[12px]`
- Bottom-left: `-left-[90px] bottom-[90px] h-60 w-60 border-[22px]`

These are pure outline circles — no fill, no band — so they read as faint pokéball silhouettes.

### 3. Hero pokéball — new component above the logo
Build a static SVG/divs Pokéball (108×108) and place it above the Pokémon logo:
- Outer circle `border-[5px] border-poke-dark` clipping a red top half + white bottom half
- Horizontal `bg-poke-dark` band (12px) across the middle
- 32×32 white center circle with `border-[5px] border-poke-dark`

Will live as a small helper `PokeballEmblem` inside `index.tsx` (no new file — keeps the screen self-contained).

### 4. Sprite row — static alternating offset
Replace the animated bounce loop. Render 4 white circles (`h-16 w-16 rounded-full bg-card shadow-card`) with sprites 1/4/7/25; the 2nd and 4th circles get `-translate-y-3` to produce the zig-zag in the reference. No motion.

### 5. Remove the standalone spinner under the sprites
Delete the `<PokeballSpinner size={64} spinning />` block — the new hero emblem replaces it visually.

### 6. Stack order, spacing, typography
- Container becomes `flex flex-col items-center` with the hero block vertically centered (`justify-center`) and buttons in a bottom strip (`mt-auto`), matching the ref's split.
- Spacing: `Emblem → mt-6 logo (w-42) → mt-3 "Trivia Battle" (text-[2.625rem] font-black tracking-tight) → mt-4 blurb (max-w-[17rem] text-[15px]) → mt-7 sprite row`.
- Buttons: keep "New Trainer" (primary red pill, `h-[58px]`) + "Play as Guest" (white pill, `border-2 border-poke-dark/10`), gap 3.

## Out of scope
- TrainerCreate (`step === "create"`) and its three substeps stay as-is.
- No logic, navigation, or store changes.

## Verification
- `tsc --noEmit` clean.
- 390×844: emblem above logo, three faint ring outlines visible in corners, sprite row holds zig-zag without animation, gradient transitions yellow→sky-blue from top-left to bottom-right.
- No bottom spinner. Buttons unchanged in behavior.
