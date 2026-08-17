import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { AppIcon } from "@/components/app-icon";
import { ConfettiRain } from "@/components/confetti-rain";
import { PokemonSprite } from "@/components/game-ui";
import { TypeChip } from "@/components/type-chip";
import { Button } from "@/components/ui/button";
import { REWARD_ICON, UI_ICON } from "@/lib/app-icons";
import { findPokemon } from "@/lib/pokemon-data";

/**
 * One reward on the catch screen: art over a tinted card, then what it is.
 *
 * The tint is passed as a raw colour and mixed here rather than taken as a
 * class, because the three tiles differ ONLY by hue — spelling out three
 * near-identical class strings at the call site is how they drift apart.
 */
function RewardTile({
  tint,
  icon,
  title,
  caption,
  check,
}: {
  tint: string;
  icon: ReactNode;
  title: ReactNode;
  /** Omitted on the Pokédex tile, which carries no category. */
  caption?: string;
  /** The reference puts a green tick on the Pokédex tile — the one reward that
   *  is a state change rather than a quantity. */
  check?: boolean;
}) {
  return (
    <div
      className="relative flex min-w-0 flex-col items-center justify-start gap-1 rounded-xl border-2 px-1 py-2 text-center"
      style={{
        background: `color-mix(in oklab, ${tint} 14%, #fff)`,
        borderColor: `color-mix(in oklab, ${tint} 40%, #fff)`,
      }}
    >
      {check && (
        <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-hp-good ring-2 ring-white">
          <Check className="h-3 w-3 text-white" strokeWidth={4} />
        </span>
      )}
      {icon}
      {/* Two lines maximum, then it clips. A tile is a fixed third of the row,
          so an item with a long name must not be allowed to make its column
          taller than the other two. */}
      <span className="line-clamp-2 text-[11px] font-extrabold leading-tight text-poke-dark">
        {title}
      </span>
      {/* The caption is a PILL, as in the reference — bare text at this size
          reads as a stray label rather than as the tile's category. */}
      {caption && (
        <span
          className="rounded-full px-1.5 py-0.5 font-pixel text-[7px] uppercase leading-none"
          style={{ background: `color-mix(in oklab, ${tint} 26%, #fff)`, color: tint }}
        >
          {caption}
        </span>
      )}
    </div>
  );
}

export interface CaughtScreenProps {
  /** The species actually registered — the guess in modes that name one. */
  id: number;
  name: string;
  isShiny: boolean;
  /** XP as the SERVER granted it, not a client constant. */
  awardedXp: number;
  rewardName: string;
  rewardIcon: string;
  onCollect: () => void;
}

/**
 * The Who's That Pokémon catch screen.
 *
 * Follows the owner's reference for the name treatment, the dex number, the
 * type chips and the three reward tiles, and deliberately drops the rest of it
 * — Pokédex progress, the NEW rosette, the fun fact, rarity stars and the
 * weakness row. Every one of those is a second screen's worth of information
 * competing with the one thing this screen exists to say.
 *
 * A component rather than JSX inside the route because the route can only reach
 * this state through a live server round: extracted, the screen can be rendered
 * directly to be looked at, which is how the layout was actually checked.
 *
 * No scrolling by design. The column is a fixed stack with ONE elastic band —
 * the sprite — so a long name or a long item name eats into the artwork rather
 * than pushing the Collect button off the bottom.
 */
export function WhosThatCaught({
  id,
  name,
  isShiny,
  awardedXp,
  rewardName,
  rewardIcon,
  onCollect,
}: CaughtScreenProps) {
  const species = findPokemon(id);
  return (
    <div className="screen-x screen-top screen-bottom relative flex h-full w-full flex-col items-center gap-2 overflow-hidden bg-poke-cream">
      {/* Confetti over the whole screen. It is ABOVE the artwork on purpose —
          tucked behind, it would be hidden by the light burst across the middle
          third, which is most of the screen. It stays under the Collect button
          so the one tap target never has something crossing it, and it is
          `pointer-events-none` throughout. */}
      <ConfettiRain className="z-20" />

      {/* Header ribbon, sized by HEIGHT so a long name below it can never
          change the art's shape. */}
      <img
        src={encodeURI(UI_ICON.youCaught)}
        alt="You caught a"
        draggable={false}
        className="h-[44px] w-auto shrink-0 select-none object-contain"
      />

      {/* The name carries its dark outline through eight text-shadows rather
          than `-webkit-text-stroke`, which draws INSIDE the glyph and thins a
          heavy weight until it reads as a lighter font. */}
      <h1
        className="shrink-0 text-center font-display-xl uppercase leading-none text-white"
        style={{
          textShadow:
            "2px 0 0 #1b1d2b, -2px 0 0 #1b1d2b, 0 2px 0 #1b1d2b, 0 -2px 0 #1b1d2b, 1.5px 1.5px 0 #1b1d2b, -1.5px 1.5px 0 #1b1d2b, 1.5px -1.5px 0 #1b1d2b, -1.5px -1.5px 0 #1b1d2b, 0 4px 0 rgba(27,29,43,0.35)",
        }}
      >
        {name}
      </h1>
      <span className="shrink-0 rounded-full bg-poke-dark px-3 py-0.5 font-pixel text-[10px] tabular-nums text-white">
        #{String(id).padStart(3, "0")}
      </span>

      {/* Sprite over the light burst — the owner's art, replacing the
          conic-gradient sunburst that used to sit here. The burst is absolutely
          positioned and oversized so it can spill past the sprite without
          adding any height of its own. */}
      {/* Grows into spare height, but only up to `max-h`. Uncapped it swallowed
          every pixel on a tall phone and — since both the sprite and the burst
          are sized off this band — inflated the burst until it filled the
          screen and washed out the name and the type chips. Capped, a tall
          phone gets a bigger sprite and a short one still shrinks to fit. */}
      <div className="relative flex max-h-[18rem] min-h-0 flex-[1_1_11.5rem] items-center justify-center">
        {/* The burst is CLIPPED to this band so it stops reaching the dex
            number above and the type chips below — the thing the owner
            reported.
            The mask is RADIAL, not a vertical ramp. A vertical-only fade still
            leaves the left and right edges cut square, and the result reads as
            a yellow rectangle of light rather than as a glow; `ellipse` follows
            the band's own proportions, so the falloff stays even on a tall
            phone and a short one alike. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden"
          style={{
            maskImage: "radial-gradient(ellipse 50% 50% at 50% 50%, #000 55%, transparent 100%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 50% 50% at 50% 50%, #000 55%, transparent 100%)",
          }}
        >
          <img
            src={encodeURI(UI_ICON.lightBurst)}
            alt=""
            draggable={false}
            className="absolute left-1/2 top-1/2 h-[130%] w-auto max-w-none -translate-x-1/2 -translate-y-1/2 select-none"
          />
        </div>
        {isShiny && (
          <div className="absolute -top-1 z-20 rounded-full bg-poke-yellow px-3 py-1 font-pixel text-[10px] text-poke-dark shadow-card">
            SHINY!
          </div>
        )}
        <PokemonSprite
          id={id}
          shiny={isShiny}
          alt={name}
          className={`relative z-10 h-full w-auto [image-rendering:pixelated] ${
            isShiny ? "drop-shadow-[0_0_14px_rgba(245,197,24,0.85)]" : ""
          }`}
        />
      </div>

      {species && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-1.5">
          {species.types.map((t) => (
            <TypeChip key={t} type={t} selected size="sm" />
          ))}
        </div>
      )}

      {/* The reference's rewards panel: a titled container holding the three
          tiles, rather than three loose cards. The header is what makes them
          read as one payout instead of three unrelated chips. Tiles carry this
          game's real XP art, the round's actual item sprite and the Pokédex
          book. */}
      <div className="w-full shrink-0 rounded-2xl border-2 border-poke-dark/10 bg-white/75 px-2 pb-2 pt-1.5 shadow-card">
        <div className="mb-1.5 text-center font-pixel text-[8px] uppercase tracking-[0.2em] text-poke-dark/40">
          Rewards
        </div>
        <div className="grid grid-cols-3 gap-2">
          <RewardTile
            tint="var(--color-poke-blue)"
            icon={<AppIcon src={REWARD_ICON.xp} className="h-9 w-9" />}
            title={`+${awardedXp}`}
            caption="XP"
          />
          <RewardTile
            tint="var(--color-primary)"
            icon={
              <img
                src={rewardIcon}
                alt={rewardName}
                className="h-9 w-9 [image-rendering:pixelated]"
              />
            }
            title={rewardName}
            caption="ITEM"
          />
          {/* No caption pill on this tile (owner ruling: the NEW ENTRY /
              REGISTERED label is gone). Without it the tile is a line shorter
              than its neighbours, so the title is set on two deliberate lines
              instead of wrapping wherever the width happens to break. */}
          <RewardTile
            tint="var(--color-hp-good)"
            icon={<AppIcon src={UI_ICON.pokedexBook} className="h-9 w-9" />}
            title={
              <>
                Added to
                <br />
                Pokédex
              </>
            }
            check
          />
        </div>
      </div>

      {/* The existing Collect button, kept as-is per the owner and given the
          white rim every other red button in the app carries. */}
      <Button
        size="action"
        onClick={onCollect}
        className="relative z-30 mt-auto w-full shrink-0 border-2 border-white bg-primary font-pixel text-sm tracking-wide text-primary-foreground shadow-card"
      >
        COLLECT
      </Button>
    </div>
  );
}
