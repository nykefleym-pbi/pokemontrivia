import { useState } from "react";
import { PokemonSprite } from "@/components/game-ui";
import { useGameStore } from "@/lib/store";
import { ALL_POKEMON } from "@/lib/pokemon-data.generated";

const SHINY_CHANCE = 0.1;

/**
 * Poké Egg shelf + hatch flow. Eggs are earned from Mega Raid wins; hatching one
 * adds a random Pokémon to the Pokédex (with a shiny chance). Mount anywhere.
 */
export function EggHatch() {
  const eggs = useGameStore((s) => s.pokeEggs ?? 0);
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<"idle" | "hatching" | "done">("idle");
  const [result, setResult] = useState<{ id: number; name: string; shiny: boolean } | null>(null);

  const close = () => {
    setOpen(false);
    setPhase("idle");
    setResult(null);
  };

  const hatch = () => {
    const st = useGameStore.getState();
    if (!st.hatchPokeEgg()) return;
    const p = ALL_POKEMON[Math.floor(Math.random() * ALL_POKEMON.length)];
    const shiny = Math.random() < SHINY_CHANCE;
    setPhase("hatching");
    window.setTimeout(() => {
      st.recordPokedexCapture(p.id, shiny);
      setResult({ id: p.id, name: p.name, shiny });
      setPhase("done");
    }, 1200);
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl active:scale-95"
        style={{
          background: "linear-gradient(160deg, var(--brand-cream), #F1E2BE)",
          boxShadow: "0 3px 0 #E2D2A8",
        }}
        aria-label="Poké Eggs"
      >
        <span className="text-2xl">🥚</span>
        {eggs > 0 && (
          <span
            className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-extrabold text-white"
            style={{ background: "var(--brand-red)" }}
          >
            {eggs}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-6" onClick={close}>
          <div className="absolute inset-0" style={{ background: "rgba(8,9,14,0.72)" }} />
          <div
            className="relative w-[330px] max-w-[92vw] overflow-hidden rounded-[28px] p-6 text-center"
            style={{
              background: "var(--brand-cream)",
              boxShadow: "0 24px 60px -18px rgba(0,0,0,0.6)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={close}
              aria-label="Close"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,0.06)" }}
            >
              <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
                <path
                  d="M1 1l11 11M12 1L1 12"
                  stroke="var(--brand-slate)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
              </svg>
            </button>

            <div className="font-pixel" style={{ fontSize: 8, letterSpacing: 1, color: "#9A7320" }}>
              POKÉ EGGS
            </div>

            {phase === "done" && result ? (
              <div className="mt-4 flex flex-col items-center">
                <div
                  className="font-pixel"
                  style={{ fontSize: 8, color: result.shiny ? "var(--brand-amber)" : "#3F9D5A" }}
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
                <div className="mt-1 text-[22px] font-black" style={{ color: "var(--brand-ink)" }}>
                  {result.name}
                </div>
                <div
                  className="mt-1 text-[13px] font-semibold"
                  style={{ color: "var(--brand-slate)" }}
                >
                  Added to your Pokédex!
                </div>
                <button
                  onClick={
                    eggs > 0
                      ? () => {
                          setPhase("idle");
                          setResult(null);
                        }
                      : close
                  }
                  className="mt-5 flex h-12 w-full items-center justify-center rounded-full text-[15px] font-extrabold"
                  style={{
                    background: "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
                    color: "var(--brand-ink)",
                    boxShadow: "0 3px 0 var(--brand-gold-shadow)",
                  }}
                >
                  {eggs > 0 ? `Hatch another (${eggs} left)` : "Done"}
                </button>
              </div>
            ) : (
              <div className="mt-4 flex flex-col items-center">
                <div
                  className="relative text-[96px] leading-none"
                  style={
                    phase === "hatching"
                      ? { animation: "mega-egg-shake 0.4s ease-in-out infinite" }
                      : undefined
                  }
                >
                  🥚
                </div>
                <div className="mt-3 text-[15px] font-bold" style={{ color: "var(--brand-ink)" }}>
                  {eggs > 0 ? `You have ${eggs} Poké Egg${eggs === 1 ? "" : "s"}` : "No eggs yet"}
                </div>
                <div className="mt-1 text-[13px]" style={{ color: "var(--brand-slate)" }}>
                  {eggs > 0
                    ? "Hatch one to add a Pokémon to your Pokédex."
                    : "Win Mega Raids to earn Poké Eggs."}
                </div>
                <button
                  onClick={hatch}
                  disabled={eggs <= 0 || phase === "hatching"}
                  className="mt-5 flex h-12 w-full items-center justify-center rounded-full text-[15px] font-extrabold disabled:opacity-50"
                  style={{
                    background: "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
                    color: "var(--brand-ink)",
                    boxShadow: "0 3px 0 var(--brand-gold-shadow)",
                  }}
                >
                  {phase === "hatching" ? "Hatching…" : "Hatch an Egg"}
                </button>
              </div>
            )}
          </div>
          <style>{`@keyframes mega-egg-shake{0%,100%{transform:rotate(-8deg)}50%{transform:rotate(8deg)}}`}</style>
        </div>
      )}
    </>
  );
}
