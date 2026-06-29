## Goal

Force the static preview surface to rebuild by landing a trivial no-op commit. The live sandbox preview and local `bun run build` are already healthy — this is purely to nudge the preview-build pipeline that produces the `id-preview--…lovable.app` page.

## Change

Append a single dated line to `docs/ARCHITECTURE.md` (a docs-only file, no runtime impact):

```
<!-- preview-rebuild: 2026-06-29 -->
```

## Why this works

The preview-build pipeline triggers on new commits. A docs-only edit produces a fresh commit without touching any TS, route, store, or asset code, so:

- No risk of behavior change.
- No risk of breaking the green build.
- Type checks, tests, and lint counts stay identical.

## What I will NOT touch

- No source files (`src/**`).
- No `package.json` / lockfile.
- No config (`vite.config.ts`, `wrangler.jsonc`, `tsconfig.json`, etc.).
- No migrations or backend changes.
- The open `tsc` regression on `/battle` search params stays as-is (you declined to bundle that fix).

## Verification after the commit lands

1. Wait ~60 seconds for the static preview build to finish.
2. Reload the `id-preview--…lovable.app` tab.
3. If it still shows "Preview has not been built yet," the issue is on the preview-build pipeline side, not the code — at that point we'd escalate rather than keep editing.
