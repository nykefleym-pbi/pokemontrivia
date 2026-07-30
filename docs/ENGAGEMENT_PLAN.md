# Engagement plan

Written 2026-07-30, from production data rather than from intuition. Every number
below was queried against the live Supabase project; where something could not be
verified it says so.

The headline: **the app does not have an engagement-depth problem. It has a
day-two problem, and one broken secret is holding the main fix hostage.**

---

## What the data actually says

Eight profiles exist. Two are not players: `Nykefleym` (the owner) and
`Training Bot`. That leaves **six real invited players**, and this is what they
did:

| Trainer      | Joined | Actions | Active days | What they did                  |
| :----------- | :----- | ------: | ----------: | :----------------------------- |
| Nykefleym    | Jul 9  |     120 |          19 | (owner)                        |
| Training Bot | Jul 9  |      73 |          18 | (bot)                          |
| Ash          | Jul 28 |       2 |           1 | 1 solo battle, 1 Nearby Battle |
| Andrei       | Jul 29 |       1 |           1 | 1 Daily Quest                  |
| Bankai       | Jul 29 |       1 |           1 | 1 solo battle                  |
| John Carlo   | Jul 28 |       1 |           1 | 1 solo battle                  |
| Kannei       | Jul 29 |       1 |           1 | 1 solo battle                  |
| Meio         | Jul 27 |       1 |           1 | 1 Nearby Battle                |

**Day-2 retention is 0 of 6.** Every invited player took one or two actions on the
day they joined and never opened it again. Nobody bounced off a deep system — they
bounced off the first session.

Supporting facts:

- **0 friends, 0 friend requests, 0 referrals.** The entire social graph is empty.
- **0 Mega runs, ever.** `mega_events` holds one row and it **expired 2026-07-07** —
  23 days ago. The limited-time event that creates urgency has been absent for the
  whole period during which every one of these players arrived.
- **Only 1 profile has ever played Who's That Pokémon**, and **1** has ever
  attempted Weekly League.
- **Nearby Battle has been used by two humans exactly once.** Of 74 live matches,
  **73 are against the Training Bot** and 1 is human-vs-human. The human one
  completed; **all 26 forfeits are bot matches**, which is the owner testing and
  backing out, not a player signal. (Corrected 2026-07-30: the first version of
  this document read the 74 as real multiplayer usage and recommended work on the
  forfeit rate. It was a misread — see P1.3.)
- 2 bot matches have been stuck `active` since Jul 9 and Jul 18, so the state
  machine has no timeout.
- **5 of 8 players opted into push** — a good rate — and **not one has ever
  received a notification.** `last_reminder_sent` is null for all eight.

---

## P0 — the live bug (fix first, it is one line of config)

`send-push` is returning **503 to everything**. From `net._http_response`, today:

```
503  {"error":"push not configured: invalid VAPID keys
      (Vapid subject is not a valid URL. https://pokemontriviabattle.vercel.app \);
      publicLen=87, privateLen=87"}
```

The `VAPID_SUBJECT` edge-function secret is `https://pokemontriviabattle.vercel.app \`
— it has a **trailing space and backslash**. `web-push` rejects it,
`setVapidDetails` throws, and the lazy-init guard turns every single push request
into a 503.

This is not theoretical, and it explains the whole reminder story:

- `daily-promo-push` (cron, 08:00 daily since Jul 4) → 503 every day.
- `mode-availability-reminders` (cron, every 4h) → returns `{"scanned":8,"notified":0}`.
  It scans everyone, then `res.ok` is false for each because `send-push` 503s, so
  `notified` stays 0 **and `last_reminder_sent` is never written** — which is why
  the column is null for all eight and every player stays permanently eligible for
  a reminder that can never arrive.
- Friend requests, PvP results, and the **`pvp_chat` notification just shipped in
  #247** are all dead for the same reason.

**Fix:** set `VAPID_SUBJECT` to a valid value — either `mailto:support@pokemontriviabattle.app`
(the code's own default) or a clean `https://…` with no trailing characters. No
redeploy needed for a secret change, but re-invoke `send-push` once to confirm a 200. This is the single highest-leverage action available: it turns 5 already-opted-in
players from unreachable into reachable, and it is a dashboard edit.

**Mitigated in code 2026-07-30 — but still fix the secret.** `send-push` no longer
lets a malformed subject take push down. A bad SUBJECT is not a cryptographic
failure (it is a contact hint for the push service), so `ensureVapid` now tries the
configured value, then a tidied version of it, then the `mailto:` default, and only
503s if all three are refused — at which point the _keys_ really are broken, and
those cannot be substituted for. It logs loudly whenever it falls back, so "push
works" never hides "the secret is still wrong". Bad keys stay fatal.

This means push works without touching the dashboard, but the stored secret is
still malformed and should be corrected.

**Second P0, nearly as cheap:** schedule a new Mega event. The mode has never been
run once, the card is a primary comeback hook, and the reason is simply that no
event row is current. `readyModes` also gates the reminder copy on
`megaEventActive`, so an expired event quietly shrinks what a reminder can even
say.

---

## P1 — make the first session end with a reason to return

This is where the actual problem lives. Six players finished one battle and left,
so the work is at the _end of session one_, not deeper in the game.

1. **A concrete, named tomorrow.** The last thing a player sees after their first
   battle should state what is waiting and when: "Daily Quest resets in 6h",
   "your Egg is 3 battles from hatching". Right now the reward is real but invisible
   at the moment of leaving. Cheap: the data is already in the store, and the
   `ENGAGE_THEME` carousel already knows how to render it.
2. **Make the push ask land after the payoff, not before it.** Worth checking the
   current placement against the funnel once analytics is on (below). An opt-in
   asked before the player has felt a win converts worse — and with P0 fixed, the
   opt-in is now the difference between a player we can reach and one we cannot.
3. ~~**Cut the 35% Nearby Battle forfeit rate.**~~ **Retracted 2026-07-30.** All 26
   forfeits are Training Bot matches — owner testing — and the single
   human-vs-human match completed. There is no player-facing forfeit signal to act
   on, and building against this number would have been building against the
   owner's own dev sessions. The instrumentation to make a real signal possible
   (`forfeited_at`, `forfeited_by`) has shipped; revisit when human matches exist.

   What the 73-to-1 split _does_ say is more useful: **Nearby Battle's problem is
   not completion, it is that two humans almost never reach it.** That is the same
   day-two/invitation problem as everything else here, not a separate one.

   The 2 matches stuck `active` since Jul 9 remain worth a timeout, independent of
   any of this.

4. **Ask for the referral at the win, not on a settings page.** `referrals` is 0
   and the reward logic (`rollReferralReward`) already exists and is unused. The
   `/refer` route is reachable only if you go looking for it. With six players,
   invitation is the only growth channel there is.

---

## P2 — depth, explicitly deprioritised

Bag capacity, the ranking window, chat notifications, the type filter, the discard
slider — everything shipped in #247 and #248 — is **mid-game depth for players who
do not yet exist**. Zero friends means the friend prompt has nothing to prompt
about; zero mega runs means the raid leaderboard has no audience. None of it is
wasted, but none of it can move day-2 retention, and it should not be extended
until the P0/P1 items are done.

The same goes for new systems (trading, guilds, seasons, tournaments). They are
the right things to build at 500 players and the wrong things to build at 8.

---

## Instrumentation gaps found while measuring

These matter because without them the plan above cannot be evaluated.

1. **Vercel Web Analytics appears not to be enabled.** `<Analytics />` is mounted
   in `__root.tsx` and there are 17 `track()` call sites across a deliberately
   closed event list — but the Web Analytics API returns
   `404 Web Analytics not found` for the project, which means those events are
   being discarded. Needs a dashboard check; if it is off, turning it on is a
   toggle and immediately gives a real funnel (`onboard_complete` →
   `first_battle_complete` → `return_after_days`). **Everything in P1 is guesswork
   until this is on.**
2. ~~**`pvp_live_matches.match_source` is NULL on all 74 rows.**~~ **FIXED
   2026-07-30** (`20260730104214_match_source_and_forfeit_timing`). The column and
   its CHECK existed and `enqueue_pvp` did write it, but `start_live_pvp_match` and
   `start_bot_pvp_match` — which created all 74 rows — did not. Both now label
   their own path (`'qr'`, `'bot'`).

   The existing rows were backfilled rather than left as a permanent NULL gap,
   which is sound because `enqueue_pvp` has always written the column: no
   queue-created row can be NULL, so every NULL came from one of the two fixed
   functions, and `is_bot_match` separates those two (73 true / 1 false, agreeing
   exactly with a guest-id test against the Training Bot). Result: `bot=73, qr=1`,
   zero NULLs.

3. ~~**No forfeit reason or timestamp.**~~ **FIXED 2026-07-30**, same migration.
   `forfeited_at` and `forfeited_by` are now recorded. `forfeited_by` is the
   _actor_, not the loser — the presence watchdog claims a win by forfeit — so the
   pair distinguishes a rage-quit from an opponent who vanished. The 26 existing
   forfeits are deliberately **not** backfilled: `created_at` is the match start,
   not the forfeit, and inventing that number would quietly corrupt the first 26
   rows of any duration analysis.

   The same migration dropped a dead `forfeit_live_pvp_match(uuid)` overload. The
   client always sends `_concede`, so PostgREST resolved to the 2-arg version and
   the 1-arg one was unreachable — but it predates the concede split and always
   credits the win to the _caller_, so the first caller to omit `_concede` would
   have silently turned "I give up" into "I claim the win", with no compile or
   runtime error.

4. **`rewards-grant` is deployed, ACTIVE, and has no caller anywhere in the repo**
   (carried over from `docs/REPO_MAP.md`). Either it is dead and should go, or
   something is meant to call it and does not.

---

## Order of work

1. Fix `VAPID_SUBJECT`; confirm a 200 from `send-push` and a real notification on a
   device. _(config, minutes)_
2. Enable Web Analytics if it is off. _(toggle, minutes)_
3. Schedule a Mega event. _(data, minutes)_
4. Write `match_source`; add forfeit timing. _(small)_
5. End-of-first-session "here's your tomorrow". _(small-medium)_
6. Referral ask at the win moment. _(small-medium)_
7. Diagnose and reduce the forfeit rate. _(needs 4 first)_

Steps 1–3 are configuration, not engineering, and between them they restore the
two comeback mechanisms the app already has and cannot currently use.
