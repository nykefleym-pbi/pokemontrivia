# Worklist

Backlog of planned features and fixes. Items are removed (or checked off) as
they ship.

## Features

1. ~~**Notifications**~~ ✅ shipped — real Web Push (VAPID + service worker):
   mode-availability reminders, daily promo, friend request sent/accepted.
2. ~~**More Pokémon items**~~ ✅ shipped — 11 new items, simulation-balanced.
3. ~~**Poké-Egg mechanics**~~ ✅ shipped — Legendary/Mythical exclusivity (only
   obtainable via egg, excluded from all enemy pools with one documented Mega
   Raid exception), per-egg hatch progress based on modes played boosted by
   day-streak, hatch grants a Rare Candy, Legendary/Mythical partners get a
   data-driven type-colored frame (no glow) wrapping the whole partner card.
4. ~~**Partner re-pick restriction**~~ ✅ shipped — — limit re-picking the partner Pokémon to
   Pokémon already captured in the Pokédex.
5. ~~**Grow curated_questions beyond 2000+**~~ ✅ shipped — 464 new questions
   across dex stats, TCG, games, anime, and competitive play (2,275 → 2,739 rows),
   then 1,411 more across 7 source domains (2,275 → 3,686 rows), then 314 more
   from Pokémon Unite/GO/Snap/TCG Pocket/Sleep to reach exactly 4,000 rows.
6. ~~**PvP mechanics**~~ ✅ shipped — async friend battles (Profile → Friends
   Challenge button) and Nearby Battle, a real-time face-to-face mode mirroring
   Pokémon GO's Trainer Battle QR: your friend code doubles as a scannable
   Battle Code, an in-app camera scan instantly starts a wall-clock-synced
   match. Nearby Battle later reworked into a full HP/stats/status/berry
   battle — see #16/#17 below.
7. ~~**Invite campaign / referral**~~ ✅ shipped — grow the user base.
8. ~~**Level-up rewards**~~ ✅ shipped — grant rewards on level up.
9. ~~**Suggestions / bug-report form**~~ ✅ shipped — — "Submit suggestion" / "Report bug"
   entries in Profile → Settings.
10. ~~**What's New card**~~ ✅ shipped — — carousel card announcing new features.
11. ~~**Add-friends button in Mega Raid**~~ ✅ shipped — — quick friend-adding from the raid.
12. ~~**Item icon fixes + 3 new items**~~ ✅ shipped — fixed Exp Charm's broken
    PokeAPI sprite (pointed at Exp. Share instead); added Big Nugget (instant
    coins), Star Piece (+50% win rewards), and Choice Specs (2× rewards, but
    must be the only item used that battle).
13. ~~**Legendary/Mythical signature abilities**~~ ✅ shipped — **81 of 104**
    roster entries fully wired with live effects for **PvP (Nearby Battle)
    only** (Solo has no Attack/Defense/Speed/Crit stats so the abilities
    don't apply there); the remaining 23 are intentionally catalog-only/
    bespoke by design (validated via a dedicated audit pass, no live effect
    planned). Displays the Signature Move name in the UI (not a separate
    ability name). Roster now includes the 8 previously-missing Pokémon plus
    Shadow Rider Calyrex (a new synthetic-dex-id precedent for Pokémon
    formes). Per-side partner-id tracking (unlocks Mew's Transform,
    interrupt/reactive abilities, ability-lock/suppress abilities, and
    weather-conflict resolution), stack-tracking (Moltres, Zeraora), and
    Ho-Oh's Rainbow Rebirth revive-on-KO (both the self-inflicted and
    opponent-inflicted KO paths) are all shipped. A validation audit also
    surfaced and fixed a real security gap (client-supplied Pokémon id
    wasn't checked against the caller's registered partner, allowing
    ability-spoofing and unbounded HP drain/heal spam) plus several dead/
    partially-wired abilities and minor sub-effect gaps. Implemented via a
    data-driven ability-effect engine.
14. ~~**Status conditions**~~ ✅ shipped — Burn, Paralysis, Sleep, Freeze,
    Poison/Badly Poisoned, and Confusion, shared between Solo and Nearby
    Battle via a store-level `battleStatuses`/`opponentStatuses` system (one
    major status at a time; Confusion is the sole stacking volatile). Solo's
    prior local-state confused/poisoned behavior is unchanged.
15. ~~**PvP stats: Attack / Defense / Speed / Crit Rate**~~ ✅ shipped —
    Nearby-Battle-only stat stages (−3…+3, ±10%/stage), flat/uniform baseline
    for every Pokémon, buffable/debuffable mid-battle via items. Solo keeps
    its existing HP/damage system untouched.
16. ~~**Nearby Battle → real-time HP-endurance rework**~~ ✅ shipped — Nearby
    Battle is now a turn-based HP battle over 20 questions (sudden-KO on 0
    HP; otherwise higher HP wins, tiebreak accuracy then avg answer time),
    server-authoritative via `submit_pvp_live_answer` + a real-time
    `pvp_live_effects` broadcast so items/berries affect the live opponent.
    Async PvP (`pvp_matches`) is explicitly untouched.
17. ~~**PvP-specific items (berries)**~~ ✅ shipped — 14 PvP-exclusive berries
    (cures, self-buffs, opponent-facing debuffs), gated out of Solo's
    shop/reward pools; 5 random berries drop per completed Nearby Battle
    (win or loss), plus a one-time starter Lum Berry for new PvP players.
    Follow-ups not yet done: the ~20 existing auto-items/reward-multiplier
    items aren't wired into the live HP loop yet (still work in Solo/Shop);
    inventory isn't server-synced (item RPC validates the catalog + the
    3-item cap, not ownership); only Chople Berry currently inflicts a
    status in live battle; HP/damage/Speed-timer numbers are initial values
    pending a balance pass.
18. **Training vs Bot (Nearby Battle)** — a "Training" entry point next to
    the Nearby Battle button that starts a live PvP match against a bot
    opponent instead of scanning a real friend's code: the bot gets a
    randomly-rolled Legendary/Mythical partner (so it uses whatever
    signature ability that Pokémon has, reusing the existing roster with no
    new ability code needed) and a randomized per-match skill profile
    (accuracy, answer speed, item/ability-use aggressiveness). Feeds through
    the exact same `submit_pvp_live_answer`/`apply_pvp_signature_effect`
    RPCs as a real match — no changes needed to the core HP/stats/status/
    items/abilities engine. Scheduled to start **after** the signature-
    ability rollout (item 13) finishes.

## Bug fixes / polish

- [x] a. Battle tab: make the circular red ring around the trainer sprite
      static (not driven by XP).
- [x] b. In-battle bag: match the Shop bag's layout when tapped; only show
      available items (same behavior as the Shop bag).
- [x] c. Shop tab: replace the star icon next to the coin amount with a coin
      icon.
- [x] d. Shop: change the gift icon to a pixelated gift icon (design
      consistency).
- [x] e. Pokédex: change the Poké-Egg icon to a pixelated Poké-Egg icon
      (design consistency).
- [x] f. Mega Leaderboard: move the Mega Charizard sprite further left so it
      isn't so close to the screen edge.

## Plans for complex features (for review — tweak freely)

### 1. Mode-availability notifications
- **In-app (phase 1):** a red-dot badge on the Battle tab + a bell icon in the
  hub header listing which modes are ready (Daily not done today, Weekly not
  attempted, Who's That new hour, Mega attempts left). All state already exists
  client-side — no backend needed.
- **Push (phase 2):** Web Push via service worker. Needs a `push_subscriptions`
  table in Supabase, a VAPID key pair, and a scheduled Edge Function (cron) that
  sends "Daily Quest is ready!" etc. iOS PWA push works from iOS 16.4+ only when
  installed to Home Screen. Recommend shipping phase 1 first.

### 2. More items + rebalance
- New item candidates: Revive (auto once/battle: survive at 25% HP), Ether
  (+5s once), Berry (auto-heal 15 at <30%, consumable), Amulet Coin (2× coins,
  1 battle), Repel (skip one question, no penalty, 1/battle).
- Rebalance pass with the same battle simulator used for abilities; price via
  coins-per-win-rate-point so no item is strictly best.

### 3. Poké-Egg mechanics (expand current EggHatch)
- Eggs from Mega Raids (existing) + Day-7 gift + level-up rewards.
- Hatching requires "steps" = correct answers (e.g. 50); progress bar on the
  egg shelf. Hatch rolls a Pokémon weighted by rarity, small shiny chance
  (1/64), grants Pokédex entry + TP candy.

### 4. Partner re-pick limited to captured Pokémon
- Profile partner picker filters `STARTING_PARTNERS`/all-Pokémon list to ids in
  `pokedex` (captured). Onboarding keeps the starter list. One-file change +
  empty-state copy ("Capture Pokémon in battle to unlock them as partners").

### 5. Grow curated_questions past 2000
- ~~Generate in themed batches~~ ✅ shipped — 1,411 new questions added across
  the 7 requested source domains (official Pokédex/profile facts,
  Bulbapedia-style regional/game lore, dex stats & abilities, TCG rules &
  sets, mainline games & features, anime characters & movies, competitive
  VGC/format terms), inserted via Supabase MCP in per-domain batches with a
  Node validator (uniqueness, 4-option/1-correct shape, no answer-leakage)
  and spot-checked/fact-corrected before each insert. Table grew from
  2,275 → 3,686 rows.
- ~~Top up to exactly 4,000~~ ✅ shipped — 314 more questions focused on the
  spin-off titles Pokémon Unite, Pokémon GO, Pokémon Snap, Pokémon TCG Pocket,
  and Pokémon Sleep, same validated pipeline (uniqueness + dedup-checked
  against the full existing table before insert). Table grew from
  3,686 → 4,000 rows.

### 6. PvP
- ~~**Async friend battles**~~ ✅ shipped — challenger plays a 20-question
  run, a `pvp_matches` row stores the question set + score; the friend gets
  an inbox invite (`PvpInviteInbox`), plays the same set on `/pvp/$matchId`,
  higher total (points + accuracy + streak + speed) wins. Pure Supabase
  tables + RLS; no realtime infra; no rewards (v1).
- ~~**Nearby Battle (real-time QR)**~~ ✅ shipped — mirrors Pokémon GO's
  Trainer Battle QR: your friend code doubles as a scannable Battle Code
  (Profile → PvP → Nearby Battle → My Code); scanning someone's code with the
  in-app camera (`qrcode`/`jsqr`, `NearbyBattleSheet`) atomically creates an
  already-active `pvp_live_matches` row (no waiting lobby — you're already
  face to face); both clients derive the current question from a shared
  `started_at` wall-clock anchor so questions advance in lockstep
  (`LivePvpBattleScreen`, `/pvp/live/$matchId`); Realtime Presence forfeits a
  side that disconnects for 30s; no rewards (v1).

### 7. Invite campaign / referral
- ~~Referral code = existing friend code in a share link (`?ref=CODE` /
  `/refer?code=`)~~ ✅ shipped — new user onboards → both sides get rewards
  (coins + egg + 5 random non-premium items). `referrals` table + RLS +
  onboarding hook.

### 8. Level-up rewards
- On level change: coins scaled by level, +1 Poké-Egg every 5 levels, item at
  rank-ups (L6/16/26/51). Reward modal on the battle result screen (level-up
  already detected there).

### 9. Suggestions / bug report (Settings)
- Sheet form (category, text, optional email) → `feedback` table in Supabase
  (insert-only RLS). Zero backend beyond one table; view rows in Supabase.

### 10. What's New card
- `WHATS_NEW` const (version, title, bullets) in code; carousel card shows
  while `lastSeenWhatsNew < version`; dismiss stores version in the store.

### 11. Add-friends button in Mega Raid
- Leaderboard rows for non-friends get a "+" button → sends the existing
  friend request by trainer id (social lib already supports it).
