
# Pokémon Trivia Battle — Modern Mobile Game

A vibrant, mobile-first Pokémon trivia battler that recreates the full mechanics from the reference HTML, rebuilt with a modern Pokémon-themed look (bright type-colored gradients, soft cards, smooth animations) and AI-generated questions via Lovable AI.

## Screens & Navigation

**Bottom tab nav** (sticky, mobile-only width capped at ~480px): Battle · PokéMart · Profile.

1. **Splash / Onboarding**
   - Animated Poké Ball, bright gradient background, "New Trainer" / "Guest Mode".
   - Trainer creation: search Gen 1 Pokémon (with sprite preview) + trainer name.

2. **Battle (Home)**
   - "Find a Battle" CTA when idle. Shows current rank, level, XP bar.
   - Battle view: enemy trainer + their Pokémon (front sprite) at top with HP bar; player Pokémon (back sprite) at bottom with HP bar; battle dialog box; question card with 4 answer buttons; circular timer (20s); item bag button; floating damage text; shake/throw/appear animations.
   - Result screen: win/loss, XP earned, stats summary, "Battle Again" / "Home".

3. **PokéMart (Shop)**
   - Buy items with XP. All 8 items from original (Potion, Revive, X Attack, Escape Rope, Rare Candy, Lucky Egg, Scope Lens, X Accuracy) with icons, descriptions, premium tag, owned count.

4. **Profile**
   - Avatar (chosen Pokémon), editable name, rank badge, level, XP bar to next level.
   - Stat grid: Battles, Wins, Losses, Accuracy, Best Streak, Avg Time.
   - Change starter Pokémon (search), inventory display, dark mode toggle, reset progress.

## Core Mechanics (full parity)

- **HP system**: 100 HP each side. Correct answer deals 10 dmg (×2 if super-effective, +20 with X Attack). Wrong/timeout costs player 15 HP.
- **Type effectiveness**: full Gen 1 type chart (151 Pokémon) for super-effective bonus, shown as "It's super effective!" intro.
- **Timer**: 20s per question with color-pulse warning at low time.
- **Levels & ranks**: XP curve `80 + (level-1)*40`. Ranks: Youngster → Bug Catcher → Pokéfan → Ace Trainer → Gym Leader → Elite Four → Champion → Pokémon Master.
- **Enemies**: random rotation (Oak, Misty, Brock, Surge, Erika, Sabrina, Blaine, Giovanni, Lance, Cynthia, Red, Blue).
- **Items** with all original constraints (per-set caps, cooldowns measured in completed sets, Revive only at ≤10 HP, etc.).
- **Difficulty scaling**: question difficulty (easy → master) tied to player level, sent to AI prompt.

## Questions (AI-generated)

- Lovable AI Gateway via a TanStack server function (`/api/trivia`). Server picks a random category (General, Games, Anime, Pokédex, Moves & Abilities, Items, Regions, Lore, Competitive, Generations) and difficulty based on player level, returns one validated trivia object `{question, options[4], correct, explanation, category}` using tool-calling for structured output.
- Small built-in safety fallback bank if the AI call fails or rate-limits (kept tiny — primary source is AI).
- Surfaces 429 / 402 errors as toasts.

## Visual Direction — Vibrant Pokémon-Themed

- Type-colored accent system (Electric yellow, Fire orange-red, Grass green, Water blue) used contextually based on the player's Pokémon.
- Bright gradient backgrounds (sky → grass for battle, sunset for victory), soft rounded cards, drop-shadowed sprites, pixel-perfect Pokémon sprites from PokeAPI.
- Press Start 2P for tags/numbers (rank, HP, dmg) and Outfit for body — same hybrid as the reference, but lighter and more polished.
- Smooth Framer-style animations (already in the reference: Poké Ball throw, shake on hit, floating damage, fade-up screen transitions, confetti on victory).
- Light mode by default with a Dark Mode toggle in Profile.

## Persistence

- All progress (profile, level, XP, stats, inventory, dark mode, item cooldowns) saved to `localStorage` and restored on load. No account needed.

## Architecture

- TanStack Start routes: `/` (splash/onboarding gate → battle), `/battle`, `/shop`, `/profile`.
- Server function for AI question generation (keeps prompt + key on backend).
- Type-safe state managed with Zustand (single store) for clean cross-screen reactivity (HP, timer, inventory).
- Tailwind v4 theme tokens for type colors + dark mode.
