# Splash micro-animations & spacing tweak

Targeted polish in `src/routes/index.tsx` only — no other files touched.

## Changes

### 1. Tighter logo → heading gap
`<h1>Trivia Battle</h1>` currently has `mt-3` (12px) under a `w-[168px]` Pokémon logo. Reduce to `mt-1` (≈4px) so the wordmark sits just above "Trivia Battle" without touching — matches the reference proportions more closely.

### 2. Sprite bubbles — random float
Wrap each of the 4 sprite circles in a `motion.div` with a continuous bobbing animation. Per-bubble random parameters generated once with `useMemo`:
- `duration`: 2.4–4.0s
- `delay`: 0–1.2s
- `amplitude`: 6–14px up/down
- `drift`: ±3px horizontal sway

Keeps the existing static `-translate-y-3` zig-zag as the base offset (applied via Tailwind class) and layers motion on top via `animate={{ y: [...], x: [...] }}` with `ease: "easeInOut"`, `repeat: Infinity`, `repeatType: "mirror"`. Each bubble feels independently buoyant, never in lockstep.

### 3. Pokéball emblem — occasional spin
`PokeballEmblem` becomes a `motion.div` that rotates a full 360° every ~6 seconds, sits still for ~4 seconds, then spins again. Implemented via keyframe rotation:
- `animate={{ rotate: [0, 0, 360, 360] }}`
- `times: [0, 0.4, 0.7, 1]`
- `duration: 6`
- `ease: "easeInOut"`
- `repeat: Infinity`

Hold → spin → hold cadence reads as "spins from time to time" rather than constant motion. No interaction needed.

## Out of scope
- Background gradient, decorative rings, buttons, blurb, layout structure — unchanged.
- TrainerCreate flow — unchanged.

## Verification
- `tsc --noEmit` clean.
- At 390×844: gap between logo and heading visibly tightens; the 4 sprite bubbles drift on independent timings; the emblem rotates once every ~6s with a clear pause between spins.
