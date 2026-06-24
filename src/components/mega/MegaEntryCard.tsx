import { useEffect, useState } from "react";
import { PokemonSprite } from "@/components/game-ui";
import { useActiveMegaEvent } from "@/lib/mega/schedule";

function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}D ${h}H`;
  if (h > 0) return `${h}H ${m}M`;
  return `${m}M`;
}

/** Home-screen entry for the active Mega Raid. Renders nothing when none is live. */
export function MegaEntryCard({ onStart, onLeaderboard }: { onStart: () => void; onLeaderboard: () => void }) {
  const { event, loading } = useActiveMegaEvent();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading || !event) return null;
  const msLeft = Date.parse(event.endsAt) - now;
  if (msLeft <= 0) return null;

  return (
    <div className="px-5 pt-2.5">
      <div
        className="relative overflow-hidden rounded-[18px] p-4"
        style={{ background: "radial-gradient(circle at 78% 30%, #2E3A5C 0%, #1C2333 55%, #14161F 100%)", boxShadow: "0 10px 26px -10px rgba(0,0,0,0.6)" }}
      >
        <div className="absolute inset-0" style={{ background: "repeating-conic-gradient(from 0deg at 82% 36%, rgba(242,214,78,0.16) 0deg 5deg, transparent 5deg 11deg)" }} />
        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="inline-block font-pixel" style={{ fontSize: 7, letterSpacing: 1, color: "#1C2333", background: "#F2D64E", borderRadius: 999, padding: "4px 9px" }}>
              ⚡ MEGA RAID
            </div>
            <h3 className="mt-2 truncate text-[19px] font-black leading-tight text-white">{event.name}</h3>
            <p className="mt-0.5 font-pixel" style={{ fontSize: 7, color: "rgba(255,255,255,0.6)" }}>ENDS IN {fmtCountdown(msLeft)}</p>
          </div>
          <PokemonSprite id={event.megaId} alt={event.name} className="h-[76px] w-[76px] shrink-0 object-contain [filter:drop-shadow(0_6px_10px_rgba(0,0,0,0.55))]" />
        </div>
        <div className="relative mt-3.5 flex gap-2.5">
          <button
            onClick={onStart}
            className="flex h-[46px] flex-1 items-center justify-center rounded-full text-[15px] font-extrabold active:translate-y-0.5"
            style={{ background: "linear-gradient(95deg, #F2D64E, #E8A93C)", color: "#1C2333", boxShadow: "0 4px 0 #C18A28" }}
          >
            Battle
          </button>
          <button
            onClick={onLeaderboard}
            className="flex h-[46px] items-center justify-center rounded-full px-5 text-[15px] font-bold text-white active:translate-y-0.5"
            style={{ background: "rgba(255,255,255,0.1)", border: "1.5px solid rgba(255,255,255,0.2)" }}
          >
            Leaderboard
          </button>
        </div>
      </div>
    </div>
  );
}
