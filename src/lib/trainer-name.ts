// Shared trainer-name validation + error-message mapping for the claim flow.
// Matches the server-side `claim_trainer_name` RPC validation exactly.

export const TRAINER_NAME_MIN = 3;
export const TRAINER_NAME_MAX = 16;
export const TRAINER_NAME_REGEX = /^[A-Za-z0-9 _-]+$/;

export type ClaimErrorCode = "length" | "chars" | "taken" | "no_session" | "no_profile" | "network";

export function validateTrainerName(
  raw: string,
): { ok: true; name: string } | { ok: false; error: "length" | "chars" } {
  const name = raw.trim();
  if (name.length < TRAINER_NAME_MIN || name.length > TRAINER_NAME_MAX) {
    return { ok: false, error: "length" };
  }
  if (!TRAINER_NAME_REGEX.test(name)) {
    return { ok: false, error: "chars" };
  }
  return { ok: true, name };
}

// Kid-friendly random trainer name for guest sessions (feedback 96098111):
// an adjective + trainer-y noun + 1–2 digits, always within the 3–16 char
// length rule and the allowed character set above.
const GUEST_NAME_ADJECTIVES = [
  "Brave", "Swift", "Lucky", "Mighty", "Clever", "Sunny", "Bold", "Cosmic",
  "Turbo", "Epic", "Wild", "Royal", "Zippy", "Cool", "Ace",
];
const GUEST_NAME_NOUNS = [
  "Trainer", "Champ", "Rival", "Rookie", "Master", "Hero", "Star", "Ranger",
  "Ace", "Scout", "Buddy", "Pal",
];

export function randomGuestName(rng: () => number = Math.random): string {
  const adj = GUEST_NAME_ADJECTIVES[Math.floor(rng() * GUEST_NAME_ADJECTIVES.length)];
  const noun = GUEST_NAME_NOUNS[Math.floor(rng() * GUEST_NAME_NOUNS.length)];
  const num = Math.floor(rng() * 90) + 10; // 10–99
  return `${adj}${noun}${num}`.slice(0, TRAINER_NAME_MAX);
}

export function claimErrorMessage(error: string): string {
  switch (error as ClaimErrorCode) {
    case "taken":
      return "That name's already taken — pick another";
    case "length":
      return `${TRAINER_NAME_MIN}–${TRAINER_NAME_MAX} characters`;
    case "chars":
      return "Letters, numbers, spaces, _ and - only";
    case "no_profile":
    case "no_session":
    case "network":
    default:
      return "Couldn't reserve that name, please try again";
  }
}
