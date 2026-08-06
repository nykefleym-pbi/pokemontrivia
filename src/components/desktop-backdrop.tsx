import { useMemo } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PokeballSpinner, typeColorMap } from "@/components/game-ui";
import type { PokeType } from "@/lib/pokemon-data.generated";

const TYPES: PokeType[] = [
  "fire", "water", "electric", "grass", "ice", "fighting", "poison", "ground",
  "flying", "psychic", "bug", "rock", "ghost", "dragon", "dark", "steel", "fairy", "normal",
];

interface Drifter {
  id: number;
  kind: "ball" | "type";
  type: PokeType;
  size: number;
  top: number;
  left: number;
  opacity: number;
  dx: number;
  dy: number;
  rot: number;
  dur: number;
  delay: number;
}

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function buildDrifters(count: number): Drifter[] {
  return Array.from({ length: count }, (_, id) => {
    // A wide duration spread is the whole point: some pieces creep, others
    // dart across "fast and wild" — feedback 2026-08-06.
    const dur = rand(7, 26);
    const wild = dur < 12; // the fast ones also travel further and spin harder
    return {
      id,
      kind: id % 3 === 0 ? "type" : "ball",
      type: TYPES[Math.floor(rand(0, TYPES.length))],
      size: rand(30, 90),
      top: rand(0, 94),
      left: rand(0, 94),
      opacity: rand(0.5, 0.82),
      dx: rand(-1, 1) * (wild ? rand(90, 190) : rand(20, 70)),
      dy: rand(-1, 1) * (wild ? rand(90, 190) : rand(20, 70)),
      rot: rand(-1, 1) * (wild ? rand(120, 320) : rand(20, 90)),
      dur,
      delay: rand(0, 8),
    };
  });
}

/**
 * The ambient wallpaper behind the desktop phone mockup: the home tab's beige
 * (`.bg-poke-cream`) with Poké Balls and type-coloured discs drifting at
 * randomised, wildly-varying speeds. Rendered only when the frame is active
 * (see routes/__root.tsx), so phones never pay for it. `pointer-events-none`
 * and low-opacity so it never competes with the phone it sits behind.
 */
export function DesktopBackdrop() {
  const reduced = useReducedMotion();
  const drifters = useMemo(() => buildDrifters(reduced ? 12 : 24), [reduced]);

  return (
    <div className="bg-poke-cream pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {drifters.map((d) => (
        <motion.div
          key={d.id}
          className="absolute"
          style={{
            top: `${d.top}%`,
            left: `${d.left}%`,
            opacity: d.opacity,
            // A soft shadow gives the white Poké Ball body a visible edge on the
            // cream backdrop (it would otherwise disappear into it).
            filter: "drop-shadow(0 3px 6px oklch(0.25 0.03 265 / 0.5))",
          }}
          animate={reduced ? undefined : { x: [0, d.dx, 0], y: [0, d.dy, 0], rotate: [0, d.rot, 0] }}
          transition={{ duration: d.dur, delay: d.delay, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
        >
          {d.kind === "ball" ? (
            <PokeballSpinner size={d.size} />
          ) : (
            <div
              className={`rounded-full ${typeColorMap[d.type]}`}
              style={{ width: d.size * 0.72, height: d.size * 0.72 }}
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}
