# 01-spec — Feedback-table triage batch

**Feature slug:** `feedback-triage`
**Author:** Product Owner
**Date:** 2026-07-10
**Type:** Bug-fix batch + one feature plan (from in-app `public.feedback`)

---

## Source

Three items pulled from Supabase `public.feedback` (project `dvdorceiasaipdvyfhil`),
which is insert-only under RLS and readable only via a service-role/MCP connection.

| # | Trainer | Category | Verbatim |
|---|---------|----------|----------|
| 1 | Nykefleym | bug | "Lose screen of Nearby Battle / Training should be similar to Regular Battle Losing screen where you can review all your incorrect answers." |
| 2 | TurboAce74 | suggestion | "Add a Global Chat. Ensure profanities or incorrect behavior is banned." |
| 3 | TurboAce74 | bug | "Legendary/ Mythical also have type abilities on top of their signature abilities. Ensure both are triggered." |

Owner decision (2026-07-10): **build #1 and #3 now; #2 = plan only** (see
`docs/handoffs/global-chat/`), no implementation this batch.

---

## In scope (this batch)

- **#1** — Add an incorrect-answer review to the **Nearby Battle / Training** lose
  screen, at parity with the Regular (Solo) battle lose screen.
- **#3** — Make Legendary/Mythical partners trigger **both** their signature ability
  **and** their type ability in PvP (currently mutually exclusive by design).

## Out of scope

- Global Chat implementation (#2) — planned separately, not built here.
- Rebalancing ability values (see risk on #3), new abilities, or new content.
- Changing the Regular-battle lose screen behaviour (it is the reference).
- Human-PvP-only enhancements beyond what the shared fix naturally flows through.

---

## User stories & acceptance criteria

### Story 1 — Review missed answers on the Nearby/Training lose screen (#1)
As a player who **loses** a Nearby Battle or Training match, I want to review every
question I answered incorrectly (question, correct answer, explanation), exactly as
I can after losing a Regular battle.
- **Given** I lose a Nearby/Training match, **When** the result (defeat) screen
  shows, **Then** it lists each question I got wrong with its correct answer and
  explanation — visually consistent with the Solo `ResultScreen` review block.
- **Given** the match is resolved by the **opponent's** answer (realtime), so my
  client never runs its own finish handler, **Then** my missed-answer list is still
  complete on the defeat screen (history must survive the battle→result unmount).
- **Given** I got **nothing** wrong (edge case on a loss by HP/forfeit), **Then**
  the review area degrades gracefully (no empty/broken card).
- **Priority: Must.**

### Story 3 — Legendary/Mythical fire both abilities (#3)
As a player using a Legendary/Mythical partner, I want its type ability to trigger
in addition to its signature ability, so I get the full kit the feedback expects.
- **Given** my partner is Legendary/Mythical (has a signature ability), **When** a
  slot resolves, **Then** its resolved **type ability** effects fire **and** its
  **signature ability** effects fire (both fold into damage/self-damage/status as
  each is designed to).
- **Given** both fire, **Then** both are **announced** (toast/cue) and correctly
  **attributed** to the right side — the info popover should surface both, not one.
- **Given** a type ability that relies on the server catalog (`battleStart` /
  `postAnswerFires`), **Then** the type-ability id is reported to the server so the
  effect resolves and the opponent can attribute it.
- **Priority: Must.**

---

## Definition of Done
- Losing a Nearby/Training match shows the missed-answer review, robust to the
  opponent-resolves-the-match path; no regression to the Solo lose screen.
- Legendary/Mythical partners fire and announce both abilities; non-legendary
  partners are unchanged (still type ability only).
- `tsc` + ESLint + Vitest green; a regression test covers no-answer/opponent-resolve
  history retention (#1) and the dual-ability gate removal (#3).
- Verified in a live battle on the Vercel preview.

## Open questions / risks (for Architect + owner)
1. **#3 balance:** stacking a rarity-5 signature nuke on top of a type ability was
   *deliberately avoided* by the original mutually-exclusive design
   (`signature-abilities.ts:15-17`, `pvp-type-abilities.ts:5-9`). Owner has accepted
   the feedback's intent, but flag for a post-ship balance pass.
2. **#1 shared component:** extract the Solo review block into a shared `MissedReview`
   so both lose screens stay identical by construction (recommended), vs. duplicate.

---

## Handoff
- **Status:** done
- **Produced:** `docs/handoffs/feedback-triage/01-spec.md`
- **Next agent:** solution-architect (see `02-architecture.md`)
- **Context the next agent needs:**
  - Two Must fixes, both **Frontend-owned** (components/routes/hooks/client-lib); no
    schema change expected. #3's server-report tweak is in a TanStack `api`/route
    client caller, still client-side wiring — confirm ownership at the api boundary.
  - #1: missed history is **not retained** in the Nearby/Training flow today; must be
    lifted above the battle→result unmount (route state), not hung off `onFinish`.
  - #3: remove two `signature ? null : typeAbility` gates
    (`live-pvp-battle-screen.tsx:352`, `pvp.live.$matchId.tsx:113-114`); both ability
    blocks already fold independently, so both will stack once un-gated.
  - #2 is plan-only — do not build.
- **Open questions / risks:** the two above.
