# 01-spec — Signature-ability rework: generalized combat mechanics

**Feature slug:** `signature-rework`
**Author:** Product Owner
**Date:** 2026-07-10
**Type:** Engine rework + data re-authoring (multi-milestone)

---

## Problem statement

The owner has redefined the signature abilities in a new authoritative table
(`docs/handoffs/signature-rework/00-owner-spec.md`, 71 rows so far, Gen I → Blacephalon).
The redefinition is not a value tweak — it introduces **new trigger types**, a new
**disable/expiry column** (mislabelled "Cooldown"), a **stacking-with-cap** stat model,
**decaying buffs**, **conditional damage multipliers**, **phase windows**, and a set of
**bespoke effects**, most of which the current engine does not model.

The current engine (per `docs/handoffs/signature-audit/00-coverage-audit.md`) has three
gaps that this rework directly targets:
1. **Stat stages never expire** — `_pvp_bump_stage` persists a clamped ±3 delta with no
   duration or tick-down, so any buff is permanent and re-stacks each fire. The new spec
   requires *conditional expiry* ("disable after N incorrect") and *decay* ("-1 per following
   question"), neither of which exists.
2. **No throttle / disable mechanic** — the only spacing today is the trigger TYPE plus ad-hoc
   bespoke gates. The owner's new "Cooldown" column is a first-class disable condition.
3. **Reactive opponent triggers are dead in the generic path** (`opponent_correct` /
   `opponent_wrong` never set on the context); the new spec adds *more* reactive triggers
   ("if opponent triggers a signature ability", "if opponent uses an item").

**The engine is the deliverable.** The roster is partial (owner still owes the remaining
Legendary/Mythical rows), and per-ability data is filled incrementally. So this spec
formalizes the **generalized mechanics** the 71 abilities are built from; individual
abilities are just data rows once the mechanics exist. Everything is server-authoritative
today (stages/HP/statuses via Supabase RPCs), so all of this is DB/backend work, not
client-only.

## Goal / success

A single, server-authoritative mechanics vocabulary — triggers, stat-change model,
disable/expiry model, conditional multipliers, phase windows, and a catalogue of bespoke
effects — such that **any** of the 71 (and the pending) abilities can be expressed as data
against that vocabulary, behaves identically for both sides (human PvP and bot Training/Nearby),
and its effects apply *and* expire exactly as the owner's table specifies.

---

## In scope

- A normalized **trigger vocabulary** covering every trigger in the owner table, including
  the new ones.
- A **stat-change model** supporting: stack-up-to-cap ramps, one-shot ("does not stack"),
  and decaying buffs.
- A **disable / expiry model** for the new "Cooldown" column (the core of the rework):
  disable-after-N-incorrect, disable-increase-only, disable-damage-multiplier / healing,
  after-inflicting-X-next-question-disabled, once-per-battle, disable-effect-after-3-incorrect,
  applied-only-on-selected-questions, and the compound "after N incorrect OR after 3 questions".
- **Conditional damage multipliers** by opponent type and by specific opponent species.
- **Phase windows** (first-N-questions damage%, then xM on question N+1) and fixed-question
  effects (e.g. Giratina 2nd/12th).
- A **bespoke-effects catalogue**: HP-fraction damage, flat next-question damage, lifesteal,
  revive, cure, disable-opponent-ability, item lockout, choice elimination, predicted-status
  reveal, copy-opponent-ability, reflect-opponent-stat, use-opponent-item.
- Applying the model **identically to bot and human sides**.
- Re-authoring the 71 transcribed rows against the new vocabulary (data), gated behind the
  engine milestone.

## Out of scope

- The remaining **non-transcribed** Legendary/Mythical rows (Zeraora/Meltan/Melmetal +
  Gen VIII/IX) — pending from the owner; data lands when supplied. The engine must not assume
  a complete roster.
- **Type abilities** except where the disable/expiry model is shared (they are covered by the
  audit's separate finding: only 18 seeded rows; tracked elsewhere).
- Economy / rarity / matchmaking rebalancing.
- Reworking the trigger-gating machinery that already works (`postTriggerFires` /
  `hitTriggerHolds`) beyond adding the new trigger types.
- New UI beyond the toast/visual cues already required by the `training-battle-fx` batch
  (that batch owns feedback parity; this spec owns the *mechanics* being announced).

---

## User stories & acceptance criteria

Given/When/Then are the sign-off contract. "Opponent" = the other side (bot in
Training/Nearby, human in PvP). All criteria must hold for **both sides**.

### Story 1 — Trigger vocabulary (normalized, both sides)
As the engine, I want every trigger in the owner table mapped to a named, server-evaluable
type, so that abilities fire exactly when their condition holds.
- **Given** `N correct in a row` (N=3 or 5), **When** a side reaches an unbroken streak of N
  correct, **Then** the trigger fires; **And** an incorrect answer resets the streak toward N.
- **Given** `start of battle`, **When** the battle initializes, **Then** the trigger fires once
  before Q1 resolves.
- **Given** `every question`, **When** each question resolves, **Then** the trigger fires that
  question.
- **Given** `every even` / `every odd question`, **When** a question of the matching parity
  resolves, **Then** the trigger fires (confirm 1-indexed — see OQ7).
- **Given** `on the Nth question` (and `Nth and Mth`), **When** that question index resolves,
  **Then** the trigger fires only on those indices.
- **Given** `if self inflicted-by-status OR HP < 50%`, **When** either self-condition becomes
  true at resolution, **Then** the trigger fires (reactive self-condition — NEW).
- **Given** `if opponent triggers a signature ability`, **When** the opponent's signature fires,
  **Then** this trigger fires in response (reactive-to-opponent — NEW; the audit notes the
  generic opponent-reactive path is currently dead and only one bespoke ability works).
- **Given** `if HP reaches 0`, **When** a side's HP would hit 0, **Then** the revive hook fires
  before faint is finalized (NEW).
- **Given** `if opponent uses an item`, **When** the opponent consumes an item, **Then** this
  trigger fires in response (NEW).
- **Priority: Must. Milestone: M1.**

### Story 2 — Stat-change model (ramp / one-shot / decay)
As the engine, I want three stat-change behaviours, so buffs grow, hold, or fade per the table.
- **Given** `stacks up to 3 per correct after the trigger` (ramp), **When** the trigger fires
  and each **subsequent correct** resolves, **Then** the stat gains +1 each correct up to a
  cap of **3** (whether the trigger fire grants stack #1 is OQ2). Example: Diamond Storm
  (+Def ramp) → after trigger, correct→correct→correct = +1,+2,+3, then holds at +3.
- **Given** `does not stack` (one-shot), **When** the trigger fires, **Then** the stat changes
  once and re-fires do not add further stacks. Example: Necrozma +1 Atk stays +1.
- **Given** a **decaying buff** (`+X now, then -1 per following question, decrease is stacking`),
  **When** the trigger fires, **Then** the stat is set to +X immediately, and each following
  question subtracts 1 cumulatively. Example: Deoxys +3 Atk → +3, then +2, +1, 0, -1…
  (floor / interaction with the ±3 clamp is OQ4).
- **Given** any of the above, **When** applied, **Then** the resulting stage still respects the
  global ±3 clamp unless the owner rules otherwise (OQ4).
- **Priority: Must. Milestone: M1.**

### Story 3 — Disable / expiry model (the new "Cooldown" column) — CORE
As the engine, I want each disable condition in the "Cooldown" column to actually disable the
right part of the ability at the right time, because non-expiry is the headline bug this rework
fixes.
- **Given** `disable stat change after N incorrect answers` (N=1 or 2), **When** the side
  reaches N qualifying incorrect answers, **Then** the ability's stat-change portion is disabled
  per the resolved semantics (revert / freeze / disable-whole — **OQ1**). Cumulative-vs-consecutive
  counting and re-enable-on-retrigger are also **OQ1**.
- **Given** `disable increase only` (Deoxys/Magearna), **When** N incorrect is reached, **Then**
  only the increase portion stops; the decay portion continues (confirm — OQ1).
- **Given** `disable damage-multiplier after 1 incorrect` (Articuno), **When** the first incorrect
  resolves, **Then** the conditional damage multiplier no longer applies.
- **Given** `disable healing after 3 questions from trigger` (Suicune), **When** 3 questions have
  passed since the trigger, **Then** the heal stops.
- **Given** `after inflicting X, next question it is disabled` (Mewtwo/Entei/Jirachi), **When** the
  effect X resolves, **Then** the ability is disabled for exactly the following question, then
  behaviour resumes (confirm resume vs one-shot — OQ1).
- **Given** `once per battle only`, **When** the effect has fired once, **Then** it cannot fire
  again this battle.
- **Given** `disable effect after 3 incorrect answers` (Mesprit/Azelf/Xerneas), **When** the side
  reaches 3 incorrect, **Then** the whole effect is disabled.
- **Given** `applied only on selected questions` (Giratina), **When** the question is not a
  selected index, **Then** the effect does not apply (no separate disable).
- **Given** the compound `disable after 1 incorrect OR after 3 questions` (Moltres), **When**
  either condition is first met, **Then** the ability disables.
- **Given** a **blank** disable cell (Arceus, Yveltal, Hoopa, Marshadow), **Then** the effect has
  no disable condition — confirm truly permanent all battle (**OQ5**).
- **Priority: Must. Milestone: M1.**

### Story 4 — Conditional damage multipliers
As the engine, I want damage multipliers that depend on the opponent, so matchup abilities work.
- **Given** `if opponent is [Type] xN` (e.g. Articuno x2 vs Water, Rayquaza x3 vs Kyogre/Groudon),
  **When** the opponent has that type, **Then** the multiplier N applies to the relevant damage;
  otherwise no multiplier.
- **Given** `if opponent is [specific mon] xN` (Kyogre↔Groudon, Dialga↔Palkia, Reshiram↔Zekrom,
  Solgaleo↔Lunala), **When** the opponent is that species, **Then** xN applies.
- **Given** `if opponent is [Type] xN; if not, [stat buff]` (Zygarde), **When** the condition
  fails, **Then** the fallback stat buff applies instead.
- **Given** any multiplier, **Then** it applies to the correct damage source (answer-damage vs
  effect-damage — **OQ6**).
- **Priority: Must. Milestone: M1 (model) · M2 (per-mon data).**

### Story 5 — Phase windows & fixed-question effects
As the engine, I want time-boxed damage phases keyed to question index, so charge-up abilities work.
- **Given** `first N questions damage → X%, then xM on question N+1` (Poipole 5→x3, Naganadel
  3→x2, Cosmog 3→½HP, Type:Null/Silvally/Stakataka, Regigigas q4, Xerneas q2), **When** the
  question index is ≤ N, **Then** outgoing damage is scaled to X%; **When** it is N+1, **Then**
  the payoff multiplier / effect applies.
- **Given** a fixed-index effect on specific questions (Giratina: 1st/11th receive 0 damage,
  2nd/12th deal x2; Blacephalon: Q1 x5, 2nd-to-last x75%), **When** that index resolves, **Then**
  the effect applies only there.
- **Given** all fixed-index / phase logic, **Then** it assumes a known fixed battle length —
  confirm battles are fixed-length e.g. 20 questions (**OQ7**).
- **Priority: Must. Milestone: M2.**

### Story 6 — Bespoke / special effects catalogue
As the engine, I want a catalogue of special effects the abilities reference, so non-stat effects work.
Each effect must apply and be announced (cue parity owned by `training-battle-fx`).
- **HP-fraction damage:** halve current HP (Tapu ×4, Cosmog); random 1–10% HP per question
  (Arceus); 12.5% per turn for 5 turns (Heatran). *Partially wired today (Chi-Yu frac-HP is a
  NO in the audit; Heatran uses Bad Poison as a proxy).*
- **Flat next-question damage:** +20 on next question (Jirachi). *NEW — audit lists Jirachi as NO
  (no delayed-strike impl).*
- **Lifesteal heal:** heal by a % of damage dealt (Yveltal 75%). *Yveltal drain partially wired.*
- **Revive:** revive at 25% HP + cure + buff when HP hits 0 (Ho-Oh). *Already server-wired.*
- **Cure / full heal:** remove status ± heal (Suicune, Cresselia to 100%). *Cresselia/Suicune wired.*
- **Disable opponent ability:** Celebi, Solgaleo, Lunala. *Suppress-ability exists (Heatran/Zygarde/
  Regieleki); Celebi is currently NO.*
- **Item lockout:** restrict opponent items all battle (Mesprit). *NEW.*
- **Choice elimination:** remove 1–3 answer options on selected questions (Azelf). *Help-mode path
  exists but is a client no-op today (NO).*
- **Predicted-status reveal:** show a predicted status at 100% HP, apply it if opponent < 50% (Uxie).
  *NEW behaviour; Uxie currently NO.*
- **Copy-opponent-ability:** Mew Transform. *Already bespoke-wired (resolveMewTransform).*
- **Reflect / negate opponent stat effect:** Manaphy ×(-1). *Swap-stages handler exists; ×(-1)
  semantics differ — confirm.*
- **Use-opponent-item:** Marshadow applies the opponent's used item effect to self. *NEW; audit
  lists Marshadow as NO.*
- **Priority: Must for the model; per-effect delivery split across M2/M3 by the Architect.**

---

## Priority (MoSCoW)
- **Must:** Stories 1–3 (trigger vocabulary, stat-change model, disable/expiry model) — the
  generalized engine. Story 6's *model* (a bespoke-effect contract) is Must; individual bespoke
  effects are Should.
- **Should:** Stories 4–5 (conditional multipliers, phase windows) as reusable model; the
  higher-value bespoke effects (revive, lifesteal, cure — already partly wired).
- **Could:** the harder bespoke effects (Uxie predicted-status, Azelf choice elimination,
  Mesprit item lockout, Marshadow use-item) as they need new UI/DB surface.
- **Won't (now):** the pending non-transcribed roster rows; type-ability seeding (tracked
  separately); any economy/rarity change.

## Milestones
- **M1 — Engine core.** Trigger vocabulary (Story 1), stat-change model (Story 2), disable/expiry
  model (Story 3), applied server-side for both sides. Ships with the ±3-clamp / expiry resolution
  from OQ1/OQ4. No new abilities need to be *complete* — the machinery must exist and be tested
  with a representative subset.
- **M2 — Multipliers, phases, and re-authored data.** Conditional multipliers (Story 4), phase
  windows (Story 5), and re-authoring the 71 transcribed rows onto the new vocabulary. Higher-value
  bespoke effects.
- **M3 — Remaining bespoke effects + pending roster.** Uxie/Azelf/Mesprit/Marshadow-class effects
  and the owner's outstanding Legendary/Mythical rows as they arrive.

## Definition of Done
- Every trigger, stat-change, and disable pattern in the owner table maps to a named,
  server-evaluable mechanic; no ability requires an un-modelled behaviour to be expressible.
- Stat changes **expire / decay** exactly per the owner table (fixes the "permanent buff" root
  cause) — verified in a live battle: a buff that should disable after N incorrect visibly stops.
- All mechanics behave **identically for bot and human** sides (Training/Nearby and PvP).
- The 71 transcribed rows are re-authored as data against the vocabulary (M2), with ⚠-flagged
  cells reconciled against the owner source.
- Server-authoritative: expiry, stacking caps, multipliers, and phase windows are enforced in the
  DB/RPC layer, not the client.
- `tsc` + Vitest green; tests cover at least one ability per mechanic family (streak trigger,
  reactive trigger, ramp, decay, disable-after-N-incorrect, once-per-battle, conditional multiplier,
  phase window).
- Open questions resolved by the owner before the Architect freezes the model.

## Open questions (for the OWNER — these gate the Architect)

1. **"Disable stat change after N incorrect answers" — exact semantics.** Does it (a) **revert**
   accumulated stacks to 0, (b) **freeze** at the current value but stop new gains, or (c) disable
   the **whole** ability (not just stats)? Is the incorrect-answer counter **cumulative for the
   battle** or **consecutive**? Does a later **re-trigger re-enable** it? (Same question for
   "disable increase only" — does decay continue after disable? — and for "after inflicting X,
   next question disabled" — does the ability resume the question after, or is it one-shot?)
2. **"Stacks up to 3 per correct after the trigger" — where does stacking start?** Does the trigger
   fire itself grant the **first** stack, or does stacking begin on the **next** correct? And is the
   cap **+3 total** or **3 additional** on top of the trigger's own change?
3. **Both-sides parity.** Do all effects apply to the **bot/opponent** side identically in Training/
   Nearby as they do human-vs-human PvP? (Assumed yes; confirm no bot-only shortcuts.)
4. **Interaction with the existing ±3 global stage clamp and current server stage system.** Do the
   new stacking caps and decaying buffs live **within** the ±3 clamp (so +3 ramp already hits the
   ceiling and decay floors at -3), or do they override it? Where does a decaying buff **floor**
   (0, -3, or unbounded)?
5. **Blank "Cooldown" cells (Arceus, Yveltal, Hoopa, Marshadow) — permanent?** Are these truly
   active **every question, all battle** with no disable? (Arceus 1–10%/q, Yveltal lifesteal,
   Hoopa per-answer ignore-Def/self-debuff, Marshadow reactive.)
6. **Multiplier scope.** Do "damage" multipliers apply to the **answer-damage only**, or also to
   **effect damage** (flat/HP-fraction/phase payoff)? Same for "ignore Defense" — answer-damage only?
7. **Fixed-question triggers assume a known total.** Confirm battles are a **fixed length** (e.g. 20
   questions) so indices like "2nd-to-last", "questions 5/10/15/20", and "12th question" are
   well-defined. If length varies, how are these resolved? Also confirm even/odd and Nth indices are
   **1-indexed**.
8. **Hoopa ⚠ row** (`if incorrect inflict -2 Defense to own`) is low-confidence in the transcription
   — confirm the intended effect.
9. **Ordering / stacking of simultaneous effects** in one question (multiple triggers/effects
   resolving together) — is there an intended precedence? (Also flagged by `training-battle-fx`.)
10. **Scope confirmation:** proceed engine-first (M1) with only a representative data subset, and
    treat the remaining transcribed rows as M2 data, and the pending non-transcribed roster as M3?

---

## Handoff
- **Status:** done
- **Produced:** `docs/handoffs/signature-rework/01-spec.md`
- **Next agent:** solution-architect
- **Context the next agent needs:**
  - **The engine is the deliverable, not the roster.** Formalize the generalized mechanics
    (Stories 1–6); data is filled per-ability and the roster is only partial.
  - Authoritative design = `docs/handoffs/signature-rework/00-owner-spec.md` (71 rows +
    derived vocabulary); it SUPERSEDES the old `src/lib/signature-abilities.ts` semantics for
    these abilities. Current-state truth = `docs/handoffs/signature-audit/00-coverage-audit.md`
    (do not re-derive).
  - **Headline gap = stat-stage EXPIRY.** `_pvp_bump_stage` (migration `20260705000000:165-182`)
    persists a clamped ±3 delta with no duration; the new "Cooldown" column is the expiry the owner
    wants. This is server-authoritative → DB/RPC work.
  - Trigger gating already works (`postTriggerFires`/`hitTriggerHolds`, audit finding 1) — extend it
    with the new trigger types (reactive self, opponent-signature, HP=0, opponent-item), don't rebuild it.
    Note the generic opponent-reactive path is currently dead (only one bespoke ability works).
  - Milestones: **M1 engine core** (triggers + stat model + disable/expiry, both sides) → **M2**
    multipliers + phase windows + re-authored 71 rows → **M3** hard bespoke effects + pending roster.
  - Bespoke catalogue maps to existing partial wiring (Ho-Oh revive, Mew copy, Cresselia/Suicune
    cure, suppress-ability all exist; Jirachi/Celebi/Azelf/Uxie/Mesprit/Marshadow/Chi-Yu are NO in
    the audit and are new work).
- **Open questions / risks:** the 10 numbered OQs above are **owner-gated** and must be answered
  before the model is frozen — OQ1 (disable semantics) and OQ4 (clamp/decay interaction) are the
  highest-risk. Do NOT let the Architect decide these unilaterally. Roster is incomplete (pending
  owner rows); scope realism = engine-first, data incremental.
