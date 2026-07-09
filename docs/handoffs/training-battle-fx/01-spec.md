# 01-spec — Training / Nearby-Battle combat FX & no-answer scoring

**Feature slug:** `training-battle-fx`
**Author:** Product Owner
**Date:** 2026-07-09
**Type:** Bug-fix batch (feedback + correctness)

---

## Problem statement

In **Training** (and **Nearby Battle**) — i.e. any battle against a bot opponent —
the combat effect system fires silently and, in places, may not fire at all.
Players get no feedback for items, type abilities, statuses, or signature
abilities, so the battle feels broken and opaque: things change on-screen with no
explanation of *what* happened or *why*. Separately, a slot where a player (human
or bot) submits **no answer** is not being scored as incorrect, which corrupts
match fairness and the whole FX chain that depends on right/wrong outcomes.

The human-vs-human PvP path reportedly shows these cues correctly; the bot/opponent
path does not mirror them. The core requirement is: **every combat effect must be
both *applied correctly* and *announced* (toast + visual cue), for both sides,
in bot battles — at parity with human PvP.**

## Goal / success

A player in Training can, at all times, tell what just happened and to whom:
which item was used, which ability/status/signature triggered, what it does, and
whether each side answered correctly (including "no answer" = incorrect).

---

## In scope

- Training and Nearby Battle (bot opponent) battle screen only.
- Feedback (toast + visual cue) for: **items, type abilities, statuses, signature abilities** — for **both** the local player and the bot/opponent.
- Verifying the underlying **effect resolution** actually works (not only the missing cue): type abilities, and statuses such as **confused** after 2 incorrect.
- **No-answer = incorrect** scoring for both sides, and the FX that depends on it.

## Out of scope

- Human-vs-human PvP feedback (treated as the reference/source of truth; only touch it if it's shared code the fix flows through).
- New abilities, items, statuses, or signature effects — this is fix-to-parity, not new content.
- Rebalancing existing effect values/economy.
- Any schema change unless the Architect proves one is required (default: none expected).

---

## User stories & acceptance criteria

Given/When/Then criteria are the sign-off contract. "Opponent" = bot in Training/Nearby.

### Story 1 — Effects actually resolve (correctness)
As a player in Training, I want type abilities and statuses to actually take effect,
so that battles play by the real rules and not a broken subset.
- **Given** a type ability's trigger condition is met, **When** the slot resolves, **Then** the ability's effect is applied to the correct target and reflected in state (HP/score/modifier), for either side.
- **Given** a player answers **incorrectly twice** (the "confused" trigger), **When** the second incorrect resolves, **Then** the **confused** status is applied and its documented behaviour is active on the next slot, for either side.
- **Given** any status is active, **When** it should tick/expire, **Then** it does so per its rules.
- **Priority: Must. Milestone: M1.**

### Story 2 — Item usage is announced
As a player, I want a clear cue when either side uses an item, so I know what was consumed and its effect.
- **Given** the local player or the opponent uses an item, **When** it takes effect, **Then** a toast names **who** used **which** item and **what it did**, plus a visual cue on the battle screen.
- **Given** the opponent (bot) uses an item, **Then** the cue is shown at parity with the local player's item cue (same clarity, correct attribution).
- **Priority: Must. Milestone: M1.**

### Story 3 — Type ability activation is announced
As a player, I want a cue when a type ability activates, so I'm not surprised by a silent state change.
- **Given** a type ability activates for either side, **When** it applies, **Then** a toast + visual cue name the ability and its effect and attribute it to the correct side.
- **Priority: Must. Milestone: M1.**

### Story 4 — Status changes are announced
As a player, I want a cue whenever a status is applied/removed, so I understand altered behaviour (e.g. why I'm confused).
- **Given** a status (e.g. **confused**) is applied to either side, **When** it lands, **Then** a toast + visual cue name the status, its target, and its effect/duration.
- **Given** a status expires, **Then** its removal is indicated (cue and/or cleared visual indicator).
- **Priority: Must. Milestone: M1.**

### Story 5 — Signature ability activation is announced
As a player, I want a cue when a signature ability fires, so I know it activated, whose it was, and what it does.
- **Given** a signature ability triggers for either side, **When** it activates, **Then** a toast + visual cue name the signature ability, identify **whose** it is, and describe its effect.
- **Priority: Must. Milestone: M1.**

### Story 6 — No answer counts as incorrect
As a player, I want an un-answered slot to count as incorrect, so scoring and every wrong-answer-triggered effect are fair.
- **Given** the local player or the opponent submits no answer before the slot timer expires, **When** the slot resolves, **Then** that side is scored **incorrect** (identically to an actively wrong answer).
- **Given** a no-answer resolves as incorrect, **Then** all downstream effects that depend on an incorrect result fire (e.g. it counts toward the 2-incorrect **confused** trigger in Story 1).
- **Priority: Must. Milestone: M1.**

### Story 7 — Cross-cutting feedback consistency (non-functional)
As a player, I want all bot-side cues to match human-side cues in style and timing, so the battle reads consistently.
- **Given** any of Stories 2–5 fire for the opponent, **Then** the toast/visual style, position, and duration match the local-player equivalent (parity, not a second-class variant).
- **Given** multiple effects resolve in one slot, **Then** their cues are ordered/queued legibly (no lost or overlapping toasts).
- **Priority: Should. Milestone: M1 (fold in if cheap; else M2).**

---

## Priority (MoSCoW)
- **Must:** Stories 1–6 (correctness + all four cue types + no-answer scoring).
- **Should:** Story 7 (consistency/queueing polish).
- **Could:** short "effect log" of what happened this slot. *(Backlog, not this batch.)*
- **Won't (now):** new effects, rebalancing, human-PvP-only enhancements.

## Milestones
- **M1 (this batch):** Stories 1–6. Ships as one fix PR (bug-fix batch).
- **M2 (optional):** Story 7 if not folded into M1; the "Could" effect log.

---

## Definition of Done
- All Must acceptance criteria pass on the Vercel preview, verified in a live Training battle.
- Both **local player and bot** trigger correct cues for items, type abilities, statuses, signature abilities.
- **Confused** verifiably applies after 2 incorrect (including no-answer as one of them) and changes behaviour.
- No-answer scores as incorrect for both sides and feeds downstream FX.
- No regression to human-vs-human PvP feedback.
- `tsc` + Vitest green; a Playwright/Vitest check covers no-answer→incorrect and at least one cue path.
- Docs updated only if player-facing behaviour is newly documented.

## Open questions (for Architect / requester)
1. Is the human-PvP cue path the same code the bot path *should* reuse, or a separate branch that must be brought to parity? (Likely a single shared FX layer — Architect to confirm.)
2. Bug 1 says effects "not working properly" — is it (a) effect never applied, (b) applied but wrong target/value, or (c) applied silently? Architect to classify per effect type during design; each needs the right fix, not just a toast.
3. Confused behaviour: what is its exact documented in-battle effect (e.g. chance to mis-answer, skipped turn)? Needed so Story 1/4 criteria are objectively testable.
4. When several effects resolve in one slot, is there an existing intended order? (Feeds Story 7.)
5. Do items/abilities already emit structured events the UI can subscribe to, or does the bot path bypass that emitter? (Root-cause hypothesis: bot driver mutates state directly without emitting the FX event.)

---

## Handoff
- **Status:** done
- **Produced:** `docs/handoffs/training-battle-fx/01-spec.md`
- **Next agent:** solution-architect
- **Context the next agent needs:**
  - Scope = Training/Nearby (bot) battles only; bring bot-side FX to parity with human PvP.
  - 6 Must stories: effect correctness (1), item/type-ability/status/signature cues (2–5), no-answer=incorrect (6). Story 7 = Should.
  - Two distinct problem classes: **silent-but-working** (needs cue) vs **not-working** (needs fix) — classify each effect (open Q2).
  - Root-cause hypotheses from prior triage (verify, don't assume): bot driver applies effects without emitting the FX/toast event; no-answer likely a timeout handler that never submits an incorrect result.
  - Prior triage pointers (Architect to confirm, not gospel): `src/components/live-pvp-battle-screen.tsx` (bot driver ~1265–1354), `src/lib/pvp-bot.ts`, `src/lib/pvp-combat.ts`, `src/routes/pvp.live.$matchId.tsx`.
  - Expect **no schema change**; prove otherwise before adding a migration.
- **Open questions / risks:** 5 above; biggest risk is Q2 (some bugs are logic, not just missing UI) — don't ship toasts over a broken effect.
