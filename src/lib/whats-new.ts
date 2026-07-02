// "What's New" announcement shown as the FIRST card in the battle-hub
// carousel, once per release. To announce a release: bump `version` (any
// higher number) and rewrite the bullets. Keep the copy simple enough for
// kids — short sentences, no jargon.
export const WHATS_NEW = {
  version: 1,
  title: "What's New!",
  bullets: [
    "Your partner now gets 1 of 3 special powers — try re-picking!",
    "Every screen has its own music now. Turn it up!",
    "You can make music and sounds louder or quieter in Settings.",
    "Winning battles at high levels is fairer now.",
  ],
} as const;
