# 03-frontend — Feedback-triage batch (#1 lose-screen review, #3 dual ability)

**Feature slug:** `feedback-triage`
**Author:** Frontend Engineer
**Date:** 2026-07-10
**Inputs:** `01-spec.md`, `02-architecture.md`.

Both fixes implemented, client-side only. No schema/migration/edge-function change.

---

## Fix #1 — Missed-answer review on the Nearby/Training lose screen

Shared `MissedAnswer` history is now accumulated in **route state** as each of the
local player's questions resolves wrong, so it survives the battle→result unmount
(the loss is often resolved by the opponent's realtime answer, unmounting the runner).

- **New type** `MissedAnswer` — `src/lib/trivia-core.ts:16` (`{question, correctAnswer, explanation}`; reused everywhere, not redeclared).
- **New shared component** `src/components/MissedReview.tsx` — prop `missed: MissedAnswer[]` plus an optional `footer?: ReactNode` slot. Renders the "Review · N Missed" card; **returns `null` when `missed.length === 0` and no footer** (graceful degrade on an HP/forfeit loss). Extracted verbatim from the old Solo markup so both lose screens are identical by construction.
- **Solo** `src/components/result-screen.tsx` — imports `MissedReview` (`:6`); the old inline review+consolation card (was `:221-249`) replaced by `<MissedReview missed={missed} footer={<consolation .../>} />` (`:221`). Removed the now-unused local `shown`/`more` (was `:185-186`). **Solo is pixel-identical** (consolation passed as `footer`, so its "No wrong answers" edge-case message is preserved).
- **Runner** `src/components/live-pvp-battle-screen.tsx`:
  - `Props.onMissed?: (m: MissedAnswer) => void` added (`:110`); destructured (`:311`); `MissedAnswer` imported (`:6`).
  - Single call site in `resolveQuestion`'s wrong-answer `else` branch (`~:1119`). **All three wrong paths — real wrong answer (`handleAnswer`), no-answer ceiling (`~:875`), personal-timeout (`~:1366`) — route through this one `else`**, and the `lastResolvedIdxRef` double-submit guard (`:972`) means each slot reaches it at most once → one entry per miss, no dupes. Uses `questions[idxAtAnswer]` (post-shuffle, `correct` re-indexed) mirroring Solo's `missedRef` push. Deviation from the plan's 3 sites noted below.
- **Route** `src/routes/pvp.live.$matchId.tsx`:
  - `const [missed, setMissed] = useState<MissedAnswer[]>([])` (`~:69`); `MissedReview` + `MissedAnswer` imported (`:36-37`).
  - `onMissed={(m) => setMissed((prev) => [...prev, m])}` passed to `LivePvpBattleScreen` (`~:441`).
  - `PvpResultScreen` gains a `missed: MissedAnswer[]` prop (`~:515`, `:528`); defeat branch renders `<MissedReview missed={missed} />` directly below the (kept) HP line block (`~:678`).

## Fix #3 — Legendary/Mythical fire BOTH signature AND type ability

- **Gate A removed** `src/components/live-pvp-battle-screen.tsx:351-354` — `typeAbilityId` now resolves unconditionally (`resolvePvpTypeAbilityId(myPokemon?.types, storeAbilityId)`, deps `[myPokemon, storeAbilityId]`). Both ability blocks fold into the same `dmg`/`selfDmg` locals, so they stack. Stale "mutually exclusive / no-op for legendary" comments updated (`:345`, `~:1138`).
- **Gate B removed** `src/routes/pvp.live.$matchId.tsx:113-116` — the type-ability id is always reported to the server via `setLivePvpPartner`, so server-catalog `battleStart`/`postAnswerFires` effects resolve and the opponent can attribute the type ability. Signature id is carried separately by dex id, so both coexist. `signatureAbilityFor` import removed (now unused).
- **Popover shows both** — `PvpCombatPanel` refactored from `abilityName`/`abilityDesc` to `abilities?: AbilityChip[]` (`{name, desc}[]`), rendering one chip+popover per ability. `myAbilities`/`oppAbilities` arrays (`~:361`) push signature (if legendary) then type ability (if present). Non-legendary → one chip (unchanged). Legendary → signature + type. Symmetric for the opponent panel too (a legendary opponent now reports its type id post-Gate-B).
- **Attribution verified** `src/routes/pvp.live.$matchId.tsx:287-288` — unchanged and correct: type effects arrive as rows with `abilityId` and no `pokemonId`; signature effects carry `pokemonId`. They are distinct rows/sources, so both attribute correctly with no double-count.

## Files touched
- `src/lib/trivia-core.ts` (new `MissedAnswer` type)
- `src/components/MissedReview.tsx` (new)
- `src/components/result-screen.tsx` (use shared component)
- `src/components/live-pvp-battle-screen.tsx` (both fixes)
- `src/routes/pvp.live.$matchId.tsx` (both fixes)

## Verification
- `tsc --noEmit`: **PASS** (0 errors).
- `eslint` on the 5 changed files with `--max-warnings=0`: **PASS** (0 problems).
- Full-repo `eslint . --max-warnings=0`: 13 **pre-existing** warnings, all in untouched files (`MegaRaidScreen.tsx`, `ui/*`, `router.tsx`, `battle.tsx`) — none introduced by this change. Repo's own `lint` script (`eslint .`, no max-warnings) exits 0.
- Not run: Vitest / `vite build` (left for QA).

## Deviations from the plan
- **One `onMissed` call site, not three.** The plan named `:1108` + no-answer paths `:875`/`:1366`. Both no-answer paths already call `resolveQuestion(idx, false, …)`, which lands in the same wrong-answer `else`, so a single guarded call covers all three with no duplication. Frozen auto-forfeits deliberately do **not** record a miss (no answer was shown) — matches Solo.
- **`MissedReview` got an optional `footer` prop** beyond the spec's `missed`-only signature. This keeps Solo pixel-identical (consolation line stays inside the same card) while PvP passes no footer. Minimal, additive.
- **`PvpCombatPanel` switched to an `abilities[]` array** rather than concatenating two abilities into one popover — cleaner "list" per spec option, and applied symmetrically to the opponent panel.

## Handoff
- **Status:** done
- **Produced:** `docs/handoffs/feedback-triage/03-frontend.md`; code changes in the 5 files above (working tree, not committed).
- **Next agent:** qa-engineer
- **Context the next agent needs:**
  - #1 retention is in **route state** (`pvp.live.$matchId.tsx` `missed` useState), fed by `onMissed` from the runner's wrong-answer `else`. Regression focus: **opponent-resolves-the-match** path (runner unmounts) and **no-answer/timeout** path must both still show a complete missed list; **zero-wrong loss** (HP/forfeit) shows no review card.
  - #1 review UI is the shared `MissedReview` — verify Solo lose screen is visually unchanged and the PvP defeat screen matches it (HP line still above the review).
  - #3: a legendary partner should now yield **both** a type-ability id (reported to server) **and** a signature effect; both should announce + attribute correctly with no double-count; the info popover lists both. Non-legendary partners unchanged (type ability only).
  - No schema change; `tsc` + targeted lint green; Vitest not yet run.
- **Open questions / risks:**
  - #3 removes an intentional balance guard (rarity-5 signature nuke now stacks on a type ability) — Owner accepted; post-ship balance pass out of scope here.
  - Only tsc + eslint run this stage; QA to run Vitest + a live preview battle (opponent-resolve + legendary dual-ability).
