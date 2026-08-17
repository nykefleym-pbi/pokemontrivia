import { PokemonSprite } from "@/components/game-ui";
import { TypeChip } from "@/components/type-chip";
import { UI_ICON } from "@/lib/app-icons";
import { findPokemon } from "@/lib/pokemon-data";
import { PokeballIcon } from "@/components/profile-parts";
import { RESULT_ART } from "@/lib/result-art";

/** Rendered width of the "It fled!" square, and the fraction of it that is
 *  actually drawn on (1 - top - bottom padding). */
const FLED_ART_W = 260;
const FLED_ART_VISIBLE = 1 - RESULT_ART.itFled.top - RESULT_ART.itFled.bottom;

/**
 * The Who's That Pokémon timeout screen — the one you get when the clock runs
 * out and the species gets away.
 *
 * Built to the owner's reference, with two deliberate omissions: there is no
 * TIP block (owner ruling — it was a hint for a round that is already over),
 * and the Close button is untouched, so it is passed in rather than rebuilt
 * here.
 *
 * Extracted from the route for the same reason `WhosThatCaught` was: the route
 * can only reach this state through a live server round that has to time out,
 * so a component is the only way the layout can be rendered and looked at.
 */
export interface FledScreenProps {
  id: number;
  name: string;
  /** The Pokédex flavour text. `null` while it is still being fetched. */
  flavor: string | null;
  /** True once the fetch has settled, whatever the outcome. */
  flavorSettled: boolean;
  /** Formatted countdown to the next playable hour, e.g. "00:15:11". */
  countdown: string;
  /**
   * How the round was lost. Both paths land on this same screen, so the line
   * above the countdown has to say which one happened: telling a player who
   * answered that they ran out of time is simply wrong, and it was.
   */
  reason: "timeout" | "wrong";
  onClose: () => void;
}

export function WhosThatFled({
  id,
  name,
  flavor,
  flavorSettled,
  countdown,
  reason,
  onClose,
}: FledScreenProps) {
  const species = findPokemon(id);

  return (
    <div className="screen-x screen-top screen-bottom flex h-full w-full flex-col items-center overflow-y-auto bg-poke-cream text-center">
      {/* ----- The escape ----- */}
      {/* The sprite sits LEFT of centre and the dash art trails to its right,
          because the art is drawn that way: speed lines on the left, dust puff
          on the right. Centred behind the sprite it would read as an explosion
          rather than as something running off. */}
      <div className="relative flex h-44 w-full shrink-0 items-center justify-center">
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-[85%] -translate-y-1/2 rounded-full blur-xl"
          style={{ background: "radial-gradient(circle, rgba(245,214,78,0.6) 0%, transparent 70%)" }}
        />
        <img
          src={encodeURI(UI_ICON.dash)}
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-auto max-w-none -translate-x-[18%] -translate-y-1/2 select-none"
        />
        <PokemonSprite
          id={id}
          alt={name}
          className="relative z-10 h-32 w-32 -translate-x-[70%] [image-rendering:pixelated]"
        />
      </div>

      {/* The wordmark, trimmed to its VISIBLE height.
          Untrimmed this file is a 512-square holding one short line of
          lettering, so it would reserve roughly six times the height it draws.
          The crop is done with an absolutely-positioned image inside a
          fixed-height window rather than the padding-top/negative-margin trick:
          that pair positions the image from the CONTENT edge, which sits below
          the padding that created the height, so the window lands a full band
          off and shows empty space instead of the letters. Absolute
          positioning has no such ambiguity — `top` is measured from the window
          itself. */}
      <div
        className="relative shrink-0 overflow-hidden"
        style={{ width: FLED_ART_W, height: FLED_ART_W * FLED_ART_VISIBLE }}
      >
        <img
          src={encodeURI(UI_ICON.itFled)}
          alt="It fled!"
          draggable={false}
          className="absolute left-0 max-w-none select-none"
          style={{ width: FLED_ART_W, top: -FLED_ART_W * RESULT_ART.itFled.top }}
        />
      </div>

      <p className="mt-3 shrink-0 text-lg leading-snug text-poke-dark">
        {reason === "timeout" ? (
          <>
            You <span className="font-extrabold text-primary">weren&rsquo;t able to guess</span> it
            in time.
          </>
        ) : (
          <>
            That <span className="font-extrabold text-primary">wasn&rsquo;t the right guess</span>.
          </>
        )}
        <br />
        <span className="font-extrabold text-primary">{name}</span> escaped!
      </p>

      {/* ----- The countdown ----- */}
      {/* A dark console rather than the two lines of muted text this used to
          be: the wait is the screen's one actionable fact — when you may play
          again — and it was previously the quietest thing on it. The digits are
          `tabular-nums` so the seconds tick without the row reflowing. */}
      <div className="mt-4 w-full shrink-0 rounded-2xl border-2 border-poke-dark/80 bg-poke-dark p-3 shadow-card">
        <div className="font-pixel text-[9px] uppercase tracking-[0.25em] text-white/55">
          Play again in
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-3">
          <PokeballIcon className="h-6 w-6 shrink-0 text-white/25" />
          <span className="font-pixel text-2xl tabular-nums text-primary [text-shadow:0_0_14px_rgba(226,59,46,0.55)]">
            {countdown}
          </span>
          <PokeballIcon className="h-6 w-6 shrink-0 text-white/25" />
        </div>
      </div>

      {/* ----- Who it was ----- */}
      <div className="mt-4 w-full shrink-0 rounded-2xl border-2 border-poke-dark/10 bg-white p-3 text-left shadow-card">
        <div className="-mt-1 mb-2 inline-block rounded-md bg-primary px-2.5 py-1 font-pixel text-[9px] uppercase tracking-wider text-white">
          About {name}
        </div>
        <div className="flex gap-3">
          <div className="flex shrink-0 flex-col gap-1.5">
            {species?.types.map((t) => <TypeChip key={t} type={t} selected size="sm" icon />)}
          </div>
          <div className="min-w-0 flex-1 border-l-2 border-poke-dark/10 pl-3">
            {/* Three states, said apart. The old screen rendered nothing while
                loading AND nothing on failure, which is indistinguishable from
                a species that simply has no entry. */}
            {!flavorSettled ? (
              <p className="text-sm italic text-poke-dark/40">Reading the Pokédex…</p>
            ) : flavor ? (
              <p className="text-sm leading-snug text-poke-dark/80">{flavor}</p>
            ) : (
              <p className="text-sm italic text-poke-dark/40">No Pokédex entry available.</p>
            )}
          </div>
        </div>
      </div>

      {/* The existing Close button, unchanged per the owner. */}
      <div className="flex-1" />
      <button
        onClick={onClose}
        className="mt-4 w-full shrink-0 rounded-full border-2 border-poke-dark/15 bg-white py-3.5 font-pixel text-sm tracking-wide text-poke-dark shadow-card press-lg"
      >
        CLOSE
      </button>
    </div>
  );
}
