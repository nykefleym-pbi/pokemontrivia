# 03 — Frontend Engineer (shard A: engine / catalog / combat)

**Feature slug:** `signature-rework` · **Builder:** Frontend Engineer (shard A) · **Date:** 2026-07-11
**Inputs consumed:** `00-owner-spec.md` (71 rows, authoritative), `01b-owner-decisions.md`
(rulings 1–10), `02-architecture.md` (§2a trigger vocab, §2b/2c stat/disable, §4 multiplier,
§5 phase, §6 bespoke, §7 milestones), `src/lib/signature-rework-types.ts` (frozen stub).

Files changed (owned): `src/lib/signature-abilities.ts`, `src/lib/pvp-combat.ts`,
`src/lib/signature-rework-types.ts`. **Not touched:** `src/components/**`, `pvp-live.ts`,
`pvp-bot.ts`, `supabase/**`, type-ability code (dual-fire preserved, R1).

Verification: `tsc --noEmit` clean · `eslint` clean on all three files · `vitest run`
219/219 green (incl. `signature-abilities.test.ts` 61, `pvp-combat.test.ts` 10) — no test edits.

---

## 1. Where the new vocabulary lives (merge decision)

The frozen stub's 8 unions were **merged into `signature-abilities.ts`** as the real
types (not duplicated). `signature-rework-types.ts` is now a thin **re-export** of them,
and still **owns** the server-side contract types (`SigRuntimeEntry`, `SigRuntimeMap`,
`SigEngineTickArgs`, `SigEngineTickResult`) that DB/Backend read.

**Key call the coordinator flagged:** `NewSignatureTrigger` is **NOT** merged into the
legacy `SignatureTrigger` union — it is a **separate** type used only on
`SignatureEngineSpec.trigger`. This keeps every legacy exhaustive switch
(`describeSignatureTrigger`, damage/toast helpers) complete over the original union.
The two predicate evaluators accept the widened `SignatureTrigger | NewSignatureTrigger`
and have a `default: return false`, so they carry no exhaustiveness obligation. No `type`
string collides between the two unions.

New exported symbols from `signature-abilities.ts`:
`SIG_BATTLE_QUESTIONS` (20) · `SIG_STAGE_CLAMP` (3) · `SIG_STACK_CAP` (3) ·
`TriggerEvalSite` · `NewSignatureTrigger` · `RampStatSpec`/`OneShotStatSpec`/`DecayStatSpec`/`StatChangeSpec` ·
`DisableSpec` · `MultiplierCondition`/`DamageMultiplierSpec` · `PhaseWindowSpec` · `FixedIndexSpec` ·
`BespokeEffectRef` · `SignatureEngineSpec`. Each `SignatureAbility` now has an optional
`engine?: SignatureEngineSpec` (present on all 71 owner-spec rows; absent on the ~33
non-owner-spec roster ids that have no rework data yet — legacy `trigger`/`effect` still drive those).

---

## 2. Extended `SignatureContext` — FOR FRONTEND-B (`buildSigContext`, live-pvp-battle-screen.tsx:~924)

Four fields added, all **OPTIONAL** so existing constructors compile before you populate them.
Predicates treat `undefined` safely (index triggers fall back to `questionIndex + 1`;
`selfAfflicted` undefined → `false`):

```ts
questionNo?: number;      // 1-indexed q# (= questionIndex + 1). even/odd/on_questions use it.
selfAfflicted?: boolean;  // self has a status OR self HP < 50% (the frozen owner-spec cutoff).
oppType?: string[];       // opponent partner's types (for multiplier "opponent_type"/"…_any").
oppSpecies?: number;      // opponent partner's National Dex id (for "opponent_species"/"…_any").
```

**Frontend-B must populate all four** in `buildSigContext` (until then the index/self-reactive
triggers degrade gracefully, and every `damage_multiplier` condition except `always` resolves false).
`oppSpecies` is the opponent partner dex id you already resolve for Mew/Transform;
`oppType` is that species' type array; `selfAfflicted` = `hasAnyStatus(self) || selfHpPct < 0.5`.

---

## 3. New exported predicates & the multiplier helper

**Client-eval triggers now evaluated** in `hitTriggerHolds` (:~2111) and `postTriggerFires`
(:~2221) — both signatures widened to `SignatureTrigger | NewSignatureTrigger`:
`streak_in_a_row(n)` · `start_of_battle` · `every_question` · `every_even_question` ·
`every_odd_question` · `on_questions(indices)` · `self_afflicted_or_hp_below(pct)`.
Server-eval triggers (`opponent_signature`, `hp_reaches_zero`, `opponent_uses_item`) return
**false** on the client path (handled server-side / bespoke / deferred, architecture §2a/§9 R3).
Helper `questionNoOf(ctx)` = `ctx.questionNo ?? ctx.questionIndex + 1`.

**`evaluateHitModifiers` in `pvp-combat.ts`** (NEW — distinct from the same-named legacy
function in `signature-abilities.ts`; different module, different signature):

```ts
evaluateHitModifiers(
  spec: DamageMultiplierSpec | null | undefined,
  ctx: { correct: boolean; oppType: string[]; oppSpecies: number },  // HitModifierContext
): { factor: number; ignoreDefense: boolean }                        // SignatureHitModifiers
```

- Wrong answer or no spec → `{ factor: 1, ignoreDefense: false }` (ruling 7: answer-damage scope).
- Condition holds → spec `factor` + `ignoreDefense`. Condition fails → `factor` reverts to 1;
  `ignoreDefense` survives only if the condition was `always` (unconditional ignore-Def rows).
- `onSuccess`/`fallback` STAT specs are **not** handled here — those are stages resolved by the
  backend `sigEngineTick`, not the damage number.

**Fold into `computePvpDamage`:** pass `hitFactor` and `ignoreDefense` on `PvpDamageParams`
(both default to no-op). `ignoreDefense` collapses the Defense-stage divisor to 1. Flat /
HP-fraction / phase damage paths never build a `PvpDamageParams`, so they are untouched.
Server re-clamps the final HP delta (R6). **Name-collision note:** a file needing both
`evaluateHitModifiers`es must alias one on import, e.g.
`import { evaluateHitModifiers as evaluateSigMultiplier } from "./pvp-combat"`.

---

## 4. How Backend/Frontend-B read a row's `engine` for `sigEngineTick`

For the answered partner's dex id → `SIGNATURE_ABILITIES[dex].engine` (a `SignatureEngineSpec`):

- **`engine.trigger`** → compute the client `_trigger_fired` boolean by calling the
  predicate for its site: client triggers via `hitTriggerHolds`/`postTriggerFires`
  (they accept `NewSignatureTrigger` directly); server triggers → let the server observer decide.
- **`engine.stat[]`** → each entry maps to `sigEngineTick` stat args:
  `ramp{stat,target,perCorrect}` → tracked bump up to +3 cap (`_pvp_bump_stage_tracked`);
  `one_shot{stat,target,delta}` → apply once; `decay{stat,target,initial,perQuestion,floor}` →
  set to `initial` on fire, step `perQuestion`/question. `stat:"random"` → server rolls the stat.
- **`engine.disable`** → the runtime lifecycle branch (§3 of architecture):
  `revert_stat_after_incorrect(n)` · `disable_increase_after_incorrect(n)` ·
  `disable_effect_after_incorrect(n)` · `disable_multiplier_after_incorrect(n)` ·
  `disable_healing_after_questions(n)` · `disable_effect_after_questions(n)` (NEW, see §6) ·
  `disable_next_question_after_effect` · `once_per_battle` · `any_of([...])` · `none`.
- **`engine.status[]`** → `{status,target,chance,questions}` (`status:"random"` → server rolls).
- **`engine.multiplier`** → client damage via `evaluateHitModifiers` (§3); condition inputs from
  `SignatureContext.oppType`/`oppSpecies`.
- **`engine.phase` / `engine.fixedIndex[]`** → question-index-keyed (1-indexed, q1..q20).
  `receiveDamagePct` (Giratina q1/q11 immunity) is **defensive → server-enforced**;
  `outgoingMultiplier`/`scaleToPct`/`payoffMultiplier` are client damage-calc.
- **`engine.bespoke[]`** → catalogue refs; delivery per §6 (many are M3 no-ops).

---

## 5. Row status table — fully-live (M1/M2) vs M3-TODO

All 71 rows have a faithful `engine` spec. Rows whose **bespoke fx is not yet wired**
carry a `// TODO(M3):` note and are a graceful no-op downstream (they still won't crash —
the engine simply skips an unimplemented `bespoke` fx):

| Owner row | Name (dex) | Why M3-TODO |
|--|--|--|
| 11 | Celebi (251) | `opponent_signature` server-eval (M2) + `disable_opponent_ability` |
| 20 | Jirachi (385) | `flat_next_question_damage` (delayed strike) |
| 23 | Uxie (480) | `predicted_status_reveal` |
| 24 | Mesprit (481) | `item_lockout` |
| 25 | Azelf (482) | `eliminate_choices` (client help path is a no-op today) |
| 28 | Heatran (485) | `dot_frac_hp` (12.5%×5) |
| 33 | Manaphy (490) | `opponent_signature` + `reflect_opponent_stat` ×(-1) |
| 36 | Arceus (493) | `frac_hp_random` (1–10%/q) |
| 63 | Solgaleo (791) | `opponent_signature` + `disable_opponent_ability` (mirror x2 deferred) |
| 64 | Lunala (792) | `opponent_signature` + `disable_opponent_ability` |
| 67 | Marshadow (802) | `opponent_uses_item` server-eval + `use_opponent_item` |

Everything else is M1/M2-shaped (streak/start/every/parity/self-reactive triggers, ramp/one-shot/decay
stats, statuses, conditional multipliers, phase windows, and the already-wired bespoke: Ho-Oh #10
revive, Mew #5 copy, Cresselia #31 full-heal, Suicune #8 heal-pct, Yveltal #50 lifesteal,
Tapu #57–60 / Cosmog #61 frac-HP).

---

## 6. Owner-spec ambiguities I had to rule on (none invent new mechanics)

1. **Stack vs one-shot default.** Where a cell states neither "stacks up to 3" nor "does not
   stack" (e.g. Kyogre/Groudon/Rayquaza multi-stat, Keldeo), I used `one_shot` — the
   conservative reading (no compounding) consistent with ruling 3.
2. **Moltres #3 "1 incorrect OR after 3 questions".** The frozen stub had no
   questions-elapsed disable kind (only `disable_healing_after_questions`). Added a general
   `disable_effect_after_questions(n)` `DisableSpec` arm; Moltres = `any_of(revert(1), effect_after_q(3))`.
3. **Unconditional ignore-Defense rows** (Cobalion/Terrakion/Virizion/Keldeo/Hoopa) had no
   "if opponent is X" gate; the stub's `MultiplierCondition` had no "always" arm. Added
   `{ on: "always" }`. Also added `{ on: "opponent_species_any" }` (Rayquaza/Kyurem vs two mons)
   and `DamageMultiplierSpec.onSuccess?` (Regice: conditional +1 Atk with no real multiplier).
4. **"Disable stat change after N incorrect" on rows with no `stat`** (Type:Null/Silvally/
   Poipole/Naganadel/Stakataka phase rows) → mapped uniformly to `revert_stat_after_incorrect(N)`
   per the task disable-table; the revert is a harmless no-op there (the phase payoff is the effect).
5. **Solgaleo #63** owner-spec has BOTH unconditional ignore-Defense AND x2-only-vs-Lunala;
   `DamageMultiplierSpec` holds one condition → the every-battle ignore-Defense wins
   (`always`), the rare mirror x2 is deferred to M2 (noted inline).
6. **Regigigas #29 payoff** "x2.5 if opponent HP > user" — `PhaseWindowSpec` has no
   HP-comparison field, so the conditional is dropped to an unconditional x2.5 payoff (noted inline).
7. **Hoopa #53 (ruling 10, provisional).** ignore-Def on correct is modelled; the "if incorrect,
   self -2 Def" half can't be a correct-answer engine stat — left as an inline `engineNote`, M2.
8. **Magearna #66** the DECREASE is on **Defense** (not Attack) — modelled as `one_shot(+3 Atk)` +
   `decay(Defense, initial 0, -1/q)`, two distinct stats; Deoxys #21 is a single-stat `decay(Attack, +3, -1/q)`.

---

## Handoff
- **Status:** done
- **Produced:** `src/lib/signature-abilities.ts` (merged unions + builders; `SignatureContext`
  +4 optional fields; `hitTriggerHolds`/`postTriggerFires` +7 client triggers; all 71 `engine` specs),
  `src/lib/pvp-combat.ts` (`evaluateHitModifiers` + `hitFactor`/`ignoreDefense` in `computePvpDamage`),
  `src/lib/signature-rework-types.ts` (re-export + server-contract types), this handoff.
- **Next agent:** Frontend Engineer (shard B — `live-pvp-battle-screen.tsx`).
- **Context the next agent needs:**
  - Populate the 4 new **optional** `SignatureContext` fields in `buildSigContext` (:~924):
    `questionNo` (= questionIndex+1), `selfAfflicted` (status OR HP<50%), `oppType`, `oppSpecies`.
  - On each correct answer, call `evaluateHitModifiers(row.engine?.multiplier, {correct, oppType, oppSpecies})`
    from `pvp-combat.ts` and pass `{ factor→hitFactor, ignoreDefense }` into `computePvpDamage`.
    Alias the import to avoid the name clash with the legacy `evaluateHitModifiers` in `signature-abilities.ts`.
  - Wire `resolveQuestion` (:~988) to call `sigEngineTick` (Backend's caller), reading the answered
    partner's `SIGNATURE_ABILITIES[dex].engine.stat`/`.disable` per §4 above; `_trigger_fired` comes
    from `hitTriggerHolds`/`postTriggerFires` for client-site triggers.
  - **Do NOT alter the type-ability blocks (:359, :1246) — dual-fire must stay (R1).**
- **Open questions / risks:** server-eval triggers (Celebi/Manaphy/Solgaleo/Lunala/Marshadow) are
  inert client-side until the M2 observer lands; M3 bespoke fx (see §5) are graceful no-ops, not yet
  delivered; Regigigas HP-comparison payoff & Hoopa incorrect-branch are simplified (§6.6/§6.7).
