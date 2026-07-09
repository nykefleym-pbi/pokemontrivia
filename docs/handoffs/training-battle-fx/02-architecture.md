# 02-architecture — Training / Nearby-Battle combat FX & no-answer scoring

**Feature slug:** `training-battle-fx`
**Author:** Solution Architect
**Date:** 2026-07-09
**Upstream:** `01-spec.md` (read its Handoff block first)

> TL;DR: The opponent-cue **infrastructure already exists and is correctly wired** —
> the bot's RPCs broadcast `pvp_live_effects` rows sourced as the bot, and the route
> subscription toasts them. The two *provable* defects are **logic**, not cues:
> (1) "confused after 2 incorrect" is entirely absent from the live PvP screen, and
> (2) a default-speed **no-answer is never scored** because the shared wall-clock
> ceiling advances past the unanswered slot before the personal-timeout submit runs.
> The remaining "silence" is a mix of missing *status-change* cues and genuine bot
> trigger rarity — QA must confirm delivery for each. **No table/column schema
> change; no migration required** (confused is modelled client-side, see §8).

---

## 1. Effect classification table

Classes: **(a)** silent-but-working (cue only) · **(b)** broken-logic (real fix) · **(c)** both.

| # | Issue | Class | Root cause (`file:line`) | Fix approach |
|---|-------|:---:|--------------------------|--------------|
| 1 | Type abilities & statuses "not resolving"; **no confused after 2 incorrect** | **b** (confused) / c (rest) | Live PvP has **no** wrong-streak→confused rule. Solo applies it at `src/components/battle-screen.tsx:1033-1041` (`wrongStreakRef === confuseAt → applyStatus("confused")`). The live screen only *tallies* wrongs (`live-pvp-battle-screen.tsx:1124-1127` `wrongCountRef`, non-consecutive) and only *consumes* confusion (`:907-912`); it never applies it. Type-ability resolution DOES have a path (`:1043-1128` → `applyPvpTypeAbilityEffect`) but is unverified at runtime. | Add a **consecutive**-wrong counter (reset on correct) in `resolveQuestion`; at 2, apply a client-authoritative `confused` overlay (both sides) + emit `status-applied`. Bot confusion simulated client-side (see §8). QA-verify type-ability resolution separately. |
| 2 | Item usage silent (both sides) | **a** | Local player already toasts (`live-pvp-battle-screen.tsx:1367,1400`). Bot path is **wired**: `applyBotPvpLiveItem` → `use_bot_pvp_live_item` inserts `pvp_live_effects` with `source_id = guest_id` (`20260706202620_pvp_bot_match_rpcs.sql:451-452`); route toasts it (`pvp.live.$matchId.tsx:304-313`, filter `sourceId !== myId` passes). `"superpotion"` is a valid `ItemId` + seeded effect (`20260705000000...:61`). Apparent silence = bot only uses items at `hpPct ≤ 0.45` (`pvp-bot.ts:133-141`) → rare. | Route both sides through the frozen `emit` path; QA-verify delivery. No logic fix expected — confirm rarity, not breakage. |
| 3 | Type-ability activation silent | **a** (human) / N/A (bot) | Human's own type ability toasts locally (`:766-768`, `:1066-1069`, `:806-814`); opponent type ability toasts via route (`pvp.live.$matchId.tsx:279-287`). **Bot never has a type ability** — bot partner is always Legendary/Mythical (`pvp-bot.ts:78-81 rollBotPartner` + server `start_bot_pvp_match`), so `signatureAbilityFor` is always non-null and the type-ability branch is dead for the bot. | Route the human's local type-ability toast through `emit`. No bot work. |
| 4 | Status change silent (+ maybe not applying) | **a** | A stat-**stage** diff toaster catches every stage change from any source (`:650-673`), but there is **no equivalent status diff toaster**. Statuses synced from the row (`pvp.live.$matchId.tsx:249-254`) change the chip with no toast unless the triggering effect's own broadcast happens to cover it. No expiry cue at all. | Add a **status diff** effect mirroring `:650-673`, over `myStatuses`/`oppStatuses`, emitting `status-applied` / `status-expired`. This is the single catch-all for Story 4 regardless of source. |
| 5 | Signature ability silent (no identity) | **a** | Identity IS shown: local via `describeSignatureEffect`/`signatureMoveName` (`:1476-1480`, `:1192-1196`); opponent via route (`pvp.live.$matchId.tsx:289-301`). Bot signature broadcasts via `apply_bot_pvp_signature_effect` (`20260706202620...:358-363`). Apparent silence = bot `post_answer` fire is gated on wiring + aggression roll (`live-pvp-battle-screen.tsx:1317-1324`, `pvp-bot.ts:119-126`) → infrequent; battle-start fires once (`:1258-1267`). | Route through `emit`; QA-verify. No logic fix expected. |
| 6 | No answer not scored incorrect | **b** | **Race.** The human personal-timeout submit (`:1246-1254`) fires at `questionStartRef + personalTimerMs`. When there is no speed modifier `personalTimerMs === QUESTION_SLOT_MS` (`:774-788`), and the shared **wall-clock ceiling** (`:832-842`) — keyed on `idx` from the shared clock, no `selected` dep — advances to the next slot at the same boundary and runs **first** (defined earlier, effect order), calling `enterQuestion` which resets `selected`/`questionStartRef`. The timeout then sees `Date.now() < newDeadline` and no-ops → the unanswered slot is **never submitted**, so it is neither scored nor counted. Bot side is unaffected (it always submits via `submitBotPvpMove`, `:1310`). | Make the wall-clock ceiling **resolve the current unanswered slot as incorrect before entering the next** (or have the ceiling itself call `resolveQuestion(cur, false, personalTimerMs)` when `selected === null`). Emit `answer-result{ noAnswer:true, correct:false }`. Then it feeds the §1 confused counter. |

---

## 2. Root-cause narrative

### 2a. The FX-cue gap (human path vs bot path)
- **Human cues come from two local sources.**
  1. **Acting-player inline toasts** — the player's own client toasts the moment it
     calls a server RPC: items `live-pvp-battle-screen.tsx:1367,1400`; manual signature
     `:1476-1480`; post-answer signature `:1192-1196`; type-ability fire-note `:1066-1069`;
     stat-stage diff catch-all `:650-673`.
  2. **Opponent broadcast toasts** — `pvp.live.$matchId.tsx:272-315`
     (`subscribeToLivePvpEffects`) reacts to `pvp_live_effects` INSERT rows, filtered
     `if (effect.sourceId === myId) return;` (`:275`), and resolves names locally.
- **The bot has no client**, so source (1) never runs for the bot. Bot cues rely
  entirely on source (2). Crucially, the bot RPCs the human's client drives **do**
  insert broadcast rows sourced as the bot:
  - `use_bot_pvp_live_item` → `source_id = v_match.guest_id` (`20260706202620...:451-452`)
  - `apply_bot_pvp_signature_effect` → `source_id = v_match.guest_id` (`:358-363`)
  - RLS `pvp_live_effects_select_participant` (`20260705000000...:98-105`) lets the
    host (human) SELECT guest-sourced rows; realtime respects it. So `sourceId !== myId`
    **passes** and the toast fires.
- **Conclusion:** the opponent-cue path is present and correctly wired. The real gaps
  are (i) missing **status-change** cues (§1 #4 — no status diff toaster / no expiry
  cue) and (ii) genuine **trigger rarity** (bot item < 45% HP; bot post-answer signature
  gated on aggression). The fix is to **standardise every cue through one `emit`**
  (frozen contract §3) so nothing depends on which incidental path changed the row, and
  to add the status diff toaster. Whether any *remaining* silence is a realtime-delivery
  failure is a **QA runtime question**, not a code defect visible in the source.

### 2b. No-answer scoring
- Two advance mechanisms exist: the **both-answered early advance** (`:844-864`, needs
  both `*_answered_live` counters past the index — never triggers when the human hasn't
  answered) and the **wall-clock ceiling** (`:832-842`, the hard slot boundary).
- The personal-timeout submit (`:1246-1254`) is meant to score a no-answer, but it only
  wins the race when `personalTimerMs < QUESTION_SLOT_MS` (a speed **debuff**). At default
  speed the deadlines coincide and the ceiling (earlier effect, no `selected` guard)
  advances first, orphaning the unanswered slot. This exactly reproduces "no-answer not
  scored," and it silently breaks the downstream 2-incorrect confused chain (§1 #1).

---

## 3. Frozen contract

**File (Architect-authored, frozen):** `src/lib/training-battle-fx-types.ts` (created with this doc).

One cue path both sides share: `EmitBattleFx = (event: BattleFxEvent) => void`.
`BattleFxEvent` is a discriminated union over `kind`:
`"item" | "type-ability" | "signature" | "status-applied" | "status-expired" | "answer-result"`,
each carrying `side: "self" | "opponent"`, `questionIndex`, and a `dedupeKey` (idempotency
so a bot effect arriving via both the broadcast and a row-diff toasts once). The UI/UX cue
module implements `emit` (wording, emoji, motion, and the Story 7 ordering/queue); **callers
never call `toast` directly.** See the file for full signatures.

Rules frozen here:
1. Every player-visible combat cue goes through `emit`. No new direct `toast.*` for items,
   abilities, statuses, or answer results.
2. `dedupeKey` convention: `` `${side}:${kind}:${questionIndex}:${discriminant}` `` (e.g.
   itemId / abilityId / partnerId / status).
3. `side` is always from the **local player's** POV (`opponent` = the bot in Training).

---

## 4. File-ownership split (disjoint)

The bulk of behaviour lives in **one** file (`live-pvp-battle-screen.tsx`). To parallelise
without collisions, that file + the route are **Frontend-only**; UI/UX owns the *presentation
module* Frontend imports; Backend owns the *pure libs*. Disjoint sets:

| Builder | Owns / touches (exact) | Not this file |
|---------|------------------------|---------------|
| **Database** | **NONE.** Confirm no schema/migration (see §8). | — |
| **Backend** | `src/lib/pvp-bot.ts` (client-side bot **confused** simulation helper: accuracy penalty while confused), `src/lib/pvp-live.ts` (only if a wrapper needs to surface effect metadata — expected none). Pure/testable helpers only. | must not edit the battle screen or route |
| **Frontend** | `src/components/live-pvp-battle-screen.tsx` (bot driver, `resolveQuestion`, **no-answer race fix** in the `:832-842` ceiling, **confused overlay** + consecutive-wrong counter, **status diff toaster**, replace inline `toast.*` with `emit`), `src/routes/pvp.live.$matchId.tsx` (route `subscribeToLivePvpEffects` → `emit` opponent events), `src/lib/store*` (only if a small battle-FX slice is needed) | must not edit the cue-presentation module or `styles.css` |
| **UI/UX** | `src/hooks/useBattleFxCues.ts` **(new)** — implements `EmitBattleFx`: toast wording/emoji + Story 7 queue/ordering; `src/components/game-ui.tsx` (`StatusEffectOverlay`/`ConfusionEffect` motion for the new confused overlay); `src/styles.css` (any cue tokens/motion) | must not edit the battle screen or route logic |

Shared, read-only for all: `src/lib/training-battle-fx-types.ts` (frozen §3).

---

## 5. Sequencing / parallelism

```
[Architect: freeze src/lib/training-battle-fx-types.ts]  ← DONE (the one serialization point)
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼                ▼
   Backend         UI/UX            Frontend (structural: race fix +
  (pvp-bot        (useBattleFxCues   confused counter + status diff)
   confused sim)   + overlay/tokens)  — can start against the frozen types
        └──────────────┼───────────────┘
                       ▼
        Frontend INTEGRATION pass: import Backend helper + UI/UX `emit`,
        replace inline toasts, wire route → emit. (last; depends on both)
```

- **Parallel:** Backend (`pvp-bot.ts`), UI/UX (`useBattleFxCues.ts` + overlay), and the
  Frontend **structural** fixes (no-answer race, consecutive-wrong counter) — all touch
  disjoint files and only depend on the frozen types.
- **Serialize (the one point):** everything depends on the frozen contract in §3, which is
  already produced. The only ordering constraint after that is the Frontend **integration
  pass** (swapping inline `toast.*` for `emit`, wiring the route) which must land after
  UI/UX's `useBattleFxCues` signature is real — but that signature is fixed by the frozen
  stub, so UI/UX and Frontend can develop concurrently and merge Frontend last.

---

## 6. Per-builder task list + Handoff stubs

### Database
- [ ] Confirm no table/column change and no migration (§8). Produce a one-line Handoff.
```
## Handoff — Database
- Status: done
- Produced: (no changes) confirmation only
- Next agent: code-reviewer
- Context: no schema/migration; confused is client-authoritative (§8)
- Open questions / risks: none
```

### Backend
- [ ] `pvp-bot.ts`: add a pure helper for **bot confusion** — while the bot is confused,
      reduce effective accuracy / roll a "miss" (mirror the human's 25% confusion miss at
      `live-pvp-battle-screen.tsx:908`), consuming one tick. Keep it deterministic given
      injected `rng`. Add a Vitest.
- [ ] Confirm no `pvp-live.ts` wrapper change is needed (effect rows already carry enough).
```
## Handoff — Backend
- Status: <fill>
- Produced: src/lib/pvp-bot.ts (+ test)
- Next agent: frontend
- Context: bot-confusion helper signature; called from the bot driver
- Open questions / risks: confused magnitude for the bot (accuracy penalty vs miss-roll)
```

### Frontend
- [ ] **No-answer fix (#6):** in the wall-clock ceiling (`:832-842`), before `enterQuestion`,
      if the current slot is unanswered (`selected === null`, not frozen), resolve it as
      incorrect (`resolveQuestion(cur, false, personalTimerMs)`) and emit
      `answer-result{ noAnswer:true }`.
- [ ] **Confused (#1):** add a consecutive-wrong ref (reset on correct) in `resolveQuestion`;
      at 2, apply a client-authoritative `confused` overlay for the acting side (merged into
      the displayed statuses so row-sync can't clobber it — §8) and `emit status-applied`.
      Wire the bot's confusion through Backend's helper. Emit `status-expired` on tick-out.
- [ ] **Status diff toaster (#4):** add an effect mirroring `:650-673` over `myStatuses`/
      `oppStatuses` → `emit status-applied` / `status-expired`.
- [ ] **Standardise cues (#2,#3,#5):** replace inline `toast.*` combat cues with `emit`;
      wire `pvp.live.$matchId.tsx:272-315` to `emit` opponent events (dedupe via `dedupeKey`).
```
## Handoff — Frontend
- Status: <fill>
- Produced: live-pvp-battle-screen.tsx, pvp.live.$matchId.tsx (+ store slice if used)
- Next agent: qa
- Context: which triggers emit which BattleFxEvent; confused overlay behaviour
- Open questions / risks: race-fix must not double-submit; dedupe correctness
```

### UI/UX
- [ ] `src/hooks/useBattleFxCues.ts` (new): implement `EmitBattleFx` — per-kind toast
      wording/emoji at **parity** with today's strings, plus a legible **queue/order** when
      several events land in one slot (Story 7).
- [ ] `game-ui.tsx` `StatusEffectOverlay`/`ConfusionEffect`: ensure the confused overlay
      renders for a client-authoritative confused overlay; `styles.css` tokens/motion.
```
## Handoff — UI/UX
- Status: <fill>
- Produced: src/hooks/useBattleFxCues.ts, src/components/game-ui.tsx, src/styles.css
- Next agent: frontend
- Context: emit() signature + queue semantics; confused overlay hook
- Open questions / risks: toast flooding when many effects resolve in one slot
```

---

## 7. Risks + QA testability

| Risk | Mitigation / test |
|------|-------------------|
| "Silence" is really rarity, not breakage (#2,#5) | QA: force a bot below 45% HP and a post-answer-wired Legendary; confirm the item/signature toast. Vitest can't cover realtime — needs a live Training battle on the Vercel preview. |
| No-answer race fix double-submits | Guard on `selected`/`finishedRef`; Vitest around `resolveQuestion` idempotency; Playwright: let a slot time out at default speed → assert scored incorrect + counter increments. |
| Client-authoritative confused clobbered by row-sync | Merge overlay into displayed statuses (don't write the row); unit-test the merge. |
| Cue flooding / lost toasts in one slot (Story 7) | UI/UX queue; test ordering with a multi-effect slot. |
| Regression to human PvP cues | `emit` reuses existing wording; opponent path unchanged in shape. Manual human-PvP smoke. |

**Testable stories:** #6 (no-answer→incorrect) and #1-confused via Vitest on `resolveQuestion`
+ the bot-confusion helper; #2-#5 cue **delivery** via Playwright/manual in a live Training
battle (realtime can't be unit-tested). This satisfies the spec DoD ("a Playwright/Vitest
check covers no-answer→incorrect and at least one cue path").

---

## 8. Migration verdict

**No table/column schema change. No migration required.**

- Items, signature abilities, type abilities and their statuses all resolve through the
  **existing** authoritative RPCs and the `pvp_live_effects` broadcast (all already shipped).
- The only new mechanic — **confused after 2 incorrect** — is modelled **client-authoritative**,
  which is consistent with the fact that the Training bot is *already fully client-simulated*
  (its correctness, timing, items and ability fires are all decided on the human's device;
  `pvp-bot.ts`, and the bot driver `live-pvp-battle-screen.tsx:1275-1336`). Confused is held as
  a local overlay merged into the displayed statuses and drives the existing confusion-miss
  roll (`:907-912`); it never needs to be written to the authoritative row, so no RPC/migration.
- **Fallback (only if the team wants confused on the authoritative row for exact chip parity):**
  a single additive SECURITY DEFINER function migration to apply an intrinsic self-status to a
  side. This is a *function* migration, still not a table/column schema change. **Not recommended**
  — it adds server surface for no gameplay benefit over the overlay. Flag to the requester if
  authoritative-row confusion is a hard requirement (ties to spec Open Q3).

---

## Handoff
- **Status:** done
- **Produced:**
  - `docs/handoffs/training-battle-fx/02-architecture.md` (this file)
  - `src/lib/training-battle-fx-types.ts` (frozen FX-event/cue contract, signatures only)
- **Next agent:** the three builders in parallel — **Backend** (`pvp-bot.ts`),
  **UI/UX** (`useBattleFxCues.ts` + overlay/tokens), **Frontend** (battle screen + route);
  Frontend integrates last. Then **QA**.
- **Context the next agent needs:**
  - Two real logic bugs: **#1 confused-after-2-incorrect absent** (`battle-screen.tsx:1033`
    is the Solo reference the live screen lacks) and **#6 no-answer race** at the wall-clock
    ceiling (`live-pvp-battle-screen.tsx:832-842` vs the timeout `:1246-1254`).
  - #2/#3/#5 cue infra is **already wired** (bot RPCs broadcast with `source_id = guest_id`;
    route `pvp.live.$matchId.tsx:272-315` toasts it) — standardise through `emit`, don't rebuild.
  - #4 needs a **status diff toaster** mirroring the stage one at `:650-673`.
  - Bot partner is **always Legendary/Mythical** → bot never has a type ability (#3 bot = N/A).
  - Everyone imports the frozen contract `src/lib/training-battle-fx-types.ts`; no direct
    `toast.*` for combat cues.
  - **No migration / no schema change** (§8); confused is client-authoritative.
- **Open questions / risks:**
  - Open Q3 (confused's exact effect): assumed = Solo's model (25% miss/tick, applied after 2
    consecutive wrong). Confirm with the requester if it differs.
  - Whether any residual bot-cue silence is a realtime-delivery failure vs trigger rarity is a
    **runtime/QA** question the source cannot settle.
