# 08-review — Code review: Training / Nearby-Battle combat FX & no-answer scoring

**Reviewer:** Code Reviewer sub-agent
**Date:** 2026-07-09
**Branch / HEAD under review:** `fix/training-battle-fx` @ `f4a5d74`
**Scope:** `git diff main..HEAD` (10 files, +1191 / −72). The two real logic fixes
(#1 confused-after-2-consecutive-wrong, #6 no-answer race) plus cue standardisation
through the frozen `emit` contract.

---

## Verdict: **Approve-with-nits**

- **Blockers:** 0
- **Majors:** 0
- **Minors:** 3 · **Nits:** 4

The two logic fixes are correct and well-guarded. Double-submit protection is solid,
the consecutive-wrong counter has the right reset semantics, the bot mirror matches the
human path, and the emit/dedupe reasoning holds (no genuine double-toast between the two
`useBattleFxCues` instances). `tsc --noEmit` is clean; `pvp-bot.test.ts` 21/21 green.
Nothing here should block the merge; the Minors are cue-delivery edge cases (not scoring)
and the Nits are wording/consistency polish.

---

## What I verified (the load-bearing guards)

### #6 No-answer race — resolves exactly once, no double/missed submit ✅
- `resolveQuestion` opens with `if (idxAtAnswer <= lastResolvedIdxRef.current) return;`
  then claims the slot (`lastResolvedIdxRef.current = idxAtAnswer`). Indices only advance,
  so this is a per-slot mutex that can never block a legitimate later slot
  (`live-pvp-battle-screen.tsx:1036-1037`).
- The wall-clock ceiling (`:922-940`) only resolves the leaving slot when
  `leaving > lastResolvedIdxRef.current && selectedRef.current === null && !frozen`, then
  the personal-timeout effect (`:1415-1424`) is blocked either by its `selected !== null`
  guard (the ceiling calls `setSelected(-1)`) or by the `lastResolvedIdxRef` guard inside
  `resolveQuestion`. Whichever fires first wins; the other no-ops. **No double-submit.**
- **No missed-submit** across the slot range: middle slots are resolved by the ceiling on
  advance; the ceiling early-returns at `idx >= PVP_QUESTIONS` (`:910`) so it does **not**
  resolve the *last* slot — but that slot has no preempting advance, so the personal-timeout
  effect resolves it (the original race only bit non-last slots). Both paths terminate in
  `submitPvpLiveAnswer` (`:1377`), so a no-answer is actually scored and feeds the
  consecutive-wrong → confused chain.
- The both-answered early-advance (`:954-965`) never orphans a no-answer: it requires the
  human's own `host_answered_live` to have passed the index, i.e. the human already answered.
- Stale-closure check: the ceiling's `[idx]` dep list is intentional. `frozen` / `personalTimerMs`
  / `emit` are captured from the render in which `idx` changed (React runs the newest
  committed closure when the dep changed), so they are current at action time. `frozen` is
  stable across a slot (only toggled by `enterQuestion`), so the `!frozen` skip matches the
  timeout effect's own `frozen` guard — frozen no-answer slots are intentionally not
  submitted, unchanged from prior behaviour.

### #1 Confused counter — genuinely consecutive, client-authoritative, bot mirrors human ✅
- Human wrong-streak resets to 0 in the `correct` branch **before** the confusion-miss roll
  (`:1053`), so a confusion-miss (which submits `correct=true` / `dmg=0`) also resets — no
  death-spiral. Increments only in the genuine-wrong `else` (`:1177`); applies confused at
  exactly `=== CONFUSE_AT` (`:1178`). `applyConfused` is idempotent (`ticksRef.current > 0`
  early-return, `:995`).
- Overlay is never written to the synced row: held in `selfConfused` / `oppConfused` +
  ticks refs, merged only into the *displayed* lists via `mergeConfused` (`:1726-1733`), and
  the status-diff toaster **excludes** `confused` (`:717,:735`) so row-sync can't clobber it
  and it never double-announces. Confirmed no leak into `myStatuses`/`oppStatuses`.
- Bot mirror (`botConfusionMiss`, `pvp-bot.ts:145-160`) decrements only on a miss, 25% at
  `rng() < 0.25`, matching the human roll; the driver resets `botWrongStreakRef` on any
  correct (incl. a miss) and applies at `=== CONFUSE_AT` (`:1504-1510`). Tests cover the
  boundary, the no-decrement-on-wrong path, drain-to-zero, and 25% convergence over 20k.

### emit / dedupe — no genuine double-toast ✅
- The battle-screen instance emits **self** cues; the route instance emits **opponent** cues
  (disjoint `side`), and `dedupeKey` embeds `side`, so the two instances cannot duplicate each
  other. The route (ability/signature/item KINDS) and the status-diff toaster
  (status-applied/expired KINDS) fire *different* cue kinds — a bot ability firing + the
  resulting status landing are two legitimate Story 4/5 cues, not a dup. Human-applied
  statuses on the bot are `sourceId === myId`, so the route skips them and only the status-diff
  announces — single toast. **The "two cues, not a duplicate" reasoning holds.**
- `STATUS_META[event.status]` is total: `BattleStatusKind` === `StatusKind` (same 7 members)
  and `STATUS_META` is `Record<StatusKind, …>`, so no undefined-meta crash.
- Route null-narrowing is correct: `if (!effect.itemId) return;`, `if (effect.pokemonId == null) return;`
  before passing to the non-null event fields. No unused imports left behind (`toast`/`ITEMS`
  still used by the starter-berry + pickup paths).

### Timers / hygiene ✅
- The emit queue's single `flushTimerRef` is cleared on unmount (`useBattleFxCues.ts:229-233`);
  `scheduleFlush` guards against double-arming and re-arms for the remainder — no leak, no
  toast-after-unmount beyond one in-flight timer that unmount clears.
- No stray `console.*` / `debugger` / `any` in the diff. `tsc --noEmit` clean.

---

## Findings

| # | Severity | File:line | Issue | Fix direction |
|---|----------|-----------|-------|---------------|
| 1 | **Minor** | `src/hooks/useBattleFxCues.ts:194-199` | Queue is **wiped unconditionally** on any higher-`questionIndex` emit (`queueRef.current = []`). At a slot boundary the ceiling emits `answer-result{leaving}` then `enterQuestion(idx)`; if a status-diff for the new slot (higher index) emits within the 350 ms stagger before the "No answer — counted incorrect" toast is released, that Must-story cue (and a same-slot `confused` status-applied) is silently dropped. Scoring still happens — only the toast is lost. Low probability (synced statuses rarely change exactly on that transition). | Before clearing, flush any still-pending cues from slots `< questionIndex` immediately (or keep them and only drop cues strictly older than one slot back), rather than discarding unconditionally. |
| 2 | **Minor** | `src/hooks/useBattleFxCues.ts:143-149` | The `answer-result` **opponent** cue ("Opponent didn't answer — counted incorrect") is **unreachable**: nothing ever emits `answer-result` with `side:"opponent"` (the ceiling only emits `side:"self"`; the route never emits `answer-result`). So an opponent's no-answer is never announced. Not a regression (no such toast existed before) and Training bots always answer, but it's a dead branch / Story 6 parity gap for human-vs-human. | Either drop the dead opponent branch, or (if opponent no-answer parity is wanted) emit an opponent `answer-result` when the synced `guest_answered_live` skips a slot. |
| 3 | **Minor** | battle-screen (self) vs route (opponent) — two `useBattleFxCues()` instances | Story 7 ordering/stagger only holds **within** one instance. When a single slot produces both a self cue and an opponent cue, the two queues release independently, so the two toasts can still land simultaneously. Story 7 is a *Should*, so acceptable for M1. | If tighter ordering is wanted later, lift `useBattleFxCues` to a shared provider so both paths share one queue. |
| 4 | Nit | `live-pvp-battle-screen.tsx:1223-1231` (fire-note) & `:1683-1691` (manual sig) | Minor wording drift from the pre-refactor strings routed through `emit`: the local type-ability fire-note now renders `⚡ Your {ability} — {wiring.note}` instead of the bespoke `typeWiring.fireNote`; the manual-signature no-desc fallback changed `✨ {move} unleashed!` → `✨ {move} activates!`. Cosmetic, not a functional regression. | If exact parity matters, have the hook emit `fireNote` verbatim for the fire-note kind and keep "unleashed!" for the manual path. |
| 5 | Nit | `live-pvp-battle-screen.tsx:889, 1058, 1100, 1133, 1312, 1337, 1390` | Residual **direct `toast.*`** combat/flavour cues that bypass `emit` (enterQuestion reveal fire-note, confusion-miss, passive-sig desc, Wrath discharge, suppression, Air Lock, Rainbow Rebirth). Architecture asked to route combat cues through `emit`; these are left inline, so they don't participate in the queue/dedupe and can overlap emit cues. Mostly out-of-scope flavour, but an inconsistency. | Fold the type-ability reveal note (`:889`) and confusion-miss at minimum through `emit`; leave one-off narrative toasts if intentional. |
| 6 | Nit | `live-pvp-battle-screen.tsx:1729-1733` (`mergeConfused`) | The confused chip's `curesRemaining` is read from `selfConfusedTicksRef.current` during render, but `tickConfusedOut` decrements the ref **without** `setState` until it hits 0, so the chip's remaining count can lag a render. In practice the confusion-miss also calls `setStreak(0)`, forcing a re-render, so it self-corrects. Purely cosmetic. | None required; if strict, mirror ticks into state. |
| 7 | Nit | `useBattleFxCues.ts:170` | `KIND_ORDER.indexOf(event.kind)` is O(n) per emit over a 6-element array — trivially fine, noting only for completeness (a `Record<BattleFxKind, number>` would be O(1)). | Optional. |

No regressions to the human-vs-human PvP cue path were found: the route's opponent
subscription resolves the same names/wording locally from ids (never off the wire), the
`sourceId !== myId` filter is unchanged, and self cues reuse the prior strings (modulo the
Nit-4 drift).

---

## Handoff

- **Status:** done — review complete.
- **Verdict:** Approve-with-nits (0 Blocker / 0 Major).
- **Next agent:** **devops** — the change is safe to proceed to preview/deploy + live-Training
  QA (the Must stories that need runtime verification: no-answer→incorrect at default speed,
  confused-after-2, and cue delivery for item/type-ability/status/signature on both sides).
- **If a follow-up polish pass is wanted → frontend:** address Minor #1 (queue drop at the slot
  boundary) and optionally Minor #2 (dead opponent no-answer cue). Nits #4–#7 are discretionary.
- **Context for the next agent:**
  - Logic is sound; the open items are cue-delivery edge cases, not scoring correctness.
  - Minor #1 is the only one with a (low-probability) chance of a *missing* Must-story toast;
    scoring is unaffected in all cases.
  - QA cannot be unit-tested for realtime delivery (per §7 of the architecture) — verify on the
    Vercel preview in a live Training battle.
- **Open questions / risks:** none blocking. Confirm at QA that the confused overlay chip +
  sprite render for both sides and clears on tick-out.
