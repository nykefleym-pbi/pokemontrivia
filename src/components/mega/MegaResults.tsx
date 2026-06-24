import { PokemonSprite } from "@/components/game-ui";
import type { MegaEvent } from "@/lib/mega/schedule";

export interface MegaRewardItem {
  id: string;
  name: string;
  iconUrl: string;
  qty: number;
}

interface MegaResultsProps {
  event: MegaEvent;
  outcome: "win" | "loss";
  accuracy: number; // 0–100 integer
  correct: number;
  total: number;
  timeMs: number;
  rank: number | null;
  shiny: boolean;
  items: MegaRewardItem[];
  canRematch: boolean;
  onRematch: () => void;
  onHome: () => void;
  onViewLeaderboard: () => void;
}

function fmtTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function MegaResults({
  event,
  outcome,
  accuracy,
  correct,
  total,
  timeMs,
  rank,
  shiny,
  items,
  canRematch,
  onRematch,
  onHome,
  onViewLeaderboard,
}: MegaResultsProps) {
  const win = outcome === "win";

  return (
    <div
      className="flex h-full w-full flex-col overflow-y-auto"
      style={{ background: "#14161F", fontFamily: "Outfit, sans-serif" }}
    >
      {/* header: navy hero + gold sunburst */}
      <div
        className="relative px-6 pb-6 text-center"
        style={{
          paddingTop: 56,
          background: "radial-gradient(circle at 50% 30%, #2E3A5C 0%, #1C2333 58%, #14161F 100%)",
          overflow: "hidden",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: `repeating-conic-gradient(from 0deg at 50% 26%, rgba(242,214,78,${win ? 0.14 : 0.08}) 0deg 6deg, transparent 6deg 13deg)`,
          }}
        />
        <div
          className="relative inline-block font-pixel"
          style={{
            fontSize: 9,
            lineHeight: 1.5,
            letterSpacing: 1,
            color: win ? "#1C2333" : "rgba(255,255,255,0.6)",
            background: win ? "#F2D64E" : "rgba(255,255,255,0.08)",
            borderRadius: 999,
            padding: "9px 18px",
            boxShadow: win ? "0 4px 0 #C9AE2E" : "none",
          }}
        >
          {win ? `${event.name.toUpperCase()} CAPTURED!` : "RAID FAILED"}
        </div>
        <div className="relative mt-3.5 flex justify-center">
          {win && (
            <div
              className="absolute"
              style={{
                width: 180,
                height: 180,
                borderRadius: "50%",
                background: "radial-gradient(circle, rgba(242,214,78,0.3) 0%, transparent 68%)",
              }}
            />
          )}
          <PokemonSprite
            id={event.megaId}
            shiny={shiny}
            alt={event.name}
            className="relative h-[150px] w-[150px] object-contain"
          />
        </div>
        {!win && (
          <div className="relative mt-1 text-[26px] font-black leading-tight text-white">
            {event.name}
            <br />
            got away…
          </div>
        )}
      </div>

      {/* stats: 2×2 */}
      <div className="grid grid-cols-2 gap-2 px-6 pt-5">
        <StatCard label="ACCURACY" value={`${accuracy}%`} big highlight={win} />
        <button
          onClick={onViewLeaderboard}
          className="flex flex-col justify-center rounded-2xl px-4 py-3.5 text-left active:scale-[0.98]"
          style={
            win
              ? { background: "linear-gradient(95deg, #F2D64E, #E8A93C)", boxShadow: "0 4px 0 #C18A28" }
              : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }
          }
        >
          <span className="font-pixel" style={{ fontSize: 6, color: win ? "#7A5E10" : "rgba(255,255,255,0.6)" }}>
            LEADERBOARD RANK ›
          </span>
          <span
            className="mt-1.5 text-[26px] font-black leading-none"
            style={{ color: win ? "#1C2333" : "rgba(255,255,255,0.85)" }}
          >
            {rank ? `#${rank}` : "—"}
          </span>
        </button>
        <StatCard label="CORRECT" value={`${correct}/${total}`} />
        <StatCard label="TIME" value={fmtTime(timeMs)} />
      </div>

      {/* rewards (win only) */}
      {win && (
        <div className="px-6 pt-4.5">
          <div className="font-pixel" style={{ fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.6)" }}>
            REWARDS
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            <div className="grid grid-cols-2 gap-2">
              <RewardPill label={`+${event.reward.xp} XP`} emoji="✨" />
              <RewardPill label={`+${event.reward.tp} TP`} emoji="🎓" />
            </div>
            {items.length > 0 && (
              <div className="rounded-2xl p-3.5" style={{ background: "#FBF3DF" }}>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">🎁</span>
                  <div className="text-[15px] font-extrabold" style={{ color: "#1C2333" }}>
                    Items earned
                  </div>
                </div>
                <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
                  {items.map((it, i) => (
                    <div key={`${it.id}-${i}`} className="flex items-center gap-2">
                      <img src={it.iconUrl} alt={it.name} className="h-6 w-6 [image-rendering:pixelated]" />
                      <span className="text-[13px] font-bold" style={{ color: "#1C2333" }}>
                        {it.name}
                      </span>
                      <span className="ml-auto text-[13px] font-extrabold" style={{ color: "#6B6E7B" }}>
                        ×{it.qty}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: "#FBF3DF" }}>
              <span className="text-2xl">🥚</span>
              <div className="flex-1 text-[15px] font-extrabold" style={{ color: "#1C2333" }}>
                Poké Egg
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-2xl px-3.5 py-2.5" style={{ background: "#FBF3DF" }}>
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: "#DDF0E3" }}
              >
                <span style={{ color: "#3F9D5A", fontWeight: 900 }}>✓</span>
              </div>
              <div className="flex-1 text-[14px] font-extrabold" style={{ color: "#1C2333" }}>
                {event.baseName} added to Pokédex
              </div>
              <PokemonSprite id={event.reward.dexId} shiny={shiny} className="h-8 w-8" />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1" />

      {/* actions */}
      <div className="flex flex-col gap-2.5 px-6 pb-11 pt-4">
        {win ? (
          <>
            <button
              onClick={onViewLeaderboard}
              className="flex h-14 items-center justify-center rounded-full text-base font-extrabold active:scale-[0.99]"
              style={{ background: "linear-gradient(95deg, #F2D64E, #E8A93C)", color: "#1C2333", boxShadow: "0 4px 0 #C18A28" }}
            >
              View Leaderboard
            </button>
            <button
              onClick={onHome}
              className="flex h-14 items-center justify-center rounded-full text-base font-bold text-white"
              style={{ background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.18)" }}
            >
              Back home
            </button>
          </>
        ) : (
          <>
            {canRematch && (
              <button
                onClick={onRematch}
                className="flex h-14 items-center justify-center rounded-full text-base font-bold text-white active:scale-[0.99]"
                style={{ background: "#E23B2E", boxShadow: "0 14px 30px -8px rgba(226,59,46,0.55)" }}
              >
                Rematch (1 retake left)
              </button>
            )}
            <button
              onClick={onViewLeaderboard}
              className="flex h-14 items-center justify-center rounded-full text-base font-bold text-white"
              style={{ background: "rgba(255,255,255,0.08)", border: "1.5px solid rgba(255,255,255,0.18)" }}
            >
              View Leaderboard
            </button>
            <button
              onClick={onHome}
              className="flex h-14 items-center justify-center rounded-full text-base font-bold text-white"
              style={{ background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(255,255,255,0.12)" }}
            >
              Back home
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, big, highlight }: { label: string; value: string; big?: boolean; highlight?: boolean }) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={
        highlight
          ? { background: "rgba(242,214,78,0.14)", border: "1px solid rgba(242,214,78,0.4)" }
          : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }
      }
    >
      <div className="font-pixel" style={{ fontSize: 6, color: highlight ? "#F2D64E" : "rgba(255,255,255,0.6)" }}>
        {label}
      </div>
      <div className={`mt-1.5 font-black leading-none text-white ${big ? "text-[26px]" : "text-[22px]"}`}>
        {value}
      </div>
    </div>
  );
}

function RewardPill({ label, emoji }: { label: string; emoji: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl px-3.5 py-2.5" style={{ background: "#FBF3DF" }}>
      <span className="text-2xl">{emoji}</span>
      <div className="text-[15px] font-extrabold" style={{ color: "#1C2333" }}>
        {label}
      </div>
    </div>
  );
}
