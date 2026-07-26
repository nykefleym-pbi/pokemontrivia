import { useNavigate } from "@tanstack/react-router";
import { ChevronRight, Flame } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { litGiftPips, GIFT_CYCLE_DAYS } from "@/lib/daily-gift";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON } from "@/lib/app-icons";

/**
 * The three things worth coming back for, on the screen a returning player
 * actually lands on.
 *
 * None of these were visible from Home before:
 *  - The 7-day gift streak, with a guaranteed shiny at day 7, lived only on the
 *    Shop tab — which a new player has no reason to open.
 *  - `arenaStats.currentWinStreak` was tracked on every battle and rendered
 *    nowhere; only the historical best was ever shown, which is the one number
 *    that cannot be lost and so the one that motivates nothing.
 *  - A hatchable Poké Egg — the only route to a Legendary — showed up solely as
 *    a small badge on the Pokédex tab.
 *
 * Each row appears only when it has something to say, so the strip is empty for
 * a brand-new trainer rather than being three rows of zeroes.
 */
export function HomeStreakStrip() {
  const navigate = useNavigate();
  const winStreak = useGameStore((s) => s.arenaStats.currentWinStreak);
  const lastClaim = useGameStore((s) => s.dailyGiftLastClaim);
  const giftStreak = useGameStore((s) => s.dailyGiftStreak);
  const freezeUsedDate = useGameStore((s) => s.dailyGiftFreezeUsedDate);
  const eggs = useGameStore((s) => s.pokeEggs);

  const today = new Date().toISOString().slice(0, 10);
  const lit = litGiftPips({ lastClaim, streak: giftStreak, freezeUsedDate, today });
  const giftReady = lastClaim !== today;
  const eggsReady = eggs.filter((e) => e.progress >= e.required).length;

  // A streak of one is just "you won"; two is the first time there is something
  // to lose, which is the whole point of showing it.
  const showStreak = winStreak >= 2;
  const showGift = giftReady || lit > 0;

  if (!showStreak && !showGift && eggsReady === 0) return null;

  return (
    <div className="space-y-2 px-5 pt-3">
      {showStreak && (
        <div className="flex items-center gap-2 rounded-2xl bg-card px-4 py-2.5 shadow-card">
          <Flame className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm font-bold text-foreground">
            {winStreak} wins in a row
          </span>
          <span className="ml-auto text-xs text-foreground/60">Don&rsquo;t break it</span>
        </div>
      )}

      {showGift && (
        <button
          onClick={() => void navigate({ to: "/shop" })}
          className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-2.5 text-left shadow-card"
        >
          <AppIcon src={UI_ICON.dailyGift} className="h-5 w-5 shrink-0" alt="" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {Array.from({ length: GIFT_CYCLE_DAYS }, (_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-full rounded-full ${
                    i < lit ? "bg-primary" : "bg-foreground/15"
                  }`}
                />
              ))}
            </div>
            <p className="mt-1 text-xs text-foreground/60">
              {giftReady
                ? lit >= GIFT_CYCLE_DAYS - 1
                  ? "Day 7 gift: guaranteed shiny"
                  : "Daily gift ready"
                : `Day ${lit} of ${GIFT_CYCLE_DAYS} — back tomorrow`}
            </p>
          </div>
          {giftReady && (
            <span className="shrink-0 rounded-full bg-primary px-2.5 py-1 font-pixel-xs text-primary-foreground">
              Open
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-foreground/40" />
        </button>
      )}

      {eggsReady > 0 && (
        <button
          onClick={() => void navigate({ to: "/pokedex" })}
          className="flex w-full items-center gap-3 rounded-2xl bg-card px-4 py-2.5 text-left shadow-card"
        >
          <AppIcon src={UI_ICON.pokeEgg} className="h-5 w-5 shrink-0" alt="" />
          <span className="text-sm font-bold text-foreground">
            {eggsReady === 1 ? "A Poké Egg is ready to hatch" : `${eggsReady} eggs ready to hatch`}
          </span>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-foreground/40" />
        </button>
      )}
    </div>
  );
}
