# Onboarding 1/3 (Trainer Name) — match reference layout

Update only the `substep === "name"` branch inside `TrainerCreate` in `src/routes/index.tsx`. Other substeps and global header stay as-is structurally, but the header layout for this step needs tightening to match.

## Changes

### 1. Always use Oak as the Professor sprite
The current screen renders the *selected* trainer sprite as the speaker. Replace with the hardcoded Oak sprite via `trainerSpriteUrl("oak")` so this step always shows Prof. Oak regardless of the avatar pick (avatar pick happens in step 2).

### 2. Heading: centered, bold, tighter
Replace `text-3xl font-extrabold` with `text-[30px] font-extrabold tracking-tight text-center` matching the reference proportions (two-line "What should we call you?"). Move it above the Oak sprite (heading first, then sprite + speech card), mirroring the reference order.

### 3. Speech card with notch
- Oak sprite: `h-[132px] w-[132px] object-contain` centered, sits just above the speech card with negative overlap (`-mt-1` on the card).
- Speech card: `rounded-2xl bg-card px-4 py-3.5 shadow-card text-center` with a 14×14 white square rotated 45° as a notch absolutely positioned at `top:-7px left:1/2`.
- Eyebrow: `font-pixel-xs uppercase text-primary` reading "PROF. OAK".
- Body: `text-sm leading-snug text-poke-dark/80`.

### 4. Input field — pill with red border
Already pill-shaped, but tighten to match:
- `h-[54px] rounded-full border-[2.5px] border-primary bg-card px-5 text-[17px] font-bold`
- Label above: `font-pixel-xs uppercase text-poke-dark/55`, `mb-2`.
- Helper below: `mt-2 text-xs text-poke-dark/55`, copy unchanged.
- Keep `maxLength={16}`, `autoFocus`.

### 5. Bottom button strip
Float the "Next: Choose Avatar" button in a fixed bottom padding block (`px-6 pb-11 pt-4`) so it sits flush near the safe-area, not pushed by `mt-auto` inside the scroller. Same red pill style (`h-[58px] rounded-full bg-primary text-[17px] font-bold shadow-pop`).

### 6. Header (back chip + STEP label + progress bars)
Slight tightening so this step matches the ref:
- Top row spacing: `pt-[calc(env(safe-area-inset-top)+1.5rem)]` (slightly more top breathing room).
- STEP label uses `font-pixel-xs` (already does, just sizing tweak).
- Progress bar bumped to `h-[6px]` and `gap-1.5`.

These header tweaks live on the parent `TrainerCreate` shell, so they affect steps 2 and 3 too — which is desirable for consistency.

## Out of scope

- Substep 2 (Pick your avatar) and substep 3 (Pick your partner) — content unchanged.
- TRAINER_BLURBS and trainer selection logic — untouched.
- Background, store, navigation — untouched.

## Verification

- `tsc --noEmit` clean.
- 390×844 name step: heading → Oak sprite → speech card with notch → label → red-bordered pill input → helper text → bottom red pill button. Oak is always Oak.
- Confirm avatar step still uses selected trainer for its own pickers (independent of the Oak hardcode in name step).
