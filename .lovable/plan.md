## Three-pass rollout

This is too large for one safe pass. Ship in the order you suggested: **C → B → A**. Each pass leaves a working app.

---

## Pass 1 — Part C: Pokédex + Shiny (data layer first)

**Goal:** capture-on-defeat collection, shiny enemies, Pokédex tab in Profile. No AI, no new question rendering.

### Store (`src/lib/store.ts`)
- Add `PokedexEntry` interface and `pokedex: Record<number, PokedexEntry>` to `GameState`.
- Action `recordPokedexCapture(pokemonId, isShiny)` — upsert, preserve `firstSeenAt`, OR shiny flag, increment `defeatCount`.
- Add `defeatedEliteRegions: string[]` (used in Pass 2; safe to add now).
- `defaultState`, `partialize`, `merge` fallbacks: `pokedex: {}`, `defeatedEliteRegions: []`. Reset action clears them.

### Sprites (`src/lib/pokemon-data.ts`)
- Change `spriteUrl(id, opts?: { back?; shiny? })` with backward-compat for old `(id, true)` second-arg-as-back signature (detect boolean).
- Shiny path: `.../sprites/pokemon/shiny/{id}.png`; back-shiny: `.../back/shiny/{id}.png`. Front normal stays on pokemondb (current); shiny falls back to PokeAPI sprites repo.

### Enemy roll (`src/lib/game-data.ts`)
- Extend `EnemyTrainer` with `isShiny: boolean`.
- `pickRandomEnemy()` rolls `Math.random() < 1/256`.

### Battle (`src/components/battle-screen.tsx`)
- On mount of a new enemy: if `enemy.isShiny`, `toast.success("✨ A SHINY {name} appeared!")` once.
- Render enemy sprite via `spriteUrl(id, { shiny: enemy.isShiny })` + `<Sparkles>` overlay when shiny.
- In `finish()` BattleMode win branch: `recordPokedexCapture(enemy.pokemon.id, enemy.isShiny)`.

### Picker guards (`src/routes/index.tsx`, `src/routes/profile.tsx`)
- Pokémon partner pickers always render normal sprites; no shiny toggle exposed.

### Pokédex UI (Profile tab)
- New tab between Trophies and Stats. Order: Profile → Trophies → Pokédex → Stats → More.
- Header: `{captured}/{total}`, "Shinies seen: N".
- **Generation pagination** (Gen 1–9 sub-tabs) instead of windowing — simpler and 1010 cells split across 9 tabs is fine on mobile.
- 5-col grid; uncaptured = silhouette + "???"; captured = sprite + name + defeat-count badge; shiny-unlocked shows ✨ corner icon.
- Tap → Dialog: sprite (toggle normal/shiny if unlocked), name, types, defeat count, first-seen date.
- Search input (substring, case-insensitive) + type filter dropdown (18 types + All), applied across captured & uncaptured.

### Achievements (`src/lib/achievements.ts`)
- `pokedex_50` 📕, `pokedex_151` 🟥, `shiny_first` ✨ (check `Object.values(s.pokedex).some(e => e.shinyUnlocked)`).

**Acceptance:** existing localStorage loads cleanly with `pokedex: {}`; shiny toast fires; Pokédex grid renders per-gen; search/filter work; players cannot pick a shiny partner.

---

## Pass 2 — Part B: Elite 4 gate

**Goal:** every 5 levels, block progression with a themed boss battle.

### Data (`src/lib/elite-four.ts`)
- Hard-code the 20-member roster from the prompt **verbatim** (IDs are pre-verified — do not "fix").
- Export `ELITE_FOUR`, `EliteFourMember`.

### Store
- `pendingEliteBattle: { level, member, blocked: true } | null`.
- `recentEliteTypes: PokeType[]` (cap last 4) for variety bias.
- `defeatedEliteRegions` (added in Pass 1) gets pushed on win; dedupe.
- Actions: `triggerEliteGate(newLevel)`, `clearEliteGate()`, `recordEliteWin(member)`.
- Backward-compat in partialize/merge.

### Trigger
- In `finish()` after XP applied, if `newLevel % 5 === 0` and `newLevel !== oldLevel`: pick a member whose `signatureType` not in `recentEliteTypes`, set `pendingEliteBattle`, toast "🛡️ An Elite 4 challenger has appeared!".

### Gating (`src/routes/battle.tsx` BattleHome)
- If `pendingEliteBattle`: replace Find Match CTA with gold-bordered Elite 4 panel (member portrait via `trainerSpriteUrl`, name, region, flavor, "CHALLENGE THE ELITE 4" button → `/battle?mode=elite`).
- Disable regular battle + daily CTAs with lock overlay text.

### Elite battle mode (`src/components/battle-screen.tsx`)
- New mode `"elite"`. Enemy HP = 200, player HP = 100, 10 questions single-set (no set boundaries).
- Enemy = `{ name: member.displayName, pokemon: findPokemon(member.signaturePokemonId), isShiny: false }`; sprite h-40 w-40 with `drop-shadow(0 0 16px gold)` pulse.
- Top bar: "ELITE 4 CHALLENGE — {name}" + `{q+1}/10`.
- Background: `.bg-elite-arena` (added in `src/styles.css`).
- On entry: `playSfx("elite_intro")` — add 4-note arpeggio (440/554/659/880 Hz sine 0.15s sequential) to `audio.ts` SFX map.
- Win: `recordPokedexCapture(member.signaturePokemonId, false)`, push BattleLogEntry with `isElite: true`, `recordEliteWin`, `clearEliteGate`, grant +50 bonus XP, roll 5 random items from `ITEMS.filter(i => i.premium)` — staggered "Spoils of victory!" overlay (250ms each, premium-yellow border).
- Loss: no XP penalty; gate stays. After 2 consecutive losses show item-tip toast.

### Endpoint (`src/routes/api.trivia-elite.ts`)
- Mirrors `api.trivia-batch.ts`. Accepts `{ member, difficulty }`. System prompt as written. Returns 10 questions via same tool schema. Falls back to filtered FALLBACK_QUESTIONS.

### Types (BattleLogEntry)
- Add optional `isElite?: boolean`.

### Achievements
- `elite_first` 🛡️ (`s.defeatedEliteRegions.length >= 1`).
- `elite_all_regions` 🏛️ (Kanto, Johto, Hoenn, Sinnoh, Unova all present).

**Acceptance:** hitting LV 5 gates the player; cannot start regular/daily battles; Elite 4 themed questions ≥70% signature type; win grants 5 premium item rolls + ace added to Pokédex; loss is retryable with no penalty.

---

## Pass 3 — Part A: 5 new question kinds

**Goal:** discriminated-union question deck rendered through unified `<QuestionCard>`.

### Types (`src/lib/trivia-types.ts`)
- Discriminated union `TriviaQuestion` exactly as specified (mcq | silhouette | cry | pokedex | lore | media). Existing `Trivia` becomes alias of mcq variant.

### Builders (client-side, `src/lib/question-builders.ts`)
- Difficulty-aware ID cap: easy/medium ≤386, hard/expert ≤649, master all.
- `buildSilhouette()`: random PokeEntry within cap.
- `buildCry()`: answer + 3 distractors sharing primary type, shuffle.
- `buildPokedex(id)`: async, fetches `pokemon-species/{id}`, picks recent-game English flavor, normalizes (`\n\f` → ` `, `POKéMON` → `Pokémon`); module-level `Map<number,string>` cache. Distractors share ≥1 type with answer. Returns null on fetch failure → caller substitutes silhouette.

### Endpoints
- `src/routes/api.trivia-lore.ts` — mirrors trivia-batch, batch=5, lore prompt as written.
- `src/routes/api.trivia-media.ts` — batch=5, media prompt; tool schema gains `medium: "anime"|"manga"|"movie"|"live-action"`.
- Throttle: only fetch lore/media when `playerLevel >= 3` (caller decides).

### Deck builder (`src/routes/battle.tsx`)
- `buildQuestionDeck()` per spec: 20 weighted slots (35/15/10/15/15/10), parallel fetch of mcq+lore+media, async pre-resolution of all `pokedex` slots before battle starts, fallback chain on any miss.
- Preload: for silhouette/cry slots, `new Image().src = spriteUrl(id)` and `new Audio(cryUrl)` (no play) before first render.
- Daily challenge stays MCQ-only (do not call buildQuestionDeck for daily).
- Elite mode (Pass 2): 10 type-themed MCQs from `/api/trivia-elite`; optionally inject 1–2 silhouettes of signature type for variety.

### `<QuestionCard>` (`src/components/question-card.tsx`)
- Switches on `kind`. Shared header (timer, streak chip, hint area).
- **silhouette**: sprite with `filter: brightness(0)`; letter-blank row honoring spaces/hyphens/apostrophes; text input (uppercase, no autocomplete); live green-prefix / red-wrong feedback; Submit/Enter; Hint button reveals one letter, costs −3s on timer (max 2 uses); on reveal, drop filter + `playCry(id)` + explanation.
- **cry**: large play button + Replay (max 3); auto-play once 400ms after mount unless `isMuted()` (then "Tap to play"); 4 name-only MCQ buttons; reveal shows sprite + cry replay.
- **pokedex**: red Pokédex-frame card ("POKéDEX ENTRY" header + italic body); 4 MCQ buttons; reveal shows sprite + name + types.
- **lore / media**: standard MCQ rendering; media shows small medium badge.
- Normalize for silhouette compare: lowercase, strip non-alphanumerics, remove spaces. Daily-pattern mapping: exact match 🟩, wrong 🟥, timeout ⬛.
- All kinds feed into existing damage/streak/SFX/haptics flow unchanged.

**Acceptance:** all 6 kinds render, scoring/audio identical to MCQ; silhouette typing + hint works; cry auto-plays once and respects mute; pokedex entry falls back to MCQ on fetch failure; lore/media only fetched at level ≥3; daily unchanged.

---

## Risks / call-outs
- `spriteUrl` signature change: audit every call site (battle-screen, pickers, Pokédex tab, profile) and add the boolean-back compat shim.
- PokeAPI rate limits: cache species lookups in-memory + during a single battle preload them in parallel with a 6-wide concurrency cap.
- Existing players' localStorage: every new field needs default in both `partialize` and `merge`.
- Deck-builder slot fallback chain must never return `undefined` — always degrade to a synchronous silhouette.
