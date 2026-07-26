## Delegation
The higher your tier, the more you delegate. Push the
work down, keep your own context for judgment.
Brief every child: the context, the why, what done
looks like. It starts blank and inherits nothing.

| Model    | Best for               | Delegate?          | Effort |
|----------|-------------------------|---------------------|--------|
| Haiku    | bulk mechanical          | never               | low    |
| Sonnet   | scoped research          | when it helps       | medium |
| Opus 4.8 | multi-step reasoning     | on clear benefit    | xhigh  |
| Fable 5  | judgment, taste          | by default          | medium |

Fable goes xhigh only for the hardest calls. Skip high.

## Escalation
The parent doesn't have to be the top model. An Opus
parent spawns a Fable child for the one hard call.
The child answers and returns.
Work above your tier? Return it, don't burn tokens on it.

## Signature abilities: never infer liveness. Compute it.
In this codebase a function can be exported, imported,
called from the live battle screen, AND backed by rows
in production — and still be stone dead, because of one
guard at the top of its body:

    if (!ability || isEngineOwned(ability)) return [];

All 104 rows have an `engine`, so any path carrying that
guard returns empty every time. Names, call-graph edges
and database rows CANNOT see this. Reading those three
and concluding "it's live" has produced four wrong
findings, one of which nearly deleted 20 abilities.

Names lie in BOTH directions:
  - `evaluateBattleStart` looked live. It was dead.
  - `hasServerManualEffect` looks legacy. It is LIVE.
  - `manual` no longer means player-fired. The Fire
    button is gone; manual-phase rows are the payload a
    row's ENGINE trigger auto-delivers (`fireManualAuto`).

BEFORE claiming any path is dead/live, or deleting
anything in the signature system, run:

    npx vite-node -c scripts/balance-sim/vite.config.ts \
      scripts/balance-sim/liveness.ts

It reads the real source, finds the guards, and computes
the answer from the catalog. Trust it over your reading
of the code, and over any comment — including this one.

Then falsify: delete the thing, re-run the balance sim
(`run.ts`, same battles/pair as the baseline). If it was
truly dead, results are BYTE-IDENTICAL. If numbers move,
it was live and you were wrong.

Falsify RENAMES too — a pure rename must also come back
byte-identical. `scripts/` is NOT in tsconfig, so tsc will
not check the simulator: a stale string comparison there
compiles fine and silently un-wires abilities. That is a
real bug caught this way (103/104 rows moved on a rename).

## Two vocabularies, one word: `manual`
TypeScript says `capped_payload`. The DATABASE phase token
is still the string `'manual'` — a wire protocol the client
sends, live RPCs filter on, and 20 production rows carry.
They are NOT interchangeable. `gen-signature-sql` maps
between them via `DB_PHASE`; never emit `phase: a.wiring`
again, and never compare a trigger/wiring to `"manual"`.
Neither mistake is caught by the compiler.

## The engine is not the only implementation
`apply_pvp_live_answer_v2` RECOMPUTES the human's streak,
wrong-streak and confusion in PL/pgSQL and writes its own
answer — it ignores `_next_state` for those columns. Its
bot twin, `apply_bot_pvp_move_v2`, does the opposite and
stores `_next_state->>'confusedTicksLive'` verbatim.

So a rule added to `engine/pvp-live-answer.ts` takes effect
for the BOT and silently does nothing for the PLAYER. That
shipped once: Shield Dust's confusion immunity passed unit
tests, tsc and a live Edge Function deploy while production
kept arming `host_confused_ticks_live` on a shield-dust
partner.

Before believing any per-answer rule is live, check the SQL:

    select (regexp_matches(pg_get_functiondef(p.oid),
      '(v_confused_ticks :=[^;]{0,140};)', 'g'))[1]
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='apply_pvp_live_answer_v2';

Then confirm against the ROW after a real battle
(`host_confused_ticks_live`, `host_streak_live`), not
against the test suite. Neither side of this duplication is
visible to the compiler.
