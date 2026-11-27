// "What's New" (Figma 14.6): one of the pop-ups in the Home queue (2.2), shown
// once per release, never in a battle. To announce a release: bump `version`,
// set `release`, and rewrite the items. Keep the copy simple enough for kids;
// five lines fit the sheet above its button.
export const WHATS_NEW = {
  version: 3,
  release: "v3.0 (November 2026)",
  /** Each line: a Figma icon name (NaIcon) and the text, its label in capitals first. */
  items: [
    ["arena", "TRAINER BATTLES: Find real players in the Arena and put your skills to the test!"],
    ["qr", "FRIEND BATTLES: Scan a friend's Battle Code and battle side by side!"],
    ["trophy", "TROPHY REWARDS: Claim coins and XP for the trophies you've earned!"],
    ["bell", "EGG REMINDERS: Get notified the moment your Egg is ready to hatch!"],
    ["sparkle", "FRESH NEW LOOK: Enjoy a revamped interface with cleaner screens, smoother navigation, and a better battle experience!"],
  ],
} as const;
