// The action/event vocabulary for a server-authoritative solo battle
// (02-architecture.md P3 scope). Isomorphic types only, matching the existing
// engine/ convention of freezing a contract before building against it.
//
// NOT included here: `reduce()` / `replay()`. Solo battle's actual damage
// formula (src/components/battle-screen.tsx's handleAnswer) is ~50 distinct
// per-ability special cases (Dragon Dance, Aerilate, Guts, Blaze, Moxie,
// Cursed Body, ...) tightly interleaved with React state, timers, and toast
// side effects. Porting that into a pure reducer is a real behavior-preserving
// rewrite of live game-balance logic — exactly the kind of change this
// codebase has gotten subtly wrong before when eyeballed rather than verified
// (see CLAUDE.md's signature-ability liveness warning; the rolled-ability
// system here has the same shape of risk, just no balance-sim harness built
// for it yet). Shipping a guessed port under this contract without a
// regression harness to diff it against battle-screen.tsx's real output on
// fixed seeds/action-logs would risk silently changing every player's battle
// balance. That harness — or an explicit decision to accept the risk — should
// exist before `reduce()`/`replay()` are written, not after.
import type { ItemId } from "../content/items/item-def";
import type { StatusKind } from "../content/statuses/status-def";

/** A client-submitted action in a solo battle. */
export type BattleAction =
  | { type: "submit_answer"; questionIdx: number; choiceIdx: number; elapsedMs: number }
  | { type: "use_item"; itemId: ItemId }
  | { type: "forfeit" };

/** A server-emitted event resulting from applying one BattleAction. */
export type BattleEvent =
  | { type: "damage_dealt"; target: "player" | "enemy"; amount: number; crit?: boolean }
  | { type: "status_applied"; target: "player" | "enemy"; kind: StatusKind }
  | { type: "status_cured"; target: "player" | "enemy"; kind: StatusKind }
  | { type: "item_consumed"; itemId: ItemId }
  | { type: "battle_ended"; won: boolean };
