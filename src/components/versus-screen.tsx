import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { rankForLevel, trainerSpriteUrl } from "@/lib/game-data";

/**
 * The moment before a battle: two trainers facing off across a VS bar.
 *
 * Pokémon GO's shape — one continuous scene split in half, your side lit and
 * theirs darkened until they resolve, the VS badge straddling the divide. It
 * covers three situations that used to look like nothing at all:
 *
 *   - Online: the wait itself. The top half stays empty while matchmaking runs.
 *   - Nearby / Training: the three-second beat before question one, which was
 *     previously a bare pokéball spinner.
 *
 * Purely presentational. It knows nothing about queues, matches or timers —
 * callers own all of that, which is what lets the same screen serve a 30-second
 * search and a 3-second countdown.
 */

export interface VersusTrainer {
  name: string;
  /** Trainer sprite id; resolved here so callers pass what the store holds. */
  spriteId: string;
  /**
   * Overrides the sprite outright when set — an animated GIF, or any artwork
   * that is not a trainer sprite. The Training Bot uses this; a human never
   * does. Falls back to `spriteId` when null.
   */
  avatarUrl?: string | null;
  level?: number | null;
  /** Elo. Shown as `ELO 1234` under the title when the trainer has one. */
  rating?: number | null;
  /**
   * This trainer's own half of the backdrop. Each side owns its own image, so
   * two players bring two different scenes to the same face-off. Falls back to
   * the screen-level `backdrop` when null. See public/versus/readme.txt.
   */
  backdrop?: string | null;
}

export interface VersusScreenProps {
  me: VersusTrainer;
  /** Null while matchmaking is still looking — the top half stays empty. */
  opponent: VersusTrainer | null;
  /** "Finding an opponent…", "Battle starting…" — the line above the VS bar. */
  status: string;
  /** Optional second line — the elapsed timer while a search runs. */
  detail?: string;
  /** Cancel / fallback buttons, pinned above the safe area. */
  actions?: ReactNode;
  /**
   * Fallback backdrop for a half whose trainer has none of their own. Falls
   * back again to a themed gradient when unset, which is what ships until the
   * artwork lands (see VERSUS_BACKDROP).
   */
  backdrop?: string | null;
  /**
   * Whether the trainers animate in. False when this face-off is CONTINUING
   * one already on screen — across a route change, say — where replaying the
   * fade-and-slide reads as the sprites refreshing rather than as the same
   * picture holding still.
   */
  entrance?: boolean;
  /** Tapping anywhere skips ahead. Used by the pre-battle beat so a rematch
   *  chain is never slowed down by ceremony. */
  onSkip?: () => void;
}

function TrainerSide({
  trainer,
  half,
  dim,
  entrance,
}: {
  trainer: VersusTrainer | null;
  half: "top" | "bottom";
  dim: boolean;
  entrance: boolean;
}) {
  // An unknown sprite id resolves to "" — rendering that draws a broken image
  // whose onError then hides it, which is how a face-off ended up with an empty
  // half. Resolve first and render nothing rather than something broken.
  const src = trainer ? (trainer.avatarUrl ?? trainerSpriteUrl(trainer.spriteId) ?? "") : "";
  // Mirrored halves: the opponent reads text-then-sprite, the player
  // sprite-then-text, so the two sprites sit on opposite sides of the VS bar
  // and neither label is ever behind the other half's artwork.
  const textFirst = half === "top";
  return (
    <div className="relative flex-1 overflow-hidden">
      {/* Darkening scrim. The opponent's half stays heavy until they exist, so
          an empty top reads as "nobody yet" rather than as a missing image. */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${
          dim ? "bg-black/65" : "bg-black/25"
        }`}
      />
      {trainer && (
        <>
          {/* The opponent's sprite is positioned on its own rather than in a row
              with the label: sharing a row pinned it to the label's height,
              which on a backdrop whose ground is at the BOTTOM of the half left
              the trainer hanging in the sky. It stands on the seam now, centred,
              where every backdrop has land. The player's half already reads that
              way — its row sits low — so only the top needed splitting. */}
          {textFirst && src !== "" && (
            <motion.img
              key={src}
              initial={entrance ? { opacity: 0, y: -16 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: entrance ? 0.35 : 0 }}
              src={src}
              alt={trainer.name}
              // Standing back from the edge, not on it. `bottom-0` put the
              // feet on the divide, which the status line — pinned 2.5rem
              // above the seam and about 1.8rem tall — cut straight across.
              // 5rem clears the top of that text by roughly 10px, and both
              // are absolute units, so the gap does not close on a short
              // screen the way a percentage would.
              className="sprite absolute bottom-20 left-1/2 h-[34vh] max-h-[210px] w-1/2 -translate-x-1/2 object-contain object-bottom drop-shadow-2xl"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.opacity = "0";
              }}
            />
          )}
          <div
            className={`absolute inset-x-0 flex items-center gap-3 px-6 ${
              textFirst ? "top-[12%] flex-row" : "bottom-[16%] flex-row-reverse"
            }`}
          >
            <div className={`min-w-0 flex-1 ${textFirst ? "text-left" : "text-right"}`}>
              <TrainerLabel trainer={trainer} align={textFirst ? "left" : "right"} />
            </div>
            {!textFirst && src !== "" && (
              <motion.img
                // `entrance={false}` for a face-off that is CONTINUING one already
                // on screen — re-running the fade-and-slide there reads as the
                // sprites refreshing rather than as the same picture holding.
                key={src}
                initial={entrance ? { opacity: 0, y: 16 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: entrance ? 0.35 : 0 }}
                src={src}
                alt={trainer.name}
                className="sprite h-[34vh] max-h-[210px] w-1/2 shrink-0 object-contain drop-shadow-2xl"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.opacity = "0";
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/** Name, then title, then rating — three stacked lines, largest first. The
 *  friend code that used to sit here is gone: this screen is shown to a
 *  stranger, and a friend code is an invite. */
function TrainerLabel({ trainer, align }: { trainer: VersusTrainer; align: "left" | "right" }) {
  const rank = trainer.level != null ? rankForLevel(trainer.level) : null;
  return (
    <div className={align === "left" ? "text-left" : "text-right"}>
      <div className="truncate font-display-md text-white drop-shadow">{trainer.name}</div>
      {rank && (
        <div className="mt-0.5 font-pixel-xs uppercase tracking-widest text-white/70">{rank}</div>
      )}
      {trainer.rating != null && (
        <div className="mt-1 font-pixel-xs tracking-wider text-poke-yellow">
          ELO {trainer.rating.toLocaleString()}
        </div>
      )}
    </div>
  );
}

export function VersusScreen({
  me,
  opponent,
  status,
  detail,
  actions,
  backdrop,
  entrance = true,
  onSkip,
}: VersusScreenProps) {
  // A trainer's own backdrop wins; the screen-level one is the shared fallback.
  const topBackdrop = opponent?.backdrop ?? backdrop ?? null;
  const bottomBackdrop = me.backdrop ?? backdrop ?? null;
  return (
    <div
      className="fixed inset-0 z-[150] flex flex-col overflow-hidden bg-poke-dark"
      onClick={onSkip}
      role={onSkip ? "button" : undefined}
      tabIndex={onSkip ? 0 : undefined}
      onKeyDown={onSkip ? (e) => (e.key === "Enter" || e.key === " ") && onSkip() : undefined}
    >
      {/* Backdrop: two independent halves, each owned by the trainer standing
          in it. They are separate images rather than one scene split in two, so
          two players bring two different backgrounds to the same face-off. Each
          is centred in its own half; there is no horizon to keep continuous. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,oklch(0.35_0.08_260)_0%,oklch(0.18_0.04_260)_60%,oklch(0.12_0.03_260)_100%)]" />
      {topBackdrop && (
        <img
          src={topBackdrop}
          alt=""
          className="absolute inset-x-0 top-0 h-1/2 w-full object-cover object-center"
        />
      )}
      {bottomBackdrop && (
        <img
          src={bottomBackdrop}
          alt=""
          className="absolute inset-x-0 bottom-0 h-1/2 w-full object-cover object-center"
        />
      )}

      <TrainerSide
        trainer={opponent}
        half="top"
        dim={opponent === null}
        entrance={entrance}
      />

      {/* The divide */}
      <div className="relative z-10 h-0">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white/90" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white/90 bg-poke-dark/85">
            <span className="font-display-md text-white">VS</span>
          </div>
        </div>
      </div>

      <TrainerSide trainer={me} half="bottom" dim={false} entrance={entrance} />

      {/* Status sits just above the bar, as in GO. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-[calc(100%+2.5rem)] px-6 text-center">
        <div className="font-display-md text-white drop-shadow">{status}</div>
        {detail && <div className="mt-1 text-xs text-white/70">{detail}</div>}
      </div>

      {/* Legibility scrims. The backdrop is the owner's artwork and the avatars
          are arbitrary sprites, so neither can be relied on for contrast. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-56 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />

      {/* Actions. The labels now live inside their own halves, so this is only
          ever buttons — pinned above the safe area. */}
      {actions && (
        <div
          className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-20 flex flex-col gap-2 px-6"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      )}
    </div>
  );
}
