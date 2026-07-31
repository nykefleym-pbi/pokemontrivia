import type { VersusTrainer } from "@/components/versus-screen";
import { TRAINING_BOT_AVATAR, VERSUS_BACKDROP } from "@/lib/app-icons";

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
 * Its backdrop is the shared default, Forest. It briefly rolled a random one
 * per match; that needed module state to stay stable across the handover, and
 * a fixed world is both simpler and what the owner asked for.
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
    backdrop: VERSUS_BACKDROP,
    level: level ?? null,
  };
}
