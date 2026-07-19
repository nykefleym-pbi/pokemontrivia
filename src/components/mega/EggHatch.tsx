import { useState } from "react";
import { PokemonSprite } from "@/components/game-ui";
import { PixelEgg } from "@/components/pixel-icons";
import { useGameStore } from "@/lib/store";
import { findPokemon } from "@/lib/pokemon-data";
import { ALL_LEGENDARY_MYTHICAL_IDS } from "@/lib/legendary-data";

const SHINY_CHANCE = 0.1;

/**
 * Poké Egg shelf + hatch flow. Eggs are earned from Mega Raid champion wins,
 * every-10th level-up, and referrals; each egg fills its own progress bar as
 * you play different game modes (boosted by your day streak) and, once full,
 * hatches into a random Legendary or Mythical Pokémon — the only way to
 * obtain one. Mount anywhere.
 */
export function EggHatch() {
  const eggs = useGameStore((s) => s.pokeEggs);
  const [open, setOpen] = useState(false);
  const [hatchingId, setHatchingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ id: number; name: string; shiny: boolean } | null>(null);

  const close = () => {
    setOpen(false);
    setHatchingId(null);
    setResult(null);
  };

  const hatch = (eggId: string) => {
    const st = useGameStore.getState();
    if (!st.hatchPokeEgg(eggId)) return;
    const pokeId =
      ALL_LEGENDARY_MYTHICAL_IDS[Math.floor(Math.random() * ALL_LEGENDARY_MYTHICAL_IDS.length)];
    const p = findPokemon(pokeId);
    if (!p) return;
    const shiny = Math.random() < SHINY_CHANCE;
    setHatchingId(eggId);
    window.setTimeout(() => {
      st.recordPokedexCapture(p.id, shiny);
      st.grantItem("candy", 1);
      setResult({ id: p.id, name: p.name, shiny });
      setHatchingId(null);
    }, 1200);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-card shadow-card active:scale-95"
        aria-label="Poké Eggs"
      >
        <PixelEgg className="h-7 w-7" />
        {eggs.length > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-poke-dark px-1 text-[11px] font-extrabold text-white">
            {eggs.length}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-6"
          onClick={close}
        >
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-[330px] max-w-[92vw] overflow-hidden rounded-[28px] bg-card p-6 text-center shadow-card"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-muted"
            >
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                <path
                  d="M1 1l11 11M12 1L1 12"
                  className="stroke-muted-foreground"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="font-pixel text-[9px] tracking-wide text-brand-amber">POKÉ EGGS</div>

            {result ? (
              <div className="mt-4 flex flex-col items-center">
                <div
                  className={`font-pixel text-[9px] ${result.shiny ? "text-brand-amber" : "text-green-600 dark:text-green-400"}`}
                >
                  {result.shiny ? "✨ SHINY HATCH! ✨" : "IT HATCHED!"}
                </div>
                <div className="relative mt-2">
                  <div
                    className="absolute inset-0 -m-3 rounded-full"
                    style={{
                      background: "radial-gradient(circle, rgba(242,214,78,0.45), transparent 70%)",
                    }}
                  />
                  <PokemonSprite
                    id={result.id}
                    shiny={result.shiny}
                    alt={result.name}
                    className="relative h-[136px] w-[136px] object-contain"
                  />
                </div>
                <div className="mt-1 text-[22px] font-black text-foreground">{result.name}</div>
                <div className="mt-1 text-[13px] font-semibold text-muted-foreground">
                  Added to your Pokédex! You also got a 🍬 Rare Candy.
                </div>
                <button
                  onClick={() => setResult(null)}
                  className="mt-5 flex h-12 w-full items-center justify-center rounded-full text-[15px] font-extrabold"
                  style={{
                    background: "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
                    color: "var(--brand-ink)",
                    boxShadow: "0 3px 0 var(--brand-gold-shadow)",
                  }}
                >
                  Done
                </button>
              </div>
            ) : eggs.length === 0 ? (
              <div className="mt-4 flex flex-col items-center">
                <PixelEgg className="h-24 w-24" />
                <div className="mt-3 text-[15px] font-bold text-foreground">No eggs yet</div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  Win a Mega Raid, level up, or refer a friend to earn a Poké Egg. Each egg only
                  hatches a Legendary or Mythical Pokémon — the only way to get one.
                </div>
              </div>
            ) : (
              <div className="mt-4 flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
                {eggs.map((egg) => {
                  const ready = egg.progress >= egg.required;
                  const pct = Math.min(100, Math.round((egg.progress / egg.required) * 100));
                  return (
                    <div key={egg.id} className="rounded-2xl bg-muted/50 p-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="relative shrink-0"
                          style={
                            hatchingId === egg.id
                              ? { animation: "mega-egg-shake 0.4s ease-in-out infinite" }
                              : undefined
                          }
                        >
                          <PixelEgg className="h-12 w-12" />
                        </div>
                        <div className="min-w-0 flex-1 text-left">
                          <div className="h-2.5 overflow-hidden rounded-full bg-background">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${pct}%`,
                                background:
                                  "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
                              }}
                            />
                          </div>
                          <div className="mt-1 text-[11px] font-semibold text-muted-foreground">
                            {ready ? "Ready to hatch!" : `${egg.progress}/${egg.required} progress`}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => hatch(egg.id)}
                        disabled={!ready || hatchingId !== null}
                        className="mt-3 flex h-10 w-full items-center justify-center rounded-full text-[13px] font-extrabold disabled:opacity-50"
                        style={{
                          background: ready
                            ? "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))"
                            : "var(--muted)",
                          color: ready ? "var(--brand-ink)" : "var(--muted-foreground)",
                          boxShadow: ready ? "0 3px 0 var(--brand-gold-shadow)" : undefined,
                        }}
                      >
                        {hatchingId === egg.id ? "Hatching…" : "Hatch"}
                      </button>
                    </div>
                  );
                })}
                <div className="text-[11px] text-muted-foreground">
                  Play different modes to fill progress — a longer day streak boosts each one.
                </div>
              </div>
            )}
          </div>
          <style>{`@keyframes mega-egg-shake{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}`}</style>
        </div>
      )}
    </>
  );
}
