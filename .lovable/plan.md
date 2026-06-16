# Plan: Grayscale Played Daily/Weekly Buttons

## Summary
Add `grayscale` CSS filter to the Daily Quest and Weekly League buttons once they have already been played, giving users an immediate visual cue that those modes are no longer available today/this week. The buttons automatically return to full color after their respective reset.

## Behavior

- **Daily Quest**: Uses the existing `dailyDone` flag (`dailyResult?.date === today`). The `grayscale` class is applied only while `dailyDone` is true. After midnight local time when the daily refreshes, `dailyDone` becomes false and the button automatically regains its full yellow gradient color.
- **Weekly League**: Uses the existing `weeklyFinished` flag (`weeklyLeague?.status === "won" || weeklyLeague?.status === "lost"`). The `grayscale` class is applied only while `weeklyFinished` is true. When the weekly league resets on Monday 00:00 UTC, `weeklyFinished` becomes false and the button automatically regains its full blue gradient color.

## Changes

### `src/routes/battle.tsx`
- **Daily Quest button** (line ~424): Add `${dailyDone ? "grayscale" : ""}` to the `className` so the entire button turns grayscale when the daily is completed. The button already has `disabled:opacity-80`; grayscale layers on top.
- **Weekly League button** (line ~445): Add `${weeklyFinished ? "grayscale" : ""}` to the `className` so the entire button turns grayscale when the weekly is won or lost. The button already has `disabled:opacity-80`; grayscale layers on top.

No other UI or logic changes are needed — the existing reset logic in the store handles returning buttons to full color.