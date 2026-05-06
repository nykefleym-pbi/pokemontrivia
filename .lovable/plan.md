# No Repeats + Source-Grounded Trivia

Two tightly scoped changes — no new screens, no backend tables.

## 1. Per-device "seen questions" history (localStorage)

Goal: a player never sees the same (or near-duplicate) question twice across sessions on their device.

- Add `seenQuestionHashes: string[]` to `useGameStore` (persisted via the existing zustand persist).
- Add a stable `hashQuestion(text)` helper in `src/lib/store.ts`:
  - Normalize: lowercase, strip punctuation, collapse whitespace.
  - Hash with a tiny FNV-1a (no deps) → short hex string.
- Add store actions:
  - `markQuestionsSeen(questions: Trivia[])` — push hashes, dedupe, cap the list at the **last 2,000 entries** (FIFO trim) to keep storage small.
  - `hasSeenQuestion(text): boolean`.
- Update `src/components/battle-screen.tsx`: when a question is shown (or when the batch is received), call `markQuestionsSeen` for that question. Marking on first display ensures even abandoned battles count.

## 2. Send the seen-history to the AI batch endpoint

Goal: the model actively avoids repeats and near-paraphrases.

- Update `src/routes/battle.tsx`'s pre-fetch call to `POST /api/trivia-batch` with:
  ```json
  { "difficulty": "...", "seenHashes": [...], "seenSamples": [last 40 question texts] }
  ```
  - `seenHashes`: full list (hashes are tiny, ~8 chars each).
  - `seenSamples`: the **40 most recent** raw question texts (capped, so the prompt stays small) for semantic avoidance.
- Add a parallel `seenQuestions: string[]` to the store (last 200, FIFO) so we can send recent samples without storing all raw texts forever.

## 3. Update `src/routes/api.trivia-batch.ts`

- Accept the new fields in the POST body.
- **Prompt changes** — add to the system prompt:
  - "You are crafting questions grounded in canonical Pokémon sources: **pokemondb.net**, **bulbapedia.bulbagarden.net**, and **pvpoke.com** (for competitive/PvP content). Only use facts verifiable on those sources."
  - "AVOID these recent questions and any paraphrase of them (different wording, same answer/topic counts as a repeat):" followed by the `seenSamples` list.
  - Encourage breadth: spread across the 10 categories AND across generations (1–9), regions, mechanics, anime arcs, TCG, and competitive (PvP tiers, movesets) to maximize variety.
- **Server-side filter**: after dedupe, drop any question whose normalized hash matches `seenHashes`, OR whose Jaccard similarity vs any `seenSamples` token set > 0.6. Top-up from fallback bank only if needed (and skip fallback entries the user has already seen).
- Keep existing 429/402 passthrough and tool-calling structure.

## 4. Fallback bank de-dup

- In `topUpFromFallback`, also skip entries whose hash is in `seenHashes`. Prevents the small fallback bank from cycling the same 8 items forever.

## 5. Profile screen: small "Reset question history" control

- In `src/routes/profile.tsx`, under the existing settings area, add a subtle button: **Reset question history** (clears `seenQuestionHashes` + `seenQuestions` only; keeps XP, inventory, trainer, etc.).
- Confirms via existing `AlertDialog` pattern.

## Technical notes

- Storage budget: 2,000 hashes × ~10 bytes ≈ 20 KB; 200 sample texts × ~80 bytes ≈ 16 KB. Well within the localStorage budget already used by the store.
- Network budget: even 2,000 hashes is ~20 KB JSON — fine for one POST per battle. If it ever balloons, we can switch to sending only the last N hashes.
- Why both hashes + samples: hashes give cheap exact-match dedupe across the entire history; the 40 recent samples let the LLM semantically avoid paraphrases without bloating the prompt.
- No DB, no auth — fully per-device as requested.
- No new dependencies.
