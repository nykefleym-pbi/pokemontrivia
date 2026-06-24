import { useEffect, useState } from "react";
import { PokemonSprite } from "@/components/game-ui";
import { trainerSpriteUrl, type ItemId } from "@/lib/game-data";
import { useGameStore } from "@/lib/store";
import { toast } from "sonner";
import type { MegaEvent } from "@/lib/mega/schedule";
import { fetchMegaLeaderboard, getMyMegaRun, type MegaRunRow } from "@/lib/mega/runs";

function fmtTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const MEDAL: Record<number, string> = { 1: "#F2D64E", 2: "#C7CDD8", 3: "#D9A066" };

interface Props {
  event: MegaEvent;
  onBack: () => void;
  onBattle: () => void;
}

export function MegaLeaderboard({ event, onBack, onBattle }: Props) {
  const [rows, setRows] = useState<MegaRunRow[]>([]);
  const [mine, setMine] = useState<MegaRunRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let on = true;
    Promise.all([fetchMegaLeaderboard(event.id, 100), getMyMegaRun(event.id)]).then(([r, m]) => {
      if (!on) return;
      setRows(r);
      setMine(m);
      setLoading(false);
    });
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => { on = false; clearInterval(t); };
  }, [event.id]);

  const ended = now >= Date.parse(event.endsAt);
  const msLeft = Date.parse(event.endsAt) - now;
  const champion = ended && rows.length > 0 ? rows[0] : null;
  const myRank = mine ? rows.findIndex((r) => r.user_id === mine.user_id) + 1 : 0;
  const isMyChampion = !!(champion && mine && champion.user_id === mine.user_id);
  const trophies = useGameStore((s) => s.megaTrophies);
  const claimed = (trophies ?? []).some((t) => t.eventId === event.id);

  const claimChampion = () => {
    const st = useGameStore.getState();
    st.addXp(event.champion.xp);
    if (st.pokemon) st.addTrainingPoints(st.pokemon.id, event.champion.tp);
    const pool: ItemId[] = ["potion", "superpotion", "maxpotion", "xattack", "scope", "xaccuracy", "candy", "luckyegg"];
    for (let i = 0; i < event.champion.items; i++) st.grantItem(pool[Math.floor(Math.random() * pool.length)], 1);
    const ok = st.claimMegaChampion(event.id, event.champion.trophyName, event.megaId);
    if (ok) toast.success(`Champion reward claimed! 🏆 ${event.champion.trophyName}`);
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden" style={{ background: "#14161F", fontFamily: "Outfit, sans-serif" }}>
      {/* header */}
      <div className="relative px-5 pb-4" style={{ paddingTop: 44, background: "radial-gradient(circle at 50% 20%, #2E3A5C 0%, #1C2333 60%, #14161F 100%)", overflow: "hidden" }}>
        <div className="absolute inset-0" style={{ background: "repeating-conic-gradient(from 0deg at 50% 18%, rgba(242,214,78,0.1) 0deg 6deg, transparent 6deg 13deg)" }} />
        <div className="relative flex items-center justify-between">
          <button onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-white" style={{ background: "rgba(255,255,255,0.1)" }}>‹</button>
          <div className="font-pixel" style={{ fontSize: 7, letterSpacing: 1.5, color: "rgba(255,255,255,0.65)" }}>MEGA RAID LEADERBOARD</div>
          <div className="h-9 w-9" />
        </div>
        <div className="relative mt-3 flex items-center gap-3">
          <PokemonSprite id={event.megaId} alt={event.name} className="h-[64px] w-[64px] object-contain [filter:drop-shadow(0_4px_8px_rgba(0,0,0,0.5))]" />
          <div className="flex-1">
            <div className="text-[20px] font-black leading-tight text-white">{event.name}</div>
            <div
              className="mt-1.5 inline-block font-pixel"
              style={{
                fontSize: 7,
                color: ended ? "rgba(255,255,255,0.6)" : "#1C2333",
                background: ended ? "rgba(255,255,255,0.1)" : "#F2D64E",
                borderRadius: 999, padding: "5px 11px",
              }}
            >
              {ended ? "RAID ENDED" : `ENDS IN ${fmtCountdown(msLeft)}`}
            </div>
          </div>
        </div>
      </div>

      {/* champion banner */}
      {champion && (
        <div className="mx-5 mt-3 rounded-2xl px-4 py-3" style={{ background: "linear-gradient(95deg, rgba(242,214,78,0.18), rgba(232,169,60,0.12))", border: "1px solid rgba(242,214,78,0.4)" }}>
          <div className="flex items-center gap-3">
            <span className="text-2xl">👑</span>
            <div className="flex-1">
              <div className="font-pixel" style={{ fontSize: 6.5, color: "#F2D64E" }}>CHAMPION · {event.champion.trophyName}</div>
              <div className="mt-1 text-[15px] font-extrabold text-white">{champion.trainer_name}{isMyChampion ? " (you)" : ""}</div>
            </div>
            <div className="text-right">
              <div className="text-[17px] font-black" style={{ color: "#F2D64E" }}>{Math.round(champion.accuracy)}%</div>
              <div className="text-[11px] text-white/55">{fmtTime(champion.time_ms)}</div>
            </div>
          </div>
          {isMyChampion && !claimed && (
            <button onClick={claimChampion} className="mt-3 flex h-11 w-full items-center justify-center rounded-full text-[15px] font-extrabold active:scale-[0.99]" style={{ background: "linear-gradient(95deg, #F2D64E, #E8A93C)", color: "#1C2333", boxShadow: "0 3px 0 #C18A28" }}>
              Claim Champion Reward · +{event.champion.xp} XP
            </button>
          )}
          {claimed && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-full py-2.5 text-[13px] font-bold" style={{ background: "rgba(242,214,78,0.16)", color: "#F2D64E" }}>
              🏆 Trophy claimed · {event.champion.trophyName}
            </div>
          )}
        </div>
      )}

      {/* list */}
      <div className="flex-1 overflow-y-auto px-5 pb-28 pt-3">
        {loading ? (
          <div className="mt-10 text-center font-pixel" style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}>LOADING…</div>
        ) : rows.length === 0 ? (
          <div className="mt-12 flex flex-col items-center text-center">
            <PokemonSprite id={event.megaId} alt={event.name} className="h-24 w-24 object-contain opacity-90" />
            <div className="mt-3 text-[17px] font-extrabold text-white">No challengers yet</div>
            <div className="mt-1 text-[14px] text-white/55">Be the first to take on {event.name}!</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((r, i) => {
              const rank = i + 1;
              const isMe = mine?.user_id === r.user_id;
              return (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
                  style={isMe
                    ? { background: "rgba(242,214,78,0.14)", border: "1.5px solid rgba(242,214,78,0.5)" }
                    : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex w-7 shrink-0 justify-center font-black" style={{ fontSize: rank <= 3 ? 18 : 15, color: MEDAL[rank] ?? "rgba(255,255,255,0.5)" }}>
                    {rank <= 3 ? "●" : rank}
                  </div>
                  <img src={trainerSpriteUrl(r.trainer_sprite)} alt="" crossOrigin="anonymous" className="h-9 w-9 rounded-full object-contain" style={{ background: "rgba(255,255,255,0.08)" }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = "hidden"; }} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-bold text-white">{r.trainer_name}{isMe ? " (you)" : ""}</div>
                    <div className="text-[11px] text-white/45">Lv {r.level} · {fmtTime(r.time_ms)} · {r.attempts > 1 ? "2 tries" : "1 try"}</div>
                  </div>
                  <div className="text-[17px] font-black text-white">{Math.round(r.accuracy)}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* footer action */}
      <div className="absolute inset-x-0 bottom-0 px-5 pb-9 pt-3" style={{ background: "linear-gradient(0deg, #14161F 60%, transparent)" }}>
        {!ended && (
          <button
            onClick={onBattle}
            className="flex h-14 w-full items-center justify-center rounded-full text-base font-extrabold active:scale-[0.99]"
            style={{ background: "linear-gradient(95deg, #F2D64E, #E8A93C)", color: "#1C2333", boxShadow: "0 4px 0 #C18A28" }}
          >
            {mine ? (mine.attempts >= 2 ? "View only — no retakes left" : "Battle (1 retake left)") : "Battle Mega Raid"}
          </button>
        )}
        {ended && (
          <div className="text-center text-[13px] text-white/45">This raid has ended.</div>
        )}
        {myRank > 0 && (
          <div className="mt-2.5 text-center font-pixel" style={{ fontSize: 7, color: "rgba(255,255,255,0.5)" }}>
            YOUR RANK · #{myRank}
          </div>
        )}
      </div>
    </div>
  );
}
