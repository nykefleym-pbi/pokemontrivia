import type { VersusTrainer } from "@/components/versus-screen";
import { TRAINING_BOT_AVATAR } from "@/lib/app-icons";
import { VERSUS_BACKDROPS, versusBackdropSrc } from "@/lib/versus-backdrops";

/**
 * Which backdrop the bot is standing on right now.
 *
 * The bot draws a random one rather than owning a fixed backdrop, so a run of
 * Training battles does not look like the same fight over and over. But it has
 * to be random ONCE PER MATCH, not once per render: three screens show the bot
 * in a row (the Arena's queue fallback, the match route's loading state, that
 * route's pre-battle beat) and re-rolling between them would put a different
 * world behind the same trainer mid-handover — exactly the flash this module
 * exists to prevent.
 *
 * So the roll is module state, taken when a Training match starts and held
 * until the next one. A cold load straight into a bot match (a reload, a shared
 * link) has no roll to read and falls back to the first backdrop, which is
 * still correct — by then the face-off has already played.
 */
let botBackdropId: string = VERSUS_BACKDROPS[0]!.id;

/** Rolls the bot's backdrop for the match about to start. Called once, by the
 *  Arena, before the fallback face-off goes up. */
export function rollTrainingBotBackdrop(): void {
  const pick = VERSUS_BACKDROPS[Math.floor(Math.random() * VERSUS_BACKDROPS.length)];
  if (pick) botBackdropId = pick.id;
}

/** The backdrop the bot is currently on — exported so the Arena can preload it. */
export function trainingBotBackdropSrc(): string {
  return versusBackdropSrc(botBackdropId);
}

/**
 * The Training Bot's side of a face-off — the ONE definition of it.
 *
 * Three screens show the bot in a row: the Arena's queue fallback, the match
 * route's loading state, then that route's pre-battle beat. The first two used
 * to build it independently and got it wrong in two different ways — the Arena
 * handed the bot the PLAYER's sprite, and the match route passed
 * `opponentProfile?.trainer_sprite || ""` for an opponent that has no profile
 * row at all, which resolved to nothing and drew a blank half. One hand-off,
 * two "Training Bot" screens, neither of them looking like the bot.
 *
 * All three go through here now, so they are the same picture and the route
 * change between them is invisible.
 *
 * Lives in lib/ rather than beside the component because exporting a non-
 * component from a component file breaks Fast Refresh (react-refresh/
 * only-export-components).
 *
 * `level` is the PLAYER's: the Training Bot is scaled to whoever it faces and
 * has no level of its own to report.
 */
export function trainingBotSide(level?: number | null): VersusTrainer {
  return {
    name: "Training Bot",
    // Only reached if the avatar 404s — deliberately neither the player's
    // sprite nor an empty string, each of which is a visible bug.
    spriteId: "engineer",
    avatarUrl: TRAINING_BOT_AVATAR,
    backdrop: trainingBotBackdropSrc(),
    level: level ?? null,
  };
}
