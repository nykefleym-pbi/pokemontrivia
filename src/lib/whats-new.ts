// "What's New" announcement shown as the FIRST card in the battle-hub
// carousel, once per release. To announce a release: bump `version` (any
// higher number), set `release` to the new label, and rewrite the bullets.
// Keep the copy simple enough for kids — short sentences, no jargon.
//
// The card has no plain-text heading: the "WHAT'S NEW" pill above the bullets
// is the heading, so a `title` here would only repeat it. Keep the list short
// too — every card in the carousel grows to match the tallest one.
export const WHATS_NEW = {
  version: 2,
  /** Shown in the card's bottom chip, in place of the old "UPDATE n". */
  release: "v2.0 (July 2026)",
  bullets: [
    "Battle real trainers — tap Battle in the Arena to find one.",
    "Scan a friend's Battle Code to play them right next to you.",
    "Every battle changes your rating. Climb the rankings!",
    "Trophies pay out now — claim coins and XP for the ones you earned.",
    "Play days in a row for bigger Daily Quest rewards.",
    "Questions now follow how well you play, not just your level.",
    "Turn on reminders and hear the moment your Egg is ready.",
  ],
} as const;
