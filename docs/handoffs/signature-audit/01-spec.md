# 01-spec — Signature-ability behaviour audit: expiry, cooldown, gating & coverage

**Feature slug:** `signature-audit`
**Author:** Product Owner
**Date:** 2026-07-10
**Type:** Bug-fix + correctness batch (with one net-new mechanic)

---

## Problem statement

The owner reports that signature abilities "feel always-on": they appear to fire
before meeting their stated requirements, never cool down, and their stat buffs/debuffs
seem to stack for the entire battle. The owner also cannot see Legendary/Mythical
**type** abilities activating after a signature ability, and wants a definitive audit
of which of the 100+ signature abilities actually do anything.

A code investigation (attached as the full 104-row audit table artifact) **confirms
some concerns and corrects others**. This spec reflects the ground truth, so the team
fixes what is actually broken and only *validates* what already works:

- **Trigger gating already works.** Every structured trigger is evaluated at fire time
  (`postTriggerFires` / `hitTriggerHolds`, fed by `buildSigContext`). Plasma Fists
  (Zeraora, `fast_pair underMs 6000`) *cannot* fire before Q2 and only when both prior
  answers were correct and each under 6s. The "fires on Q1" report is not reproducible
  at the gate. → Treat as **validation**, not a fix. One real gap: opponent-reactive
  triggers (`opponent_correct` / `opponent_wrong`) read a context field
  `buildSigContext` never sets, so all but one bespoke ability ignore those triggers.
- **Stat stages never expire — this is the real root cause** of "always active / compounds
  all battle." The catalog `duration` (number / `"passive"` / `"one_hit"`) is metadata
  only; the server stage helper `_pvp_bump_stage` has no expiry, so bumps persist for the
  whole match and compound to the ±3 clamp. Only `"one_hit"` effects avoid this (folded
  into the current damage calc, never a persistent stage). This is server-authoritative
  (Supabase stage jsonb). **This is the CORE fix.**
- **No cooldown exists** between successive fires. The often-cited migration is only a
  per-question-index *replay guard*, not a throttle. A generic cooldown is a **new mechanic**.
- **Dual type-ability already works** (post-fix): the type-ability block is ungated and uses
  independent server cursors + row-lock, so it does not collide with the signature RPC.
  Where it "looks not activated," the cause is (a) only 18 type-ability ids have seeded
  server catalog rows (the rest are no-ops by **data**), and/or (b) the non-expiring
  stat compounding masking the small type-ability bump. A stale/misleading "mutually
  exclusive" header comment also survives in a migration and should be corrected.
- **Coverage:** of 104 signature entries, **76 fire, 5 are partial, 23 do nothing**
  (unimplemented bespoke / help / manual effects). The owner wants this in a table.

## Goal / success

The owner can trust that (1) each signature ability fires only when its requirement is
met, (2) stat effects expire on schedule instead of compounding, (3) effects respect a
cooldown, (4) Legendary/Mythical type abilities are visibly active after a signature fires,
and (5) a single table states, per ability, whether it works.

---

## In scope

- **Stat-stage expiry** on the server (honor catalog `duration`; decay + re-arm) plus client
  stat-chip display of remaining duration — for **both** sides.
- **Signature-effect cooldown** — a new, generic min-spacing mechanic between successive fires
  (design parameters gated on Open Q1).
- **Trigger-gating validation** — regression tests + a live repro proving fire-time gating is
  correct; and closing the opponent-reactive context gap so `opponent_correct` / `opponent_wrong`
  triggers evaluate for all abilities, not just the one bespoke observer.
- **Type-ability coverage** — expand the seeded server catalog rows beyond the current 18 so
  Legendary/Mythical type abilities are not silent no-ops; correct the stale "mutually
  exclusive" migration comment.
- **The audit table deliverable** — publish the 76 / 5 / 23 per-ability status table as an
  artifact in this handoff folder.

## Out of scope

- **Implementing the 23 unimplemented bespoke abilities** (Celebi, Jirachi, Arceus, etc.) and
  the 5 partials — these are a separate backlog (see Open Q3); not this batch unless the owner
  says otherwise.
- New signature abilities or new effect *types* — this is correctness, not new content.
- Rebalancing effect magnitudes, durations, or the economy (beyond honoring existing catalog values).
- Reworking human-vs-human vs bot FX parity (owned by the `training-battle-fx` batch).
- Any migration that is not additive/reversible; never edit a shipped migration.

---

## User stories & acceptance criteria

Given/When/Then criteria are the sign-off contract. "Both sides" = local player and opponent
(human or bot). "Stage" = a persistent server-side stat modifier.

### Story 1 — Stat effects expire on schedule (CORE)
As a player, I want a signature's stat buff/debuff to wear off after its stated duration,
so that effects don't silently compound for the whole battle.
- **Given** a signature applies a stat change with a numeric `duration` of N questions,
  **When** N questions have resolved after it fired, **Then** that stage is removed and the
  stat returns toward baseline (net of any other active stages), for either side.
- **Given** the same effect fires again while still active, **When** it re-fires, **Then** it
  **re-arms** (resets its remaining duration / refreshes to the catalog value) rather than
  stacking a second permanent bump — and the total stays within the existing ±3 clamp.
- **Given** an effect marked `"one_hit"`, **When** it resolves, **Then** it applies to that
  single hit only and never becomes a persistent stage (current behaviour preserved).
- **Given** an effect marked `"passive"`, **When** it fires, **Then** it applies for the
  duration defined by Open Q2 (default TBD) — not silently forever unless the owner confirms
  "passive = whole battle by design."
- **Given** any active stat stage, **When** the stat chips render, **Then** the chip reflects
  the current (post-expiry) value; remaining duration is surfaced per Open Q5.
- **Priority: Must. Milestone: M1.**

### Story 2 — Signature effects respect a cooldown (new mechanic)
As a player, I want a signature ability to wait a set spacing before it can fire again,
so that a met trigger can't re-fire every single question.
- **Given** a signature ability has fired, **When** its trigger is met again before the
  cooldown elapses, **Then** it does **not** fire and (optionally) surfaces a "on cooldown"
  state per Open Q1.
- **Given** the cooldown has fully elapsed, **When** the trigger is next met, **Then** the
  ability fires normally.
- **Given** an ability whose trigger *type* already spaces fires (e.g. `cooldown` / `every_nth_*`),
  **When** the new generic cooldown also applies, **Then** the interaction is defined and
  deterministic (no double-suppression surprise) per Open Q1.
- **Priority: Must (mechanic) / design gated on Open Q1. Milestone: M1 if Q1 answered in time; else M2.**

### Story 3 — Trigger gating is provably correct (validation)
As the owner, I want proof that abilities fire only when their requirement is met,
so that the "fires too early" worry is settled with evidence, not vibes.
- **Given** Plasma Fists (`fast_pair underMs 6000`), **When** Q1 resolves, **Then** it does
  **not** fire; **When** Q2 resolves with both prior answers correct and each under 6s,
  **Then** it fires exactly once.
- **Given** a representative sample across trigger families (streak, threshold, fast-pair,
  every-nth, opponent-reactive), **When** each condition is / isn't met, **Then** automated
  regression tests assert fire / no-fire correctly.
- **Given** an `opponent_correct` / `opponent_wrong` trigger, **When** the opponent answers,
  **Then** the runtime context now carries the opponent's result and the trigger evaluates
  (closing the current gap where only one bespoke observer works).
- **Priority: Must (validation + opponent-ctx fix). Milestone: M1.**

### Story 4 — Legendary/Mythical type abilities are visibly active
As a player, I want a Legendary/Mythical's **type** ability to take effect after its signature,
so that the mon isn't quietly missing half its kit.
- **Given** a Legendary/Mythical whose type-ability id has a seeded server catalog row,
  **When** its condition is met, **Then** the type-ability effect applies independently of
  the signature (no collision) and is reflected in state.
- **Given** the currently-unseeded type-ability ids, **When** coverage is expanded, **Then**
  those abilities produce a real effect instead of a silent no-op (target coverage set with
  the Architect; the full list is in the audit artifact).
- **Given** Story 1 ships, **When** a small type-ability bump applies, **Then** it is no longer
  masked by a non-expiring signature stage.
- **Given** the codebase, **When** reviewed, **Then** the stale "mutually exclusive" migration
  header comment is corrected to reflect that signature + type abilities coexist.
- **Priority: Must (confirm + de-mask + comment) / Should (breadth of new seeded rows). Milestone: M1.**

### Story 5 — Per-ability audit table
As the owner, I want one table showing every signature ability and whether it works,
so that I know exactly what's live, partial, or dead.
- **Given** the 104 signature entries, **When** the audit publishes, **Then** a table lists
  each with status **Working (76) / Partial (5) / Not working (23)** and a one-line reason.
- **Given** the 5 partials and 23 non-working, **When** listed, **Then** each is tagged with its
  root cause (e.g. client no-op, unimplemented bespoke) and a backlog disposition.
- **Priority: Must. Milestone: M1 (table is a doc deliverable; the artifact already exists from investigation).**

---

## Priority (MoSCoW)
- **Must:** Story 1 (stat expiry — the headline fix), Story 3 (gating validation + opponent-ctx),
  Story 4 core (confirm + de-mask + comment fix), Story 5 (audit table). Story 2 mechanic
  (design gated on Q1).
- **Should:** Story 4 breadth (expand seeded type-ability rows), cooldown "on cooldown" UI cue.
- **Could:** implement the 5 partials; a per-slot "effect log."
- **Won't (now):** implementing the 23 unimplemented bespoke abilities (separate backlog, Open Q3);
  new abilities; rebalancing.

## Milestones
- **M1 (this batch):** Story 1, Story 3, Story 4 (core), Story 5, and Story 2 if Open Q1 is
  answered in time. Ships as a fix batch (server migration + client display + tests).
- **M2 (follow-up):** Story 2 if Q1 lands late; Story 4 breadth; the "Could" items.

---

## Definition of Done
- All Must acceptance criteria pass on the Vercel preview, verified in a live battle.
- A bumped stat stage **decays after its `duration`** and re-fires **re-arm** instead of
  compounding; `"one_hit"` and `"passive"` semantics behave per Story 1 (and Open Q2).
- Stat chips reflect post-expiry values for both sides.
- Cooldown (if in M1) demonstrably blocks a re-fire within the window and allows it after.
- Trigger-gating regression tests are green (fire / no-fire across trigger families), and the
  Plasma-Fists live repro confirms no Q1 fire.
- `opponent_correct` / `opponent_wrong` triggers evaluate for all abilities, not just the bespoke one.
- Legendary/Mythical type abilities with seeded rows visibly apply; the stale migration comment is fixed.
- The 76 / 5 / 23 audit table is published in `docs/handoffs/signature-audit/`.
- Migration is additive/reversible; RLS/`SECURITY DEFINER` least-privilege preserved; server
  inputs validated (zod). `tsc` + Vitest green; new tests cover expiry + gating.
- No regression to existing working signature or type-ability effects.

## Open questions (for Architect / owner — these gate the Architect)
1. **Cooldown length & scope (Story 2):** a single global min-questions-between-fires? per-ability?
   And how does it interact with abilities whose trigger *type* already spaces fires
   (`cooldown` / `every_nth_*`) — does the generic cooldown stack, or defer to the trigger type?
2. **`"passive"` duration default (Story 1):** honor numeric `duration` values as-is; but what is
   the default expiry for effects marked `"passive"` — permanent-by-design (whole battle), or a
   default N? Owner to confirm.
3. **The 23 unimplemented bespoke abilities:** fix now, backlog, or leave as intentional no-ops?
   (One, Cosmog, is an intentional joke no-op.) Default assumption: **backlog**, out of this batch.
4. **Trigger gating (Story 3):** since gating already works at the gate, is the owner satisfied
   with *validation* (tests + live repro) plus the opponent-ctx fix, rather than a "fix" for a
   non-bug? Confirm so the Architect doesn't over-scope.
5. **Expiry visibility (Story 1):** should the stat chip show remaining duration (e.g. a countdown
   / "2 left" badge), or is silent correct-value display sufficient for M1?

---

## Handoff
- **Status:** done
- **Produced:** `docs/handoffs/signature-audit/01-spec.md` (+ the 104-row audit table artifact,
  to be attached in this folder by the orchestrator).
- **Next agent:** solution-architect
- **Context the next agent needs:**
  - **Headline fix = stat-stage expiry.** `duration` is metadata only; server `_pvp_bump_stage`
    never expires, so bumps persist all battle and compound to ±3. Server-authoritative
    (Supabase stage jsonb) → needs a DB/backend change (per-stage expiry question-index + tick
    down each question, with re-arm on re-fire) **plus** client stat-chip display. `"one_hit"`
    stays a folded single-hit calc; `"passive"` default is Open Q2.
  - **Cooldown is net-new** (Story 2) — not the existing per-question replay guard. Design gated
    on Open Q1 (length, scope, interaction with `cooldown`/`every_nth_*` trigger types).
  - **Gating already works** — Story 3 is *validation* (regression across trigger families +
    Plasma-Fists live repro), plus close the opponent-reactive context gap so
    `opponent_correct` / `opponent_wrong` evaluate for all abilities (only one bespoke observer
    works today because `buildSigContext` never sets the opponent-result field).
  - **Type abilities already coexist** with signatures (independent cursors + row-lock, ungated
    block). Silence is by **data** (only 18 seeded server rows) and/or **masking** by the
    non-expiring stages (Story 1 unmasks). De-mask + expand seeded rows + fix the stale
    "mutually exclusive" migration header comment.
  - **Coverage:** 76 working / 5 partial / 23 not-working. Partials = client no-op effects
    (scramble/hamper/highlight/force-mistap/ignore-Def). Non-working = unimplemented bespoke /
    help / manual. The 23 are a **backlog** (Open Q3), not this batch by default.
  - Investigation pointers (Architect to confirm, not gospel): `src/lib/signature-abilities.ts`
    (`postTriggerFires`, `hitTriggerHolds`, trigger eval), `src/lib/signature-bespoke.ts`
    (unimplemented bespoke), `src/components/live-pvp-battle-screen.tsx` (`buildSigContext`,
    type-ability block, client no-op handlers), the `_pvp_bump_stage` stage helper migration,
    and the type-ability seed migration (18 rows + stale comment).
  - Migrations must be additive/reversible; do not edit shipped migrations.
- **Open questions / risks:** 5 above. Biggest risk: over-scoping Story 3 into a "fix" for a
  non-bug (Open Q4), and the expiry change is server-authoritative — get the tick/re-arm and the
  `"passive"` default (Open Q2) right before touching client display.
