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
