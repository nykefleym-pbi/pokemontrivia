import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import { ItemIcon } from "@/components/game-ui";
import { FieldSprite } from "@/components/na/battle";
import { NaButton } from "@/components/na/button";
import { NaGlassRow, NaWordmark } from "@/components/na/celebration";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaSheet } from "@/components/na/sheet";
import { NaTypeChip } from "@/components/na/type-chip";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { track } from "@/lib/analytics";
import { ITEMS } from "@/lib/game-data";
import { ALL_LEGENDARY_MYTHICAL_IDS, isMythical } from "@/lib/legendary-data";
import { findPokemon } from "@/lib/pokemon-data";
import { useGameStore } from "@/lib/store";

const SHINY_CHANCE = 0.1;
const RARE_CANDY = ITEMS.find((i) => i.id === "candy");

/** The half shell Latias stands in (plugin SHELL). */
const SHELL = (
  <svg width="120" height="52" viewBox="0 0 120 52" aria-hidden>
    <path d="M4 12 16 24 28 10 40 24 52 10 64 24 76 10 88 24 100 10 112 24 116 16C116 37 92 50 60 50S4 37 4 16Z" fill="#FFFBEF" stroke="#A88A4E" strokeWidth="4" strokeLinejoin="round" />
    <path d="M20 38c11 7 26 9 40 9" stroke="#E2CC94" strokeWidth="4" fill="none" strokeLinecap="round" />
    <path d="M30 34c3-4 9-4 11 1-3 4-9 4-11-1zM78 36c2-3 7-3 9 1-2 3-7 3-9-1z" fill="#E2CC94" />
  </svg>
);

type Hatched = { id: number; name: string; shiny: boolean };

/**
 * Poké Eggs (Figma 6.1b, 6.1c). The round egg button in the Pokédex header opens
 * the egg sheet; Hatch plays the hatching screen. Eggs come from Mega Raids,
 * every 10th level and invites, fill as you play, and hatch into a random
 * Legendary or Mythical Pokémon: the only way to get one.
 */
export function EggHatch() {
  const eggs = useGameStore((s) => s.pokeEggs);
  const [open, setOpen] = useState(false);
  const [hatched, setHatched] = useState<Hatched | null>(null);
  const ready = eggs.find((e) => e.progress >= e.required);

  const hatch = () => {
    const st = useGameStore.getState();
    if (!ready || !st.hatchPokeEgg(ready.id)) return;
    const p = findPokemon(ALL_LEGENDARY_MYTHICAL_IDS[Math.floor(Math.random() * ALL_LEGENDARY_MYTHICAL_IDS.length)]);
    if (!p) return;
    const shiny = Math.random() < SHINY_CHANCE;
    // Paid at once, so leaving mid-animation can't lose the Pokémon.
    st.recordPokedexCapture(p.id, shiny);
    st.grantItem("candy", 1);
    track("egg_hatched", { pokemon: p.name, shiny });
    setOpen(false);
    setHatched({ id: p.id, name: p.name, shiny });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={eggs.length ? `Poké Eggs: ${eggs.length}` : "Poké Eggs"}
        className="press relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-night-card-2 shadow-[0_4px_0_#141A3F]"
      >
        {/* Stirs every few seconds only while you carry an egg (reduced motion turns it off in styles.css). */}
        <span className={eggs.length ? "animate-wiggle" : ""}>
          <NaRewardIcon kind="Egg" size={28} />
        </span>
        {eggs.length > 0 && (
          <span className="na-label absolute left-7 top-[-3px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-foreground">
            {eggs.length}
          </span>
        )}
      </button>

      <NaSheet
        open={open}
        onOpenChange={setOpen}
        scrim={0.72}
        title="Poké Eggs"
        body="What's inside? A Legendary or Mythical Pokémon! Play any game mode to hatch your eggs. Keep your daily streak alive to hatch them faster!"
        primary={eggs.length ? { label: "Hatch", onClick: hatch, disabled: !ready } : undefined}
        secondary={{ label: "Close", onClick: () => setOpen(false) }}
        footnote="Earn eggs by winning Mega Raids, reaching every 10th level, or inviting friends!"
      >
        {eggs.length === 0 ? (
          <p className="na-body-strong text-foreground">No eggs yet!</p>
        ) : (
          eggs.map((egg, i) => {
            const done = egg.progress >= egg.required;
            return (
              <div key={egg.id} className="flex items-center gap-3">
                <NaRewardIcon kind="Egg" size={44} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="na-body-strong text-foreground">Poké Egg {eggs.length > 1 ? i + 1 : ""}</span>
                  <span className={`na-caption ${done ? "text-reward-gold" : "text-text-secondary"}`}>
                    {done ? "Ready to hatch!" : "Keep playing to hatch this egg!"}
                  </span>
                  <span className="h-2 w-full overflow-hidden rounded bg-night-deep">
                    <span className="na-fill-gold block h-full rounded" style={{ width: `${Math.max(2, Math.min(100, (egg.progress / egg.required) * 100))}%` }} />
                  </span>
                </div>
              </div>
            );
          })
        )}
      </NaSheet>

      {hatched && <HatchScreen mon={hatched} onDone={() => setHatched(null)} />}
    </>
  );
}

/** Figma 6.1c: the egg wobbles, cracks and bursts, and the Legendary stands where it was. */
function HatchScreen({ mon, onDone }: { mon: Hatched; onDone: () => void }) {
  const reduce = useReducedMotion();
  const [phase, setPhase] = useState<"egg" | "crack" | "flash" | "reveal">(reduce ? "reveal" : "egg");
  const p = findPokemon(mon.id);
  const setPokemon = useGameStore((s) => s.setPokemon);
  useEffect(() => {
    if (reduce) return;
    const t = [setTimeout(() => setPhase("crack"), 1000), setTimeout(() => setPhase("flash"), 1800), setTimeout(() => setPhase("reveal"), 2200)];
    return () => t.forEach(clearTimeout);
  }, [reduce]);
  const shown = phase === "reveal";
  const rise = (d: number) => ({ initial: { opacity: 0, y: 12 }, animate: shown ? { opacity: 1, y: 0 } : {}, transition: { delay: d, duration: 0.35 } });

  return (
    <div className="na-bg-night fixed inset-0 z-[70] flex flex-col items-center overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-[calc(env(safe-area-inset-top)+20px)]">
      <p className="na-body-strong text-center text-reward-gold">Oh? Your egg is hatching!</p>
      <div className="mt-3 h-[68px]">{shown && <NaWordmark kind="victory">{mon.name.toUpperCase()}!</NaWordmark>}</div>
      <div className="relative mt-3 h-[240px] w-[330px] shrink-0">
        {!shown && (
          <motion.div
            className="absolute left-[137px] top-[92px]"
            animate={{ rotate: [0, -12, 12, -14, 14, -16, 16, 0] }}
            transition={{ duration: 1.8, ease: "easeInOut", times: [0, 0.2, 0.35, 0.5, 0.65, 0.78, 0.9, 1] }}
          >
            <NaRewardIcon kind="Egg" size={56} />
            {phase !== "egg" && (
              <svg className="absolute left-2 top-[18px]" width="40" height="24" viewBox="0 0 40 24" aria-hidden>
                <path d="M2 12 9 4l6 12 7-11 6 12 6-9 3 5" stroke="#0B1026" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            )}
          </motion.div>
        )}
        {phase === "flash" && (
          <motion.span
            className="absolute left-[123px] top-[78px] h-[84px] w-[84px] rounded-full bg-[#f4f6ff]/90"
            initial={{ scale: 0.3, opacity: 1 }}
            animate={{ scale: 3, opacity: 0 }}
            transition={{ duration: 0.4 }}
          />
        )}
        {shown && (
          <>
            <motion.div className="absolute inset-0" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.35 }}>
              <FieldSprite id={mon.id} shiny={mon.shiny} k={2.6} cx={165} feetY={200} />
            </motion.div>
            <span className="absolute left-[105px] top-[186px]">{SHELL}</span>
            {[
              [40, 40, 22],
              [276, 30, 26],
              [286, 150, 16],
              [30, 160, 14],
            ].map(([x, y, s], i) => (
              <motion.span key={i} className="absolute text-reward-gold" style={{ left: x, top: y }} initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 * i, duration: 0.5 }}>
                <Sparkles style={{ width: s, height: s }} />
              </motion.span>
            ))}
          </>
        )}
      </div>
      <motion.div {...rise(0.15)} className="mt-3 flex items-center gap-1.5">
        <span className="na-fill-gold na-label flex items-center gap-1 rounded-full py-[3px] pl-1.5 pr-2.5 text-on-gold">
          <Star className="h-3.5 w-3.5 fill-current" /> {isMythical(mon.id) ? "MYTHICAL" : "LEGENDARY"}
        </span>
        {p?.types.map((t) => <NaTypeChip key={t} type={t} />)}
      </motion.div>
      <motion.p {...rise(0.25)} className="na-title mt-3 text-center text-foreground">
        {mon.shiny ? `A shiny ${mon.name}` : mon.name} was added to your Pokédex!
      </motion.p>
      <motion.div {...rise(0.35)} className="mt-3 w-full">
        <NaGlassRow
          lead={RARE_CANDY ? <ItemIcon item={RARE_CANDY} className="h-9 w-9" /> : null}
          title="+1 Rare Candy"
          sub="Bonus reward: every egg gives you 1 Rare Candy!"
        />
      </motion.div>
      <div className="min-h-3 flex-1" />
      <NaButton block onClick={onDone} disabled={!shown}>
        Let's go!
      </NaButton>
      <NaButton
        kind="text"
        size="M"
        block
        className="mt-3 h-11"
        disabled={!shown}
        onClick={() => {
          if (p) setPokemon(p);
          toast.success(`${mon.name} is your partner now!`);
          onDone();
        }}
      >
        Set {mon.name} as my partner
      </NaButton>
    </div>
  );
}
