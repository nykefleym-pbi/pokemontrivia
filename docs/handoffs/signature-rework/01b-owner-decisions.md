# 01b — Owner decisions (gates the Architect)

**Date:** 2026-07-10. Resolves the highest-risk open questions from `01-spec.md`.
These are FROZEN; the Solution Architect designs against them.

## Owner-ruled (authoritative)

1. **Disable-after-N-incorrect → REVERT stacks to 0.** When an ability's
   "disable stat change after N incorrect answers" condition is met, the stat
   buff/debuff it applied is **removed (reverted to 0)** — the player loses the
   accumulated stacks on a wrong answer. (Strongest anti-compounding, matches the
   owner's "stats shouldn't last all battle" intent.) For "disable increase only"
   (Deoxys/Magearna) this reverts the *increase* portion; the decaying part follows
   its own rule. For "after inflicting X, next question it is disabled," the effect
   simply does not apply on the next question.

2. **Counter = CONSECUTIVE; re-trigger RE-ARMS.** The incorrect-answer counter is
   **consecutive** — a correct answer resets it to 0. Once it reaches N the effect is
   disabled/reverted, but **re-meeting the trigger** (e.g. another 3-correct-in-a-row)
   **re-enables** the ability and it may build again. Not a permanent battle-long lockout.

3. **Stacking: TRIGGER FIRE = STACK 1, cap +3 TOTAL.** "stacks up to 3 per correct
   after the trigger" → meeting the trigger applies the first stack (e.g. +1), and
   each subsequent correct answer adds one more, to a maximum of **+3 total** for that
   effect (e.g. Diamond Storm +2 Def: trigger → +2, but capped at the +3 stage clamp;
   for +1-per-correct effects: trigger → +1, +2, +3). Where the stated per-fire value
   already exceeds the cap, clamp at +3 (the existing global stage clamp).

4. **Sequencing: ENGINE FIRST NOW.** Build the generalized engine (triggers, stacking,
   disable/revert, conditional multipliers, phase windows) against the **71 provided
   rows now**; the remaining Legendary/Mythical rows are added as data when the owner
   sends them. Milestones per `01-spec.md` (M1 engine → M2 multipliers/phases/data →
   M3 hard bespoke + pending roster).

## Owner-CONFIRMED (2026-07-10, second round — promoted from defaults)

5. **Bot/opponent parity — CONFIRMED (reinforced 2026-07-10).** Signature abilities
   affect BOTH the user and the opponent/bot. Both sides run their OWN signature
   ability fully: the opponent's/bot's signature buffs, debuffs, statuses, damage
   multipliers, heals, and disable/revert tracking are all active and resolve against
   the user exactly as the user's resolve against the opponent. The engine is
   **symmetric and per-side** — the new `*_sig_runtime` state must be tracked
   independently for host AND guest (stacks, consecutive-wrong counter, disabled flag,
   firedThisBattle, phase index per side). No user-only shortcut.
6. **Blank "Cooldown" cells — CONFIRMED permanent all battle** (Arceus, Yveltal,
   Hoopa, Marshadow): no disable condition, effect active the whole battle.
7. **Multiplier scope — CONFIRMED answer-damage only.** "xN damage" / "ignore Defense"
   apply to the damage dealt on a correct answer, not to separate effect damage
   (flat / HP-fraction).
8. **Fixed-question triggers — CONFIRMED they assume the battle length.** (Giratina
   2nd/12th; Azelf q5/10/15/20; "2nd-to-last".) Architect must still read the ACTUAL
   question count from the live-PvP code and wire the indices to it.
9. **Signature AND type ability BOTH fire for a Legendary/Mythical — CONFIRMED, either
   side.** Whichever side (user or opponent) has a Legendary/Mythical partner gets
   BOTH its (reworked) signature ability effect AND its type-ability effect. The
   rework must PRESERVE the dual-firing already shipped in commit 8a0cab9 — do not
   let the signature rework re-suppress the type ability. Both sides symmetric.
10. **Hoopa (Hyperspace Hole), row 53 — owner says confirm.** Treated as CONFIRMED per
    the current transcription ("ignore Defense during damage calc if answered correct;
    if incorrect, inflict -2 Defense to self"). Orchestrator is echoing this back to
    the owner for a final sanity check; proceed unless corrected.

## Orchestrator defaults (Architect may refine; not owner-blocking)

- **Global clamp:** all stat stacking/decay operates **within the existing ±3 stage
  clamp**; decreases floor at -3, increases cap at +3. Revert-to-0 sets the ability's
  contribution back to 0 (net stage recomputed).
- **Effect ordering** in one question (Architect to finalize a deterministic order):
  own buffs → opponent debuffs → ignore-Def/multiplier applied to damage → status
  infliction → HP-fraction/flat effect damage → heal/lifesteal.
