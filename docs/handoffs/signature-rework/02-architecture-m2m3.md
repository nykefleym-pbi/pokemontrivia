# 02 — Architecture ADDENDUM (M2/M3): advanced rows, legacy de-dup, fidelity

**Feature slug:** `signature-rework` · **Author:** Solution Architect · **Date:** 2026-07-11
**Layers on:** `02-architecture.md` (M1, green), `03-db.md`/`03-backend.md`/`03-frontend-a.md`/`03-frontend-b.md`.
**Authoritative inputs:** `00-owner-spec.md` (71 rows), `01b-owner-decisions.md` (rulings 1–10),
owner decisions 2026-07-11 (this addendum's mandate). **Contract + file-map, not prose. Design against
rulings; do not re-decide them.** M1 engine surface is FROZEN except the additive deltas in §T below.

DESIGN ONLY. This doc changes no app code, migration, or catalog data — it is the builders' contract.

---

## 0. Findings verified against code (new this addendum)

| # | Finding | Anchor |
|--|--|--|
| G1 | **Item system EXISTS in live PvP.** `use_pvp_live_item(_match_id,_question_index,_item_id)` looks up effect from server table `pvp_item_effects` (target/kind/payload), enforces `MAX_ITEMS_PER_BATTLE=3` via `host/guest_items_used`, logs to `pvp_live_effects` for cross-client toast. Bot variant `use_bot_pvp_live_item`. → Marshadow/Mesprit are **designable, NOT a blocker**. Open *semantics* remain (§Q). | `20260705000000:186-306`; `pvp-live.ts:675,442,981` |
| G2 | **`suppress_ability` already disables the OPPONENT for a window.** Effect-RPC kind `suppress_ability` sets `v_opp_suppressed = greatest(_, v_qidx+1+dur)` → writes `guest/host_suppressed_until`. Client blocks the partner's signature while `myIdx < mySuppressedUntil` (`:477,:1221,:1483,:1880`). → `disable_opponent_ability` = call `suppress_ability` with a rest-of-battle window. **No new column.** | `20260710120000:880-883,943,954`; `live-pvp-battle-screen.tsx:477` |
| G3 | **Legacy stats resolve from a SERVER catalog table `pvp_signature_effects`** keyed `(pokemon_id, phase, effect_index)`, kind `stat_stage` → `_pvp_bump_stage`. The client does NOT pass stat magnitudes for the legacy path; the server reads them. → the stat double-apply is fixed **by removing `stat_stage` rows for reworked ids** (server data), not by gating the client call. | `20260710120000:843-857` |
| G4 | **Cross-side signature observation already has a runtime marker.** Every `sigEngineTick` returns BOTH `hostSigRuntime` + `guestSigRuntime`; `SigRuntimeEntry.phaseIdx` = 1-indexed question the trigger last fired. → `opponent_signature` reactive fire reads the opponent entry's `phaseIdx` bump (existing client-observer→server-apply pattern, like Raging Bolt `:660,:809`). **No new column.** | stub §7; `live-pvp-battle-screen.tsx:809` |
| G5 | **The M1 tick does NOT mutate HP and has NO status arg.** `_pvp_sig_engine_apply` writes stages/runtime only. Status infliction + all HP effects still run through `apply_pvp_signature_effect` (`heal/drain/status/...`). → HP-mutating bespoke (Jirachi/Heatran/Arceus) go through the effect RPC as NEW kinds, server-clamped — not the tick. Status stays legacy (single source). | `20260710120000:836-959` |

---

## 1. Legacy de-duplication (owner decision 1) — exact call-sites

The engine tick owns the STAT lifecycle for the 71 reworked ids. Two writers must be retired for those
ids **only**; everything else (bespoke revive/heal/cure/copy, and ALL of the ~33 non-rework roster) stays.

| # | Writer to retire (reworked ids only) | Site | Owner | Action |
|--|--|--|--|--|
| L1 | **Server legacy stat rows** — `pvp_signature_effects` rows of `kind='stat_stage'` (all phases: `post_answer`, `battle_start`, `sig_state`). These are the SAME stats the engine now applies via `engine.stat` one_shot/ramp/decay → double-buff (the R2 class, extended from `stat_scale` to `stat_stage`). | data table `pvp_signature_effects` | **DB** | `DELETE FROM public.pvp_signature_effects WHERE pokemon_id = ANY(<SIG_ENGINE_DEX_IDS>) AND kind = 'stat_stage';` in the M2/M3 migration. KEEP `status/heal/drain/cure/suppress_ability/swap_stages/cleanse` rows and every row for non-reworked ids. Reversible: down-section re-inserts (or leave down as a comment, per repo style). |
| L2 | **Client legacy stat/armed-hit application** for engine rows — `armedHitRef` (Mewtwo −1 Def), `wrathStacksRef` + `sig_state` Moltres path (`:1268,:1358`), `evaluatePassiveDamageSideEffects` stat side-effects, legacy `evaluateHitModifiers(ability,sigCtx)` STAT/multiplier for reworked rows. | `live-pvp-battle-screen.tsx` | **Frontend-B** | Gate each legacy stat/armed-hit block behind `!ability.engine` (when a row has an `engine` spec the tick owns its stats; skip the legacy stat/armed-hit application). The legacy **damage multiplier** for engine rows is superseded by `engine.multiplier` via `evaluateSigMultiplier` (already wired) — ensure the legacy `evaluateHitModifiers(ability,…)` factor is not *also* applied for engine rows (compose → replace). |
| L3 | **KEEP** — do NOT gate the legacy `applyPvpSignatureEffect(...,'post_answer')` CALL itself. After L1 it finds no `stat_stage` rows for engine ids and still applies status/heal/cure for them (status is single-sourced via legacy; the tick has no status arg — G5). Ho-Oh revive (`submit_pvp_live_answer`), Mew copy (`set_live_pvp_transform`), Cresselia/Suicune heal remain untouched. | — | — | No change. |

**Dependency:** Frontend-A publishes the canonical `SIG_ENGINE_DEX_IDS: number[]` (the dex ids of all rows
carrying an `engine` spec — all 71) as an exported constant; DB pastes that literal array into the L1 DELETE.
L1 (DB) and L2 (Frontend-B) must land in the SAME release or stats will either double (L1 missing) or vanish
(L2 gates before L1 removes) — sequence: **L1 and L2 ship together**; QA verifies no reworked buff is 0× or 2×.

---

## 2. New DB primitives — exact RPC arg/return deltas (§T freezes the types)

All land in the **new** migration (§3). Function-signature-changing deltas use `DROP FUNCTION` + recreate
(appending trailing args to `CREATE OR REPLACE` creates an overload, not a replace — DB must drop the M1
10-arg `pvp_sig_engine_tick`/`pvp_bot_sig_engine_tick`/`_pvp_sig_engine_apply` and recreate with the new args).

### 2a. `pvp_sig_engine_tick` / `pvp_bot_sig_engine_tick` — 10 args → **13 args**
Append three trailing args (all defaulted, so Backend callers that don't set them are unchanged):

```
  _incorrect_stat_specs jsonb   default '[]',   -- StatChangeSpec[] applied when _correct = false (Hoopa −2 self Def)
  _expire_after_questions int    default 0,      -- >0: disable+revert at phaseIdx + n (Moltres q-expiry; composes with _disable_kind)
  _self_hp int                   default null,   -- caller's current self HP snapshot, for HP-comparison payoff gate (Regigigas)
  _opp_hp int                    default null    -- caller's current opp HP snapshot (same)
```
`_pvp_sig_engine_apply` takes the same three; delegation unchanged. Return shape **unchanged**
(`SigEngineTickResult`) plus the new runtime fields in §T2 surface inside `host/guestSigRuntime`.

### 2b. `_pvp_sig_engine_apply` lifecycle additions (refines §3 of M1 architecture)
Insert into the existing order, no reordering of M1 steps:
- **2 (counter):** unchanged.
- **3 (revert/disable):** ADD arm — if `_expire_after_questions > 0` and `qNo >= phaseIdx + _expire_after_questions` → treat as disable+revert (calls `_pvp_revert_ability_stat`, sets `disabled`). This is the Moltres "after 3 questions" half; composes with `revert_stat_after_incorrect(1)` passed in `_disable_kind`.
- **6 (stack apply):** ADD — on `_correct = false`, apply `_incorrect_stat_specs` via `_pvp_bump_stage_tracked` (tracked into `netByStat`, ±3 clamp). For Hoopa (no disable) these accumulate and never revert; for a row WITH a disable they revert with the rest.
- **NEW step 4b (predicted status):** if `_stat_specs`/spec carries a `predictedStatus` marker (Uxie), on first fire roll+store `predictedStatus` in runtime and echo it in the returned entry (client reveals it; server infliction is bespoke — §5 U).

### 2c. Effect RPC (`apply_pvp_signature_effect` + `_bot_` twin) — NEW bespoke kinds (HP-mutating, server-clamped, G5)
`CREATE OR REPLACE` (no signature change — new `kind` branches in the existing `for v_row … loop`, called via
a `bespoke` phase). Each clamps HP to `[0,120]` exactly like `heal`/`drain` already do (R6):

| New kind | Effect | Clamp/notes |
|--|--|--|
| `dot_frac_hp` | opp HP −= round(oppMaxHp × pct) (Heatran 12.5%). Client calls it each of the 5 questions the DoT is live (window from Heatran runtime `phaseIdx+1..+5`); server applies+clamps. | `greatest(0, …)`; `v_touched_opponent`. |
| `frac_hp_random` | opp HP −= round(oppMaxHp × random(minPct,maxPct)) (Arceus 1–10%). Server rolls the pct (trust — R6). | as above |
| `flat_next_question_damage` | opp HP −= flat (Jirachi +20), applied on the scheduled question only. Scheduling via runtime `disabledUntilQ`/a `pendingStrikeAtQ` — see §5 J. | as above |
| `reflect_opponent_stat` | Manaphy ×(−1): read opponent's last-fired ability `netByStat` (entry whose `phaseIdx == qNo`), invert its stat contribution onto the target. **M3, complex — see §Q4 for the semantics escalation.** | stages only |

### 2d. `use_pvp_live_item` + `use_bot_pvp_live_item` — NEW opponent-item hooks (G1)
`CREATE OR REPLACE` (shipped migrations `20260705000000`, `20260706202620` — recreate, do not edit in place).
Two additions inside each, AFTER the caller's item is applied and the `pvp_live_effects` row is logged:

- **Mesprit lockout (item_lockout):** BEFORE applying, if the OTHER side's partner (or transform) dex = **481**
  and that side's `*_sig_runtime['481']` has `firedThisBattle = true AND disabled = false` → reject with
  `{ok:false, error:'item_locked'}`. Reads the existing runtime blob; **no new column.** (Mesprit's own
  `disable_effect_after_incorrect(3)` sets `disabled=true` via the tick → lock auto-lifts; ruling 2 re-arm.)
- **Marshadow mirror (use_opponent_item):** AFTER applying the caller's item, if the OTHER side's partner
  (or transform) dex = **802** and its runtime is not `disabled` → apply the SAME `v_effect.kind/payload`
  to Marshadow's side (server-authoritative, clamped) and log a second `pvp_live_effects` row for the toast.
  **Semantics of which item kinds mirror, and cap accounting, are escalated — §Q3.**

---

## 3. New-migration plan (recommendation)

**Recommend a SECOND additive migration** `supabase/migrations/20260711HHMMSS_pvp_sig_engine_m2m3.sql` —
do NOT edit the M1 file `20260710120000`.

Reasoning: (a) COMMON_RULES §4 — a migration committed to the repo/handed downstream is "shipped" even if
not yet applied to a DB; editing it breaks the one-migration = one-logical-change / additive discipline and
desyncs anyone who already pulled M1. (b) M1 must stay independently reviewable/green. (c) M2/M3 is cleanly
additive: `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for any new runtime scalar columns (none required — all new
runtime state lives inside the existing `*_sig_runtime` jsonb; §T2), `DROP FUNCTION`+recreate for the arg-widened
tick/apply trio, `CREATE OR REPLACE` for the four HP/item-touching RPCs, and the L1 `DELETE`. Since M1 is
unapplied, DB applies M1 then M2/M3 in order on the preview branch — no data backfill needed.

---

## 4. Server-side opponent-signature observer (Celebi/Manaphy/Solgaleo/Lunala)

Reuses the **client-observer → server-apply** pattern (R3 stays deferred for a fully server-side reactor).

**Observation:** the reactive side's client already receives the opponent's `SigRuntimeEntry` from every
`sigEngineTick` result. Track `lastSeenOppPhaseIdxRef`. When the opponent entry's `phaseIdx` advances to the
current question, the opponent's signature just fired → the reactive `opponent_signature` trigger holds.

**Apply (once observed):** resolved through the existing engine + effect RPCs on the reactive side's next tick:
- own stat (Celebi +2 Spd, Lunala +2 Def) → normal `engine.stat` one_shot via the tick.
- `disable_opponent_ability` → call `apply_pvp_signature_effect(bespoke: suppress_ability)` with a rest-of-battle
  window (`questions = SIG_BATTLE_QUESTIONS`) targeting the opponent (G2). Solgaleo/Celebi/Lunala.
- Manaphy `reflect_opponent_stat` → §2c (M3, semantics escalated §Q4).

**Known limitation (flag, not blocker):** the reaction can lag the opponent's fire by up to one question
(client observes on its own next answer). Matches Raging Bolt's shipped behavior. If the owner wants
zero-lag reaction, that requires the fully-server-side reactor (R3) — escalated §Q5.

**Cross-side state reuse:** `phaseIdx` (existing) is the shared marker; no shared match field, no new column.

---

## 5. Per-row bespoke design table (11 advanced rows + 4 fidelity items)

`site` = where it executes. `server` effects that change HP/state are clamped (R6). `client` = info/help only.

| Row (dex) | Mechanic | site | Data (catalog `engine`) | Execution |
|--|--|--|--|--|
| **11 Celebi (251)** | `opponent_signature` + `disable_opponent_ability` + own +2 Spd | server | `trigger: opponent_signature`; `stat:[one_shot self spd +2]`; `bespoke:[disable_opponent_ability]`; `disable: disable_effect_after_incorrect(2)` | §4 observer → suppress opp (G2) + tick applies +2 Spd |
| **20 Jirachi (385)** | `flat_next_question_damage` +20, one question after trigger | server | `trigger: self_afflicted_or_hp_below(50)`; `bespoke:[flat_next_question_damage{amount:20}]`; `disable: disable_next_question_after_effect` | On fire (tick) set runtime `pendingStrikeAtQ = qNo+1`; on that question client calls effect `flat_next_question_damage`; server −20 opp HP, clamp; then next-q disable |
| **23 Uxie (480)** | `predicted_status_reveal` + conditional inflict when opp <50% | server roll + client reveal | `trigger: start_of_battle`; `bespoke:[predicted_status_reveal]`; `status:[random @ opp when oppHp<50%]`; `disable: once_per_battle` | Tick rolls+stores `predictedStatus` at start, returns it → client shows banner at opp 100%. Each later q: if opp HP<50% & not applied, effect RPC inflicts the SAME stored status (server) |
| **24 Mesprit (481)** | `item_lockout` on opponent | server | `trigger: start_of_battle`; `bespoke:[item_lockout]`; `disable: disable_effect_after_incorrect(3)` | `use_pvp_live_item` rejects opp while Mesprit runtime `firedThisBattle && !disabled` (§2d) |
| **25 Azelf (482)** | `eliminate_choices` (1–3) on q5/10/15/20 for Azelf owner | **client** | `trigger: on_questions([5,10,15,20])`; `bespoke:[eliminate_choices{min:1,max:3}]`; `disable: disable_effect_after_incorrect(3)` | Pure client answer-help: on those questions, if Azelf runtime not `disabled`, client hides random 1–3 wrong options. No HP/state → no server write |
| **28 Heatran (485)** | `dot_frac_hp` 12.5% × 5 questions | server | `trigger: streak_in_a_row(5)`; `bespoke:[dot_frac_hp{pct:0.125,questions:5}]`; `disable: disable_effect_after_incorrect(2)` | Runtime window `phaseIdx+1..+5`; each of those questions client calls effect `dot_frac_hp`; server −12.5% opp HP, clamp |
| **33 Manaphy (490)** | `opponent_signature` + `reflect_opponent_stat` ×(−1) | server | `trigger: opponent_signature`; `bespoke:[reflect_opponent_stat]`; `disable: disable_effect_after_incorrect(2)` | §4 observer → §2c reflect. **M3, semantics escalated §Q4** |
| **36 Arceus (493)** | `frac_hp_random` 1–10%/question | server | `trigger: every_question`; `bespoke:[frac_hp_random{minPct:0.01,maxPct:0.10}]`; `disable: none` (ruling 6) | Each question client calls effect `frac_hp_random`; server rolls pct, −HP, clamp |
| **63 Solgaleo (791)** | every-battle ignore-Def + `disable_opponent_ability` + ×2 vs Lunala | server (disable) + client (mult) | `trigger: opponent_signature` for disable; `multiplier:{ignoreDefenseAlways:true, on:opponent_species, species:792, factor:2}` (§6 fidelity) | §4 observer → suppress opp; ignore-Def + ×2 via `evaluateSigMultiplier` (§6) |
| **64 Lunala (792)** | `opponent_signature` + `disable_opponent_ability` + own +2 Def + ×2 vs Solgaleo | server + client | `trigger: opponent_signature`; `stat:[one_shot self def +2]`; `bespoke:[disable_opponent_ability]`; `multiplier:{on:opponent_species,species:791,factor:2}` | §4 observer → suppress opp + tick +2 Def; ×2 via multiplier |
| **67 Marshadow (802)** | `opponent_uses_item` + `use_opponent_item` | server | `trigger: opponent_uses_item`; `bespoke:[use_opponent_item]`; `disable: none` (ruling 6) | `use_pvp_live_item` mirrors opp's item to Marshadow (§2d). **Semantics escalated §Q3** |

### Fidelity restorations (4)

| Item | Design | Owner | New?|
|--|--|--|--|
| **F-a Moltres #3 (146)** | revert on 1 incorrect AND auto-expire 3 questions after firing. Catalog: `disable: revert_stat_after_incorrect(1)` + NEW `_expire_after_questions = 3`. Engine adds the q-expiry arm (§2b step 3). Resolves Frontend-B's dropped `any_of` arm. | DB (engine arm) + Frontend-A (catalog) | engine arm |
| **F-b Solgaleo #63 (791)** | CONFIRMED mostly catalog: unconditional ignore-Def **plus** ×2 vs Lunala. `DamageMultiplierSpec` must carry ignore-Def **independent** of the condition → add `ignoreDefenseAlways?: boolean` (§T3). `evaluateHitModifiers` (pvp-combat): `ignoreDefense = spec.ignoreDefenseAlways || (condHeld && spec.ignoreDefense)`; `factor` still gated by the species condition. **No engine/DB work.** | Frontend-A (catalog + pvp-combat) | 1 field + 1 line |
| **F-c Regigigas #29 (486)** | payoff ×2.5 only if oppHp > selfHp at q4. Add `payoffCondition?: 'opp_hp_gt_self'` to `PhaseWindowSpec` (§T3); add `selfHpPct`/`oppHpPct` to `SignatureContext` (Frontend-B populates). Gate evaluated **client-side in the damage calc from server-synced HP, server clamps final delta** — consistent with ruling 7 (answer-damage multiplier) and the shipped client-multiplier model. Pass `_self_hp`/`_opp_hp` to the tick too (§2a) so the server can additionally guard if strict gating is later wanted. | Frontend-A (catalog + pvp-combat) + Frontend-B (context) | 1 field + context |
| **F-d Hoopa #53 (720)** | on WRONG answer, −2 self Def (distinct from correct-answer stats). NEW `_incorrect_stat_specs` engine arm (§2a/§2b step 6); catalog `engine.incorrectStat: [one_shot self def −2]`. Hoopa has no disable → accumulates within ±3, no revert. Resolves ruling 10 / R5. | DB (engine arm) + Frontend-A (catalog) | engine arm |
| Magearna #66 (801) | decay-on-Defense already correct — **no change** (confirmed). | — | — |

---

## 6. Multiplier model fix for ignore-Def + conditional factor (Solgaleo, and any future dual)

`DamageMultiplierSpec` currently couples `ignoreDefense` to the single condition, so an always-on ignore-Def
row cannot ALSO carry a rare conditional factor. FROZEN fix (§T3): add `ignoreDefenseAlways?: boolean`.
`evaluateHitModifiers` (pvp-combat.ts, Frontend-A):
```
ignoreDefense = !!spec.ignoreDefenseAlways || (conditionHeld && !!spec.ignoreDefense)
factor        = conditionHeld ? (spec.factor ?? 1) : (spec.fallbackFactor ?? 1)
```
Unblocks Solgaleo (§5 F-b) and Cobalion/Terrakion/Virizion/Keldeo/Hoopa unconditional ignore-Def with any
future species/type gate. No engine change.

---

## 7. M1 cleanups folded in

| # | Cleanup | Owner | Design |
|--|--|--|--|
| C1 | Export `hitTriggerHolds`/`postTriggerFires` from `signature-abilities.ts` so Frontend-B deletes local `engineTriggerFired` mirror. | Frontend-A (export) → Frontend-B (delete mirror, import) | Add `export` to both predicates (or a purpose-built `export function engineTriggerFired(trigger, ctx)`); Frontend-B replaces its local copy with the import. Disjoint files preserved. |
| C2 | Canonical type-name casing (catalog "Water" vs pokemon-data "water"; `capType` bridge). | Frontend-A | **Canonical = lowercase everywhere** (matches `PokeType`/pokemon-data, the larger source of truth). Author `MultiplierCondition` type names lowercase AND make `evaluateHitModifiers` (pvp-combat) lowercase both sides defensively. Frontend-B then deletes `capType`. |

---

## T. Type-stub delta (frozen contract for builders)

Lands in **`signature-abilities.ts`** (canonical vocabulary home per Frontend-A §1); `signature-rework-types.ts`
re-exports it (already the pattern). Server-only runtime/RPC types stay in `signature-rework-types.ts`.

**T1 — `SignatureEngineSpec` (new/changed fields, all optional → additive):**
```ts
// on SignatureEngineSpec:
incorrectStat?: StatChangeSpec[];   // applied on a WRONG answer (Hoopa −2 self Def). Tracked into netByStat.
expireAfterQuestions?: number;      // Moltres: disable+revert at phaseIdx + n. Composes with `disable`.
```
**T2 — `SigRuntimeEntry` (new optional fields, additive; live inside the existing `*_sig_runtime` jsonb — no new columns):**
```ts
pendingStrikeAtQ?: number;   // Jirachi: 1-indexed question the +20 flat strike lands.
predictedStatus?: string;    // Uxie: status rolled at start, revealed client-side, inflicted when opp<50%.
```
**T3 — `DamageMultiplierSpec` + `PhaseWindowSpec`:**
```ts
// DamageMultiplierSpec:
ignoreDefenseAlways?: boolean;  // ignore-Def independent of the condition (Solgaleo, §6).
fallbackFactor?: number;        // factor when condition fails (default 1); pairs with existing fallback stat.
// PhaseWindowSpec:
payoffCondition?: 'opp_hp_gt_self';  // Regigigas #29 q4 gate.
```
**T4 — `SignatureContext` (Frontend-B populates in `buildSigContext`):**
```ts
selfHpPct?: number;  // self HP / PVP_MAX_HP (0..1) — Regigigas payoff gate.
oppHpPct?: number;   // opponent HP / PVP_MAX_HP.
```
**T5 — `BespokeEffectRef` union — add refs (documentation anchors; delivery per §5):**
`disable_opponent_ability` · `item_lockout` · `use_opponent_item` · `eliminate_choices` ·
`predicted_status_reveal` · `dot_frac_hp` · `frac_hp_random` · `flat_next_question_damage` ·
`reflect_opponent_stat`.
**T6 — `SigEngineTickSpec` (pvp-live.ts, Backend) — add pass-through fields:**
```ts
incorrectStatSpecs?: StatChangeSpec[];  // → _incorrect_stat_specs
expireAfterQuestions?: number;          // → _expire_after_questions
selfHp?: number; oppHp?: number;        // → _self_hp / _opp_hp
```
**T7 — `SIG_ENGINE_DEX_IDS: number[]`** — NEW exported constant (Frontend-A): dex ids of all rows with an
`engine` spec (the 71). Consumed by the DB L1 DELETE (pasted as a SQL literal array) and by Frontend-B's
`!ability.engine` gate. Single source of "which rows are reworked."

---

## 8. File-map + task split (DISJOINT — ORCHESTRATION §2)

| Builder | Files (owns) | Tasks | Must not touch |
|--|--|--|--|
| **DB** | `supabase/migrations/**` (new `..._pvp_sig_engine_m2m3.sql`) | Widen tick trio to 13 args (§2a, DROP+recreate); engine arms: `expireAfterQuestions`, `incorrectStat`, predicted-status roll (§2b). New effect-RPC kinds `dot_frac_hp`/`frac_hp_random`/`flat_next_question_damage`/`reflect_opponent_stat` (§2c). `use_pvp_live_item`+`_bot_` Mesprit-lock + Marshadow-mirror (§2d). L1 `DELETE` (§1). Type-ability RPCs untouched (F6/R1). | `src/**`; type-ability migrations |
| **Backend** | `src/lib/pvp-live.ts`, `src/lib/pvp-bot.ts` | Extend `SigEngineTickSpec` + `sigEngineTick`/`botSigEngineTick` with T6 pass-throughs. Add thin callers for the new effect `bespoke` kinds (Jirachi/Heatran/Arceus/Uxie/Manaphy/disable_opponent_ability) mirroring `applyPvpSignatureEffect`. zod-validate; surface `ok:false` (component toasts). | `signature-abilities.ts`; migrations; UI |
| **Frontend-A (catalog/combat)** | `src/lib/signature-abilities.ts`, `src/lib/pvp-combat.ts`, `src/lib/signature-rework-types.ts` | Merge T1/T3/T5 into `SignatureEngineSpec`/`DamageMultiplierSpec`/`PhaseWindowSpec`/`BespokeEffectRef`; author the 11 advanced rows + F-a…F-d catalog; §6 `evaluateHitModifiers` ignore-Def-always + fallbackFactor; C2 lowercase casing; **export** `hitTriggerHolds`/`postTriggerFires` (C1); publish `SIG_ENGINE_DEX_IDS` (T7). | `live-pvp-battle-screen.tsx`; `pvp-live.ts`; migrations |
| **Frontend-B (screen)** | `src/components/live-pvp-battle-screen.tsx` | Populate T4 (`selfHpPct`/`oppHpPct`) in `buildSigContext`; L2 gate legacy stat/armed-hit behind `!ability.engine`; delete `engineTriggerFired` mirror + import the exported predicates (C1); delete `capType` (C2); wire per-question bespoke effect calls (Jirachi/Heatran/Arceus DoT scheduling; Azelf client `eliminate_choices`; Uxie reveal banner); `opponent_signature` client observer (§4, `lastSeenOppPhaseIdxRef`). Keep dual-fire (R1). | libs; migrations |
| **UI/UX** | stat-chip / cue components | "disabled/reverted/locked" cues for suppress + item_lockout + predicted-status banner styling. | engine logic; RPCs |

**Sequencing (hard deps):**
1. **DB migration lands FIRST** (blocks Backend callers + Frontend bespoke wiring; provides the 13-arg tick + new kinds + item hooks).
2. **Frontend-A** publishes T1/T3/T5/T7 + exports (C1) — blocks Frontend-B's gate/import and DB's L1 id list.
3. **L1 (DB DELETE) + L2 (Frontend-B `!ability.engine` gate) SHIP TOGETHER** (§1) — else stats 0× or 2×.
4. Backend callers + Frontend-B wiring run in parallel after 1–2. UI/UX against frozen T2/T5 anytime.
5. `opponent_signature` observer (§4) + Manaphy reflect (§2c) are the last/riskiest — gate behind the §Q escalations.

---

## Handoff
- **Status:** needs-review (owner escalations §Q block Marshadow/Manaphy final design; rest is buildable)
- **Produced:** `docs/handoffs/signature-rework/02-architecture-m2m3.md` (this addendum). No app code/migration/data changed.
- **Next agent:** Orchestrator → then DB Engineer (§2/§3/§8 seq 1), Frontend-A (§5/§6/§7/T seq 2).
- **Context the next agent needs:**
  - Item system EXISTS (G1) — Marshadow/Mesprit designed against `use_pvp_live_item`/`pvp_item_effects`/`*_items_used`; NOT a build blocker, but §Q3 semantics need owner sign-off before Marshadow ships.
  - Legacy de-dup is precisely: DELETE `pvp_signature_effects` `stat_stage` rows for `SIG_ENGINE_DEX_IDS` (L1, DB) + gate client legacy stat/armed-hit behind `!ability.engine` (L2, Frontend-B); ship together; keep everything else and all non-rework rows.
  - New DB surface is a SECOND migration (§3); 13-arg tick via DROP+recreate; all new runtime state lives inside `*_sig_runtime` jsonb (no new columns); `disable_opponent_ability` reuses `suppress_ability` (G2); `opponent_signature` reuses `phaseIdx` + client observer (G4/§4).
  - Frozen type deltas in §T (T1–T7); Solgaleo/Regigigas/Hoopa/Moltres fidelity per §5.
- **Open questions / risks (escalate to owner — §Q):**
  - **Q1 (item context):** items exist in the live-PvP RPC, but confirm players actually have an item bag in the *ranked/standard* `/pvp/live` route (vs Nearby-Battle only). If Marshadow/Mesprit partners can appear where no player can use items, those abilities are inert in that context — owner to confirm intended scope.
  - **Q2 (disable_opponent_ability duration):** owner spec says "immediately disable" — design assumes REST-OF-BATTLE suppression (`questions = 20`). Confirm vs a temporary window / opponent re-arm.
  - **Q3 (Marshadow use_opponent_item):** which item kinds mirror? (self-heal Potion is clear; how does an opponent-*targeting* / utility item like Escape Rope, Rare Candy mirror?) Does the mirror count against Marshadow owner's 3-item cap? Owner ruling needed before build.
  - **Q4 (Manaphy Heart Swap):** exact ×(−1) semantics — does it flip the OPPONENT's self-buff into a self-debuff, or flip a debuff-inflicted-on-Manaphy into a buff-on-Manaphy? Which stat(s)/which fired ability? Blocks `reflect_opponent_stat`.
  - **Q5 (reaction lag):** `opponent_signature` reaction may lag the opponent's fire by one question (client-observer pattern, R3 deferred). Acceptable, or require a zero-lag fully-server-side reactor?
  - **Q6 (Regigigas HP-gate trust):** payoff gate evaluated client-side from server-synced HP + server-clamped magnitude (ruling-7 consistent). Accept the residual client-trust class (R6), or require strict server-side gating (would move damage computation server-side, larger scope)?
  - **Q7 (Uxie predicted status):** confirm the inflicted status MUST equal the revealed prediction, and that infliction fires when opp first drops below 50% (design assumes both).
