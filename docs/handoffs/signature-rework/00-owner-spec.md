# 00 — Owner rework spec (signature abilities) — VERBATIM TRANSCRIPTION

**Feature slug:** `signature-rework`
**Source:** Owner (Paul) screenshot, 2026-07-10.
**Status:** PARTIAL roster (71 rows, Gen I → Gen VII up to Blacephalon). Owner will
supply the remaining Legendary/Mythical rows (Zeraora/Meltan/Melmetal + Gen VIII/IX)
"sooner." This is the AUTHORITATIVE design; it SUPERSEDES the current catalog
`trigger`/`effect`/`note` semantics where they differ.

> Transcribed from an image. Cells marked ⚠ are lower-confidence — verify against the
> owner's source before freezing. Columns: **Name (signatureMove) | Trigger | Extra
> Effect | Cooldown**. "Cooldown" here is really a **disable/expiry condition**, mostly
> tied to *incorrect answers*, not a question-count timer.

| # | Name (signatureMove) | Trigger | Extra Effect | Cooldown / Disable |
|--|--|--|--|--|
|1|Articuno (Freeze-Dry)|3 correct answers in a row|10% chance of inflicting Freeze status to opponent + if opponent has Water typing x2 damage|Disables damage multiplier after 1 incorrect answer|
|2|Zapdos (Thunderous Kick)|3 correct answers in a row|Inflict -1 Defense to opponent, stacks up to 3 per correct after the trigger|Disables stat change after 1 incorrect answer|
|3|Moltres (Fiery Wrath)|3 correct answers in a row|20% chance of inflicting Sleep + increase own Attack by 1, stacks up to 3 per correct after the trigger|Disables stat change after 1 incorrect answer or after 3 questions|
|4|Mewtwo (Psystrike)|3 correct answers in a row|Ignore Defense of opponent during damage calculation; on the next correct, inflict -1 Defense to opponent|After inflicting -1 Defense, next question it is disabled|
|5|Mew (Transform)|Immediately at the start of battle|The ability of the opponent is copied and will activate based on the ability's trigger|Use cooldown requirement of the copied ability; once per battle|
|6|Raikou (Thunder)|3 correct answers in a row|30% chance of inflicting Paralysis status to opponent + increase own Speed by 1, not stacking|Disables stat change after 2 incorrect answers|
|7|Entei (Sacred Fire)|3 correct answers in a row|50% chance of inflicting Burn status to opponent + additional 50% damage for 1 question|After inflicting +50% Damage, next question it is disabled|
|8|Suicune (Aurora Beam)|If inflicted by a status OR HP is below 50%|Cure / remove status condition + heal 50% of damage taken for 3 questions|Disables healing after 3 questions from trigger; once per battle|
|9|Lugia (Aeroblast)|3 correct answers in a row|Increase own Critical by 1, stacks up to 3 per correct after trigger|Disables stat change after 1 incorrect answer|
|10|Ho-Oh (Sacred Fire)|If HP turns to 0|Pokémon is revived/healed with 25% HP, remove status condition + increase own Attack by 1, does not stack|Disables stat change after 2 incorrect answers|
|11|Celebi (Time Travel)|If opponent triggers a signature ability|Immediately disable the opponent's ability + increase own Speed by 2, does not stack|Disables stat change after 2 incorrect answers|
|12|Regirock (Stone Edge)|3 correct answers in a row|Increase own Critical by 2, stacks up to 3 per correct after trigger|Disables stat change after 1 incorrect answer|
|13|Regice (Blizzard)|3 correct answers in a row|10% chance of inflicting Freeze status to opponent + if opponent has Flying, Grass or Ground type increase own Attack by 1, does not stack|Disables stat change after 1 incorrect answer|
|14|Registeel (Flash Cannon)|If inflicted by a status OR HP is below 50%|Inflict -1 Defense to opponent, stacks up to 3 per correct after the trigger + increase own Attack by 1, does not stack|Disables stat change after 1 incorrect answer|
|15|Latias (Mist Ball)|3 correct answers in a row|Inflict -2 Attack to opponent, stacks up to 3 per correct after the trigger|Disables stat change after 1 incorrect answer|
|16|Latios (Luster Purge)|3 correct answers in a row|Inflict -2 Defense to opponent, stacks up to 3 per correct after the trigger|Disables stat change after 1 incorrect answer|
|17|Kyogre (Origin Pulse)|If inflicted by a status OR HP is below 50%|Increase own Attack by 1, Critical by 1, Speed by 1 + if opponent is Groudon x2 damage|Disables stat change after 1 incorrect answer|
|18|Groudon (Precipice Blades)|If inflicted by a status OR HP is below 50%|Inflict -1 Attack, -1 Critical, -1 Speed to opponent + if opponent is Kyogre x2 damage|Disables stat change after 1 incorrect answer|
|19|Rayquaza (Dragon Ascent)|If inflicted by a status OR HP is below 50%|Increase own Crit by 3, decrease own Defense by 2 + if opponent is Kyogre or Groudon x3 damage|Disables stat change after 1 incorrect answer|
|20|Jirachi (Doom Desire)|If inflicted by a status OR HP is below 50%|Add a flat 20 damage on the next question after trigger|After inflicting +20 Damage, next question it is disabled|
|21|Deoxys (Psycho Boost)|3 correct answers in a row|Increase own Attack by 3, then decrease own Attack by 1 per following question (decrease is stacking)|Disables increase stat change after 1 incorrect answer|
|22|Victini (V-create)|3 correct answers in a row|Increase own Crit by 3, decrease own Defense by 2 and Speed by 1, does not stack|Disables stat change after 1 incorrect answer|
|23|Uxie (Future Sight)|Immediately at the start of battle|Inflict a random Status condition to opponent if their HP is below 50%; show that you have predicted [Random status] to happen while opponent is still at 100%|Once per battle only|
|24|Mesprit (Future Sight)|Immediately at the start of battle|Restrict opponent from using any item during battle|Disable effect after 3 incorrect answers|
|25|Azelf (Future Sight)|Immediately at the start of battle|Eliminate a random number [1 to 3] of choices in questions 5, 10, 15 and 20|Disable effect after 3 incorrect answers|
|26|Dialga (Roar of Time)|3 correct answers in a row|Increase own Speed by 3 + if opponent is Palkia x2 damage|Disable stat change after 1 incorrect answer|
|27|Palkia (Spacial Rend)|3 correct answers in a row|Increase own Critical by 3 + if opponent is Dialga x2 damage|Disable stat change after 1 incorrect answer|
|28|Heatran (Magma Storm)|5 correct answers in a row|For 5 turns, decrease the HP of the opponent by 12.5% each turn|Disable stat change after 2 incorrect answers|
|29|Regigigas (Crush Grip)|on the 4th question|First 3 questions, decrease damage to opponent to 0. On the 4th question, x2.5 damage to opponent if opponent's HP is higher than user|Disable stat change after 2 incorrect answers|
|30|Giratina (Shadow Force)|on the 2nd and 12th question|First and 11th question, receive 0 damage from opponent. On the 2nd and 12th question, x2 damage to opponent|Applied only on selected questions|
|31|Cresselia (Lunar Dance)|If inflicted by a status OR HP is below 50%|Heal to 100% HP, remove status condition|Once per battle only|
|32|Phione (Bubble Beam)|3 correct answers in a row|Inflict -1 Speed to opponent, stacks up to 3 correct after the trigger + increase own Speed by 1, stacks up to 3 correct after the trigger|Disable stat change after 2 incorrect answers|
|33|Manaphy (Heart Swap)|If opponent triggers a signature ability|Multiply by negative 1 the stat effect of the opponent (a negative effect becomes positive)|Disable stat change after 2 incorrect answers|
|34|Darkrai (Dark Void)|3 correct answers in a row|100% chance of inflicting Sleep status to opponent + if opponent has Psychic or Ghost typing x2 damage|Disable stat change after 1 incorrect answer|
|35|Shaymin (Seed Flare)|3 correct answers in a row|Inflict -2 Defense to opponent + increase own Attack by 1, does not stack|Disable stat change after 1 incorrect answer|
|36|Arceus (Judgment)|on every question|Inflict random damage from 1% to 10% of HP per question (does not count the regular damage from answering the question)|(blank)|
|37|Cobalion (Sacred Sword)|on every question|Ignore Defense of opponent during damage calculation|Disable stat change after 1 incorrect answer|
|38|Terrakion (Sacred Sword)|on every even-numbered question|Ignore Defense of opponent during damage calculation + increase own Defense by 1, does not stack|Disable stat change after 1 incorrect answer|
|39|Virizion (Sacred Sword)|on every odd-numbered question|Ignore Defense of opponent during damage calculation + increase own Attack by 1, does not stack|Disable stat change after 1 incorrect answer|
|40|Tornadus (Bleakwind Storm)|3 correct answers in a row|20% chance of inflicting Confusion status to opponent + increase own Speed by 3, does not stack|Disable stat change after 2 incorrect answers|
|41|Thundurus (Wildbolt Storm)|3 correct answers in a row|20% chance of inflicting Paralysis status to opponent + increase own Speed by 3, does not stack|Disable stat change after 2 incorrect answers|
|42|Reshiram (Blue Flare)|3 correct answers in a row|20% chance of inflicting Burn status to opponent + increase own Attack by 1 and Crit by 1, does not stack + if opponent is Zekrom x2 damage|Disable stat change after 2 incorrect answers|
|43|Zekrom (Bolt Strike)|3 correct answers in a row|20% chance of inflicting Paralysis status to opponent + increase own Attack by 1 and Crit by 1, does not stack + if opponent is Reshiram x2 damage|Disable stat change after 2 incorrect answers|
|44|Landorus (Sandsear Storm)|3 correct answers in a row|20% chance of inflicting Burn status to opponent + increase own Speed by 3, does not stack|Disable stat change after 2 incorrect answers|
|45|Kyurem (Glaciate)|3 correct answers in a row|20% chance of inflicting Freeze status to opponent + inflict -2 Speed to opponent, stacks up to 3 correct after the trigger + if opponent is Zekrom or Reshiram x2 damage|Disable stat change after 2 incorrect answers|
|46|Keldeo (Sacred Sword)|on every question|Ignore Defense of opponent during damage calculation + increase own Defense by 2 and Attack by 2|Disable stat change after 2 incorrect answers|
|47|Meloetta (Relic Song)|3 correct answers in a row|20% chance of inflicting Sleep + increase own Attack by 1, does not stack|Disable stat change after 2 incorrect answers|
|48|Genesect (Techno Blast)|3 correct answers in a row|Inflict a random Status condition to opponent + increase a random stat by 1, does not stack|Disable stat change after 2 incorrect answers|
|49|Xerneas (Geomancy)|on the 2nd question|First question, decrease damage to opponent to 0. On the 2nd question, increase own Attack by 2, Defense by 2 and Speed by 2|Disable effect after 3 incorrect answers|
|50|Yveltal (Oblivion Wing)|on every question|Heal by 75% of the damage the user inflicts to the opponent (e.g. user inflicts 10 damage → partner healed by 7.5)|(blank)|
|51|Zygarde (Thousand Waves)|3 correct answers in a row|If opponent has Flying type x2 damage; if not, increase Attack by 1 and Defense by 1|Disable stat change after 2 incorrect answers|
|52|Diancie (Diamond Storm)|3 correct answers in a row|Increase own Defense by 2, stacks up to 3 correct after the trigger|Disable stat change after 2 incorrect answers|
|53|Hoopa (Hyperspace Hole)|on every question|Ignore Defense of opponent during damage calculation if answered correct; if [incorrect] inflict -2 Defense to own ⚠|(blank)|
|54|Volcanion (Steam Eruption)|3 correct answers in a row|30% chance of inflicting Burn status to opponent + increase own Crit by 2, does not stack|Disable stat change after 1 incorrect answer|
|55|Type: Null (Multi-Attack)|Immediately at the start of battle|First question, decrease damage to opponent to 0. On the 2nd question, x1.5 damage|Disable stat change after 2 incorrect answers|
|56|Silvally (Multi-Attack)|Immediately at the start of battle|First question, decrease damage to opponent to 0. On the 2nd question, x2 damage|Disable stat change after 2 incorrect answers|
|57|Tapu Koko (Nature's Madness)|5 correct answers in a row|Halve the current HP of the opponent + increase own Speed by 1|Once per battle only|
|58|Tapu Lele (Nature's Madness)|5 correct answers in a row|Halve the current HP of the opponent + increase own Crit by 1|Once per battle only|
|59|Tapu Bulu (Nature's Madness)|5 correct answers in a row|Halve the current HP of the opponent + increase own Attack by 1|Once per battle only|
|60|Tapu Fini (Nature's Madness)|5 correct answers in a row|Halve the current HP of the opponent + increase own Defense by 1|Once per battle only|
|61|Cosmog (Splash)|Immediately at the start of battle|First 3 questions, decrease damage to opponent to 0. On the 4th question, halve the current HP of the opponent|Once per battle only|
|62|Cosmoem (Cosmic Power)|3 correct answers in a row|Increase own Defense by 2, stacks up to 3 correct after the trigger + increase Attack by 1|Disable stat change after 1 incorrect answer|
|63|Solgaleo (Sunsteel Strike)|If opponent triggers a signature ability|Immediately disable the opponent's ability + Ignore Defense of opponent during damage calculation + if opponent is Lunala x2 damage|Disable stat change after 1 incorrect answer|
|64|Lunala (Moongeist Beam)|If opponent triggers a signature ability|Immediately disable the opponent's ability + increase Defense by 2, does not stack + if opponent is Solgaleo x2 damage|Disable stat change after 1 incorrect answer|
|65|Necrozma (Photon Geyser)|3 correct answers in a row|50% chance of inflicting Confusion status to opponent + increase Attack by 1, does not stack|Disable stat change after 1 incorrect answer|
|66|Magearna (Fleur Cannon)|3 correct answers in a row|Increase own Attack by 3, then decrease own Defense by 1 per following question (decrease is stacking)|Disables increase stat change after 1 incorrect answer|
|67|Marshadow (Spectral Thief)|If opponent uses an item|Use the effect of the opponent's used item (e.g. opponent uses Potion → user is healed)|(blank)|
|68|Poipole (Fell Stinger)|Immediately at the start of battle|First 5 questions, decrease damage to opponent to 50%. On the 6th question, x3 damage|Disable stat change after 1 incorrect answer|
|69|Naganadel (Air Slash)|Immediately at the start of battle|First 3 questions, decrease damage to opponent to 75%. On the 4th question, x2 damage|Disable stat change after 1 incorrect answer|
|70|Stakataka (Gyro Ball)|Immediately at the start of battle|First 3 questions, decrease damage to opponent to 0. On the 4th question, x1.5 damage + increase Attack by 2, does not stack|Disable stat change after 1 incorrect answer|
|71|Blacephalon (Mind Blown)|Immediately at the start of battle|First question, x5 damage. On the 2nd-to-last question, decrease damage to opponent to 75%|Disable stat change after 1 incorrect answer|

---

## Derived mechanic vocabulary (for PO/Architect — verify against the table)

**Trigger types used:**
- `N correct answers in a row` (N = 3 or 5) — streak gate.
- `Immediately at the start of battle`.
- `on every question`.
- `on every even-numbered question` / `on every odd-numbered question`.
- `on the Nth question` / `on the Nth and Mth question` (specific indices).
- `If inflicted by a status OR HP is below 50%` — reactive self-condition (NEW).
- `If opponent triggers a signature ability` — reactive to opponent (NEW).
- `If HP turns to 0` — on-faint / revive hook (NEW).
- `If opponent uses an item` — reactive to opponent item (NEW).

**Effect patterns:**
- Stat change, `stacks up to 3 per correct after the trigger` (ramp) vs `does not stack` (one-shot).
- Decaying self-buff: `+X now, then -1 per following question, decrease is stacking`.
- Conditional damage multiplier: `if opponent is [Type] xN damage` / `if opponent is [specific mon] xN damage`.
- Status infliction with `P% chance`.
- Heal (flat %, or % of damage dealt = lifesteal), revive at % HP, cure status.
- HP-fraction damage (`halve current HP`, `1–10% per question`, `12.5%/turn for 5 turns`).
- Flat damage on next question.
- Phase-based damage windows: `first N questions decrease damage to X%`, then `xM on question N+1`.
- Ignore Defense in damage calc (conditional on correct).
- Disable opponent's ability; item lockout; choice elimination on specific questions; predicted-status reveal.

**Cooldown / disable semantics (NEW column):**
- `Disable[s] stat change after N incorrect answers` (N = 1 or 2) — the dominant pattern.
- `Disables increase stat change after 1 incorrect answer` (only the increase portion; decay may continue).
- `Disables damage multiplier / healing after ...`.
- `After inflicting [X], next question it is disabled`.
- `Once per battle only`.
- `Disable effect after 3 incorrect answers`.
- `Applied only on selected questions`.
- `Disables stat change after 1 incorrect answer OR after 3 questions`.
- Some blank (Arceus, Yveltal, Hoopa, Marshadow) — no disable condition.

---

## Notes for the pipeline
- This SUPERSEDES the old per-ability `trigger`/`effect` in `src/lib/signature-abilities.ts`
  for these 71; the old catalog + the audit `00-coverage-audit.md` are now reference only.
- Roster is PARTIAL — the engine/mechanics are the priority; per-ability data lands
  incrementally as the owner supplies rows. Dex-id mapping: reuse existing ids in the
  current catalog (names match).
- Everything is server-authoritative today (stages/HP/statuses via Supabase RPCs), so
  the "disable after N incorrect" expiry, stacking caps, conditional multipliers, and
  phase windows need DB/backend work, not client-only.
