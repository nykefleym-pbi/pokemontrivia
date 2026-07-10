# 02-architecture — Feedback-triage batch (#1 lose-screen review, #3 dual ability)

**Feature slug:** `feedback-triage`
**Author:** Solution Architect
**Date:** 2026-07-10
**Inputs:** `01-spec.md`; two root-cause investigations (below).

Both fixes are **Frontend-owned**. No schema change. One builder (Frontend Engineer)
owns both to avoid colliding on the shared file `live-pvp-battle-screen.tsx`.

---

## Story 1 (#1) — missed-answer review on the Nearby/Training lose screen

### Root cause (verified)
The missed-answer history is **not retained anywhere** in the Nearby/Training flow.
- Solo reference works: `ResultScreen` renders the review block at
  `src/components/result-screen.tsx:221-249` from a `missed` prop
  (`{question, correctAnswer, explanation}[]`, typed `result-screen.tsx:46`),
  populated by a component-local `missedRef` in `src/components/battle-screen.tsx:397`,
  pushed on each wrong answer (`battle-screen.tsx:887-891`), passed at
  `battle-screen.tsx:1365`.
- Nearby/Training runner `LivePvpBattleScreen`
  (`src/components/live-pvp-battle-screen.tsx`) resolves answers in `resolveQuestion`
  (`:967`); the wrong branch (`:1108-1127`) records **nothing**. Result screen
  `PvpResultScreen` lives in `src/routes/pvp.live.$matchId.tsx:502-687`; its defeat
  branch (`:629-686`) shows only an HP line (`:672-674`) and receives no history.
- **Critical:** on a loss the match is often resolved by the *opponent's* answer via
  the realtime row subscription — the route flips `phase` to `"result"` and
  `LivePvpBattleScreen` **unmounts**; local `onFinish` may never fire. So the history
  must be lifted to route state as answers happen, **not** hung off `onFinish`/
  `LivePvpBattleResult` (`live-pvp-battle-screen.tsx:91-96`, discarded at
  `pvp.live.$matchId.tsx:399-404`).

### Approach (frozen)
1. **Accumulate in the runner as answers resolve.** In `live-pvp-battle-screen.tsx`,
   add an `onMissed?: (m: MissedAnswer) => void` prop. In `resolveQuestion`'s wrong
   branch (`:1108`) and the no-answer/timeout wrong paths (`:875`, `:1366`), call
   `onMissed({ question: q.question, correctAnswer: q.options[q.correct],
   explanation: q.explanation })` using `questions[idxAtAnswer]`. Per-client option
   shuffle is safe — `correct` is re-indexed to the shuffled `options` in
   `shuffleAllTriviaOptions` (`trivia-core.ts:51-52`).
2. **Hold it above the unmount.** In `pvp.live.$matchId.tsx`, keep a
   `const [missed, setMissed] = useState<MissedAnswer[]>([])`, append in the
   `onMissed` handler. This survives the battle→result phase flip.
3. **Render.** Add a `missed` prop to `PvpResultScreen` (`:502`) and render the review
   in its defeat branch (`:672`), replacing the HP-only block (keep the HP line above
   it). Degrade gracefully when `missed.length === 0`.
4. **De-dup (recommended).** Extract the Solo review block
   (`result-screen.tsx:221-249`) into a shared `MissedReview` component
   (`src/components/MissedReview.tsx`, prop `missed: MissedAnswer[]`) and use it in
   both `ResultScreen` and `PvpResultScreen` so the two lose screens stay identical by
   construction. Share the `MissedAnswer` type via `src/lib/` (e.g. reuse/extend the
   existing shape rather than redeclaring).

### File ownership (#1)
- `src/components/live-pvp-battle-screen.tsx` (add `onMissed`, call in wrong paths)
- `src/routes/pvp.live.$matchId.tsx` (`missed` state + pass to `PvpResultScreen` +
  render in defeat branch)
- `src/components/MissedReview.tsx` (new, extracted) + refactor
  `src/components/result-screen.tsx` to use it
- Type: `MissedAnswer` in `src/lib/` (co-locate with trivia/result types)

---

## Story 3 (#3) — Legendary/Mythical fire both signature AND type ability

### Root cause (verified)
Signature and type abilities were **deliberately** made mutually exclusive; two gates
null out the type ability whenever a signature exists. Both ability blocks already
fold independently into the same `dmg`/`selfDmg` locals in the answer handler, so
removing the gates makes both stack — nothing structural prevents it.
- **Gate A (client):** `src/components/live-pvp-battle-screen.tsx:351-354`
  `typeAbilityId = ability ? null : resolvePvpTypeAbilityId(...)` — the `ability ? null :`
  suppresses all type-ability codepaths (`:772`, `:818`, `:1133`).
- **Gate B (server report):** `src/routes/pvp.live.$matchId.tsx:113-116`
  `signatureAbilityFor(myPartnerId) ? null : resolvePvpTypeAbilityId(...)` — a legendary
  never reports a type-ability id, so server-catalog `battleStart`/`postAnswerFires`
  effects and opponent attribution can't key on it. Signature is stored separately
  (`pokemonId`/`host_partner_id`), so both coexist in distinct columns.
- Data: type abilities keyed by elemental type (`src/lib/abilities.ts`,
  `src/lib/pvp-type-abilities.ts`); signatures keyed by dex id
  (`src/lib/signature-abilities.ts`); legendary gate `isLegendaryOrMythical`
  (`src/lib/legendary-data.ts:70-72`).

### Approach (frozen)
1. **Un-gate client** (`live-pvp-battle-screen.tsx:351-354`): resolve `typeAbilityId`
   unconditionally — `() => resolvePvpTypeAbilityId(myPokemon?.types, storeAbilityId)`,
   deps `[myPokemon, storeAbilityId]`. Both blocks now fire and stack.
2. **Un-gate server report** (`pvp.live.$matchId.tsx:113-115`): drop
   `signatureAbilityFor(myPartnerId) ? null :` so the type-ability id is always reported
   (needed for server-catalog type effects + opponent attribution; signature id is sent
   separately).
3. **Show both** in the info popover (`live-pvp-battle-screen.tsx:361-370`): currently
   picks signature name when `ability` exists else the type ability — list/concatenate
   **both** for legendary partners.
4. **Attribution** (`pvp.live.$matchId.tsx:287-288`) already tags type vs signature
   effects per source (`!effect.pokemonId && effect.abilityId`); both attribute
   correctly once both ids are stored — verify no double-count.

### File ownership (#3)
- `src/components/live-pvp-battle-screen.tsx` (remove Gate A, popover shows both)
- `src/routes/pvp.live.$matchId.tsx` (remove Gate B, verify attribution)

> Both stories touch `live-pvp-battle-screen.tsx` and `pvp.live.$matchId.tsx` — a
> **single Frontend Engineer** owns the batch; no parallel split.

### Risk (to owner, post-ship)
Un-gating removes an intentional balance guard: a rarity-5 signature nuke now stacks
on top of a type ability. Owner accepted the feedback intent; schedule a balance pass.

---

## Verification (DevOps/QA)
Env note (this machine): prefix with `$env:NODE_OPTIONS="--use-system-ca"`; portable
git at `C:\Users\PaulCan\.local\mingit\cmd\git.exe` (not on PATH). Run `tsc`, ESLint,
Vitest, `vite build`. Regression tests: (#1) missed list retained when opponent
resolves the match / no-answer path; (#3) legendary partner yields both a type-ability
id and a signature effect.

## Handoff
- **Status:** done
- **Produced:** `docs/handoffs/feedback-triage/02-architecture.md`
- **Next agent:** frontend-engineer (build #1 + #3), then qa-engineer → code-reviewer →
  devops-engineer.
- **Context the next agent needs:**
  - #1: add `onMissed` in runner wrong paths, accumulate in route `useState`, render
    shared `MissedReview` in `PvpResultScreen` defeat branch. Do NOT rely on `onFinish`.
  - #3: delete two `signature ? null : type` gates
    (`live-pvp-battle-screen.tsx:352`, `pvp.live.$matchId.tsx:113-114`); popover lists
    both; verify attribution not double-counting.
  - No schema change. Single builder owns both (shared files).
- **Open questions / risks:** #3 balance guard removed (post-ship pass); confirm
  `MissedReview` extraction vs duplicate (recommend extract).
