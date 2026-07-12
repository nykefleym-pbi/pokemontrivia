# 02 — Architecture: signature-ability rework (generalized combat engine)

**Feature slug:** `signature-rework` · **Author:** Solution Architect · **Date:** 2026-07-10
**Inputs:** `01b-owner-decisions.md` (FROZEN rulings 1–10), `01-spec.md`, `00-owner-spec.md`
(71 rows), `signature-audit/00-coverage-audit.md` (current-state truth).
**Type stub (builders code against this):** `src/lib/signature-rework-types.ts`.

This is a contract + file-map, not prose. Design against owner rulings; do not re-decide them.

---

## 0. Findings (verified against code)

| # | Finding | Anchor |
|--|--|--|
| F1 | **Battle length = 20, FIXED.** `PVP_QUESTIONS = 20`. Loop hard-stops at it both sides. Indices are 0-based in the loop; owner rows are 1-indexed. **1-indexed q1..q20.** "2nd-to-last" = **q19**. Azelf q5/10/15/20, Giratina q2/q12, Regigigas q4, Xerneas q2, Poipole q6, Cosmog q4 all valid. | `src/lib/pvp-combat.ts:63`; `live-pvp-battle-screen.tsx:867,915,1722` |
| F2 | **Stage helper has no expiry.** `_pvp_bump_stage(_stages,_stat,_delta)` clamps ±3, immutable, persists. No duration, no per-ability attribution → **cannot revert one ability's contribution today.** This is the headline gap. | migration `20260705000000:165-182` |
| F3 | **Effect RPC** `apply_pvp_signature_effect(_match_id,_question_index,_pokemon_id,_phase,_scale_count)` — phases `battle_start\|post_answer\|manual\|sig_state`. Has ownership auth, `*_post_answer_last_idx` **replay** cursor (not a throttle), and a `sig_state` phase already storing **one int 0..3 keyed by dex** in `host/guest_sig_state` (Moltres Wrath precedent). | migration `20260706090116` |
| F4 | **Runtime state columns exist** `host_sig_state`/`guest_sig_state` jsonb `'{}'`. We ADD parallel `*_sig_runtime` columns; do not overload sig_state. | migration `20260706031833:3-4` |
| F5 | **Client evaluators are pure & good.** `hitTriggerHolds`(:1452), `postTriggerFires`(:1536) fed by `buildSigContext`(:924) → `SignatureContext`. Extend the union + these switches; don't rebuild. Opponent-reactive path is **dead** in generic code (only bespoke Raging Bolt observer at `:640` works). | `signature-abilities.ts`; `live-pvp-battle-screen.tsx` |
| F6 | **DUAL-FIRE MUST BE PRESERVED (owner ruling 9).** `typeAbilityId` resolves unconditionally (`:359`); type-ability post_answer path (`applyPvpTypeAbilityEffect`, `:1246`) is a **separate RPC with an independent cursor** from the signature path (`applyPvpSignatureEffect`, `:1314`). They already coexist. The rework must NOT merge, gate, or share cursors between them. **QA regression risk — see §9.** | `live-pvp-battle-screen.tsx:359,1246,1314` |

---

## 1. Component / module map

```
CLIENT (Frontend owns)                      SERVER (DB + Backend own)
─────────────────────────                   ──────────────────────────────
signature-abilities.ts                      pvp_live_matches
  · SignatureTrigger  (+ NewSignatureTrigger)  · host/guest_sig_runtime  (NEW jsonb)
  · SignatureEffect   (+ multiplier/phase)     · host/guest_stages (shared sum)
  · SignatureEngineSpec per row (71)           · host/guest_sig_state (kept, Moltres)
  · hitTriggerHolds / postTriggerFires      _pvp_bump_stage            (kept)
  · evaluateHitModifiers (multiplier/ignoreDef) _pvp_bump_stage_tracked (NEW)
buildSigContext (live-pvp:924)              _pvp_revert_ability_stat    (NEW)
  · +selfAfflicted, +questionNo(1-idx),     apply_pvp_signature_effect  (kept for
    +oppType, +oppSpecies                       battle_start/manual/bespoke phases)
resolveQuestion (live-pvp:988)              pvp_sig_engine_tick         (NEW RPC —
  · calls pvp_sig_engine_tick each answer      owns stack/revert/decay/disable)
pvp-combat.ts computePvpDamage              submit_pvp_live_answer      (kept; hosts
  · applies answer-damage multiplier            HP=0 revive hook already)
UI: stat-chip / cooldown chip (UI/UX)       Type-ability RPCs — UNTOUCHED (F6)
```

**State strategy:** all lifecycle state (stacks, consecutiveWrong, disabled, decay,
phase) is **server-owned** in `*_sig_runtime` (ruling: server-authoritative expiry).
Client keeps only the pure predicate evaluation + the client-computed damage number
(server clamps). No new Zustand store — runtime is per-match server row, mirrored into
the existing synced-match object the components already read.

---

## 2. FROZEN data-model contract

### 2a. Trigger vocabulary (extends `SignatureTrigger`) — see stub §1
`streak_in_a_row(n)` · `start_of_battle` · `every_question` · `every_even_question` ·
`every_odd_question` · `on_questions(indices[])` · `self_afflicted_or_hp_below(pct)` ·
`opponent_signature` · `hp_reaches_zero` · `opponent_uses_item`.
**Eval site** (`where`): deterministic self-predicates = **client** (client computes
`_trigger_fired`, server applies — existing model); reactive-to-opponent
(`opponent_signature`, `hp_reaches_zero`, `opponent_uses_item`) = **server**-observed.

| New trigger | Eval | Rows | Milestone |
|--|--|--|--|
| `streak_in_a_row` (reuse `streak_at_least`) | client | most 3/5-in-a-row rows | M1 |
| `start_of_battle` (reuse `battle_start`) | client | Mew, Uxie/Mesprit/Azelf, Type:Null…Blacephalon | M1 |
| `every_question` | client | Arceus, Yveltal, Cobalion, Keldeo, Hoopa | M1 |
| `every_even_question`/`every_odd_question` | client | Terrakion / Virizion | M1 |
| `on_questions` | client | Giratina, Xerneas, Regigigas, Azelf | M2 |
| `self_afflicted_or_hp_below` | client | Suicune, Registeel, Kyogre, Groudon, Rayquaza, Jirachi, Cresselia | M1 |
| `opponent_signature` | server (M1: client observer→server, like `:640`) | Celebi, Manaphy, Solgaleo, Lunala | M2 |
| `hp_reaches_zero` | server (already wired) | Ho-Oh | M1 (exists) |
| `opponent_uses_item` | server | Marshadow | M3 |

### 2b. Stat model — stacks / one-shot / decay (owner rulings 1–3) — stub §2
- **ramp:** trigger fire = **stack #1**; each later correct +perCorrect; **cap +3 total**
  for the ability, inside the ±3 stage clamp (ruling 3).
- **one_shot:** applied once; re-fires add nothing.
- **decay:** set to `initial` on fire; step `perQuestion` each following question
  (stacking), floored at `floor`, inside ±3.

### 2c. Disable / expiry model — stub §3 (ruling 1 = REVERT-to-0; ruling 2 = CONSECUTIVE + re-arm)
`revert_stat_after_incorrect(n)` · `disable_increase_after_incorrect(n)` ·
`disable_effect_after_incorrect(n)` · `disable_multiplier_after_incorrect(n)` ·
`disable_healing_after_questions(n)` · `disable_next_question_after_effect` ·
`once_per_battle` · `any_of([...])` (Moltres) · `none` (Arceus/Yveltal/Hoopa/Marshadow — ruling 6).

### 2d. `*_sig_runtime` schema (NEW server state) — stub §7
`pvp_live_matches.host_sig_runtime` / `guest_sig_runtime` : `jsonb not null default '{}'`,
keyed by **dex id string** → `SigRuntimeEntry`:
`{ stacks, netByStat, consecutiveWrong, disabled, increaseDisabled, firedThisBattle, phaseIdx, disabledUntilQ }`.

> **REVISED R1 (build):** `netDelta` (single scalar) → **`netByStat: Record<string,number>`**,
> keyed `"<target>:<stat>"` (target ∈ {`self`,`opp`}, stat a `PvpStat` — e.g. `"opp:def": -2`).
> A single scalar only reverted the *first* stat a multi-stat row moved, so the other stats
> (Kyogre/Groudon/Rayquaza/Victini/Registeel/Phione/Reshiram/Keldeo/Xerneas/Cosmoem/Zygarde,
> ~12 rows) would compound for the whole battle — exactly the owner complaint. `netByStat` = this
> ability's signed contribution to **each** `*_stages` entry it touched; `_pvp_revert_ability_stat`
> now loops **every** key and subtracts it. `_pvp_bump_stage_tracked` takes an explicit `_target`
> and accumulates into `netByStat["<target>:<stat>"]`.

**PER-SIDE SYMMETRY (owner ruling 5, reinforced — FROZEN).** The model is symmetric and
per-side: `host_sig_runtime` and `guest_sig_runtime` are **two fully independent blobs**
(stacks, consecutiveWrong, disabled, increaseDisabled, firedThisBattle, phaseIdx,
disabledUntilQ tracked separately for each side). There is **no user-only path** — the
host runs its own signature and the guest runs its own, each side's effects (buffs, debuffs,
status, multipliers, heals, disable/revert) resolving against the OTHER side. `pvp_sig_engine_tick`
is invoked **once per side per answer** (`v_i_am_host` selects which `*_sig_runtime` blob to
mutate — mirroring how `apply_pvp_signature_effect` already branches self/opp). In Training/Nearby
the bot is the guest and runs the identical path via `botSigEngineTick`.

### 2e. RPC contract changes
| RPC | Change | Owner |
|--|--|--|
| `_pvp_bump_stage` | **unchanged** (still the clamp primitive). | DB |
| `_pvp_bump_stage_tracked(_stages,_runtime,_dex,_stat,_perFire,_cap)` | **NEW** helper: increments `stacks` up to `_cap`, applies `min(perFire, cap-stacks)` via `_pvp_bump_stage`, adds to `netDelta`. Returns `{stages, runtime}`. | DB |
| `_pvp_revert_ability_stat(_stages,_runtime,_dex)` | **NEW** helper: `_pvp_bump_stage(stages, stat, -netDelta)`; zero `stacks`/`netDelta`. | DB |
| `pvp_sig_engine_tick(_match_id,_question_index,_pokemon_id,_correct,_trigger_fired)` | **NEW** authoritative per-answer resolver. Owns the whole lifecycle (§3). Returns stages + runtime for both sides. Ownership-auth + `*_post_answer_last_idx`-style replay guard reused. | DB |
| `apply_pvp_signature_effect` | **kept** for `battle_start` / `manual` / one-shot status/heal/drain/cure/suppress/swap/cleanse and bespoke. The ramp/decay/disable stat lifecycle **moves to** `pvp_sig_engine_tick`. Additive; no signature change. | DB |
| `applyPvpSignatureEffect` / `applyBotPvpSignatureEffect` (`src/lib/pvp-live.ts`) | **add** `sigEngineTick(...)` + `botSigEngineTick(...)` callers. | Backend |

> **REVISED (build) — as-shipped RPC surface:**
> - `pvp_sig_engine_tick` takes **10 args**, not 5: `(_match_id, _question_index, _pokemon_id,
>   _correct, _trigger_fired, _stat_specs jsonb='[]', _disable_kind text='none', _disable_n int=0,
>   _disable_next_question boolean=false, _stack_cap int=3)` → `jsonb {ok,error,...stages,...runtime}`.
> - **NEW `pvp_bot_sig_engine_tick(...same 10 args...)`** for the bot side (auth: caller = `host_id`
>   **and** `is_bot_match`; acting side fixed to guest). R3 fix — the bot is the guest and has no
>   `auth.uid`, so the human RPC's `auth.uid in (host_id,guest_id)` check could never authorize it.
> - Both delegate to a **factored `_pvp_sig_engine_apply(...)`** (`SECURITY DEFINER`, `REVOKE ALL …
>   FROM PUBLIC`) that owns the shared lifecycle; the two public RPCs only do auth + side selection.
> - **R2 double-writer fix:** the `stat_scale` branch was removed from **both**
>   `apply_pvp_signature_effect` **and** `apply_bot_pvp_signature_effect` (ramp/decay is now solely
>   the engine's job). Dex **1016** (only `stat_scale` row) no-ops until re-authored onto `engine`.
> - Dedicated replay cursor `host/guest_sig_engine_last_idx int default -1` (NOT shared with
>   `*_post_answer_last_idx` or the type-ability cursor — preserves dual-fire, owner ruling 9 / R1).

---

## 3. Deterministic per-answer lifecycle (server, `pvp_sig_engine_tick`)

Runs once per side per answer, BEFORE/independent of the type-ability RPC (F6). Order:

1. **Replay guard** (reuse `*_post_answer_last_idx` pattern) → noop on stale index.
2. **Counter update:** `correct` → `consecutiveWrong = 0`; else `consecutiveWrong += 1`.
3. **Revert/disable check (evaluated on the incorrect answer):**
   - `revert_stat_after_incorrect(n)` & `consecutiveWrong >= n` → `_pvp_revert_ability_stat`.
   - `disable_increase_after_incorrect(n)` → set `increaseDisabled` (decay continues).
   - `disable_effect_after_incorrect(n)` → set `disabled` (+revert stat).
   - `once_per_battle` spent → `disabled`.
4. **Re-arm (ruling 2):** if `_trigger_fired` this answer, clear `disabled`/`increaseDisabled`,
   set `phaseIdx = qNo`, `firedThisBattle = true`.
5. **Decay tick:** for `decay` specs, if `qNo > phaseIdx` step applied value by `perQuestion`
   (floored), unless `increaseDisabled` already past initial — recompute stage via net-delta diff.
6. **Stack apply:** if enabled and (`_trigger_fired` or a subsequent correct within an armed ramp)
   → `_pvp_bump_stage_tracked` (respects +3 cap and ±3 clamp).
7. **`disabled_until_q`** one-shot (Mewtwo/Entei/Jirachi): if `qNo == disabledUntilQ` skip effect,
   else after the effect resolves set `disabledUntilQ = qNo + 1`.

**Effect ordering within one question (FROZEN, refines the default):**
`phase/fixed-index damage gate (0-dmg / %scale)` → `own buffs (stack/decay)` →
`opponent debuffs` → `ignore-Def + answer-damage multiplier` → `status infliction` →
`HP-fraction / flat effect damage` → `heal / lifesteal` → `revive (HP=0)`.
Runtime bookkeeping (steps 2–4) is evaluated first so a revert lands before this question's buffs.

---

## 4. Damage-calc multiplier path (ruling 7 — answer-damage ONLY)

Client-computed + server-clamped (existing model). `DamageMultiplierSpec` (stub §4) and
`ignoreDefense` fold into `evaluateHitModifiers` / `computePvpDamage` (`pvp-combat.ts`) on a
correct answer only. Condition inputs (`oppType`, `oppSpecies`) added to `SignatureContext`
via `buildSigContext`. `fallback` (Zygarde) applies stat spec when condition fails. Multiplier
**never** touches flat / HP-fraction / phase-payoff damage. Server clamps final HP delta.

---

## 5. Phase windows & fixed-index (M2) — stub §5

`phase_window{windowN, scaleToPct, payoffAtIndex?, payoffMultiplier?, payoffEffect?}` and
`fixed_index[]{index, receiveDamagePct?, outgoingMultiplier?}`, keyed to the **1-indexed q1..q20**
(F1). Outgoing scaling = client damage calc; **`receiveDamagePct` (Giratina q1/q11 immunity) is a
DEFENSIVE modifier → must be server-enforced** on the incoming-damage side (both sides symmetric).

---

## 6. Bespoke catalogue — status & milestone (stub §6)

| Effect | Rows | Status | Milestone |
|--|--|--|--|
| revive (25% + cure + buff) | Ho-Oh | **already-wired** (`submit_pvp_live_answer`) | M1 |
| copy-opponent-ability | Mew | **already-wired** (`resolveMewTransform`+`set_live_pvp_transform`) | M1 |
| full-heal / cure | Cresselia, Suicune | **already-wired** (cleanse/cure) — re-author data | M2 |
| lifesteal % of damage | Yveltal 75% | **extend** `drain` → `lifesteal_pct_of_damage` | M2 |
| frac-HP damage (halve / q4) | Tapu ×4, Cosmog | **extend** `flat_damage.fracOppHp` | M2 |
| conditional multiplier / ignore-Def | Articuno, Rayquaza, Kyogre/Groudon, Dialga/Palkia… | **extend** (§4) | M2 |
| disable-opponent-ability | Celebi, Solgaleo, Lunala | **extend** `suppress_ability` + `opponent_signature` trigger | M2/M3 |
| reflect/negate opp stat ×(-1) | Manaphy | **extend** `swap_stages`→`reflect_opponent_stat` | M3 |
| frac-HP random 1–10%/q | Arceus | **NEW** `frac_hp_random` | M3 |
| DoT 12.5%×5 | Heatran | **NEW** `dot_frac_hp` (today: Bad-Poison proxy) | M3 |
| flat next-q damage +20 | Jirachi | **NEW** `flat_next_question_damage` (delayed strike) | M3 |
| item lockout | Mesprit | **NEW** `item_lockout` | M3 |
| choice elimination | Azelf | **NEW** `eliminate_choices` (help path is a client no-op today) | M3 |
| predicted-status reveal | Uxie | **NEW** `predicted_status_reveal` | M3 |
| use-opponent-item | Marshadow | **NEW** `use_opponent_item` | M3 |

---

## 7. Milestone split

- **M1 (engine core):** columns `*_sig_runtime`; `_pvp_bump_stage_tracked`,
  `_pvp_revert_ability_stat`, `pvp_sig_engine_tick`; new client triggers
  (streak/start/every/parity/self-reactive); stack/one-shot/decay stat model;
  disable/revert/re-arm/once-per-battle; both sides via bot callers. Representative
  subset of rows authored & tested. **Dual-fire preserved (F6).**
- **M2:** conditional multipliers + `on_questions`/phase windows/fixed-index +
  `opponent_signature`; re-author all 71 rows; higher-value bespoke (lifesteal, frac-HP, cure).
- **M3:** hard bespoke (Jirachi delayed, Heatran DoT, Mesprit/Azelf/Uxie/Marshadow, Manaphy ×-1)
  + pending Legendary/Mythical roster rows as data.

**Pending roster:** the non-transcribed rows are DATA only; engine must not assume a full roster.

---

## 8. File-ownership split (non-overlapping)

| Builder | Files (owns) | Must not touch |
|--|--|--|
| **Database Engineer** | `supabase/migrations/**` — new additive migration(s): `*_sig_runtime` columns; `_pvp_bump_stage_tracked`, `_pvp_revert_ability_stat`; `pvp_sig_engine_tick`; extend `apply_pvp_signature_effect` (remove ramp/decay stat path, keep battle_start/manual/bespoke). | any `src/**`; type-ability RPCs/migrations. |
| **Backend Engineer** | `src/lib/pvp-live.ts` (add `sigEngineTick`/`botSigEngineTick` callers, zod-validate, error surface); any `src/routes/api.*.ts` server glue; `src/lib/pvp-bot.ts` parity call. | `signature-abilities.ts` types/catalog; migrations; UI. |
| **Frontend Engineer** | `src/lib/signature-abilities.ts` (merge stub §1–8 unions, extend `hitTriggerHolds`/`postTriggerFires`, re-author 71 rows), `src/lib/pvp-combat.ts` (multiplier/ignore-Def in `computePvpDamage`), `src/components/live-pvp-battle-screen.tsx` (`buildSigContext` new fields, `resolveQuestion` → `sigEngineTick` wiring, **keep type-ability path intact**). | migrations; `pvp-live.ts` RPC bodies; stat-chip visuals. |
| **UI/UX Engineer** | stat-chip / cooldown-chip / disable-revert cue within components (announce stacks, "reverted", "disabled"). Cue parity coordinated with `training-battle-fx`. | engine logic; triggers; RPCs. |

**Sequencing:** DB migration (§2d/2e) lands FIRST (blocks Backend + Frontend engine wiring).
Backend caller + Frontend trigger/type merge run in parallel after. UI/UX runs against the
frozen runtime shape (§2d) independently. M2/M3 data re-authoring is Frontend, gated on M1 green.

---

## 9. Open risks

- **R1 (owner ruling 9) — dual-fire regression.** The reworked signature engine must NOT
  re-suppress or share cursors with the type-ability path (`applyPvpTypeAbilityEffect`,
  `live-pvp-battle-screen.tsx:1246`, independent RPC/cursor). **QA must verify BOTH fire, both
  sides, for a Legendary/Mythical partner** (regression against commit 8a0cab9). High priority.
- **R2 — shared `*_stages` attribution.** Revert-to-0 relies on `netDelta` bookkeeping being the
  single writer of each ability's stage contribution; if `apply_pvp_signature_effect` AND
  `pvp_sig_engine_tick` both bump the same stat, netDelta drifts. Mitigation: ramp/decay stats go
  **only** through `pvp_sig_engine_tick`; the effect RPC keeps only one-shot/status/heal.
- **R3 — `opponent_signature` server hook.** Fully server-side reactive firing is non-trivial;
  M1/M2 uses the existing client-observer→server-apply pattern (`:640`). Flagged, deferred to M2.
- **R4 — decay vs revert interaction (Deoxys/Magearna).** `disable_increase_after_incorrect`
  reverts only the increase portion while decay continues; netDelta must separate the two. Covered
  in stub `DecayStatSpec` + runtime `increaseDisabled`; needs a dedicated test.
- **R5 — Hoopa row 53 (ruling 10).** Data provisional (self -2 Def on incorrect); does not shape
  the engine; mark the catalog row `note` accordingly.
- **R6 — client-computed multiplier trust.** Multiplier/ignore-Def are client-computed; server
  must clamp the final HP delta (existing model) so a spoofed factor can't over-damage.

---

## Handoff — Database Engineer
- **Status:** ready
- **Context:** Build the additive migration per §2d/§2e/§3. Columns `host/guest_sig_runtime jsonb
  default '{}'`; helpers `_pvp_bump_stage_tracked`, `_pvp_revert_ability_stat`; RPC
  `pvp_sig_engine_tick` owning the §3 lifecycle. Keep `_pvp_bump_stage` and the sig_state phase.
  Move ramp/decay stat application OUT of `apply_pvp_signature_effect` into the new RPC (R2). Reuse
  ownership-auth + replay-cursor patterns from `20260706090116`. SECURITY DEFINER least-privilege, RLS unchanged.
- **Files:** `supabase/migrations/**` only. **Do not touch type-ability migrations (F6/R1).**
- **Risks:** R2 (single-writer netDelta), R1 (don't gate type-ability).

## Handoff — Backend Engineer
- **Status:** ready (after DB)
- **Context:** Add `sigEngineTick`/`botSigEngineTick` to `src/lib/pvp-live.ts` mirroring
  `applyPvpSignatureEffect`/`applyBotPvpSignatureEffect`; zod-validate args (stub §9), surface
  errors as sonner toasts, both sides parity (ruling 5) incl. `src/lib/pvp-bot.ts`.
- **Files:** `src/lib/pvp-live.ts`, `src/lib/pvp-bot.ts`, `src/routes/api.*.ts` (if glue needed).

## Handoff — Frontend Engineer
- **Status:** ready (after DB)
- **Context:** Merge stub §1–8 unions into `signature-abilities.ts`; extend `hitTriggerHolds`
  (:1452) + `postTriggerFires` (:1536) with the new client-eval triggers; add `oppType`,
  `oppSpecies`, `questionNo(1-idx)`, `selfAfflicted` to `buildSigContext` (:924); call
  `sigEngineTick` from `resolveQuestion` (:988). Multiplier/ignore-Def in `pvp-combat.ts`
  `computePvpDamage`. **Do NOT alter the type-ability blocks (:359, :1246) — keep dual-fire (R1).**
  Re-author 71 rows as M2 data behind the engine.
- **Files:** `src/lib/signature-abilities.ts`, `src/lib/pvp-combat.ts`,
  `src/components/live-pvp-battle-screen.tsx`.

## Handoff — UI/UX Engineer
- **Status:** ready (after runtime shape frozen — it is, §2d)
- **Context:** Stat-chip shows live net stage; add cooldown/disable + "reverted" cue when
  `pvp_sig_engine_tick` returns a disable/revert. Coordinate cue parity with `training-battle-fx`.
- **Files:** stat-chip / cooldown-chip components only.
