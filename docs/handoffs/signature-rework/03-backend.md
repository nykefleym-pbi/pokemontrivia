# 03 — Backend: signature-engine RPC callers (M1)

**Feature slug:** `signature-rework` · **Author:** Backend Engineer · **Date:** 2026-07-10
**Produced:** `src/lib/pvp-live.ts` (two new exported functions + `SigEngineTickSpec`), this doc.
**Inputs read:** `docs/handoffs/signature-rework/03-db.md` §2/§3/§4/§7,
`src/lib/signature-rework-types.ts` §2 (`StatChangeSpec`), §9 (`SigEngineTickArgs`/`SigEngineTickResult`),
pattern reference `applyPvpSignatureEffect` (`src/lib/pvp-live.ts:666`) / `applyBotPvpSignatureEffect`
(`src/lib/pvp-live.ts:345`), `supabase/migrations/20260710120000_pvp_sig_engine_runtime.sql` (the actual
migration body, read directly — not just the doc, see the auth-gap finding below),
`supabase/migrations/20260706202620_pvp_bot_match_rpcs.sql:230` (`apply_bot_pvp_signature_effect`'s
auth model).

This is a contract doc for Frontend, not prose to re-derive from source.

---

## 1. Final exported signatures

```ts
// src/lib/pvp-live.ts
export interface SigEngineTickSpec {
  statSpecs: StatChangeSpec[];      // catalog row's SignatureEngineSpec.stat (may be [])
  disableKind: string;              // DisableSpec.kind resolved for this ability, or 'none'
  disableN: number;                 // DisableSpec.n where applicable, else 0
  disableNextQuestion: boolean;     // true only for kind = disable_next_question_after_effect
  stackCap?: number;                // default 3
}

export async function sigEngineTick(
  matchId: string,
  questionIndex: number,            // 0-indexed, exactly as the caller's loop tracks it — do NOT pre-increment
  pokemonId: number,
  correct: boolean,
  triggerFired: boolean,
  spec: SigEngineTickSpec,
): Promise<SigEngineTickResult>

export async function botSigEngineTick(
  matchId: string,
  questionIndex: number,
  pokemonId: number,
  correct: boolean,
  triggerFired: boolean,
  spec: SigEngineTickSpec,
): Promise<SigEngineTickResult>
```

Both import `StatChangeSpec`/`SigEngineTickResult` directly from `@/lib/signature-rework-types`
(`src/lib/pvp-live.ts:5`) — `signature-abilities.ts` does not yet re-export the M1 types (build is
paused pending greenlight), so import from the stub file, not the catalog.

`sigEngineTick` is at `src/lib/pvp-live.ts` immediately after `applyPvpSignatureEffect`
(around line 742 pre-edit; search for `export async function sigEngineTick`).
`botSigEngineTick` sits immediately after `applyBotPvpSignatureEffect`, before `applyBotPvpLiveItem`.
No existing exports were renamed or altered; only the new `signature-rework-types` type import was added.

## 2. Arg → RPC mapping

Both functions call their RPC with identical arg shape (per 03-db.md §3):

| `SigEngineTickSpec` / call arg | RPC arg |
|--|--|
| `spec.statSpecs` | `_stat_specs` (array passed as-is, jsonb) |
| `spec.disableKind` | `_disable_kind` |
| `spec.disableN` | `_disable_n` |
| `spec.disableNextQuestion` | `_disable_next_question` |
| `spec.stackCap ?? 3` | `_stack_cap` |
| `questionIndex` (0-indexed, no pre-increment) | `_question_index` |
| `pokemonId` | `_pokemon_id` |
| `correct` | `_correct` |
| `triggerFired` | `_trigger_fired` |
| `matchId` | `_match_id` |

`sigEngineTick` calls RPC `pvp_sig_engine_tick` (exists, migration `20260710120000`).
`botSigEngineTick` calls RPC `pvp_bot_sig_engine_tick` — **does not exist yet**, see §4 below.

Call **every** answer, for both the stat-bearing and bespoke-only rows (pass `statSpecs: []`,
`disableKind: 'none'` when the ability has no `SignatureEngineSpec.stat`) — the tick still needs to run
for `consecutiveWrong`/`disabled`/`firedThisBattle` bookkeeping even when there's nothing to apply
server-side (03-db.md §3).

## 3. Validation & error surfacing

- Guard before the RPC call (mirrors nothing in `applyPvpSignatureEffect`, which validates nothing —
  per task instruction, added a minimal guard anyway): `matchId` must be non-empty and
  `questionIndex >= 0`. On failure, returns `{ ok: false, reason: "invalid_args" }` without a network
  round-trip; logs via `console.warn`.
- Transport-level Supabase error (`error` on the RPC response) → `{ ok: false, reason: "network" }`,
  `console.warn`'d, matching the existing `[pvp-live] <fn> failed:` / `threw:` log prefix convention.
- **Stub/DB shape mismatch, resolved pragmatically:** `SigEngineTickResult` (signature-rework-types.ts
  §9) has no `error` field, but `pvp_sig_engine_tick` returns `{ok:false, error: 'no_session'|
  'not_found'|'forbidden'|'not_active'|'unauthorized_ability'}` on failure (03-db.md §2). Since the
  type stub is frozen and not owned by Backend, the RPC's `error` string is mapped onto the stub's
  existing `reason` field on `ok:false` returns (the same field already used for `noop:true` reasons
  like `'stale'`) rather than widening the type. **Frontend: read `.reason` for the failure message on
  `ok:false`, not `.error` — that field doesn't exist on this type.** Flag to Architect if a dedicated
  `error` field is wanted on `SigEngineTickResult` later.
- `noop: true` is expected/normal (e.g. replay guard hit) — never toast it. Only `ok: false` should
  toast, via `sonner`, **at the call site** — same pattern as every existing caller in
  `live-pvp-battle-screen.tsx` (`applyPvpSignatureEffect`/`applyBotPvpSignatureEffect` themselves never
  toast; they return the result and the component decides). `sigEngineTick`/`botSigEngineTick` follow
  that same division of labor: they never swallow the error (always return a `reason`), but toasting
  itself is Frontend's call-site responsibility, not this file's.

## 4. CRITICAL open item — `botSigEngineTick` has no working RPC yet

Reading the actual migration body (not just 03-db.md's prose) surfaced a gap 03-db.md didn't fully
spell out:

`pvp_sig_engine_tick` (`supabase/migrations/20260710120000_pvp_sig_engine_runtime.sql:148-166`)
authorizes with:
```sql
if v_uid not in (v_match.host_id, v_match.guest_id) then return ... 'forbidden'; end if;
...
v_i_am_host := v_uid = v_match.host_id;
v_my_partner := case when v_i_am_host then v_match.host_partner_id else v_match.guest_partner_id end;
```
It has **no** host-acting-as-guest branch. Compare `apply_bot_pvp_signature_effect`
(`supabase/migrations/20260706202620_pvp_bot_match_rpcs.sql:254-269`), which requires
`v_uid = v_match.host_id` explicitly, checks `is_bot_match`, and always treats the **guest** row as
"self" — because the bot has no session of its own; the host calls on its behalf (same model as
`submitBotPvpMove`, `applyBotPvpLiveItem`).

If the host called `pvp_sig_engine_tick` today with the bot's `pokemonId`, `v_i_am_host` would be
`true` (the caller IS the host), so it would resolve `v_my_partner` from `host_partner_id` — the
**host's own** partner, not the bot's — and either tick the wrong side's runtime or return
`unauthorized_ability`. There is no way to correctly drive the bot's tick through the existing RPC.

**`botSigEngineTick` is implemented against a new RPC name, `pvp_bot_sig_engine_tick`, that does not
exist in any migration yet.** The function itself compiles and typechecks fine (the RPC name is just a
string argument to `supabase.rpc`), but it will fail at runtime (`error.message` from Supabase, likely
"function does not exist") until DB Engineer adds it — mirroring `apply_bot_pvp_signature_effect`'s
auth model (`v_uid = host_id` + `is_bot_match` + guest-as-self) but with `pvp_sig_engine_tick`'s
runtime/stat-lifecycle body. Alternative: DB Engineer could instead add a host-acting-as-guest branch
directly inside `pvp_sig_engine_tick` (extra `_as_bot boolean default false` arg) — either shape works;
Backend has no preference, whichever is less migration churn. **This blocks QA from exercising the bot
path end-to-end and blocks the R2 stat_scale fix 03-db.md §6 flagged** (bot ramp/decay stats have no
working path until this RPC exists — `apply_bot_pvp_signature_effect`'s own `stat_scale` branch is
still untouched/still fires, so nothing is silently broken today, but it's the same double-writer risk
R2 already fixed on the human side).

## 5. `botSigEngineTick` call-site contract (for Frontend / bot driver)

Not in Backend's ownership to wire (that file is `src/components/live-pvp-battle-screen.tsx`, owned by
Frontend). The exact call site:

- Bot driver `useEffect` at `src/components/live-pvp-battle-screen.tsx:1428-1521` — one bot move per
  question, resolved inside the `setTimeout` at line 1440.
- Today it calls `applyBotPvpSignatureEffect` only conditionally, gated by
  `botShouldFireAbility(...)` (line 1502-1509) — that gate is correct to KEEP for the bespoke
  `apply_bot_pvp_signature_effect` call, but is **wrong** to reuse for `botSigEngineTick`: the engine
  tick must fire **unconditionally**, once per bot answer, regardless of `botShouldFireAbility`'s
  aggression roll — otherwise `consecutiveWrong`/`disabled`/`firedThisBattle` bookkeeping desyncs from
  the question loop (03-db.md §3, "call for every answer regardless of whether the ability has a stat
  spec").
- Add a new, unconditional call right after the existing `submitBotPvpMove(...)` call (line
  1495-1501), something like:
  ```ts
  if (botPartnerId != null) {
    void botSigEngineTick(
      matchId,
      idxAtAnswer,
      botPartnerId,
      correct,
      /* triggerFired */ <resolved from the ability's NewSignatureTrigger predicate>,
      /* spec */ <resolved from the ability's SignatureEngineSpec>,
    );
  }
  ```
- `triggerFired` and `spec` (`SigEngineTickSpec`) must be resolved from the bot's `signatureAbilityFor(botPartnerId)`
  catalog row — that resolution logic lives in `signature-abilities.ts` (Frontend-owned, not touched
  here) and must mirror however the human path computes `hitTriggerHolds`/`postTriggerFires` (referenced
  in `signature-rework-types.ts` comments, not yet implemented anywhere — build is paused). Backend has
  no visibility into that resolution; Frontend owns authoring it for both the human and bot paths so
  they can't drift.
- `pvp-bot.ts` (`src/lib/pvp-bot.ts`) was reviewed and required **no changes**: it's pure
  tier/accuracy/timing decision logic with zero RPC or ability-catalog awareness (see
  `botShouldFireAbility`, `botAnswersCorrectly`, etc.) — since `sigEngineTick`/`botSigEngineTick` fire
  unconditionally (not gated by aggression the way the bespoke ability fire is), no new gating helper
  belongs there. `pvp-bot.test.ts` (21 tests) still passes unmodified.

## 6. Human-side call-site pointer (for Frontend, `resolveQuestion`)

`resolveQuestion(idxAtAnswer, correct, elapsedMs)` at `src/components/live-pvp-battle-screen.tsx:988`
is the human parity point — call `sigEngineTick(matchId, idxAtAnswer, partnerId, correct, triggerFired, spec)`
once per answer from there (or from wherever the existing `applyPvpSignatureEffect(matchId, idxAtAnswer,
partnerId, "post_answer")` calls already live inside/near that function — e.g. lines ~1107, ~1314) —
unconditionally, same reasoning as §5. `triggerFired`/`spec` resolution is the same Frontend-owned
catalog work referenced above.

## 7. Unit-test seam (QA owns tests, noting for visibility)

`sigEngineTick`/`botSigEngineTick` are thin RPC callers with no branching logic beyond the two guard
checks and the `ok`/`error`→`reason` mapping — the interesting behavior (stack caps, revert, decay,
disable/re-arm) all lives server-side in `pvp_sig_engine_tick` and isn't unit-testable from the client
without mocking `supabase.rpc`. If QA wants coverage here, the useful seam is: (1) invalid-arg guard
returns without calling `rpc.rpc` at all (spy/mock assertion), (2) `ok:false` response maps `error` →
`reason` correctly, (3) `ok:true` response passes through `hostStages`/`guestStages`/`hostSigRuntime`/
`guestSigRuntime`/`noop` untouched. No existing Vitest file covers `pvp-live.ts` (only
`pvp-bot.test.ts` exists, unaffected and still green — 21/21).

---

## Handoff
- **Status:** done (backend deliverable complete and typechecks/lints clean); **blocked** for
  Frontend/QA's bot-path work specifically on §4's missing `pvp_bot_sig_engine_tick` RPC.
- **Produced:** `src/lib/pvp-live.ts` (added `SigEngineTickSpec`, `sigEngineTick`, `botSigEngineTick`;
  added one type-only import; no existing export renamed/altered). `docs/handoffs/signature-rework/03-backend.md`
  (this file). `src/lib/pvp-bot.ts` reviewed, intentionally unchanged (§5).
- **Next agent:** Frontend Engineer.
- **Context they need:**
  - `sigEngineTick(matchId, questionIndex, pokemonId, correct, triggerFired, spec)` — call
    unconditionally, once per side per answer, from `resolveQuestion`
    (`src/components/live-pvp-battle-screen.tsx:988`) — see §1/§2/§6.
  - `botSigEngineTick` has the identical signature/mapping but targets RPC `pvp_bot_sig_engine_tick`,
    which **does not exist yet** (§4) — wire the call site (§5) but expect it to no-op/error at runtime
    until DB Engineer adds the RPC.
  - `SigEngineTickResult` has no `error` field (frozen stub gap) — read `.reason` on `ok:false`, not
    `.error` (§3).
  - `triggerFired` and `SigEngineTickSpec` (statSpecs/disableKind/disableN/disableNextQuestion) must be
    resolved from the catalog's `SignatureEngineSpec` per ability — that authoring/resolution logic is
    Frontend's to build in `signature-abilities.ts`; Backend only wires the already-resolved values
    through to the RPC.
  - Import `StatChangeSpec`/`SigEngineTickResult` from `@/lib/signature-rework-types` until/unless
    `signature-abilities.ts` re-exports them.
  - `noop:true` is normal, never toast it; toast only on `ok:false`, at the call site (component-owned,
    same division of labor as the existing `applyPvpSignatureEffect` callers).
- **Open questions / risks:**
  - **Blocking:** `pvp_bot_sig_engine_tick` RPC doesn't exist — needs a DB follow-up (new RPC mirroring
    `apply_bot_pvp_signature_effect`'s auth model, or a `_as_bot` flag added to `pvp_sig_engine_tick`
    itself) before the bot path can be exercised end-to-end (§4). Recommend routing this to DB Engineer
    before QA starts on bot-path tests.
  - `apply_bot_pvp_signature_effect`'s own `stat_scale` branch (03-db.md §6) is still live and
    untouched — not broken today, but once `pvp_bot_sig_engine_tick` exists and Frontend re-authors
    ramp/decay rows onto it, the same R2 double-writer risk DB fixed on the human side will need fixing
    on the bot side too (separate migration).
  - Migration `20260710120000` has not been applied to any database (per DB's note) — nothing here was
    verified against a live RPC call; typecheck/lint only.
