# Pokémon Trivia — Engagement Overhaul

Execution will run in 5 phases plus Phase 0 fixes, in order. Each phase is self-contained and ships working code before moving on.

---

## Phase 0 — Bug Fixes

**`src/lib/store.ts`**
- Remove `xAttackActive: false` from `completeSet()` (X Attack should only clear via `consumeXAttack` after a correct answer).
- Remove no-op `if (id === "potion") nextCooldowns.potion = 0;` in `useItem()`.

**`src/routes/api.trivia-batch.ts`**
- Delete the lines 108–114 fallback-fallback that backfills with seen questions; instead return whatever filtered set we have.
- Bump `seenSamples` from 40 → 80.

**`src/routes/profile.tsx`**
- Replace `confirm("Reset all progress?")` (line ~75) with shadcn `AlertDialog` (cancel / destructive confirm).

---

## Phase 1 — Felt Quality Pack

**`src/lib/game-data.ts`** — add `streakMultiplier(streak)` and `streakLabel(streak)` exports per spec.

**`src/components/battle-screen.tsx`** — in `handleAnswer` correct branch:
1. `let dmg = Math.round(10 * streakMultiplier(newStreak));`
2. Add time-bonus: `speedBonus = round(5 * max(0,(totalTime-elapsedSec)/totalTime))`, add to `dmg`. Append `⚡` to floating dmg if `speedBonus >= 3`.
3. Apply super-effective ×2 and X Attack +20 AFTER multiplier.
4. If `streakLabel(newStreak)` differs from previous, set `streakBanner` state; render centered Framer Motion overlay (gold pixel font, scale-up) for 1.5s.
5. Top of `handleAnswer`: `navigator.vibrate?.(correct ? 30 : [50,30,50])`.

Question card header: when `streak >= 2`, show `🔥 {streak} · ×{mult}` chip beside category.

Feedback pill: append ` · ⚡ {(elapsed/1000).toFixed(1)}s`.

**`src/lib/audio.ts`** — new module:
- `playCry(id)` → PokéAPI cries CDN at 0.4 volume.
- `playSfx("correct"|"wrong"|"victory"|"defeat"|"level")` via WebAudio oscillator (frequencies/waveforms per spec).
- `isMuted()`/`setMuted()` persisted under localStorage key `"muted"`.
- Lazy AudioContext (created on first call after user interaction). All play calls wrapped in try/catch.

Wire into `battle-screen.tsx`: `playCry` on enemy reveal, `playSfx("correct"/"wrong")` in `handleAnswer`, `playSfx("victory"/"defeat")` in `finish()`.

**`profile.tsx`** Settings section: add Mute toggle using shadcn `Switch` bound to `isMuted/setMuted`.

---

## Phase 2 — Question Variety (prompt only)

**`src/routes/api.trivia-batch.ts`** systemPrompt: add a "Question Types" block listing the 7 formats (Direct, Elimination, Comparison, Matchup, Trivia, PvP, Chronology) with the rule "no single format > ~30% of batch" and the subtle-trap instruction for Elimination.

---

## Phase 3 — Achievements

**`src/lib/achievements.ts`** — new:
```ts
export type Achievement = { id: string; name: string; desc: string; icon: string; check: (s: GameState) => boolean };
export const ACHIEVEMENTS: Achievement[] = [...]; // ≥12 entries
export function unlockedAchievements(s: GameState): string[];
```
Entries cover: first win, 25 battles, 100 correct, streak 5, streak 10, peakLevel ≥6/16/26/51, Speedrunner (avg <5s over 20+), Scholar (≥90% over 50+), Comeback Kid (`flags.includes("comeback")`).

**`store.ts`** — add persisted `flags: string[]` (default `[]`), action `raiseFlag(name)`.

**`battle-screen.tsx`** — `finish()`: if `won && playerHpAtStartOfFinish <= 10`, `raiseFlag("comeback")`. Snapshot unlocked IDs before `endBattle`, snapshot after, diff, `toast.success` (4s) for each new one with icon + name + desc.

**`profile.tsx`** — Trophies section below Inventory: header `Trophies (n/total)`, 4-col grid; locked = grayscale + opacity-30; tooltip/title shows desc.

---

## Phase 4 — Daily Challenge

**`src/routes/api.daily-challenge.ts`** — new GET handler:
- Compute `date = YYYY-MM-DD` UTC, `seed = parseInt(YYYYMMDD)`.
- Module-level `Map<date, Trivia[]>` cache.
- On miss, refactor trivia-batch core into a shared helper (e.g. `generateTrivia({difficulty, flowSeed, seenHashes, seenSamples})` exported from a new `src/lib/trivia-core.ts`) and call with `difficulty:"hard"`, `flowSeed:seed`, empty seen arrays. Slice 10. Return `{date, questions}`.

**`store.ts`** — add persisted `dailyResult: {date, correct, total, timeMs, pattern} | null` (default null), action `recordDaily(r)`.

**`battle.tsx`** BattleHome — insert Daily Challenge card between StatPills and Find a Battle CTA:
- Gold border, "🔥 TODAY'S CHALLENGE" header.
- If `dailyResult?.date === today`: locked result view with score/time + Share button.
- Else: copy + Start Daily button → navigate to `/battle?mode=daily`.

**`battle-screen.tsx`** daily mode branch:
- Fetch `/api/daily-challenge` once; load 10 questions.
- No item bag, no HP bars, no damage; just sequential trivia.
- Build `pattern` string (🟩/🟥/⬛). On finish call `recordDaily`, show result screen with Share button.

Share helper: `navigator.share` if available, else `navigator.clipboard.writeText` + sonner toast. Format per spec.

---

## Phase 5 — Polish

- **Battle progress bar**: thin bar atop battle screen (`questionIdx / questions.length`).
- **Battle log**: persisted `battleLog: BattleLogEntry[]` in store (cap 20). Push in `endBattle`. Render list in profile below Trophies.
- **Mega glow**: when `streak >= 5`, add `mega-glow` class to player sprite. CSS in `styles.css`: `filter: drop-shadow(0 0 12px gold)` + 1s pulse keyframes.
- **End-of-battle toast**: `toast` win/loss + XP delta before result-screen transition.
- **Guest Mode CTA**: in `routes/index.tsx` onboarding, give Guest Mode equal visual weight to "New Trainer" (matching button size/variant).

---

## Acceptance / Compatibility

- All new persisted store fields added with safe defaults via Zustand `partialize` + `merge` so existing localStorage loads cleanly.
- AudioContext created lazily inside play calls (post-interaction).
- TypeScript / ESLint clean; no breaking renames or removed exports.
- Mobile layout retested at 380px.

## Technical Notes

- Refactor of trivia generation into `src/lib/trivia-core.ts` keeps `api.trivia-batch.ts` and `api.daily-challenge.ts` DRY without changing route signatures.
- `streakBanner` overlay reuses existing Framer Motion patterns in battle-screen.
- Achievement diffing happens in component (post-`endBattle`) using selector snapshots — no store plumbing needed beyond `flags`.
- Daily seed determinism: PokéAPI/AI output isn't deterministic, but the per-day server cache guarantees all players in one UTC day get the same set.
