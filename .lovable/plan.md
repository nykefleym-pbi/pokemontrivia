## Scope

Eight focused fixes/enhancements to the existing app. No backend tables; no new routes.

---

### 1. Trainer roster — full searchable list, first 9 visible

Problem: `Florian` and `Juliana` slugs don't exist on Showdown's `/sprites/trainers/`, so they 404. Also, all ~36 thumbnails load on mount.

- Replace `TRAINER_SPRITES` in `src/lib/game-data.ts` with a **verified** list of slugs that actually exist on `https://play.pokemonshowdown.com/sprites/trainers/` (~150+ entries). I will assemble this from the directory's known filenames — common verified slugs include: `red`, `red-gen1`, `red-gen1rb`, `red-gen2`, `red-gen3`, `red-gen7`, `blue`, `blue-gen1`, `blue-gen3`, `ethan`, `ethan-gen4`, `lyra`, `lyra-gen4`, `brendan`, `brendan-gen3`, `may`, `may-gen3`, `lucas`, `dawn`, `hilbert`, `hilda`, `nate`, `rosa`, `calem`, `serena`, `elio`, `selene`, `victor`, `gloria`, `misty`, `misty-gen1`, `brock`, `brock-gen1`, `erika`, `sabrina`, `blaine`, `giovanni`, `lance`, `lance-gen1`, `cynthia`, `cynthia-gen4`, `steven`, `oak`, `oak-gen1`, `n`, `cheren`, `bianca`, `wally`, `barry`, `silver`, `gold`, `crystal`, `kris`, `wallace`, `juan`, `flannery`, `winona`, `tate`, `liza`, `roxanne`, `morty`, `whitney`, `bugsy`, `falkner`, `chuck`, `pryce`, `clair`, `karen`, `will`, `koga`, `bruno`, `agatha`, `lorelei`, `iris`, `drayden`, `alder`, `grimsley`, `marshal`, `caitlin`, `shauntal`, `diantha`, `wikstrom`, `siebold`, `malva`, `drasna`, `kukui`, `hala`, `olivia`, `nanu`, `hapu`, `acerola`, `kahili`, `molayne`, `sina`, `dexio`, `dexio-gen6`, `colress`, `ghetsis`, `archer`, `ariana`, `proton`, `petrel`, `archie`, `maxie`, `cyrus`, `mars`, `jupiter`, `saturn`, etc. — confirmed names only; **no** `florian` or `juliana` (those don't exist on Showdown).
- `src/routes/index.tsx` trainer picker: when search query is empty, render only the **first 9** entries (matching Pokémon picker behavior). When the user types, filter across the **full** list, capped at e.g. 30 results. Add `loading="lazy"` (already present).
- On image error, fall back to a generic Poké Ball icon (already partially implemented).

### 2. Remove "Reset question history" button + 500-question rotation rule

- Remove the reset button (and its `AlertDialog`) from `src/routes/profile.tsx`. Remove the `resetQuestionHistory` action from `src/lib/store.ts`.
- Change `MAX_SEEN_HASHES` from 2000 → **500**, FIFO. Once history hits 500, oldest hashes are dropped, so the AI can re-use those questions — but the prompt still receives `seenSamples` (the most recent 40) to avoid the *same flow* (similar wording/order) as the previous occurrence.
- Add a small `flowSeed: number` value generated per battle (random) and passed to `/api/trivia-batch` so the AI is told to vary phrasing/category order even when topics repeat.

### 3. Streak counter fix

Problem: in `src/components/battle-screen.tsx`, the result screen shows `streak` (the *current* streak at battle end), so a final wrong answer or a Defeat shows `0`. Streak counting itself is correct; only the displayed/persisted "best of this battle" is wrong.

- Track `maxStreakThisBattle` in a `useRef`, updating it whenever `newStreak > max`.
- Show `maxStreakThisBattle` (not live `streak`) in `ResultScreen`.
- Pass `maxStreakThisBattle` into the XP bonus calculation in `finish()` so consecutive correct answers actually pay out, and confirm `recordAnswer` already updates `bestStreak` cumulatively (it does).

### 4. Enemy Pokémon roster — fully evolved / no-evolution Gen I only

Problem: enemy roster is hand-picked and includes basics like Pikachu/Charizard mix.

- Add `EVOLVED_OR_SOLO_IDS` to `src/lib/pokemon-data.ts` (or compute in `game-data.ts`): the canonical Gen I "final form / no-evo" set — Venusaur(3), Charizard(6), Blastoise(9), Butterfree(12), Beedrill(15), Pidgeot(18), Raticate(20), Fearow(22), Arbok(24), Raichu(26), Sandslash(28), Nidoqueen(31), Nidoking(34), Clefable(36), Ninetales(38), Wigglytuff(40), Golbat(42), Vileplume(45), Parasect(47), Venomoth(49), Dugtrio(51), Persian(53), Golduck(55), Primeape(57), Arcanine(59), Poliwrath(62), Alakazam(65), Machamp(68), Victreebel(71), Tentacruel(73), Golem(76), Rapidash(78), Slowbro(80), Magneton(82), Farfetch'd(83), Dodrio(85), Dewgong(87), Muk(89), Cloyster(91), Gengar(94), Onix(95), Hypno(97), Kingler(99), Electrode(101), Exeggutor(103), Marowak(105), Hitmonlee(106), Hitmonchan(107), Lickitung(108), Weezing(110), Rhydon(112), Chansey(113), Tangela(114), Kangaskhan(115), Seadra(117), Seaking(119), Starmie(121), Mr. Mime(122), Scyther(123), Jynx(124), Electabuzz(125), Magmar(126), Pinsir(127), Tauros(128), Gyarados(130), Lapras(131), Ditto(132), Vaporeon(134), Jolteon(135), Flareon(136), Porygon(137), Omastar(139), Kabutops(141), Aerodactyl(142), Snorlax(143), Articuno(144), Zapdos(145), Moltres(146), Dragonite(149), Mewtwo(150).
- `getEnemyTrainers()` becomes: shuffle a base list of trainer IDs from `TRAINER_SPRITES` and pair each with a randomly assigned enemy Pokémon from the evolved/solo set. Trainer→Pokémon assignment is randomised per-battle (so the same trainer can show different Pokémon across battles, and vice-versa).
- Drop the hand-coded `enemyDefs`. Trainer titles are derived dynamically: capitalize the slug; assign a generic title like "Pokémon Trainer".

### 5. XP persists across level-ups; PokéMart spends XP

Problem: `addXp` subtracts XP at every level-up, so the XP bar resets and PokéMart has nothing to spend.

- Change `addXp` in `src/lib/store.ts` to **accumulate** total XP without subtracting on level-up. Compute `level` from cumulative XP via a helper `levelFromTotalXp(totalXp)` that walks the `xpForLevel` curve. The store keeps `xp` as the **lifetime/spendable wallet**.
- Update `xpForLevel` consumers (XP bar in `src/routes/battle.tsx`, profile bar) to display **progress within current level** = `xp - sumXpToReach(level)` over `xpForLevel(level)`.
- `buyItem` (already deducts `xp`): keep as-is. After deduction, recompute level via `levelFromTotalXp` so spending can move the level bar back (but level itself should not decrease — clamp `level` to never drop below the highest level previously achieved; track `peakLevel`).

### 6. PokéMart item effects must actually fire

Audit each item's effect end-to-end:

- `potion` — already restores 30 HP in `BattleScreen.tryUseItem`. ✓
- `revive` — already heals to 50 if HP ≤ 10. ✓
- `xattack` — already adds +20 to next correct via `xAttackActive` + `consumeXAttack`. ✓
- `escape` — already exits battle without XP loss. Verify `endBattle` is **not** called on escape (it currently isn't, but battle stats won't increment — this is the intended "no loss" behaviour).
- `candy` — adds 50 XP via `addXp(50)`. ✓
- `luckyegg` — `endBattle` currently doubles XP. Verify `luckyEggActive` survives until battle end (it does; reset on `endBattle`). ✓
- `scope` — reveals one wrong answer at next `loadQuestion`. ✓
- `xaccuracy` — adds +5 to timer per use. **Bug**: `bonusTimeThisBattle` is set in `useItem` but `BattleScreen` reads `bonusTime` only inside `loadQuestion` — the *currently displayed* question's timer doesn't update. Fix: when `xaccuracy` is used mid-question, also bump `setTimer((t) => t + 5)` from `tryUseItem`.

Also: items used during a battle should be visibly removed from the bag immediately (already handled by store decrement) and a toast confirms each. Add a unit-style sanity check in `tryUseItem` to log effect application in dev.

### 7. New rank system + enemy HP scaling

- Replace `RANKS` and `rankForLevel` in `src/lib/game-data.ts`:
  - L0–5 → **Little League Champ**
  - L6–15 → **Great League Champ**
  - L16–25 → **Ultra League Champ**
  - L26–50 → **Master League Champ**
  - L51+ → **Monarch (World Champion)**
- Add `enemyHpForLevel(level)`: base 100 + 50 × leagueIndex (Little=0, Great=1, Ultra=2, Master=3, Monarch=4) → 100 / 150 / 200 / 250 / 300.
- `BattleScreen` initialises `enemyHp` from `enemyHpForLevel(level)` instead of hard-coded 100. The `HpBar` component should accept a `max` prop (or normalise %). Verify `HpBar` in `src/components/game-ui.tsx` and update if it currently assumes `max=100`.

### 8. AI batch endpoint — accept `flowSeed`, drop `resetQuestionHistory`

- `src/routes/api.trivia-batch.ts`: accept optional `flowSeed: number` and inject into the system prompt: "Use seed N to vary category order and phrasing; do not mirror prior batches." The 500-rotation policy means the server-side filter still drops exact-hash repeats present in `seenHashes`.
- Remove any reference to `resetQuestionHistory` from profile/UI.

---

## Suggested enhancements (for your review — not in scope unless approved)

1. **Daily challenge** — one fixed 5-question set per day with a leaderboard slot; rewards a Rare Candy on first daily win.
2. **Type-effective combo bonus** — chain bonus XP when you answer correctly *and* you have super-effective type advantage.
3. **Trainer titles per league** — once the user reaches Ultra League, unlock cosmetic trainer back-sprite swaps (shiny variants).
4. **Battle music / SFX toggle** — ambient 8-bit loop + hit/feedback sounds with a mute switch in profile.
5. **Achievements badges** — "Perfect Set" (5/5 correct), "No-hit" (win without losing HP), "Speedrunner" (avg < 5s/answer).
6. **Animated transitions between battles** — Pokémon Center healing screen when returning from defeat.
7. **Pokémon party of 3** — let the player carry 2 reserves and switch when fainted (still Gen I roster).
8. **Wild encounters** — short 3-question solo encounters (no trainer) for quick XP between full battles.
9. **Seasonal events** — themed question category weeks ("Legendary Week", "TCG Week") that boost XP for that category.
10. **Share result card** — generate an image of the victory screen for social sharing.

---

## Technical notes

- All changes remain client-side + the existing `/api/trivia-batch` endpoint. No new dependencies, no backend tables.
- Storage budget after change: 500 hashes × ~10 B ≈ 5 KB; 200 sample texts × ~80 B ≈ 16 KB. Smaller than today.
- `peakLevel` is added to the persisted store so XP spending in PokéMart never visually demotes the trainer.
- `HpBar` will be updated to accept `max` (defaulting to 100) for backward compatibility.