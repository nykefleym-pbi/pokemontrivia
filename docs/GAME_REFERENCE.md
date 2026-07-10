# Pokémon Trivia Battle — Game Reference

> A comprehensive, source-accurate reference for the game exactly as it exists in the codebase. Every number, formula, cost, name, and effect below is transcribed directly from the source and cited inline as `` (`path`) `` so future readers can verify it. This is a living reference for the product owner; where the code itself flags a simplification or an unwired mechanic, that is called out honestly rather than papered over.

**Last updated:** 2026-07-07

---

## Table of Contents

1. [Overview & Modes](#1-overview--modes)
2. [Progression: Levels / XP / Ranks](#2-progression-levels--xp--ranks)
3. [Rewards & Economy Calculations](#3-rewards--economy-calculations)
4. [Solo Battle Combat Math](#4-solo-battle-combat-math)
5. [Type Abilities](#5-type-abilities)
6. [Signature Abilities (Legendary / Mythical)](#6-signature-abilities-legendary--mythical)
7. [PvP System (Nearby Battle)](#7-pvp-system-nearby-battle)
8. [Status Conditions](#8-status-conditions)
9. [Items](#9-items)
10. [Berries (PvP-only)](#10-berries-pvp-only)
11. [Poké Egg & Hatching](#11-poké-egg--hatching)
12. [Pokédex / Partners / Evolution](#12-pokédex--partners--evolution)
13. [Shop](#13-shop)
14. [Backend / Architecture Appendix](#14-backend--architecture-appendix)
15. [Known Simplifications / Not-Yet-Wired](#15-known-simplifications--not-yet-wired)

---

## 1. Overview & Modes

The game is a Pokémon-trivia PWA. The player picks a partner Pokémon, answers multiple-choice trivia questions across several modes, and every mode feeds a shared economy (XP, coins, Training Points, items, Poké Eggs). Questions are served from a curated Supabase bank with an AI gateway and a bundled offline fallback bank of 30 questions `` (`src/lib/game-data.ts` `FALLBACK_QUESTIONS`) ``.

| Mode | Where | Length | Core loop |
|------|-------|--------|-----------|
| **Regular Battle** | `battle-screen.tsx`, `routes/battle.tsx` | 20 questions `` (`src/routes/api.trivia-batch.ts` `TOTAL = 20`) `` | Deplete enemy HP before your HP runs out; scaled by level/rank |
| **Weekly League (Gym)** | `battle-screen.tsx` (`isWeekly`) | 20 questions | Boss battle, flat enemy HP 250, flat base damage 10 |
| **Elite Four** | `battle-screen.tsx` (`isElite`) | 20 questions | Boss battle, flat enemy HP 200, flat base damage 10 |
| **Daily Quest** | `daily-screen.tsx` | 10 questions | Score ≥6/10 to earn; 10/10 doubles XP |
| **Who's That Pokémon?** | `routes/whos-that-pokemon.tsx` | — | Identify the silhouette; +100 XP per correct ID |
| **Mega Raid** | `src/components/mega/*`, `src/lib/mega/*` | 50 questions | Community boss (400 HP); win awards the base Pokémon + egg |
| **Nearby Battle (Live PvP)** | `live-pvp-battle-screen.tsx`, `routes/pvp.live.$matchId.tsx` | 20 questions | HP-endurance duel vs another player or a bot |
| **Async PvP** | `pvp-battle-screen.tsx`, `routes/pvp.$matchId.tsx` | — | Turn-based / invite flow (legacy `pvp_matches`) |

Enemy opponents in Solo modes are drawn from the full roster **excluding** Legendary/Mythical Pokémon, which are Poké-Egg exclusive `` (`src/lib/game-data.ts` `ENEMY_POOL`, `pickRandomEnemy`) ``. Shiny chance for a Solo enemy is `1/256` `` (`SHINY_CHANCE`) ``.

**League ranks** (title shown on profile) `` (`src/lib/game-data.ts` `RANKS`, `rankForLevel`) ``:

| Level range | League index | Rank title |
|-------------|--------------|------------|
| 1–5   | 0 | Little League Champ |
| 6–15  | 1 | Great League Champ |
| 16–25 | 2 | Ultra League Champ |
| 26–50 | 3 | Master League Champ |
| 51+   | 4 | Monarch (World Champion) |

**Difficulty band by level** `` (`difficultyForLevel`) ``: `easy` (L1), `medium` (L2–5), `hard` (L6–15), `expert` (L16–25), `master` (L26+).

---

## 2. Progression: Levels / XP / Ranks

XP is stored as a single cumulative total; level and in-level progress are derived `` (`src/lib/game-data.ts`) ``.

**Per-level XP requirement** `` (`xpForLevel`) ``:

```
xpForLevel(level) = round( 80 + (level - 1) * 40 + 0.5 * overCap² )
  where overCap = max(0, level - 51)
```

- Linear (+40 XP per level) up through level 51 (Monarch), then a quadratic tail makes the endless endgame progressively harder.
- Level 1 → 2 needs 80 XP; L2 → 3 needs 120; L10 → 11 needs 440; L51 → 52 needs `80 + 50*40 + 0.5*1 = 2081` (`round`).

**Derived helpers:**
```
totalXpToReachLevel(L) = Σ xpForLevel(k) for k = 1 .. L-1
levelFromTotalXp(totalXp)  — walks levels subtracting each xpForLevel until remainder < need (cap 999)
xpProgressInLevel(totalXp) = { current, need: xpForLevel(level), level }
```

**Rank / league index** are pure functions of level (see table in §1) `` (`rankForLevel`, `leagueIndex`) ``.

---

## 3. Rewards & Economy Calculations

### 3.1 Multipliers

**Level multiplier** — applied to most rewards `` (`src/lib/rewards/index.ts` `levelMultiplier`) ``:
```
levelMultiplier(level) = 1 + 0.05 * (level - 1)   // +5% per level above 1
```

**Streak multiplier** — combo of consecutive correct answers `` (`src/lib/game-data.ts` `streakMultiplier`) ``:

| Streak | Multiplier | Label `` (`streakLabel`) `` |
|--------|-----------|-------|
| 0–2 | 1.0× | — |
| 3–4 | 1.5× | NICE COMBO! |
| 5–6 | 2.0× | GREAT STREAK! |
| 7–9 | 2.5× | ON FIRE! |
| 10+ | 3.0× | UNSTOPPABLE! |

### 3.2 Battle rewards `` (`src/lib/rewards/index.ts` `battleReward`) ``

Let `lvl = levelMultiplier(level)`, `streak = streakMultiplier(maxStreak)`.

| Mode | Win | Loss |
|------|-----|------|
| **Regular** | `xp = round(50·lvl·streak)`, `coins = round(0.25·xp)`, `tp = round(0.1·xp)` | `xp = round(10·lvl·streak)`, coins 0, tp 0 |
| **Weekly** | `xp = round(100·lvl·streak)`, `coins = round(0.3·xp)`, `tp = round(0.2·xp)` | all 0 |
| **Elite** | `xp = 0`, `coins = 2000`, `tp = round(200·lvl·streak)` | all 0 |

> Worked example — a Regular win at level 10 with a max streak of 5: `lvl = 1.45`, `streak = 2.0`, `xp = round(50·1.45·2.0) = 145`, `coins = round(0.25·145) = 36`, `tp = round(0.1·145) = 15`.

### 3.3 Daily Quest reward `` (`dailyReward`) ``

```
if correct < 6 → { xp: 0, tp: 0 }        // needs ≥6/10 to score
perfectMult = (correct === total) ? 2 : 1  // 10/10 doubles XP
xp = round(50 · levelMultiplier(level) · perfectMult)
tp = round(0.2 · xp)
```

### 3.4 Who's That Pokémon `` (`WHOS_THAT_XP`) ``
Flat **+100 XP** per correct identification.

### 3.5 Mega Raid rewards `` (`src/lib/mega/schedule.ts`) ``
Boss HP `MEGA_BOSS_HP = 400`, `MEGA_BOSS_DMG = 10` per correct, so `MEGA_WIN_CORRECT = 40` correct answers wins. 50 questions per run `` (`MEGA_QUESTION_COUNT`) ``, up to 2 attempts (`MEGA_MAX_ATTEMPTS`), shiny chance `0.10` (`MEGA_SHINY_CHANCE`). Base win reward `` (`MEGA_REWARD`) ``: `{ xp: 2500, coins: 2500, tp: 1000, items: 10 }`, plus a Poké Egg and the base final-evolution Pokédex entry. Leaderboard rank scales the reward `` (`megaRankScale`) ``: rank 1 → 1.0×, rank 2 → 0.5×, rank 3 → 0.3×, else → 0.05×. (Actual per-event reward values come from the `mega_events` row columns `win_xp/win_tp/win_items` and `champ_*`.)

### 3.6 Level-up rewards `` (`src/lib/level-rewards.ts` `rollLevelUpRewards`) ``

Paid out for **each level crossed** (a single battle can cross several). For each level `lvl` from `fromLevel+1` to `toLevel`, with `mult = levelMultiplier(lvl)`:
- `coins += round(25 · mult)`
- **one random non-premium, non-PvP item** (qty 1) — kept scarce.
- **Every 5th level**: also `coins += round(100 · mult)` **plus one random premium item** (from `candy`, `luckyegg`, `focusband`, `assaultvest`, `bignugget`).
- **Every 10th level**: also **+1 Poké Egg**.

### 3.7 Referral reward `` (`src/lib/referral-rewards.ts` `rollReferralReward`) ``
Granted to **both** referrer and new user: `500 coins`, `1 Poké Egg`, and **5 distinct** random non-premium items (qty 1 each).

### 3.8 Training Points (TP) economy `` (`src/lib/game-data.ts` `TP_REWARDS`) ``

| Source | TP |
|--------|----|
| Battle win, per correct answer | 1 (capped at 20/battle) |
| Battle loss | 5 |
| Daily perfect | 30 |
| Daily partial | 15 |
| Elite win | 50 |
| Weekly win | 100 |

TP fuels **evolution** and a **partner damage bonus**. TP damage tiers `` (`TP_DAMAGE_TIERS`, `getTpMultiplier`) ``:

| TP threshold | Damage multiplier |
|--------------|-------------------|
| 0 | 1.00× |
| 100 | 1.05× |
| 300 | 1.10× |
| 700 | 1.15× |
| 1500 | 1.20× |

Evolution TP cost `` (`EVOLUTION_TP_COST`) ``: stage 1 → 2 costs **150 TP**, stage 2 → 3 costs **350 TP**.

---

## 4. Solo Battle Combat Math

Constants: `QUESTIONS_PER_SET = 5`, `TIMER_BASE = 20` (seconds) `` (`src/components/battle-screen.tsx`) ``.

### 4.1 HP pools
- **Player max HP** = 100, or **105** if the partner's ability is `adaptable` `` (`battle-screen.tsx` `playerMaxHp`) ``.
- **Enemy max HP**: Weekly = 250, Elite = 200, otherwise `enemyHpForLevel(level)` `` (`src/lib/game-data.ts`) ``:
```
enemyHpForLevel(level) = 100 + 50 * leagueIndex(level)   // 100/150/200/250/300 across leagues
```

### 4.2 Base damage per correct answer
```
baseDamageForLevel(level) = 10 + 2 * leagueIndex(level)   // 10/12/14/16/18
```
Bosses (Elite/Weekly) use a flat base of **10** instead (their HP budgets are pre-balanced) `` (`battle-screen.tsx` line ~734) ``.

### 4.3 Correct-answer damage pipeline `` (`battle-screen.tsx` `handleAnswer`) ``

In order:
1. `baseDmg = isElite||isWeekly ? 10 : baseDamageForLevel(level)`; `dragon-dance` adds `floor(questionIdx/5)`.
2. `dmg = round(baseDmg · (metronome ? 3.0 : streakMultiplier(newStreak)))`.
3. **TP multiplier**: if `getTpMultiplier(tp) > 1`, `dmg = round(dmg · tpMult)`.
4. **Speed bonus**: `speedRatio = max(0, (totalTime - elapsedSec)/totalTime)`, `speedBonus = round(5 · speedRatio)`; `aerilate` ×1.5, `swift-swim` floors it at 3. Added to `dmg`. (`totalTime = TIMER_BASE + bonusTime`.)
5. **Super-effective**: if the matchup is super-effective, `dmg *= 2` (applied after the multiplier).
6. **X Attack**: `+20` and consumes the item.
7. **Silk Scarf** (auto, first correct): `dmg = round(dmg · (Normal-type partner ? 1.75 : 1.5))`.
8. Ability percentage/flat modifiers (see §5) then flat adds (`even-tempo`, `charge`, `swarm`, `moonblast`, `volt-absorb`, `counter`, `moxie`, `poison-touch` venom).

> Worked example — level 10 (league 1) regular battle, super-effective correct answer on a 3-streak, answered instantly, no items/TP: `baseDmg = 12`, `×1.5` streak → 18, speed bonus ≈ `round(5·~1) = 5` → 23, super-effective `×2` → **46 damage**. Enemy HP at level 10 is `100 + 50 = 150`.

### 4.4 Wrong-answer damage `` (`battle-screen.tsx`) ``
```
wrongDmg = 10   (base)
  immune matchup      → 5
  disadvantaged       → 15
  no-guard ability    → +2
  assault vest (auto) → floor(wrongDmg / 2)
  king's rock (auto)  → 50% chance → 0
```
Then ability reductions apply (see §5: `multiscale`, `filter`, `slush-rush`, `iron-barbs`, `solid-rock`, `static`, `snow-cloak`, `flame-body`, `cute-charm`). Survival items follow: `sturdy` (revive at 1 HP), Revive (25% HP), Focus Band (heal to 50% at ≤10 HP), Torrent / Oran Berry (heal on first drop below 30%).

**Type logic** `` (`src/lib/pokemon-data.ts`) ``:
- `isSuperEffective(attacker, defender)` — any of attacker's types is super-effective (per `TYPE_CHART`, a Gen 6+ simplified attacker→targets chart) against any of defender's types.
- `isPlayerDisadvantaged` — mirror check where the **enemy** is super-effective against the player.
- `isPlayerImmune` — every enemy type is fully blocked by a player-type immunity (`TYPE_IMMUNITIES`, e.g. Normal/Fighting → Ghost 0×, Ground → Flying, Poison → Steel, Ghost → Normal, Psychic → Dark, Dragon → Fairy).

### 4.5 Status effects in Solo
Solo battle only actively inflicts **Confused** and **Poisoned** (the two originally implemented) `` (`game-data.ts` `StatusKind` doc comment) ``:
- Confused triggers at `wrongStreak == 2` (`amnesia` delays to 3; `shield-dust` immune). On a correct answer while confused, **25%** chance the attack misses.
- Poisoned triggers at `wrongStreak == 5` (`amnesia` delays to 6; `toxic` immune). Poison DoT ticks every 2s for `max(1, floor(playerMaxHp · 0.02))` HP; `magic-guard` negates it entirely `` (`battle-screen.tsx` `startPoisonTick`) ``.

---

## 5. Type Abilities

Every type has **exactly three** abilities; a partner rolls one of its **primary** type's three at onboarding (re-rolled when the partner or its primary type changes). Index 0 is the legacy ability that unrolled saves resolve to `` (`src/lib/abilities.ts` `ABILITY_SETS`, `rollAbilityId`, `getAbility`) ``.

| Type | Ability | Effect (verbatim from source) |
|------|---------|-------------------------------|
| Normal | **Adaptable** | Starts with 105 HP instead of 100. |
| Normal | Pickup | Earns 25% more coins from battles. |
| Normal | Even Tempo | +2 damage on neutral type matchups. |
| Fire | **Flame Body** | 15% chance to ignore wrong-answer damage entirely. |
| Fire | Blaze | +20% damage while below 40% HP. |
| Fire | Flash Fire | All correct answers deal +8% damage. |
| Water | **Hydration** | Auto-cures the first Confused status of every battle. |
| Water | Torrent | Heals 10 HP the first time you drop below 30% HP each battle. |
| Water | Swift Swim | Speed bonus is never lower than 3. |
| Electric | **Static** | Wrong-answer damage is halved 20% of the time. |
| Electric | Volt Absorb | Answers within 5 seconds deal +3 damage. |
| Electric | Charge | Every correct answer deals +2 damage. |
| Grass | **Leech Seed** | Heals 2 HP for every correct answer. |
| Grass | Synthesis | Potions and Super Potions heal 50% more. |
| Grass | Overgrow | +12% damage while the enemy is above half HP. |
| Ice | **Snow Cloak** | The first wrong answer of every battle deals 0 damage. |
| Ice | Ice Body | Heals 6 HP every 4th correct answer. |
| Ice | Slush Rush | Wrong-answer damage is reduced by 5 when type-disadvantaged. |
| Fighting | **Guts** | Correct answers deal +15% damage when below 50% HP. |
| Fighting | No Guard | +18% damage on every correct answer, but wrong answers hit 2 harder. |
| Fighting | Counter | The correct answer right after a wrong one deals +4 damage. |
| Poison | **Toxic** | Immune to Poisoned, and Confused cures after 1 correct answer. |
| Poison | Corrosion | Wrong answers still deal 2 damage to the enemy. |
| Poison | Poison Touch | Correct answers poison the enemy for 2 extra damage on the next question. |
| Ground | **Sand Veil** | +2 seconds added to every question timer. |
| Ground | Sand Force | The first two wrong answers each battle don't reset your streak. |
| Ground | Bulldoze | +25% damage when type-disadvantaged. |
| Flying | **Tailwind** | +20% damage on the first 3 questions of every battle. |
| Flying | Aerilate | Speed bonuses are 50% bigger. |
| Flying | Acrobatics | +30% damage while at full HP. |
| Psychic | **Foresight** | Reveals one wrong option for free on every 5th question. |
| Psychic | Magic Guard | Statuses deal no HP damage. |
| Psychic | Amnesia | Confused and Poisoned need one extra wrong answer to trigger. |
| Bug | **Compound Eyes** | Auto-reveals a wrong option on the first and last question of every set. |
| Bug | Shield Dust | Immune to the Confused status. |
| Bug | Swarm | +3 damage while on a 3-streak or higher. |
| Rock | **Sturdy** | Survives the first otherwise-fatal hit at 1 HP. Once per battle. |
| Rock | Solid Rock | No single hit can deal more than 12 damage. |
| Rock | Stealth Rock | The enemy takes 3 damage at the start of every 5-question round. |
| Ghost | **Cursed Body** | Wrong answers heal back fully if the next question is answered correctly within 5 seconds. |
| Ghost | Shadow Tag | The enemy loses 2 HP whenever you take damage. |
| Ghost | Hex | +30% damage while you are Confused or Poisoned. |
| Dragon | **Multiscale** | Wrong-answer damage is halved while at full HP. |
| Dragon | Berserk | +12% damage after your first wrong answer of the battle. |
| Dragon | Dragon Dance | Base damage grows by +1 with every 5-question round. |
| Dark | **Intimidate** | The enemy starts at 90% HP instead of 100%. |
| Dark | Moxie | +1 permanent damage each time you reach a 3-streak (stacks all battle). |
| Dark | Dark Aura | +10% damage in Elite Four and Weekly League battles. |
| Steel | **Filter** | Reduces super-effective wrong-answer damage by 25%. |
| Steel | Iron Barbs | All wrong-answer damage is reduced by 3. |
| Steel | Metalworks | Shop items cost 10% less. |
| Fairy | **Cute Charm** | 15% chance to ignore wrong-answer damage entirely. |
| Fairy | Pixie Dust | Heals 5 HP every time you reach a 3-streak. |
| Fairy | Moonblast | +4 damage while on a 3-streak or higher. |

(Bold = index-0 legacy ability for that type.) These descriptions match the implemented logic in `battle-screen.tsx` (spot-checked: `bulldoze` = ×1.25 when disadvantaged, `moxie` +1/3-streak accumulation, `stealth-rock` 3 dmg every 5 questions, `sturdy` revive-at-1, `iron-barbs` −3 wrong dmg).

---

## 6. Signature Abilities (Legendary / Mythical)

Only **Legendary/Mythical partners** get a signature ability (non-legendary partners get nothing) `` (`src/lib/signature-abilities.ts` `signatureAbilityFor`, gated by `isLegendaryOrMythical`) ``. **Scope is PvP (Nearby Battle) only** — the v2 doc's "Solo Effect" column is intentionally ignored. The roster is **104 ids** `` (`src/lib/legendary-data.ts` `ALL_LEGENDARY_MYTHICAL_IDS`) `` and the catalog has one entry per id (Calyrex ships as two: dex 898 Ice Rider + synthetic id 10194 Shadow Rider).

### 6.1 The engine

Rather than 104 one-off functions, each ability decomposes into `{ trigger, effect, wiring }` primitives evaluated by pure functions. **Wiring modes** `` (`WiringMode`) ``:

| Wiring | Meaning |
|--------|---------|
| `battle_start` | Standing buff/debuff applied once at match start (persistent stage). |
| `passive_damage` | Modifies the current correct answer's damage calc (ignore-def, bonus atk/crit, second hit). |
| `post_answer` | Fires an effect after an answer resolves (stage / status / heal / drain / hamper), rolling any `chance`. |
| `manual` | Player-fired button; either arms a client-side one-hit modifier or routes a server-catalog effect. |
| `bespoke` | Needs a custom handler; data present, may or may not be live-wired (see notes). |

**Important stage-system caveat** `` (`EffectDuration` doc comment) ``: the shipped stat-stage system (`bumpPvpStage` / server `_pvp_bump_stage`) has **no per-question expiry** — a bump persists until changed. So effect `duration` numbers are retained for design fidelity but every non-`one_hit` stage effect currently means "bump the stage now (standing)". `one_hit` effects apply inside the current answer's damage calc only.

**Rarity** ranges 1–5; rarity 5 = mascot-tier (gold ring). `isMascotAbility` = mascot-tier **and** rarity ≥ 5.

### 6.2 Full catalog

Legend for **Live?**: **wired** = auto-fired/served by the live loop today; **manual** = player-fired Fire button (client-armed hit or server-catalog effect); **catalog-only** = data present but the defining behaviour is a bespoke/unwired secondary (see per-row note in source).

| Dex | Pokémon (flavour) | Signature Move | Rarity | Trigger | Effect | Wiring | Live? |
|----:|-------------------|----------------|:------:|---------|--------|--------|-------|
| 144 | Articuno | Freeze-Dry | 3 | passive | ignore opp Def (only if opp Def ≥ +1) | passive_damage | wired |
| 145 | Zapdos | Thunderous Kick | 3 | fast pair <5s | −1 opp Def + scramble | post_answer | wired |
| 146 | Moltres | Fiery Wrath | 3 | bespoke (Wrath stacks ≤3) | +1 Atk/stack one-hit + 30%/stack Sleep 1q | bespoke | **wired** |
| 150 | Mewtwo | Psystrike | 5 | manual (1×) | ignore opp Def + own negative stages | manual | manual (client hit) |
| 151 | Mew | Transform | 4 | bespoke (copy opp ability at start) | can't copy rating-5 → random rating-3 | bespoke | wired |
| 243 | Raikou | Thunder | 3 | every 4th q (prev correct) | +2 Crit one-hit + **+1 Speed** | passive_damage | wired |
| 244 | Entei | Sacred Fire | 3 | on correct 40% | Burn 3q | post_answer | wired |
| 245 | Suicune | Aurora Beam | 3 | streak ≥3 | +1 Def + cure any | post_answer | wired |
| 249 | Lugia | Aeroblast | 4 | manual (2×, cd5) | −2 opp Speed | manual | manual |
| 250 | Ho-Oh | Sacred Fire (Rainbow Rebirth) | 4 | HP hits 0 | revive to 25% + cure all + **+1 Atk** + 2q Burn-on-correct | bespoke | **wired** (revive) |
| 251 | Celebi | Time Travel | 3 | manual (1×) | rewind last wrong (refund HP+streak) | bespoke | catalog-only |
| 377 | Regirock | Stone Edge | 3 | last 3s | +2 Crit one-hit | passive_damage | wired |
| 378 | Regice | Blizzard | 3 | streak ≥4 | −1 opp Speed | post_answer | wired |
| 379 | Registeel | Flash Cannon | 3 | battle start | +1 Def standing | battle_start | wired |
| 380 | Latias | Mist Ball | 4 | manual (1×) | −2 opp Atk | manual | manual |
| 381 | Latios | Luster Purge | 4 | manual (1×) | −2 opp Def + ignore Def | manual | manual |
| 382 | Kyogre | Origin Pulse (Primordial Deluge) | 5 | streak ≥3 | +1 Atk + +1 Speed standing (rain) | post_answer | wired (weather conflict bespoke) |
| 383 | Groudon | Precipice Blades (Scorched Earth) | 5 | streak ≥3 | +1 Atk + −1 opp Speed (sun) | post_answer | wired (weather conflict bespoke) |
| 384 | Rayquaza | Dragon Ascent | 5 | manual (1×) | +3 Crit / +1 Atk one-hit | manual | manual (client hit) |
| 385 | Jirachi | Doom Desire | 3 | manual (1×) | delayed 12 dmg (ignore Def) | bespoke | catalog-only |
| 386 | Deoxys | Psycho Boost | 3 | every 5th q | +3 Atk one-hit + **−1 Atk recoil** | passive_damage | wired |
| 480 | Uxie | Future Sight | 2 | cooldown 4 | preview category (self help) | bespoke | catalog-only |
| 481 | Mesprit | Future Sight | 2 | cooldown 4 | preview value + +1 Speed | bespoke | catalog-only |
| 482 | Azelf | Future Sight | 3 | cooldown 5 | eliminate one option | bespoke | catalog-only |
| 483 | Dialga | Roar of Time | 4 | manual (2×) | +2 Speed | manual | manual |
| 484 | Palkia | Spacial Rend | 4 | manual (2×) | +1 Speed + scramble | manual | manual |
| 485 | Heatran | Magma Storm | 3 | manual (1×) | Badly Poisoned 3q + ability-lock 3q | manual | **wired** (suppress) |
| 486 | Regigigas | Crush Grip (Slow Start) | 3 | bespoke (locked q1-5) | +2 Atk / +1 Speed from q6 | bespoke | catalog-only |
| 487 | Giratina | Shadow Force | 4 | manual (1×) | ignore Def + 2 Crit one-hit | manual | manual (client hit) |
| 488 | Cresselia | Lunar Dance | 3 | manual (1×) | spend 15% HP: cure all + reset negative Atk/Def/Spd | manual | manual (server cleanse) |
| 489 | Phione | Bubble Beam | 2 | on correct 25% | −1 opp Speed | post_answer | wired |
| 490 | Manaphy | Heart Swap | 3 | manual (1×) | swap your lowest / their highest stage | manual | manual (server swap) |
| 491 | Darkrai | Dark Void | 3 | manual (1×) | Sleep 2q (60%) | manual | manual |
| 492 | Shaymin | Seed Flare | 3 | manual (1×) | −2 opp Def | manual | manual |
| 493 | Arceus | Judgment | 5 | manual (1×) | ~2 HP per distinct category answered (ignore Def) | bespoke | catalog-only |
| 494 | Victini | V-create | 3 | first-half answer | +1 Crit one-hit | passive_damage | wired *(doc-gap fill)* |
| 638 | Cobalion | Sacred Sword | 3 | passive | ignore opp Def + own negative stages | passive_damage | wired |
| 639 | Terrakion | Sacred Sword | 3 | passive | ignore opp Def | passive_damage | wired |
| 640 | Virizion | Sacred Sword | 3 | passive | ignore opp Def | passive_damage | wired |
| 641 | Tornadus | Bleakwind Storm | 3 | cooldown 6 | −2 opp Speed | post_answer | wired |
| 642 | Thundurus | Wildbolt Storm | 3 | cooldown 6, 50% | Paralysis 3q | post_answer | wired |
| 643 | Zekrom | Blue Flare | 4 | first-half answer | +1 Atk/+1 Crit one-hit + 40% Burn | passive_damage | wired |
| 644 | Reshiram | Bolt Strike | 4 | streak ≥3, 40% | Paralysis 3q + +1 Atk | post_answer | wired |
| 645 | Landorus | Sandsear Storm | 3 | cooldown 6 | Burn 3q + +1 Atk | post_answer | wired |
| 646 | Kyurem | Glaciate | 4 | every 3rd correct | −1 opp Speed | post_answer | wired |
| 647 | Keldeo | Sacred Sword | 3 | cooldown 4 | ignore opp Def | passive_damage | wired |
| 648 | Meloetta | Relic Song | 3 | manual (2×) | +1 Atk + 30% Sleep 1q | manual | manual (server) |
| 649 | Genesect | Techno Blast | 3 | battle start | +1 Speed standing | battle_start | wired |
| 716 | Xerneas | Geomancy | 4 | manual (1×) | +2 Atk / +1 Def / +1 Speed | bespoke | catalog-only |
| 717 | Yveltal | Oblivion Wing | 4 | on correct | drain 2 HP | post_answer | wired |
| 718 | Zygarde | Thousand Waves | 3 | manual (1×) | −1 opp Speed + ability-lock 3q | manual | **wired** (suppress) |
| 719 | Diancie | Diamond Storm | 3 | on correct 50% | +1 Def | post_answer | wired |
| 720 | Hoopa | Hyperspace Hole | 3 | cooldown 5 | ignore opp Def | passive_damage | wired |
| 721 | Volcanion | Steam Eruption | 3 | on correct 30% | Burn 3q | post_answer | wired |
| 772 | Type: Null | Multi-Attack | 2 | battle start | +1 Atk (one preset category) | bespoke | catalog-only |
| 773 | Silvally | Multi-Attack | 3 | battle start | +1 Atk / +1 Crit (dominant category) | bespoke | catalog-only |
| 785 | Tapu Koko | Nature's Madness | 3 | cooldown 6 | cut ½ opp HP lead + status immunity 2q + −1 opp Speed | bespoke | catalog-only |
| 786 | Tapu Lele | Nature's Madness | 3 | cooldown 6 | −1 opp Crit | post_answer | wired |
| 787 | Tapu Bulu | Nature's Madness | 3 | cooldown 6 | heal 4 + +1 Def | post_answer | wired |
| 788 | Tapu Fini | Nature's Madness | 3 | cooldown 6 | cure any | post_answer | wired |
| 789 | Cosmog | Splash | 1 | bespoke (no-op) | no mechanical effect (joke) | bespoke | catalog-only (intentional) |
| 790 | Cosmoem | Cosmic Power | 2 | battle start | +2 Def / −1 Atk | battle_start | wired |
| 791 | Solgaleo | Sunsteel Strike | 4 | streak ≥2 | ignore opp Def | passive_damage | wired |
| 792 | Lunala | Moongeist Beam | 4 | cooldown 5 | eliminate one option | bespoke | catalog-only |
| 800 | Necrozma | Photon Geyser | 3 | bespoke | +1 to higher of Atk/Speed each q | bespoke | catalog-only |
| 801 | Magearna | Fleur Cannon | 3 | every 5th q | +3 Atk one-hit + **−1 Atk recoil** | passive_damage | wired |
| 802 | Marshadow | Spectral Thief | 3 | manual (1×) | steal opp highest stage + +1 Crit | bespoke | catalog-only |
| 803 | Poipole | Fell Stinger | 2 | every 3rd correct | +1 Atk | post_answer | wired *(doc-gap fill)* |
| 804 | Naganadel | Air Slash | 3 | every 3rd correct | +1 Speed | post_answer | wired *(doc-gap fill)* |
| 805 | Stakataka | Gyro Ball | 2 | every 3rd correct | +1 Def | post_answer | wired *(doc-gap fill)* |
| 806 | Blacephalon | Mind Blown | 3 | every 3rd correct | +1 Crit | post_answer | wired *(doc-gap fill)* |
| 807 | Zeraora | Plasma Fists | 3 | fast pair <6s | +1 Speed / +1 Crit | post_answer | wired (no chain-reset) |
| 808 | Meltan | Flash Cannon | 2 | every 3rd correct | +1 Atk | post_answer | wired |
| 809 | Melmetal | Double Iron Bash | 3 | every 5th q | second hit ×0.5 + 30% Sleep 1q | passive_damage | wired |
| 888 | Zacian | Behemoth Blade | 5 | battle start | +1 Atk standing | battle_start | wired |
| 889 | Zamazenta | Behemoth Bash | 5 | battle start | +1 Def standing | battle_start | wired |
| 890 | Eternatus | Dynamax Cannon | 4 | manual (1×) | −2 opp Speed / −1 opp Atk | bespoke | catalog-only |
| 891 | Kubfu | Focus Energy | 2 | on correct | +1 Crit | post_answer | wired |
| 892 | Urshifu | Surging Strikes | 3 | bespoke (style choice) | ignore Def + 3 Crit | bespoke | catalog-only |
| 893 | Zarude | Jungle Healing | 3 | cooldown 5 | heal 8 + cure any | post_answer | wired |
| 894 | Regieleki | Thunder Cage | 3 | manual (1×) | Paralysis 3q + ability-lock 3q | manual | **wired** (suppress) |
| 895 | Regidrago | Dragon Energy | 3 | HP ≥80% | +2 Atk (HP-scaling) | bespoke | catalog-only |
| 896 | Glastrier | Glacial Lance | 3 | cooldown 5 | −1 opp Speed + highlight-wrong | post_answer | wired |
| 897 | Spectrier | Astral Barrage | 3 | on correct | drain 2 HP | post_answer | wired |
| 898 | Ice Rider Calyrex | Glacial Lance (As One — Glacial Reign) | 4 | cooldown 4 | −2 opp Speed + heal 3 | post_answer | wired |
| 10194 | Shadow Rider Calyrex | Astral Barrage (As One — Spectral Reign) | 4 | on correct | drain 3 HP | post_answer | wired |
| 1001 | Wo-Chien | Ruination (Tablets) | 3 | battle start | −1 opp Atk standing | battle_start | wired |
| 1002 | Chien-Pao | Ruination (Sword) | 3 | manual (1×) | −2 opp Def + 2-hit ignore-Def window | manual | **wired** (client window) |
| 1003 | Ting-Lu | Ruination (Vessel) | 3 | manual (1×) | +2 Def + −1 opp Crit | manual | manual |
| 1004 | Chi-Yu | Ruination (Beads) | 3 | manual (1×) | ½ opp current HP (ignore Def) + Burn | bespoke | catalog-only |
| 1007 | Koraidon | Collision Course | 5 | new category | +1 Atk / +1 Crit one-hit | passive_damage | wired |
| 1008 | Miraidon | Electro Drift | 5 | fast answer <5s | +1 Speed standing | post_answer | wired |
| 1009 | Walking Wake | Hydro Steam | 3 | bespoke (adversity) | +2 Atk one-hit while opp buffed/leading | bespoke | catalog-only |
| 1010 | Iron Leaves | Psyblade | 3 | bespoke (terrain) | +1 Atk / +1 Crit while terrain active | bespoke | catalog-only |
| 1014 | Gouging Fire | Burning Bulwark | 3 | bespoke (reactive protect) | block next wrong + reflect as Burn | bespoke | catalog-only |
| 1015 | Raging Bolt *(Sludge Wave in file)* | Sludge Wave | 3 | on correct 40% | Poison 3q | post_answer | wired |
| 1016 | *(Beat Up user)* | Beat Up | 3 | pokédex scaling (per 25, max 3) | +1 Atk per 25 dex entries (≤+3) at start | battle_start | wired |
| 1017 | Ogerpon | Ivy Cudgel | 4 | battle start | +1 Crit standing | battle_start | wired |
| 1020 | Gouging Fire | Burning Bulwark | 3 | bespoke (reactive) | Burn on reflect | bespoke | catalog-only |
| 1021 | Raging Bolt | Thunderclap | 3 | opponent correct | +1 self Atk / −1 opp Atk | bespoke | **wired** |
| 1022 | Iron Boulder | Mighty Cleave | 3 | cooldown 4 | ignore opp Def | passive_damage | wired |
| 1023 | Iron Crown | Tachyon Cutter | 3 | cooldown 4 | second hit ×0.15 | passive_damage | wired |
| 1024 | Terapagos | Tera Starstorm | 4 | manual (1×) | +2 Atk / +1 Def / +2 Speed | manual | manual |
| 1025 | Pecharunt | Malignant Chain | 4 | manual (1×) | Badly Poisoned 3q + ability-lock 3q + force mis-tap | manual | **wired** (suppress) |

> Note on ids 1015/1016/1020: the file maps Gen-9 Paradox/Treasures ids to these move designs; the "Pokémon (flavour)" column above reflects the source `note` text where present. Verify species labels against `pokemon-data.generated.ts` before surfacing them in UI.

**Doc-gap fills (5 ids, `docGap: true`):** 494 Victini, 803 Poipole, 804 Naganadel, 805 Stakataka, 806 Blacephalon — on-theme fill designs with no v2 doc entry; flagged "Confirm with product owner" in source.

### 6.3 Mew's Transform resolution `` (`resolveMewTransform`) ``
- Opponent runs a **non-mascot** signature ability → copy it outright.
- Opponent runs a **mascot (rating-5)** ability → can't copy; roll a random **rating-3** ability.
- Opponent has **no** ability → gain a random **non-mascot** roster ability.

### 6.4 Bespoke evaluators `` (`src/lib/signature-bespoke.ts`) ``
Pure helpers for the hard cases: `resolveHeartSwap` (490, swap lowest/highest stage, ±3 clamp), `resolveLunarDance` (488, spend 15% HP + reset negative Atk/Def/Spd), `slowStartActive`/`SLOW_START_LATE_BUFF` (486, locked q1-5 then +2 Atk/+1 Speed), `photonGeyserStat` (800, buff higher of Atk/Speed, ties → Atk), `resolveTransformCopy` (151), Moltres Wrath (`nextWrathStacks`/`wrathDischarge`, `WRATH_MAX = 3`, +1/wrong, discharge on correct = +1 Atk/stack & 30%/stack Sleep), Raging Bolt `thunderclapFires` (`THUNDERCLAP_COOLDOWN = 4`).

---

## 7. PvP System (Nearby Battle)

The live PvP mode is an **HP-endurance duel** over a shared, wall-clock-synced question set `` (`src/components/live-pvp-battle-screen.tsx`) ``.

### 7.1 Core constants `` (`src/lib/pvp-combat.ts`) ``
- `PVP_MAX_HP = 120`, `PVP_QUESTIONS = 20`, `PVP_BASE_DAMAGE = 6`.
- `PVP_BASE_TIMER_MS = 20_000` (20s shared slot).
- Stat stages clamped `PVP_STAGE_MIN = -3` .. `PVP_STAGE_MAX = 3`.
- `PVP_STAGE_STEP = 0.1` → Attack/Defense multiplier ranges 0.70×..1.30×. `statStageMultiplier(stage) = 1 + 0.1·clamp(stage)`.
- `PVP_SPEED_PER_STAGE = 0.1` → each Speed stage lengthens/shortens the holder's **own** per-question timer by 10% (20s → 14s..26s). `timerMsForSpeedStage(stage)`.
- Crit: `PVP_BASE_CRIT = 0.05`, `PVP_CRIT_PER_STAGE = 0.05`, first-half bonus `+0.10`, `PVP_CRIT_MULT = 1.5`, `PVP_CRIT_MAX = 0.5`. `critRate(critStage, firstHalf) = clamp(0.05 + 0.05·stage + (firstHalf?0.1:0), 0, 0.5)`.
- Burn output cut `PVP_BURN_OUTPUT_MULT = 0.85` (−15%).

### 7.2 Damage formula `` (`computePvpDamage`) ``
```
speedFactor = 1 + 0.5 · clamp(speedRatio, 0, 1)     // up to 1.5× for instant answers
didCrit     = rng() < critRate(critStage, firstHalf)
dmg = round(
        baseDamage(=6)
      · streakMultiplier(streak)              // shared 1.0–3.0 curve (§3.1)
      · speedFactor
      · statStageMultiplier(attackStage)      // 0.7–1.3
      · (didCrit ? 1.5 : 1)
      · (burned ? 0.85 : 1)
      · (1 / statStageMultiplier(defenseStage))
      )
dmg = max(1, dmg)
```
Bounded: fully-buffed attacker vs fully-defended opponent swings ~0.70/1.30 … 1.30/0.70 — never a blowout.

### 7.3 Match resolution `` (`live-pvp-battle-screen.tsx` header, `routes/pvp.live.$matchId.tsx`) ``
- Both players answer the **same shared question set**; questions advance when both have answered (the 20s slot is the ceiling). Speed stages shift only *your* personal countdown, never past the shared slot boundary.
- **Sudden-KO** (a player hits 0 HP) ends the match early.
- Otherwise, after 20 questions the server resolves via **HP → accuracy → average time** tiebreak (highest HP wins; tie broken by accuracy, then avg answer time).
- Correct answers deal HP damage to the live opponent; wrong answers cost flat self damage.

### 7.4 Items & berries in Nearby Battle
- **3 items total per battle** (`MAX_ITEMS_PER_BATTLE = 3`, shared with Solo) `` (`src/lib/store/slices/itemsSlice.ts`) ``, plus a **per-item-type cap of 1 use** per battle `` (`live-pvp-battle-screen.tsx` `usedItemIdsRef`) ``.
- Only a subset of Solo items are allowed in Nearby Battle; `scope`/`xaccuracy` are client-only there `` (`CLIENT_ONLY_ITEMS`) ``. Not all PvP item effects are wired into the live loop (see §15).
- **Berries** (§10) are Nearby-Battle-only. **2 berries** are granted per battle **won** `` (`BERRIES_PER_NEARBY_BATTLE = 2`, `rollBerryDrops`) ``, rolled with replacement from the common drop pool (excludes the two premium berries). A one-time **Lum Berry** starter is granted on first entry `` (`STARTER_PVP_BERRY`, `routes/pvp.live.$matchId.tsx`) ``.

### 7.5 Weather mascots `` (`src/lib/pvp-weather.ts`) ``
- **Kyogre (382)** — rain: +1 Atk / +1 Speed standing.
- **Groudon (383)** — sun: +1 Atk + opponent −1 Speed.
- **Rayquaza (384)** — Air Lock: no standing weather of its own; **negates both** Kyogre's and Groudon's weather stat effects for the whole match (on either side).
- Opposing weather (one rain + one sun): "latest establisher wins"; a turn-1 tie breaks to the **host**. Mirror matchups resolve independently.

### 7.6 Bots
Training-vs-Bot: the human is always host and drives the bot (guest) locally; the bot's skill profile is rolled once per match and its moves submitted through the bot RPCs `` (`live-pvp-battle-screen.tsx`, `src/lib/pvp-bot.ts`) ``.

---

## 8. Status Conditions

`StatusKind` and `STATUS_META` `` (`src/lib/game-data.ts`) ``:

| Kind | Emoji | Label | Major? | Default cures | Effect |
|------|:-----:|-------|:------:|:-------------:|--------|
| confused | 🌀 | Confused | no | 2 (1 with `toxic`) | Volatile; low magnitude. Solo: 25% chance a correct answer misses. |
| poisoned | ☠️ | Poisoned | yes | 3 | Major DoT. Solo tick: `max(1, floor(maxHp·0.02))` every 2s. |
| badly-poisoned | ☠️☠️ | Badly Poisoned | yes | 5 | Ramping Toxic tier; only fully removed by a cure item. |
| burn | 🔥 | Burn | yes | 3 | −15% correct-answer output + (PvP) −1 Attack stage. |
| paralysis | ⚡ | Paralysis | yes | 3 | Shorter timer + chance to short an input. |
| sleep | 😴 | Asleep | yes | 2 | Buttons locked for first ~40% of timer; 1–2 questions, self-clears. |
| freeze | ❄️ | Frozen | yes | 2 | Skip current question; ~30% thaw/question, guaranteed after 2. |

- **Hard-lockout majors** (mutually exclusive with each other): `sleep`, `freeze`, `paralysis` `` (`HARD_LOCKOUT_STATUSES`) ``.
- Solo battle only actively tracks **Confused** and **Poisoned** (the rest were added for the PvP HP-endurance rework and are available to both modes via the shared `battleStatuses` store field). Status animations ship in `game-ui.tsx` (`StatusEffectOverlay`).

---

## 9. Items

`MAX_ITEMS_PER_BATTLE = 3` (manual + auto combined) `` (`src/lib/store/slices/itemsSlice.ts`) ``. Categories `` (`src/lib/item-categories.ts`) ``: HEALING / BATTLE / UTILITY / PREMIUM (BERRY is a hidden 5th, never a Solo tab). Default starting inventory: 2 Potion, 1 X Attack, 1 Escape Rope, 1 Scope Lens, 1 X Accuracy.

| Item | Emoji | Cost | Category | Premium | Effect (from `ITEMS` desc + `itemsSlice` logic) |
|------|:-----:|-----:|----------|:-------:|-------------------------------------------------|
| Potion | 🧪 | 100 | HEALING | | Heals 30 HP. Once/battle. (`synthesis` ability heals +50%.) |
| Super Potion | 🧪 | 300 | HEALING | | Heals 60 HP. Once/battle. |
| Max Potion | 🍶 | 1000 | HEALING | | Fully restores HP. Once/battle. |
| X Attack | ⚔️ | 100 | BATTLE | | +20 damage on next correct answer. Once/battle. |
| Scope Lens | 🔭 | 100 | BATTLE | | Removes one wrong answer. Once/battle. |
| X Accuracy | 🎯 | 500 | BATTLE | | Reveals the correct answer. Once/battle. |
| Zoom Lens | 🔍 | 200 | BATTLE | | Narrows one question to two choices. Once/battle. |
| Quick Claw | ⏱️ | 1000 | BATTLE | | **Auto**: when timer drops below 5s, reset it to 20s. Once/battle. |
| Assault Vest | 🦺 | 2000 | BATTLE | ✓ | **Auto**: halves damage in super-effective-against-you battles. Once/week. |
| Silk Scarf | 🧣 | 250 | BATTLE | | **Auto**: first correct answer +50% dmg (+75% for Normal-type partner). Once/battle. |
| Escape Rope | 🪢 | 500 | UTILITY | | End the battle, no XP lost. Once/battle. (Blocked in Weekly/Elite.) |
| Amulet Coin | 🪙 | 300 | UTILITY | | 2× coins this battle. Once/battle. |
| Repel | 🧴 | 400 | UTILITY | | Skip one question, no HP/streak penalty. Once/battle. |
| Exp. Share | 📿 | 400 | UTILITY | | +25% XP this battle. Once/battle. |
| Lucky Punch | 🥊 | 200 | UTILITY | | Double-or-nothing: 50% double XP+coins, 50% lose them. Once/battle. |
| Star Piece | ⭐ | 350 | UTILITY | | +50% coins and XP this battle, **if you win**. Once/battle. |
| Choice Specs | 🥽 | 800 | UTILITY | | 2× coins/XP/TP — but must be the **only** item used this battle. Once/battle. |
| Revive | ✨ | 1000 | HEALING | | **Auto**: survive a knockout at 25% HP. Once/battle. |
| Oran Berry | 🫐 | 600 | HEALING | | **Auto**: heals 15 HP when HP first drops below 30%. Once/battle. |
| Focus Band | 🎽 | 2000 | HEALING | ✓ | **Auto**: at ≤10 HP, restore to 50%. Once/week. |
| Rare Candy | 🍬 | 2000 | PREMIUM | ✓ | +50 TP to partner instantly. Usable anytime. |
| Lucky Egg | 🥚 | 2000 | PREMIUM | ✓ | 2× XP for 24 hours. Once/week. |
| King's Rock | 👑 | 2000 | PREMIUM | ✓ | **Auto**: 50% chance to negate wrong-answer HP loss, whole battle. Once/week. |
| Leftovers | 🍞 | 2000 | PREMIUM | ✓ | **Auto**: heals 5 HP after every correct answer, whole battle. Once/week. |
| Metronome | 🔁 | 2500 | PREMIUM | ✓ | **Auto**: streak multiplier locked at max (3.0×), whole battle. Once/week. |
| Big Nugget | 🪙 | 1500 | PREMIUM | ✓ | Requires fully-evolved partner. TP earned → coins (1:1) for 3 days. Usable anytime. |

**Mechanics from `itemsSlice.ts`:**
- **Auto-only items** (can't be used manually): focusband, quickclaw, assaultvest, revive, oranberry, silkscarf, kingsrock, leftovers, metronome.
- **Once-per-battle manual items**: potion, superpotion, maxpotion, xattack, scope, xaccuracy, escape, zoomlens, repel, amuletcoin, expcharm, luckypunch, starpiece, choicespecs.
- **Weekly-cooldown items** (Monday 00:00 UTC reset): luckyegg, focusband, assaultvest, kingsrock, leftovers, metronome.
- **Choice Specs exclusivity**: once active it must be the only item; can't be activated if anything (auto or manual) already fired; blocks all other items afterward.
- **Big Nugget** requires a fully-evolved partner (`canEvolve(partner)` must be false); `BIG_NUGGET_DURATION_DAYS = 3`.
- Rare Candy grants +50 TP to the current partner on use.

Multiplier interplay (traced in `battle-screen.tsx` finish/reward path): amuletcoin (2× coins), expcharm (+25% XP), starpiece (+50% coins & XP on win), luckypunch (2× or 0), choicespecs (2× all), luckyegg (2× XP 24h), pickup ability (+25% coins), bignugget (TP→coins conversion).

---

## 10. Berries (PvP-only)

14 berries, all `isBerry: true` + `pvpOnly: true`, cost 0 (drop-only), never in the Solo shop/bag `` (`src/lib/game-data.ts` `ITEMS`) ``. Structured `berry: { target, effect }` so the Nearby-Battle loop applies them. Two premium berries (Lum, Starf) are excluded from the common drop pool `` (`NEARBY_BERRY_DROP_POOL`) ``.

| Berry | Emoji | Target | Effect | Kind |
|-------|:-----:|--------|--------|------|
| Cheri Berry | 🍒 | self | cure Paralysis | self-cure |
| Chesto Berry | 🫐 | self | cure Sleep | self-cure |
| Pecha Berry | 🍑 | self | cure Poison / Badly Poisoned | self-cure |
| Rawst Berry | 🍃 | self | cure Burn (removes −15% and −1 Atk) | self-cure |
| Persim Berry | 🫐 | self | cure Confusion | self-cure |
| **Lum Berry** (premium) | 🟢 | self | cure **any** status + 1q status immunity | self-cure |
| Liechi Berry | 🔴 | self | +1 Attack stage, 3q | self-buff |
| Ganlon Berry | 🔵 | self | +1 Defense stage, 3q | self-buff |
| **Starf Berry** (premium) | ⭐ | self | +2 to a **random** stat (Atk/Def/Spd/Crit), 3q | self-buff |
| Salac Berry | 🟡 | opponent | −1 Speed stage, 3q | opponent-facing |
| Tanga Berry | 🟠 | opponent | −1 Attack stage, 3q | opponent-facing |
| Kasib Berry | 🟣 | opponent | −1 Defense stage, 3q | opponent-facing |
| Colbur Berry | ⚫ | opponent | −2 Speed stage, 3q | opponent-facing |
| Chople Berry | 🌶️ | opponent | inflict Confusion, 2q | opponent-facing |

Notes: Salac and Colbur were reworked from timer-based effects to Speed-stage debuffs (no timer-based berries now that Speed is a real stat). Magnitudes above are from the **client** catalog; the server berry catalog lives in `pvp_item_effects` (17 rows).

---

## 11. Poké Egg & Hatching

Legendary/Mythical Pokémon are **egg-exclusive** — never battle opponents (except the Mega Raid capture exception, which awards a base Pokémon) `` (`src/lib/legendary-data.ts`, `game-data.ts`) ``.

- **Hatch requirement**: `EGG_HATCH_REQUIRED = 20` progress points `` (`game-data.ts`) ``.
- **Progress model**: at most **one** qualifying mode-completion per calendar day adds progress (a mode can't be farmed) `` (`store.ts` `pushBattleLog`) ``. Qualifying modes `` (`EggProgressMode`) ``: battle, weekly, daily, elite, mega, pvp, nearby, whosthat.
- **Progress per completion is streak-boosted** `` (`streakProgressBonus`, `currentPlayStreakDays`) ``: 1 (base) / 2 (≥3 days) / 3 (≥7) / 4 (≥14) / 5 (≥30 consecutive days played).
- **Egg sources**: every 10th level-up (§3.6), referral reward (§3.7), Mega Raid win.
- **Hatching** `` (`src/components/mega/EggHatch.tsx`) ``: picks a **uniformly random** id from `ALL_LEGENDARY_MYTHICAL_IDS` (all 104), shiny at `1/256` (`SHINY_CHANCE`), adds it to the Pokédex, and grants **1 Rare Candy** as a bonus.

---

## 12. Pokédex / Partners / Evolution

- **Dataset**: `ALL_POKEMON` = generated one-entry-per-National-Dex roster (Gens 1–9) + synthetic forme entries (currently only Shadow Rider Calyrex, id `10194`) `` (`src/lib/pokemon-data.ts`) ``.
- **Starting partners**: strict stage-1 Pokémon (`evolvesFromId === null`), pre-filtered as `STARTING_PARTNERS`. A chosen partner counts as captured (added to Pokédex) `` (`store.ts`) ``.
- **Partner re-pick** is limited to captured Pokémon (`partner-picker.tsx`).
- **Capture**: Pokédex entries carry `firstSeenAt`, `shinyUnlocked`, `defeatCount`.
- **Evolution** `` (`canEvolve`, `getEvolutionTargets`) ``: a partner can evolve if it has `evolvesToIds`; TP costs are 150 (stage 1→2) and 350 (stage 2→3) `` (`EVOLUTION_TP_COST`) ``. Evolving carries over the Pokédex metadata.
- **Type chart**: attacker→super-effective-targets (`TYPE_CHART`) and attacker→immune-defenders (`TYPE_IMMUNITIES`), Gen 6+ simplified.

---

## 13. Shop

`src/routes/shop.tsx`:
- **Metalworks** ability (Steel partner) makes regular prices **10% off**: `priceOf(cost) = metalworks ? max(1, round(cost·0.9)) : cost`.
- **Featured daily deal**: one rotating discounted item (berries never featured), discount picked by `day % steps.length`; discounted cost `max(1, round(cost·(100-pct)/100))`. **Limited to one purchase per day** — gated by `featuredDealLastPurchase` (today's ISO date) `` (`markFeaturedDealPurchased`, `itemsSlice.ts`) ``.
- Category tabs: Healing / Battle / Utility / Premium.
- **Bag** shows owned items grouped by category, plus a **read-only "Berries · Nearby Battle"** section (berries can't be used from the Solo bag).

---

## 14. Backend / Architecture Appendix

Supabase project `dvdorceiasaipdvyfhil` (read-only enumeration). High-level map — see `docs/ARCHITECTURE.md` for detail.

**Public tables** (`list_tables`):

| Table | Purpose |
|-------|---------|
| `curated_questions` (4000 rows) | Curated trivia bank |
| `daily_questions` | Daily-quest rotation |
| `profiles` | Player profiles |
| `friends`, `friend_requests` | Social graph |
| `mega_events`, `mega_event_questions`, `mega_runs` | Mega Raid events / question sets / runs |
| `feedback` | In-app feedback (→ GitHub issue pipeline) |
| `push_subscriptions` | Web-push subscriptions |
| `referrals` | Referral tracking |
| `pvp_matches` | Async/legacy PvP matches |
| `pvp_live_matches` | Live Nearby-Battle match rows (HP, stages, `*_sig_state`, partner ids) |
| `pvp_item_effects` (17 rows) | Server berry/item effect catalog |
| `pvp_live_effects` | Applied live-effect log (opponent-relay source) |
| `pvp_signature_effects` (83 rows) | Server signature-ability effect catalog |

**Key RPCs / server logic** (from `list_migrations`):
- **PvP live**: `submit_pvp_live_answer` (authoritative answer + HP + Ho-Oh Rainbow Rebirth revive), `apply_pvp_signature_effect` (phases: manual / post_answer / sig_state; server-clamped magnitudes + rate-limit + ownership), `_pvp_bump_stage`, suppress-ability (`suppress_ability`), weather columns, swap/cleanse kinds.
- **Bots**: `start_bot_pvp_match` + bot-move RPCs (`pvp_bot_match_rpcs`).
- **Questions**: `pick_battle_curated`, `get_curated_questions` (no-repeat rotation).
- **Social / referrals / push**: friend-request RPCs (`send_friend_request_by_id`), push cron jobs, referral tables.
- **Feedback → GitHub issue**: `feedback_to_issue_trigger` migration (server-side; the webhook secret is **not** included in this doc).

Client data access goes through `supabase` client; the signature/berry trust model is "client names *which* effect/partner fired, server owns the magnitude and clamps."

---

## 15. Known Simplifications / Not-Yet-Wired

Pulled honestly from source code and comments:

1. **Stat stages don't expire per-question.** The shipped stage system has no per-question timer; all `duration` numbers in the signature catalog collapse to "standing bump until changed" `` (`signature-abilities.ts` `EffectDuration` comment) ``. Effects designed to lapse after N questions (e.g. Zeraora's chain reset, most "for 3q" buffs) do not automatically revert.
2. **Catalog-only signature abilities (~23).** Many abilities' defining behaviour is a bespoke secondary that isn't auto-fired (Time Travel, Doom Desire, the three Future Sight self-help abilities, Judgment, Geomancy, Spectral Thief, Photon Geyser, Slow Start, Dynamax Cannon, Surging Strikes, Dragon Energy, the Nature's Madness lead-cut, Silvally/Type: Null category-attune, the two Iron Leaves/Walking Wake conditional passives, Gouging Fire's reactive protect, Chi-Yu's Beads, etc.). See the `note` on each row.
3. **Upper Hand (1014) is deliberately NOT wireable** with the current architecture — you can't pre-empt another player's server RPC, so its interrupt effect is intentionally left unwired `` (`signature-abilities.ts` 1014 note) ``.
4. **5 doc-gap fill abilities** (494, 803–806) have no v2 doc source and are flagged "confirm with product owner."
5. **Solo only actively tracks Confused & Poisoned.** The other five statuses exist in the shared model but Solo battle never inflicts burn/paralysis/sleep/freeze/badly-poisoned `` (`game-data.ts` `StatusKind` comment) ``.
6. **Not all PvP items are wired into the live loop**; `scope`/`xaccuracy` are client-only there, and the allowed set is narrower than Solo `` (`live-pvp-battle-screen.tsx` `CLIENT_ONLY_ITEMS`) ``.
7. **Weather latest-establisher / Rayquaza Air-Lock netcode** is partially bespoke; standing weather buffs apply but the conflict-resolution edge cases are documented as follow-up `` (`pvp-weather.ts`, catalog notes on 382/383/384) ``.
8. **Zeraora Plasma Fists (807)** grants the chain buff but the "reset to 0 on any slow/wrong answer" is deliberately not modelled (the stage system has no per-source accounting) `` (`signature-abilities.ts` 807 note) ``.

---

*End of reference. All values above are transcribed from the cited source files as of 2026-07-07.*
