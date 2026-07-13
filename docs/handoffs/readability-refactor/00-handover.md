# Handover — Signature-ability readability refactor

**Written 2026-07-13.** Everything below was verified against the shipped code on that
date. Where something is *believed* but not verified, it says so.

**Purpose.** Over one session, five separate confident-but-wrong conclusions were drawn
about this code. One came within a single approval of deleting 20 Pokémon's abilities.
None of them were careless reading — they were the *predictable* result of how the code
is currently shaped. This document explains the shape, and proposes the refactor that
makes the mistake impossible rather than merely discouraged.

---

## 1. The failure, and why it is structural

Every wrong conclusion had the same form:

> This code **exists**, and it is **reachable** (imported, called from the live battle
> screen, backed by rows in production). Therefore it **does what its name says**.

That inference is invalid *here specifically*, because liveness is decided by a guard
clause that none of those three signals can see:

```ts
function isEngineOwned(a: SignatureAbility) { return a.engine !== undefined; }

export function evaluatePostAnswer(ability, ctx) {
  if (!ability || isEngineOwned(ability)) return [];   // ← the whole story
  ...
}
```

**All 104 rows have an `engine`.** So every function carrying that guard returned empty
on every call, in every match, forever. The RPCs gated on their output never fired. The
database rows they would have read were inert. And nothing about the *name*, the *call
graph*, or the *data* revealed any of it.

Worse, **names mislead in both directions**:

| Symbol | Looked | Was |
|---|---|---|
| `evaluateBattleStart` | live (2 call sites, 5 DB rows) | **dead** |
| `evaluateHitModifiers` (signature-abilities) | live (called in battle screen) | **dead** |
| `hasServerManualEffect` | dead legacy junk (`wiring: "manual"`, a `phase='manual'` table, a name implying a button that no longer exists) | **LIVE — deleting it strips 20 abilities** |

The last row is the important one. A refactor that only deletes "obviously legacy"
things will delete a live path. **Do not trust names. Compute.**

---

## 2. Verified current state

### 2.1 What actually delivers a signature ability

**One thing: the engine tick.** `sigEngineTick` (client) → `_pvp_sig_engine_apply`
(server), reading magnitudes from `pvp_signature_effects` in the phases
`engine_status`, `m4_fx`, `m4_window`, and `manual`.

The entire legacy delivery layer has been deleted (see §4). What remains of it is
**vestigial data**, described next.

### 2.2 What `wiring` means NOW (this is the crux)

`wiring` is **no longer a delivery mode**. It has decayed into two unrelated jobs:

1. **A code-generation directive.** `scripts/gen-signature-sql.ts` reads `wiring` +
   `effect` + `trigger.usesPerBattle` to emit the `pvp_signature_effects` rows. This is
   LIVE and load-bearing — it is where the server's magnitudes come from.
2. **A toast selector.** `live-pvp-battle-screen.tsx:1736` shows the
   "🔒 Signature move suppressed!" message when `wiring === "post_answer"`. That is the
   *only* runtime read of `wiring` left.

It no longer routes anything.

### 2.3 The three vocabularies problem

A catalog row carries **three overlapping descriptions of the same ability**, and
`SignatureAbility` makes all of them **required**:

| Field | Status | Read by |
|---|---|---|
| `trigger` | vestigial, EXCEPT `trigger.usesPerBattle` | codegen (uses cap); `cappedPayloadUses` |
| `effect` | **LIVE, but only through codegen** | `gen-signature-sql` → DB magnitudes |
| `wiring` | see §2.2 | codegen; the suppression toast |
| `engine` | **the real ability** | the engine tick — everything the player experiences |

So `effect: selfStage("attack", 1)` on a row reads exactly like intent — and it *is*
intent, for the database — while `engine` says something completely different and is what
actually happens in a match. **A reader has no way to know which one is the ability.**

This is the root cause. Everything in §3 is a symptom of it.

### 2.4 `post_answer` is nearly all dead data

`post_answer` is reached from exactly **two hardcoded call sites**: Thunderclap #1021
(`live-pvp-battle-screen.tsx:986`) and Moltres #146 (`:1505`). ~31 catalog rows carry
`wiring: "post_answer"`, and `gen-signature-sql` emits **39 post_answer rows** — but only
#1021's and #146's can ever fire. The rest are inert.

`scripts/balance-sim/audit.ts` reports these as `INERT_POST_ANSWER` (21 warnings against
production).

### 2.5 `manual` means "automatic" (partially fixed)

The Fire button was removed (`fa4d738`: *"signature moves are AUTOMATIC — a player never
taps a Fire button"*). A row's `manual`-phase effects are the **capped payload its own
engine trigger delivers**, auto-fired by `fireCappedPayload`, limited to the uses it
always had.

The TypeScript has been renamed to `capped_payload`. **The DATABASE phase token is still
the literal string `'manual'`** — deliberately. It is a wire protocol: the client sends
it, live RPC bodies filter `phase = 'manual'`, and 19–20 production rows carry it. See
§5 for whether to finish this.

---

## 3. Root causes to fix

| # | Root cause | Evidence |
|---|---|---|
| **R1** | **Liveness is invisible.** A guard clause, not the call graph, decides what runs. | 4 dead evaluators that all *looked* live |
| **R2** | **Three vocabularies per row** (`trigger`/`effect`/`wiring` vs `engine`), all required, describing different behaviour. | §2.3 — the root |
| **R3** | **One word, two vocabularies.** `manual` = a TS wiring label AND a DB phase token. | `gen-signature-sql` did `phase: a.wiring` — renaming the label would have emitted rows no RPC reads, silently un-wiring 20 abilities. The compiler cannot see it (`phase` is `string`). |
| **R4** | **Duplicate exported names.** | TWO `evaluateHitModifiers` (one dead, one live) **both imported into the same file**. TWO `clampStage` — one reading the constants, one hardcoding `-3..3` as a hand-copied "mirror". |
| **R5** | **Comments carry load-bearing claims.** They cannot be checked and go stale. | `engine.ts`: *"Legacy passive_damage modifiers still fold in alongside the engine"* — they never did. The old `audit.ts` asserted liveness **in prose**. |
| **R6** | **`scripts/` is outside `tsconfig`.** The simulator is never typechecked. | A stale `=== "manual"` compiled fine and silently zeroed the use-cap on all 20 capped-payload abilities. Caught only by the byte-identical sim test. |
| **R7** | **Inert data reads as load-bearing.** | ~19 inert `post_answer` row sets; 5 inert `battle_start` rows (now deleted). |

---

## 4. Already done (2026-07-13) — do not redo

| Commit | What |
|---|---|
| `ef5f998` | Deleted `evaluateBattleStart`, the `battle_start` WiringMode, its 2 call sites, and the 5 production rows (migration applied + verified). |
| `37ba6f4` | **`scripts/balance-sim/liveness.ts`** — computes which delivery paths can run, from source + catalog. |
| `364d3bf` | Deleted the dead client-armed one-hit modifier path. |
| `7a71ad7` | De-duplicated `clampStage`; rebuilt graphify correctly. |
| `c3ad50d` | Deleted the legacy delivery layer (`evaluatePostAnswer`, `evaluatePassiveDamageSideEffects`, `evaluateHitModifiers`) — **and with it the duplicate-name trap**. |
| `5c46b1f` | Renamed `manual` → `capped_payload` (TypeScript only). Added the `DB_PHASE` map. |
| `8a313ed` | `CLAUDE.md` rules. |

State: **246/246 tests, tsc clean, audit reports 0 bugs / 21 inert-data warnings.**

---

## 5. The refactor

Ordered so that each phase is independently shippable and independently *provable*. **Do
not batch them.**

### Phase 1 — Collapse the three vocabularies into one (fixes R2, the root)

The goal: **a row describes its ability exactly once.**

Move what codegen needs INTO the engine spec, then delete the legacy fields:

```ts
interface SignatureEngineSpec {
  trigger: NewSignatureTrigger;
  // ... existing
  /** The server-catalog payload this trigger delivers, and its per-battle cap.
   *  Replaces the legacy `effect` + `wiring` + `trigger.usesPerBattle`. */
  payload?: { effects: SignatureEffect[]; uses?: number };
}

interface SignatureAbility {
  pokemonId: number;
  signatureMove: string;
  internalKey: string;
  rarity: number;
  engine: SignatureEngineSpec;   // ← now REQUIRED, and the ONLY description
  note?: string;
}
```

Then:
- `gen-signature-sql` reads `engine.payload`, not `effect`/`wiring`.
- Delete `trigger`, `effect`, `wiring`, `WiringMode`, `SignatureTrigger`.
- The suppression toast (§2.2) needs a replacement condition — **it is the only runtime
  reader of `wiring`**. Suggest `engine.payload !== undefined`, but CONFIRM against
  intent: today it fires for `post_answer` rows only, which is now an arbitrary set.
- `isEngineOwned` disappears — every row is engine-owned by construction. **This is the
  point: R1 becomes structurally impossible.** There is no legacy path to be dead.

**Exit test:** `gen-signature-sql` output is **byte-identical** to today's (39
`post_answer` + 19 `manual` rows, same magnitudes). Balance sim byte-identical. Diff the
generated SQL against the current `pvp_signature_effects` dump before applying anything.

**Risk:** this is the big one. `effect` currently feeds the DB. Get the codegen diff to
zero before deleting a single field.

### Phase 2 — Retire the inert `post_answer` data (fixes R7)

Only #1021 and #146 can fire `post_answer`. Everything else is dead weight that reads as
live.

- Give #1021 and #146 an honest, explicit path (they are hardcoded call sites — make that
  visible, e.g. `engine.payload` with a `post_answer` DB phase, or fold them into the
  engine tick properly).
- Delete the other ~19 inert row sets from `pvp_signature_effects`.
- `audit.ts` should then report **0 warnings**, not 21.

**Exit test:** balance sim byte-identical; audit clean; a live Thunderclap and Moltres
match still work (manual QA — the sim does not cover the hardcoded call sites well).

### Phase 3 — Finish the `manual` → `capped_payload` rename into the database (fixes R3)

**Only if Phase 1 lands first**, which removes the `wiring`→`phase` coupling entirely.

Sequenced so no live match breaks:
1. Make the RPCs accept **both** `'manual'` and `'capped_payload'`.
2. Ship the client that sends `'capped_payload'`.
3. Migrate the rows: `update pvp_signature_effects set phase='capped_payload' where phase='manual'`.
4. Drop `'manual'` from the RPCs and the check constraint.

**If you are not going to do all four steps in order, do not start.** A gap between 2 and
3 breaks matches in progress. Leaving the DB token as `'manual'` forever is an
*acceptable* outcome — the meaning is unambiguous inside SQL. This is a nice-to-have.

### Phase 4 — Put `scripts/` under the typechecker (fixes R6)

Add `scripts/**` to `tsconfig` (or a `tsconfig.scripts.json` in the lint/CI step). The
simulator is a measuring instrument the balance decisions depend on; it currently is not
typechecked at all. A stale string comparison in it silently produced *wrong balance
numbers*.

**Exit test:** `tsc` covers `scripts/`; the known-good sim run is still byte-identical.

### Phase 5 — Ban the re-introduction (fixes R4, R5)

- **Lint rule / CI check: no duplicate exported symbol names across `src/lib`.** This
  alone would have caught both `evaluateHitModifiers` and `clampStage` on the day they
  were introduced.
- **Never hand-copy a constant or a clamp.** `signature-bespoke.ts` had a "mirror of the
  shipped ±3 stage clamp" that hardcoded the bounds. A mirror is a bug with a delay on it.
- **No load-bearing claim in a comment.** If a fact matters, encode it as code that
  recomputes itself (that is what `liveness.ts` is). The old `audit.ts` asserted liveness
  in prose and the prose was wrong.

---

## 6. Guardrails that already exist — USE THEM

```bash
# 1. Which delivery paths can actually run? (source + catalog, not names)
npx vite-node -c scripts/balance-sim/vite.config.ts scripts/balance-sim/liveness.ts

# 2. Do catalog, delivery path and production DB agree?
npx vite-node -c scripts/balance-sim/vite.config.ts scripts/balance-sim/audit.ts

# 3. FALSIFY. This is the one that matters.
npx vite-node -c scripts/balance-sim/vite.config.ts scripts/balance-sim/run.ts -- 200
```

**The falsification rule.** After deleting anything you believe is dead — or after any
pure rename — re-run the sim at the **same battles/pair as the baseline** and compare
`rr` per `id`. Truly-dead code and pure renames must come back **byte-identical: 0 of 104
rows moved, 0.0000pp.**

This is not ceremony. It caught two real bugs on the day it was written:
- the rename returned **103/104 rows moved, up to 4.7pp** → a stale `=== "manual"` in the
  un-typechecked simulator had zeroed the use cap on 20 abilities;
- and it *proved* the battle_start / armed-hit / legacy-layer deletions were safe when
  everything else about them looked ambiguous.

**Graphify** (`graphify-out/`) is good for *where to read* and for **name collisions** —
it found the `clampStage` duplicate. It is NOT a liveness oracle: a `calls` edge proves
reachability of the *call*, not of the *work*. And **rebuild it sequentially**
(`extract(..., parallel=False)`) — the parallel pool crashes on this repo and silently
produces a graph with **one third of the nodes**, which is worse than no graph.

---

## 7. Open decisions for the owner

1. **The suppression toast (§2.2 / Phase 1).** Today "🔒 Signature move suppressed!" shows
   only for `wiring: "post_answer"` rows — a set that no longer means anything. After the
   refactor, which abilities should show it? (Suggest: any ability that had a payload to
   deliver and was blocked. Needs confirming.)
2. **Thunderclap #1021 and Moltres #146** are hardcoded exceptions to an otherwise
   uniform engine. Fold them into the engine, or keep them explicit and documented?
3. **Phase 3 (DB rename)** — worth the migration risk, or leave `'manual'` in SQL forever?

Per the owner's standing rule: **surface ambiguities, do not auto-resolve them.**

---

## 8. If you read nothing else

- The engine is the ability. Everything else on a catalog row is either **codegen input**
  or **vestigial** — and you cannot tell which by looking.
- **Run `liveness.ts` before you delete anything.** Names lie in both directions.
- **Then falsify.** Dead code and pure renames leave the simulation byte-identical. If the
  numbers move, you were wrong.
