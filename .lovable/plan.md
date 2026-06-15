# Local-host trainer sprites + remove town from blurb

## 1. Remove town from avatar blurb

In `src/routes/index.tsx` (substep "trainer" blurb card), change the pixel header from `{name} · {town}` to just `{name}`. `TRAINER_BLURBS` / `trainerInfo.town` references become unused there — leave the data file untouched (used nowhere else risky).

## 2. Download all 294 trainer sprites into the repo

The reference GitHub path `public/trainers/avatar` doesn't exist yet — we'll create it in this project (it then syncs to GitHub through the normal Lovable→GitHub sync).

Steps:
- `mkdir -p public/trainers/avatar`
- Write a small Node/bun script that reads `src/lib/trainer-data.generated.json`, downloads each `url` to `public/trainers/avatar/{id}.png` (skip if already present, small concurrency, polite delay), and reports any failures.
- Run it once. Expected: 294 PNGs, ~a few MB total (bulbagarden sprites are tiny).
- Update `src/lib/trainer-data.generated.json` so each entry's `url` becomes `/trainers/avatar/{id}.png`. Also update `scripts/build-trainers.ts` so future regenerations emit local URLs (write the same local path instead of the remote bulbagarden URL — keep remote fetch logic only for the download step, not for the emitted URL).
- `trainerSpriteUrl()` in `src/lib/game-data.ts` stays as-is — it already returns the `url` field, which now points locally.

Any sprite that fails to download is reported and left out of the JSON (so the existing `brokenTrainerIds` UI path still hides it cleanly).

## 3. Notes / out of scope

- Not migrating to Lovable CDN assets — user explicitly asked for `public/trainers/avatar/` paths so they live in the git repo.
- `public/trainers/avatar/*.png` will be committed alongside code.
- No changes to step 1, step 3, store, or layout.
- No changes to `TRAINER_BLURBS` data — just stop rendering the town.

## Verification

- `tsc --noEmit`
- Spot-check a couple of sprite URLs (curl `/trainers/avatar/red.png`, `/trainers/avatar/oak.png`) in the preview.
- Open step 2 in the preview: grid loads from local paths, blurb shows just the name (no town).
