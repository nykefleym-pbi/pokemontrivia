# 00 — Signature ability coverage audit + engine findings

**Feature slug:** `signature-audit`
**Author:** Discovery (investigation feed for Product Owner / Solution Architect)
**Date:** 2026-07-10
**Scope:** live PvP (Nearby Battle / Training + human PvP share the same loop)

Ground-truth read of the code (not just the catalog `note` fields). Feeds
`01-spec.md`.

---

## Engine findings (answers to the owner's questions)

1. **Trigger gating WORKS.** Every structured `trigger` is evaluated at fire time:
   `postTriggerFires` (`src/lib/signature-abilities.ts:1536`) and `hitTriggerHolds`
   (`:1452`), fed a runtime context by `buildSigContext`
   (`src/components/live-pvp-battle-screen.tsx:924`). The server RPC does NOT re-check
   the trigger — it trusts the client's timing and applies the fixed magnitude
   (`apply_pvp_signature_effect`, migration `20260706090116`). No trigger variant
   fires "on any answer regardless of condition."
   - **Plasma Fists** = Zeraora dex **807**, `fast_pair underMs 6000`, wiring
     `post_answer` (`signature-abilities.ts:985`). It **cannot fire before Q2**, and
     only if both prior answers were correct and each <6000ms (`:1564`); on Q1
     `prevCorrect=false` / `prevAnswerElapsedMs=MAX` (`live-...:514-515`). The
     "fires on Q1" report is **not reproducible at the gate** — see finding 3.
   - Gap: opponent-reactive triggers (`opponent_correct`/`opponent_wrong`) read
     `ctx.opponentAnsweredCorrect`, which `buildSigContext` never sets → dead in the
     generic path; only the one bespoke ability (1021 Raging Bolt) works, via a
     separate observer (`live-...:640`).

2. **No cooldown between fires.** The `20260706090116` "rate-limit" is only a
   per-question-index **replay** guard (`host/guest_post_answer_last_idx`), not a
   throttle. An ability whose trigger holds every question (e.g. `passive`,
   `on_correct`) fires every question. The only spacing today is the
   `cooldown`/`every_nth_*` trigger TYPES + ad-hoc bespoke gates.

3. **Stat stages NEVER expire — the real root cause of "always active / compounds
   all battle."** Catalog `duration` (`number | "passive" | "one_hit"`) is metadata
   only. `_pvp_bump_stage` (migration `20260705000000:165-182`) takes only
   `{stat, delta}`, clamps to ±3, and persists — no duration, no tick-down. Confirmed
   by the in-code comment at `signature-abilities.ts:94-99`. `"one_hit"` is the
   exception (folded into the current damage calc, never a persistent stage). So a
   `stat_stage` with a numeric/`"passive"` duration (incl. Plasma Fists' +1 Spd/+1
   Crit) is a permanent bump that re-stacks each fire until ±3. **This is why an
   ability looks permanently on once it fires once.**

4. **Dual TYPE-ability WORKS (post-commit 8a0cab9).** `typeAbilityId` resolves
   unconditionally (`live-...:359`), the type-ability block is ungated (`:1171`), and
   the signature + type RPCs use independent cursors and serialize via row lock — no
   collision. If a type ability "looks not activated," it is because (a) only **18**
   type-ability ids have seeded server catalog rows (`20260709120000:32-53`), so most
   are no-ops by DATA, or (b) the non-expiring stat compounding in finding 3 masks the
   small type-ability bump. Stale/misleading "mutually exclusive" header comment
   remains at `20260709120000:1-3` (docs only).

---

## Coverage table — 104 signature abilities

Applied? = **YES** effect fires · **PARTIAL** part of the encoded effect fires (a
leaf is a no-op) · **NO** data present but nothing fires.

| Dex | Name (signatureMove) | Rar | Trigger | Effect | Wiring | Applied? | Note |
|----|----|--|----|----|----|----|----|
|144|Articuno (Freeze-Dry)|3|passive|ignore Def (cond.)|passive_damage|YES|Ignore-Def only when opp Def≥+1 (by design). Freeze secondary unwired.|
|145|Zapdos (Thunderous Kick)|3|fast_pair|-1 opp Def + scramble|post_answer|PARTIAL|-1 Def applies; hamper scramble is a client no-op.|
|146|Moltres (Fiery Wrath)|3|bespoke (wrath stacks)|+Atk/stack + Sleep|bespoke|YES|Wired via nextWrathStacks/wrathDischarge.|
|150|Mewtwo (Psystrike)|5|manual x1|ignore Def+own neg|manual|YES|Client-armed one-hit.|
|151|Mew (Transform)|4|bespoke|copy opp ability|bespoke|YES|Wired via resolveMewTransform.|
|243|Raikou (Thunder)|3|every 4th q|+2 Crit +1 Spd|passive_damage|YES|Speed leaf routed via passiveDamageSideEffects.|
|244|Entei (Sacred Fire)|3|on_correct 40%|Burn|post_answer|YES|Sub-30% branch unwired (secondary).|
|245|Suicune (Aurora Beam)|3|streak≥3|+1 Def + cure self|post_answer|YES||
|249|Lugia (Aeroblast)|4|manual x2|-2 opp Spd|manual|YES|Server-fireable.|
|250|Ho-Oh (Sacred Fire)|4|self HP=0|revive+heal+cure+Atk|bespoke|YES|Wired in submit_pvp_live_answer (server).|
|251|Celebi (Time Travel)|3|manual x1|rewind last wrong|bespoke|NO|No bespoke impl.|
|377|Regirock (Stone Edge)|3|last_seconds|+2 Crit|passive_damage|YES||
|378|Regice (Blizzard)|3|streak≥4|-1 opp Spd|post_answer|YES||
|379|Registeel (Flash Cannon)|3|battle_start|+1 Def|battle_start|YES|40% opp -1 Def secondary unwired.|
|380|Latias (Mist Ball)|4|manual x1|-2 opp Atk|manual|YES|Server-fireable.|
|381|Latios (Luster Purge)|4|manual x1|-2 opp Def + ignore Def|manual|PARTIAL|-2 Def applies; ignore-Def leaf dropped.|
|382|Kyogre (Origin Pulse)|5|streak≥3|+1 Atk +1 Spd|post_answer|YES|Weather-conflict vs Groudon is bespoke.|
|383|Groudon (Precipice Blades)|5|streak≥3|+1 Atk -1 opp Spd|post_answer|YES|Weather-conflict bespoke.|
|384|Rayquaza (Dragon Ascent)|5|manual x1|+3 Crit +1 Atk|manual|YES|Client-armed one-hit. Air Lock secondary unwired.|
|385|Jirachi (Doom Desire)|3|manual x1|delayed 12 dmg|bespoke|NO|No delayed-strike impl.|
|386|Deoxys (Psycho Boost)|3|every 5th q|+3 Atk then -1 recoil|passive_damage|YES|Recoil routed via passiveDamageSideEffects.|
|494|Victini (V-create)|3|first_half|+1 Crit|passive_damage|YES|docGap fill design.|
|480|Uxie (Future Sight)|2|cooldown 4|preview category|bespoke|NO|help mode, no UI hook.|
|481|Mesprit (Future Sight)|2|cooldown 4|preview value +Spd|bespoke|NO|help mode, no UI hook.|
|482|Azelf (Future Sight)|3|cooldown 5|eliminate option|bespoke|NO|help mode, no UI hook.|
|483|Dialga (Roar of Time)|4|manual x2|+2 Spd|manual|YES|Server-fireable.|
|484|Palkia (Spacial Rend)|4|manual x2|+1 Spd + scramble|manual|PARTIAL|+1 Spd applies; hamper scramble is no-op.|
|485|Heatran (Magma Storm)|3|manual x1|Bad Poison + ability-lock|manual|YES|suppress_ability + status.|
|486|Regigigas (Crush Grip)|3|bespoke (q6 phase)|+2 Atk +1 Spd|bespoke|NO|slowStartActive only in tests, not wired.|
|487|Giratina (Shadow Force)|4|manual x1|ignore Def +2 Crit|manual|YES|Client-armed one-hit.|
|488|Cresselia (Lunar Dance)|3|manual x1|cleanse (15% HP)|manual|YES|Server cleanse handler.|
|489|Phione (Bubble Beam)|2|on_correct 25%|-1 opp Spd|post_answer|YES||
|490|Manaphy (Heart Swap)|3|manual x1|swap stages|manual|YES|Server swap_stages handler.|
|491|Darkrai (Dark Void)|3|manual x1|Sleep 60%|manual|YES|Server-fireable.|
|492|Shaymin (Seed Flare)|3|manual x1|-2 opp Def|manual|YES|Server-fireable.|
|493|Arceus (Judgment)|5|manual x1|flat dmg/category|bespoke|NO|No flat_damage impl.|
|638|Cobalion (Sacred Sword)|3|passive|ignore Def+own neg|passive_damage|YES||
|639|Terrakion (Sacred Sword)|3|passive|ignore Def|passive_damage|YES|Streak +Atk secondary unwired.|
|640|Virizion (Sacred Sword)|3|passive|ignore Def|passive_damage|YES|Debuff-evasion secondary unwired.|
|641|Tornadus (Bleakwind Storm)|3|cooldown 6|-2 opp Spd|post_answer|YES||
|642|Thundurus (Wildbolt Storm)|3|cooldown 6, 50%|Paralysis|post_answer|YES||
|643|Reshiram (Blue Flare)|4|first_half|+1 Atk/Crit + Burn 40%|passive_damage|YES|Burn routed via passiveDamageSideEffects.|
|644|Zekrom (Bolt Strike)|4|streak≥3 40%|Paralysis +1 Atk|post_answer|YES||
|645|Landorus (Sandsear Storm)|3|cooldown 6|Burn +1 Atk|post_answer|YES||
|646|Kyurem (Glaciate)|4|every 3rd correct|-1 opp Spd|post_answer|YES|Freeze-escalation secondary unwired.|
|647|Keldeo (Sacred Sword)|3|cooldown 4|ignore Def|passive_damage|YES||
|648|Meloetta (Relic Song)|3|manual x2|+1 Atk + Sleep 30%|manual|YES|Server-fireable; stance bespoke.|
|649|Genesect (Techno Blast)|3|battle_start|+1 Spd|battle_start|YES|Drive loadout secondary unwired.|
|716|Xerneas (Geomancy)|4|manual x1|+2/+1/+1 triple buff|bespoke|NO|No two-stage charge impl.|
|717|Yveltal (Oblivion Wing)|4|on_correct|drain 2|post_answer|YES||
|718|Zygarde (Thousand Waves)|3|manual x1|-1 Spd + ability-lock|manual|YES|suppress_ability + stat.|
|719|Diancie (Diamond Storm)|3|on_correct 50%|+1 Def|post_answer|YES||
|720|Hoopa (Hyperspace Hole)|3|cooldown 5|ignore Def|passive_damage|YES|Misfire secondary unwired.|
|721|Volcanion (Steam Eruption)|3|on_correct 30%|Burn|post_answer|YES||
|772|Type: Null (Multi-Attack)|2|battle_start|+1 Atk (category-gated)|bespoke|NO|Category-gating bespoke, not wired.|
|773|Silvally (Multi-Attack)|3|battle_start|+1 Atk +1 Crit|bespoke|NO|Category-attune bespoke, not wired.|
|785|Tapu Koko (Nature's Madness)|3|cooldown 6|cut HP lead + immunity|bespoke|NO|Lead-cut bespoke, not wired.|
|786|Tapu Lele (Nature's Madness)|3|cooldown 6|-1 opp Crit|post_answer|YES|Terrain lock secondary unwired.|
|787|Tapu Bulu (Nature's Madness)|3|cooldown 6|heal 4 + +1 Def|post_answer|YES|Per-q regen bespoke.|
|788|Tapu Fini (Nature's Madness)|3|cooldown 6|cure self|post_answer|YES|Truce secondary unwired.|
|789|Cosmog (Splash)|1|bespoke|no effect|bespoke|NO|Intentional no-op (joke).|
|790|Cosmoem (Cosmic Power)|2|battle_start|+2 Def -1 Atk|battle_start|YES|Slow charge secondary unwired.|
|791|Solgaleo (Sunsteel Strike)|4|streak≥2|ignore Def|passive_damage|YES|Full Metal Body secondary unwired.|
|792|Lunala (Moongeist Beam)|4|cooldown 5|eliminate option|bespoke|NO|help mode, no impl.|
|800|Necrozma (Photon Geyser)|3|bespoke|+1 highest stat|bespoke|NO|photonGeyserStat only in tests, not wired.|
|801|Magearna (Fleur Cannon)|3|every 5th q|+3 Atk then -1 recoil|passive_damage|YES|Recoil routed via passiveDamageSideEffects.|
|802|Marshadow (Spectral Thief)|3|manual x1|steal highest stage|bespoke|NO|Stat-steal bespoke, not wired.|
|803|Poipole (Fell Stinger)|2|every 3rd correct|+1 Atk|post_answer|YES|docGap fill.|
|804|Naganadel (Air Slash)|3|every 3rd correct|+1 Spd|post_answer|YES|docGap fill.|
|805|Stakataka (Gyro Ball)|2|every 3rd correct|+1 Def|post_answer|YES|docGap fill.|
|806|Blacephalon (Mind Blown)|3|every 3rd correct|+1 Crit|post_answer|YES|docGap fill.|
|807|Zeraora (Plasma Fists)|3|fast_pair|+1 Spd +1 Crit|post_answer|YES|Chain-reset not modelled (approximation).|
|808|Meltan (Flash Cannon)|2|every 3rd correct|+1 Atk|post_answer|YES||
|809|Melmetal (Double Iron Bash)|3|every 5th q|2nd hit + Sleep 30%|passive_damage|YES|Sleep routed via passiveDamageSideEffects.|
|888|Zacian (Behemoth Blade)|5|battle_start|+1 Atk|battle_start|YES|Conditional extra Atk unwired.|
|889|Zamazenta (Behemoth Bash)|5|battle_start|+1 Def|battle_start|YES|Streak/reflect secondary unwired.|
|890|Eternatus (Dynamax Cannon)|4|manual x1|-2 Spd -1 Atk opp|bespoke|NO|Charge-release bespoke, not wired.|
|891|Kubfu (Focus Energy)|2|on_correct|+1 Crit|post_answer|YES|Crit-reset secondary unwired.|
|892|Urshifu (Surging Strikes)|3|bespoke (style)|ignore Def +3 Crit|bespoke|NO|Style-select bespoke, not wired.|
|893|Zarude (Jungle Healing)|3|cooldown 5|heal 8 + cure|post_answer|YES||
|894|Regieleki (Thunder Cage)|3|manual x1|Paralysis + ability-lock|manual|YES|suppress_ability + status.|
|895|Regidrago (Dragon Energy)|3|self HP≥80%|+2 Atk|bespoke|NO|HP-scaling re-eval bespoke, not wired.|
|896|Glastrier (Glacial Lance)|3|cooldown 5|-1 opp Spd + highlight|post_answer|PARTIAL|-1 Spd applies; hamper highlight is no-op.|
|897|Spectrier (Astral Barrage)|3|on_correct|drain 2|post_answer|YES|Grim Neigh secondary unwired.|
|898|Calyrex-Ice (Glacial Lance)|4|cooldown 4|-2 opp Spd + heal 3|post_answer|YES|Ramp/Unnerve secondary unwired.|
|10194|Calyrex-Shadow (Astral Barrage)|4|on_correct|drain 3|post_answer|YES|Grim Neigh secondary unwired.|
|1001|Wo-Chien (Ruination)|3|battle_start|-1 opp Atk|battle_start|YES||
|1002|Chien-Pao (Ruination)|3|manual x1|-2 opp Def + ignore-Def window|manual|YES|-2 Def server + 2-charge ignore-Def.|
|1003|Ting-Lu (Ruination)|3|manual x1|+2 Def -1 opp Crit|manual|YES|Server-fireable.|
|1004|Chi-Yu (Ruination)|3|manual x1|½ opp HP + Burn|bespoke|NO|frac-HP flat_damage bespoke, not wired.|
|1007|Koraidon (Collision Course)|5|new_category|+1 Atk +1 Crit|passive_damage|YES|Orichalcum passive bespoke.|
|1008|Miraidon (Electro Drift)|5|fast_answer|+1 Spd|post_answer|YES|Hadron secondary unwired.|
|1009|Walking Wake (Hydro Steam)|3|bespoke (adversity)|+2 Atk|bespoke|NO|Adversity-gating bespoke, not wired.|
|1010|Iron Leaves (Psyblade)|3|bespoke (terrain)|+1 Atk +1 Crit|bespoke|NO|Terrain-gating bespoke, not wired.|
|1014|Okidogi (Upper Hand)|3|bespoke (interrupt)|Poison|bespoke|NO|Explicitly NOT WIREABLE (Phase 2 report).|
|1015|Munkidori (Sludge Wave)|3|on_correct 40%|Poison|post_answer|YES|Toxic Chain upgrade secondary unwired.|
|1016|Fezandipiti (Beat Up)|3|pokedex_scaling|+1 Atk/25 dex (max 3)|battle_start|YES|pokedex_scaling handled in evaluateBattleStart.|
|1017|Ogerpon (Ivy Cudgel)|4|battle_start|+1 Crit|battle_start|YES|Mask loadout secondary unwired.|
|1020|Gouging Fire (Burning Bulwark)|3|bespoke (reactive)|Burn|bespoke|NO|Reactive protect/reflect bespoke, not wired.|
|1021|Raging Bolt (Thunderclap)|3|opponent_correct|+1 Atk -1 opp Atk|bespoke|YES|Wired via thunderclapFires.|
|1022|Iron Boulder (Mighty Cleave)|3|cooldown 4|ignore Def|passive_damage|YES||
|1023|Iron Crown (Tachyon Cutter)|3|cooldown 4|2nd hit +15%|passive_damage|YES||
|1024|Terapagos (Tera Starstorm)|4|manual x1|+2 Atk/+1 Def/+2 Spd|manual|YES|Server-fireable.|
|1025|Pecharunt (Malignant Chain)|4|manual x1|Bad Poison + mistap + lock|manual|PARTIAL|Bad Poison + suppress apply; hamper force_mistap is no-op.|

### Totals (104): **YES 76 · PARTIAL 5 · NO 23**

**PARTIAL (5):** 145 Zapdos, 381 Latios, 484 Palkia, 896 Glastrier, 1025 Pecharunt
(each has one no-op leaf — hamper/help, or 381's dropped ignore-Def).

**NO (23):** 251 Celebi, 385 Jirachi, 480 Uxie, 481 Mesprit, 482 Azelf, 486 Regigigas,
493 Arceus, 716 Xerneas, 772 Type:Null, 773 Silvally, 785 Tapu Koko, 789 Cosmog
(intentional joke no-op), 792 Lunala, 800 Necrozma, 802 Marshadow, 890 Eternatus,
892 Urshifu, 895 Regidrago, 1004 Chi-Yu, 1009 Walking Wake, 1010 Iron Leaves,
1014 Okidogi (declared not-wireable), 1020 Gouging Fire. Root cause: hamper/help are
always client no-ops (`live-pvp-battle-screen.tsx:1343`); many bespoke effects were
never implemented in `signature-bespoke.ts`.

---

## Handoff
- **Status:** done (investigation)
- **Produced:** `docs/handoffs/signature-audit/00-coverage-audit.md`
- **Next agent:** product-owner (→ `01-spec.md`), then solution-architect.
- **Context the next agent needs:** the 4 engine findings above; the headline fix is
  stat-stage EXPIRY (finding 3) which also unmasks type abilities; cooldown is a NEW
  mechanic (finding 2, needs a design decision); trigger gating already works
  (finding 1 — validate, don't "fix"); dual type-ability works (finding 4 — expand
  the 18 seeded rows + fix the stale comment); the 23 NO abilities are an
  unimplemented-bespoke backlog.
- **Open questions / risks:** cooldown length/scope; default expiry for "passive"
  (permanent-by-design) stages vs numeric durations; whether to implement any of the
  23 NO now; stage-expiry is server-authoritative → DB/backend change, not client-only.
