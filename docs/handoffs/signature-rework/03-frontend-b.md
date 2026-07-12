# 03 — Frontend Engineer (shard B: live-pvp-battle-screen.tsx)

**Feature slug:** `signature-rework` · **Builder:** Frontend Engineer (shard B) · **Date:** 2026-07-11
**Inputs consumed:** `03-frontend-a.md` (§2 the 4 SignatureContext fields, §3 the aliased
`evaluateHitModifiers` + `computePvpDamage` fold, §4 reading a row's `engine`, §5 M3-TODO rows),
`03-backend.md` (§1/§2 `sigEngineTick`/`botSigEngineTick`/`SigEngineTickSpec` shape, §4 the missing
`pvp_bot_sig_engine_tick` RPC, §5/§6 the two call-site pointers), `02-architecture.md` (lifecycle).

## Files changed (owned)
- `src/components/live-pvp-battle-screen.tsx` — the ONLY file touched. No lib/`supabase`/type-ability
  code modified.

Verification (env `NODE_OPTIONS=--use-system-ca`):
- `npx tsc --noEmit` → exit 0.
- `npx eslint src/components/live-pvp-battle-screen.tsx` → clean.
- `npx vitest run` → **219/219 green** (14 files; no test edits — QA owns tests).

---

## What was wired (functions / regions touched)

1. **Imports.** Added `evaluateHitModifiers as evaluateSigMultiplier` + `NO_SIGNATURE_HIT_MODIFIERS`
   from `@/lib/pvp-combat`; `sigEngineTick`, `botSigEngineTick`, `type SigEngineTickSpec` from
   `@/lib/pvp-live`; `type SignatureEngineSpec`, `type NewSignatureTrigger`, `type DisableSpec` from
   `@/lib/signature-abilities`. The legacy `evaluateHitModifiers` (signature-abilities.ts) import
   is **untouched** and still drives the manual/passive `damage_calc` mods — the two never collide
   (aliased).

2. **New module-level pure helpers** (inserted just above the component): `capType`, `toStages`,
   `EngineTriggerCtx`, `engineTriggerFired`, `TickDisable`, `reduceAnyOfDisable`, `engineToTickDisable`,
   `engineToTickSpec`.

3. **`buildSigContext`** — populated all 4 new optional `SignatureContext` fields:
   `questionNo = idxAtAnswer + 1`; `selfAfflicted = myStatuses.length > 0 || selfConfused || myHp/PVP_MAX_HP < 0.5`;
   `oppType = opponent partner's types mapped through capType`; `oppSpecies = opponentPartnerId ?? undefined`.

4. **Damage multiplier (correct answers)** — both damage paths now fold the answered partner's
   `engine.multiplier` via `evaluateSigMultiplier(...)` into `computePvpDamage` as
   `{ hitFactor, ignoreDefense }` (no-op factor 1 / ignoreDefense false when absent, condition fails,
   or — human path — the ability is suppressed):
   - Human: in `resolveQuestion`'s landed-hit branch, right before `computePvpDamage`. `oppType`/`oppSpecies`
     read off `opponentPartnerId`.
   - Bot: in the bot driver's correct-answer branch, before its `computePvpDamage`. The bot's opponent is
     the human partner, so `oppType = myPokemon.types`, `oppSpecies = partnerId`.
   - The legacy `evaluateHitModifiers(ability, sigCtx)` fold + `mods.ignoreOppDefenseStage ? 0 : oppStages.defense`
     line are **left intact**; the new `ignoreDefense` param composes on top of them.

5. **`sigEngineTick` (human)** — called **unconditionally once per human answer** near the end of
   `resolveQuestion` (after the bespoke post_answer block, before `prevCorrectRef` update), gated only on
   the partner actually having an `engine` spec. `_trigger_fired` from `engineTriggerFired(engine.trigger, …)`;
   spec from `engineToTickSpec(engine)`. Result folded via `applyHumanSigTick` (stages → store, plus cues).

6. **`botSigEngineTick` (bot)** — called **unconditionally once per bot answer**, immediately after
   `submitBotPvpMove(...)`, gated only on engine presence, NOT on `botShouldFireAbility` (that gate is kept
   for the bespoke `applyBotPvpSignatureEffect` fire below it). Bot is always the guest. Result folded via
   `foldSigTickStages` (stages only — no player cue for the bot's own cooldown).

7. **DUAL-FIRE preserved (R1).** No `applyPvpTypeAbilityEffect` call or type-ability block was altered or
   gated. `typeAbilityId`, the type battle-start effect, and the post-answer type block all fire exactly as
   before; a Legendary/Mythical now fires BOTH its signature (via `sigEngineTick`) AND its type ability.
   The signature engine uses its OWN server-side replay cursor (`*_sig_engine_last_idx`) separate from the
   type-ability / post-answer cursors — nothing on the client touches those.

8. **Cues (#6).** Verified the single app-wide `<Toaster position="top-center" />` in
   `src/routes/__root.tsx:219` covers `/pvp/live` (memory fix #124 confirmed present) — reused that path.
   - Stat buff / debuff / **revert** surface visually via the live `StatChips` under each HP bar once the
     tick's returned stages are folded into `myStages`/`oppStages` — consistent with the deliberate
     no-stat-toast policy already in this file (stat-stage toasts were removed intentionally).
   - `applyHumanSigTick` additionally toasts (via `notify`) exactly two player-relevant transitions read
     straight off my own partner's returned `SigRuntimeEntry`: cooldown/lockout **onset**
     (`disabled` false→true) and stat **wore-off** (`netByStat` non-empty→empty). Both deduped via refs
     (`sigDisabledRef`, `sigNetActiveRef`) so each fires once per transition; nothing is fabricated.
   - `ok:false` from the human tick toasts once per battle (`sigTickErrorRef`) so a missing/unapplied RPC
     can't spam. `noop` is never toasted. The bot tick swallows errors silently (its RPC doesn't exist yet).
   - The inline ability chips (`PvpCombatPanel` / `myAbilities`) were left as-is: they already reflect
     signature + type ability, and `StatChips` beside them carries the live buff/debuff state.

---

## DisableSpec → tick reduction decisions (`engineToTickDisable` / `reduceAnyOfDisable`)

DB supports only `revert_stat_after_incorrect` · `disable_increase_after_incorrect` ·
`disable_effect_after_incorrect` · `once_per_battle` · `none`, plus the boolean `disableNextQuestion` and
int `disableN`. Reduction applied:
- `none` → kind `none`, n 0, nextQ false.
- `revert_stat_after_incorrect(n)` / `disable_increase_after_incorrect(n)` / `disable_effect_after_incorrect(n)`
  → same kind, n passed through.
- `once_per_battle` → kind `once_per_battle`.
- `disable_next_question_after_effect` → kind `none`, **nextQ true**.
- `any_of([...])` → first server-supported arm by priority **revert > increase > effect > once_per_battle**
  for kind/n; nextQ true if any arm is `disable_next_question_after_effect`; other arms dropped (see M2 list).
- `stackCap` — **always omitted** (defaults to 3). `SignatureEngineSpec` exposes no per-row ramp-cap
  override field, so there is nothing to pass; noted inline in `engineToTickSpec`.

## `_trigger_fired` resolution — CONTRACT MISMATCH with Frontend-A (flagged)

03-frontend-a.md §3/§4 instructs shard B to compute `_trigger_fired` by calling
`hitTriggerHolds`/`postTriggerFires`. **Those predicates are NOT exported** from `signature-abilities.ts`
(both are file-private `function`s). Reaching across to export them is outside shard B's ownership
(COMMON_RULES §6), so I implemented a **local mirror**, `engineTriggerFired`, covering the `where:"client"`
`NewSignatureTrigger` arms with `postTriggerFires`' deterministic (correct-gated) semantics; all
`where:"server"` triggers (`opponent_signature`/`hp_reaches_zero`/`opponent_uses_item`) return `false`
(server/M2 observer owns them). **Recommend Frontend-A export `hitTriggerHolds`/`postTriggerFires` (or a
purpose-built `engineTriggerFired`) so this local duplication can be deleted and can't drift** — it's the
one bit of duplicated logic in this shard.

## M2 / M3 deferral list (things this shard cannot fully honor yet)

- **`pvp_bot_sig_engine_tick` RPC does not exist** (03-backend.md §4). `botSigEngineTick` is wired and
  ungated but no-ops/errors at runtime until DB Engineer adds it. Bot tick errors are swallowed silently
  by design. **Blocks QA from exercising the bot engine path end-to-end.**
- **`any_of` dropped arms → TODO(M2):** e.g. Moltres's `disable_effect_after_questions(3)` arm is dropped;
  only its `revert_stat_after_incorrect(1)` arm reaches the RPC (nextQ raised if applicable).
- **Not tick-tracked (collapse to `none`, stay on bespoke path) → TODO(M2/M3):**
  `disable_multiplier_after_incorrect`, `disable_healing_after_questions`,
  `disable_effect_after_questions`.
- **Type-name casing bridge:** catalog `MultiplierCondition` type names are Capitalized ("Water", "Flying")
  while `PokeType`/pokemon-data are lowercase ("water"). `capType` bridges on this side so `opponent_type(_any)`
  multipliers match. If Frontend-A later normalizes casing in the catalog, `capType` becomes redundant.
- **Server-eval reactive triggers** (Celebi/Manaphy/Solgaleo/Lunala/Marshadow) and **M3 bespoke fx**
  (03-frontend-a.md §5) remain inert client-side — unchanged by this shard.
- `SigEngineTickResult.error` exists on the frozen stub after all (not absent as 03-backend.md §3 warned);
  I read `.reason` on `ok:false` regardless, per Backend's mapping — no behavioral impact.

---

## Handoff
- **Status:** done (typecheck/lint/tests green); **blocked** downstream only on `pvp_bot_sig_engine_tick`
  (DB) for the bot engine path — not a shard-B code gap.
- **Produced:** `src/components/live-pvp-battle-screen.tsx` (buildSigContext +4 fields; human+bot damage
  multiplier fold; `sigEngineTick`/`botSigEngineTick` ungated once-per-answer wiring; 8 new helpers; two
  refs + error-toast ref for cues), `docs/handoffs/signature-rework/03-frontend-b.md` (this file).
- **Next agent:** Integration Engineer.
- **Context they need:**
  - Both ticks fire **once per answer, ungated**, only for partners with an `engine` spec; dual-fire
    type-ability path is fully intact (verify no regression).
  - `pvp_bot_sig_engine_tick` RPC must land (DB) before the bot engine path works; human path uses
    `pvp_sig_engine_tick` (migration `20260710120000`, confirm it is **applied** to the DB — Backend noted
    it was authored but unapplied).
  - `engineTriggerFired` is a local mirror of `postTriggerFires`' client cases — coordinate with Frontend-A
    to export the real predicates and delete it (see contract-mismatch section).
  - Multiplier type-name casing relies on `capType`; watch for a future catalog-casing change.
- **Open questions / risks:** `_trigger_fired` uses correct-gated (`postTriggerFires`) semantics — if the
  engine wants a `start_of_battle`/`every_question` ramp to arm on a WRONG answer, revisit that choice.
  `stackCap` is never overridden (no spec field). M2/M3 disable arms above are silently reduced to `none`.
