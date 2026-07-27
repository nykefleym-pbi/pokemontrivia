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
  /** Tapping anywhere skips ahead. Used by the pre-battle beat so a rematch
   *  chain is never slowed down by ceremony. */
  onSkip?: () => void;
}

function TrainerSide({
  trainer,
  half,
  dim,
}: {
  trainer: VersusTrainer | null;
  half: "top" | "bottom";
  dim: boolean;
}) {
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
        <motion.img
          key={trainer.avatarUrl ?? trainer.spriteId}
          initial={{ opacity: 0, y: half === "top" ? -16 : 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          src={trainer.avatarUrl ?? trainerSpriteUrl(trainer.spriteId)}
          alt={trainer.name}
          // Inset from the outer edges rather than filling the half: the name
          // block and the action buttons live there, and an avatar behind a
          // button reads as a layout bug.
          className={`sprite absolute left-1/2 h-[62%] max-h-[210px] -translate-x-1/2 object-contain drop-shadow-2xl ${
            half === "top" ? "top-[14%]" : "bottom-[20%]"
          }`}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.opacity = "0";
          }}
        />
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

      <TrainerSide trainer={opponent} half="top" dim={opponent === null} />

      {/* The divide */}
      <div className="relative z-10 h-0">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 bg-white/90" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white/90 bg-poke-dark/85">
            <span className="font-display-md text-white">VS</span>
          </div>
        </div>
      </div>

      <TrainerSide trainer={me} half="bottom" dim={false} />

      {/* Status sits just above the bar, as in GO. */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-[calc(100%+2.5rem)] px-6">
        <div className="font-display-md text-white drop-shadow">{status}</div>
        {detail && <div className="mt-1 text-xs text-white/70">{detail}</div>}
      </div>

      {/* Legibility scrims. The backdrop is the owner's artwork and the avatars
          are arbitrary sprites, so neither can be relied on for contrast. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-32 bg-gradient-to-b from-black/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-56 bg-gradient-to-t from-black/85 via-black/55 to-transparent" />

      {/* Opponent identity, upper area */}
      {opponent && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+1rem)] z-20 px-6">
          <TrainerLabel trainer={opponent} align="right" />
        </div>
      )}

      {/* Own identity + actions, lower area */}
      <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-20 px-6">
        <TrainerLabel trainer={me} align="left" />
        {actions && (
          <div className="mt-4 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}
