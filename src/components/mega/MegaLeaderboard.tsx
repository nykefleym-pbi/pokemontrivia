import { useEffect, useState } from "react";

import { trainerSpriteUrl, type ItemId } from "@/lib/game-data";
import { useGameStore } from "@/lib/store";
import { toast } from "sonner";
import { playSfx } from "@/lib/audio";
import { MEGA_REWARD, megaRankScale, type MegaEvent } from "@/lib/mega/schedule";
import { rollLevelUpRewards } from "@/lib/level-rewards";
import { claimMegaReward } from "@/services/client/mega-reward-claim";
import { AppIcon } from "@/components/app-icon";
import { UI_ICON } from "@/lib/app-icons";
import {
  fetchMegaLeaderboard,
  getMyMegaRun,
  type MegaRunRow,
  type MegaLeaderboardRow,
} from "@/lib/mega/runs";
import {
  ensureSession,
  listFriends,
  listPendingRequestTargets,
  sendFriendRequestById,
} from "@/lib/social";

// Small per-row friend action: + (add) / Pending / Friend.
function FriendChip({ state, onAdd }: { state: "add" | "pending" | "friend"; onAdd: () => void }) {
  if (state === "friend") {
    return (
      <span
        className="shrink-0 rounded-full px-2 py-1 font-pixel"
        style={{
          fontSize: 6,
          color: "rgba(255,255,255,0.55)",
          background: "rgba(255,255,255,0.08)",
        }}
      >
        FRIEND
      </span>
    );
  }
  if (state === "pending") {
    return (
      <span
        className="shrink-0 rounded-full px-2 py-1 font-pixel"
        style={{ fontSize: 6, color: "var(--brand-gold)", background: "rgba(242,214,78,0.12)" }}
      >
        PENDING
      </span>
    );
  }
  return (
    <button
      onClick={onAdd}
      aria-label="Add friend"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[16px] font-black leading-none transition active:scale-90"
      style={{ background: "var(--brand-gold)", color: "var(--brand-ink)" }}
    >
      +
    </button>
  );
}

function fmtTime(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function fmtCountdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400),
    h = Math.floor((s % 86400) / 3600),
    m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}D ${h}H`;
  if (h > 0) return `${h}H ${m}M`;
  return `${m}M`;
}

const PODIUM = {
  1: {
    ring: "var(--brand-gold)",
    bar: "linear-gradient(var(--brand-gold),#D9B838)",
    barText: "#7A5E10",
    h: 80,
    av: 50,
    w: 92,
  },
  2: {
    ring: "#C0C6D4",
    bar: "linear-gradient(#3A4660,#2A3450)",
    barText: "#C0C6D4",
    h: 58,
    av: 40,
    w: 86,
  },
  3: {
    ring: "#C8895A",
    bar: "linear-gradient(#5A4636,#3F3127)",
    barText: "#C8895A",
    h: 44,
    av: 40,
    w: 86,
  },
} as const;

interface Props {
  event: MegaEvent;
  onBack: () => void;
  onBattle: () => void;
}

export function MegaLeaderboard({ event, onBack, onBattle }: Props) {
  const [rows, setRows] = useState<MegaLeaderboardRow[]>([]);
  const [mine, setMine] = useState<MegaRunRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(Date.now());

  const trophies = useGameStore((s) => s.megaTrophies);
  const claimedRewards = useGameStore((s) => s.claimedMegaRewards);
  const claimed = (trophies ?? []).some((t) => t.eventId === event.id);
  const rewardClaimed = (claimedRewards ?? []).includes(event.id);

  useEffect(() => {
    let on = true;
    Promise.all([fetchMegaLeaderboard(event.id, 200), getMyMegaRun(event.id)]).then(([r, m]) => {
      if (!on) return;
      setRows(r);
      setMine(m);
      setLoading(false);
    });
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [event.id]);

  // Friend states for leaderboard rows (+ / Pending / Friend).
  const [myUid, setMyUid] = useState<string | null>(null);
  const [friendIds, setFriendIds] = useState<Set<string>>(new Set());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    void (async () => {
      const [uid, friends, pending] = await Promise.all([
        ensureSession(),
        listFriends(),
        listPendingRequestTargets(),
      ]);
      setMyUid(uid);
      setFriendIds(new Set(friends.map((f) => f.id)));
      setPendingIds(pending);
    })();
  }, []);
  async function addFriend(targetId: string) {
    setPendingIds((prev) => new Set(prev).add(targetId)); // optimistic
    const res = await sendFriendRequestById(targetId);
    if (res.error) {
      setPendingIds((prev) => {
        const n = new Set(prev);
        n.delete(targetId);
        return n;
      });
      toast.error(res.error);
      return;
    }
    playSfx("friend_ping");
    if (res.status === "accepted") {
      setFriendIds((prev) => new Set(prev).add(targetId));
      toast.success("You're now friends!");
    } else {
      toast.success("Friend request sent!");
    }
  }
  function friendState(userId: string): "add" | "pending" | "friend" {
    if (friendIds.has(userId)) return "friend";
    if (pendingIds.has(userId)) return "pending";
    return "add";
  }

  const ended = now >= Date.parse(event.endsAt);
  const msLeft = Date.parse(event.endsAt) - now;
  const champion = rows[0] ?? null;
  const isMyChampion = !!(champion && mine && champion.user_id === mine.user_id);
  const myRank = mine ? rows.findIndex((r) => r.user_id === mine.user_id) + 1 : 0;

  const [claiming, setClaiming] = useState(false);

  const claimReward = async () => {
    const st = useGameStore.getState();
    if (st.claimedMegaRewards.includes(event.id) || claiming) return;
    setClaiming(true);
    let result;
    try {
      result = await claimMegaReward(event.id);
    } catch {
      setClaiming(false);
      toast.error("Couldn't claim reward — check your connection.");
      return;
    }
    setClaiming(false);
    st.markMegaRewardClaimed(event.id);

    if (result.alreadyGranted || !result.reward) {
      // Already paid out by a prior call (this device or another) — this
      // device just never recorded that fact locally. Don't pay out (or
      // grant champion-only bonuses) a second time.
      toast.success("Rewards already claimed.");
      return;
    }

    const { rank, reward } = result;
    const prevLevel = st.level;
    st.addXp(reward.xp);
    st.addCoins(reward.coins);
    if (st.pokemon) st.addTrainingPoints(st.pokemon.id, reward.tp);
    const newLevel = useGameStore.getState().level;
    if (newLevel > prevLevel) {
      const rewards = rollLevelUpRewards(prevLevel, newLevel);
      if (rewards) {
        useGameStore.getState().mergePendingLevelUp(rewards);
        if (rewards.coins > 0) useGameStore.getState().addCoins(rewards.coins);
        for (const it of rewards.items) useGameStore.getState().grantItem(it.id, it.qty);
        if (rewards.eggs > 0) useGameStore.getState().grantPokeEgg(rewards.eggs);
      }
    }
    if (rank === 1) {
      // Champion-only bonuses aren't part of the server-idempotent grant yet
      // (see mega-reward-claim/index.ts's module doc) — still applied
      // client-side, but only reached when `result.granted` (a genuinely new
      // claim), never on `alreadyGranted`.
      const pool: ItemId[] = [
        "potion",
        "superpotion",
        "maxpotion",
        "xattack",
        "scope",
        "xaccuracy",
        "candy",
        "luckyegg",
      ];
      for (let i = 0; i < MEGA_REWARD.items; i++)
        st.grantItem(pool[Math.floor(Math.random() * pool.length)], 1);
      st.grantPokeEgg(1);
      // Intentional exception to the "Legendary/Mythical are egg-exclusive" rule:
      // a Mega Raid champion always earns the boss's base-form Pokédex entry,
      // even if that base form is Legendary/Mythical.
      st.recordPokedexCapture(event.baseDexId, false);
      st.claimMegaChampion(event.id, event.champion.trophyName, event.megaId);
    }
    toast.success(rank === 1 ? `Champion rewards claimed!` : `Rank #${rank} rewards claimed!`);
    playSfx("claim_reward");
  };

  const Avatar = ({ sprite, size, ring }: { sprite: string; size: number; ring: string }) => (
    <div
      className="flex items-start justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, background: "#2A2D3A", border: `2px solid ${ring}` }}
    >
      <img
        src={trainerSpriteUrl(sprite)}
        alt=""
        crossOrigin="anonymous"
        className="object-cover object-top"
        style={{ width: size - 4, height: size - 4 }}
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.visibility = "hidden";
        }}
      />
    </div>
  );

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden"
      style={{ background: "var(--brand-ink-deep)", fontFamily: "Outfit, sans-serif" }}
    >
      {/* header banner */}
      <div
        className="relative px-5 pb-[18px]"
        style={{
          paddingTop: 44,
          background:
            "radial-gradient(circle at 50% 30%, #2E3A5C 0%, var(--brand-ink) 62%, var(--brand-ink-deep) 100%)",
          overflow: "hidden",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            background:
              "repeating-conic-gradient(from 0deg at 50% 26%, rgba(242,214,78,0.14) 0deg 7deg, transparent 7deg 15deg)",
          }}
        />
        <img
          src={`https://cdn.jsdelivr.net/gh/PokeAPI/sprites@master/sprites/pokemon/${event.megaId}.png`}
          alt={event.name}
          crossOrigin="anonymous"
          className="absolute object-contain"
          style={{ right: 48, top: 40, width: 96, height: 96, opacity: 0.92 }}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <button
          onClick={onBack}
          className="relative flex h-9 w-9 items-center justify-center rounded-full text-lg text-white"
          style={{ background: "rgba(255,255,255,0.1)" }}
        >
          ‹
        </button>
        <div className="relative mt-2.5">
          <div
            className="font-pixel"
            style={{ fontSize: 6.5, letterSpacing: 1, color: "var(--brand-gold)" }}
          >
            {ended ? "EVENT ENDED · RESULTS" : "MEGA RAID · LEADERBOARD"}
          </div>
          <div
            className="mt-2 text-[23px] font-black leading-[1.1] text-white"
            style={{ maxWidth: 220 }}
          >
            {event.name}
          </div>
          <div
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5"
            style={{ background: "rgba(0,0,0,0.3)" }}
          >
            {!ended && (
              <svg width="11" height="11" viewBox="0 0 22 22" fill="none">
                <circle cx="11" cy="11" r="8.5" stroke="var(--brand-gold)" strokeWidth="2" />
                <path
                  d="M11 6.5V11l3 2"
                  stroke="var(--brand-gold)"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            )}
            <span className="font-pixel" style={{ fontSize: 6.5, color: "var(--brand-gold)" }}>
              {ended ? `${rows.length} TRAINERS COMPETED` : `ENDS IN ${fmtCountdown(msLeft)}`}
            </span>
          </div>
        </div>
      </div>

      {loading ? (
        <div
          className="mt-10 text-center font-pixel"
          style={{ fontSize: 8, color: "rgba(255,255,255,0.5)" }}
        >
          LOADING…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-9 text-center">
          <div className="text-[22px] font-black text-white [text-wrap:pretty]">
            Be the first to challenge {event.name}!
          </div>
          <div className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>
            No trainers have completed the raid yet. Set the pace and claim #1.
          </div>
          {!ended && (
            <button
              onClick={onBattle}
              className="mt-6 flex h-[54px] w-full items-center justify-center rounded-full font-pixel text-white"
              style={{
                fontSize: 11,
                letterSpacing: 1,
                background: "var(--brand-red)",
                boxShadow: "0 5px 0 #A82A20",
              }}
            >
              START THE RAID
            </button>
          )}
        </div>
      ) : ended ? (
        <div className="flex-1 overflow-y-auto px-4 pb-9 pt-3.5">
          {mine &&
            (() => {
              const rank = myRank > 0 ? myRank : 99;
              const scale = megaRankScale(rank);
              const xp = Math.round(MEGA_REWARD.xp * scale);
              const coins = Math.round(MEGA_REWARD.coins * scale);
              const tp = Math.round(MEGA_REWARD.tp * scale);
              const placementText =
                myRank > 0 ? `You placed #${myRank} of ${rows.length}` : "You participated";
              if (rank === 1) {
                return (
                  <div
                    className="relative overflow-hidden rounded-[20px] p-[18px] text-center"
                    style={{
                      background:
                        "radial-gradient(circle at 50% 0%, #6a2db5 0%, var(--brand-ink) 80%)",
                      border: "1.5px solid var(--brand-gold)",
                    }}
                  >
                    <div
                      className="absolute inset-0"
                      style={{
                        background:
                          "repeating-conic-gradient(from 0deg at 50% 30%, rgba(242,214,78,0.16) 0deg 6deg, transparent 6deg 13deg)",
                      }}
                    />
                    <div className="relative">
                      <AppIcon src={UI_ICON.trophies} className="mx-auto h-[38px] w-[38px]" />
                      <div
                        className="mt-1.5 font-pixel"
                        style={{ fontSize: 10, letterSpacing: 1, color: "var(--brand-gold)" }}
                      >
                        YOU'RE THE CHAMPION!
                      </div>
                      <div className="mt-2 text-[13px]" style={{ color: "rgba(255,255,255,0.8)" }}>
                        {placementText}
                      </div>
                      <div
                        className="mt-2 text-[12px] font-bold"
                        style={{ color: "var(--brand-gold)" }}
                      >
                        +{xp} XP · +{coins} Coins · +{tp} TP
                      </div>
                      <div className="mt-1 text-[11px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                        + 10 items · Poké Egg · Pokédex · Trophy
                      </div>
                      {rewardClaimed || claimed ? (
                        <div
                          className="mt-3.5 flex h-[54px] items-center justify-center rounded-full font-pixel"
                          style={{
                            fontSize: 10,
                            letterSpacing: 1,
                            background: "rgba(242,214,78,0.16)",
                            color: "var(--brand-gold)",
                          }}
                        >
                          REWARDS CLAIMED ✓
                        </div>
                      ) : null}
                      {!(rewardClaimed || claimed) && (
                        <button
                          onClick={() => void claimReward()}
                          disabled={claiming}
                          className="mt-3.5 flex h-[54px] w-full items-center justify-center rounded-full font-pixel active:scale-[0.99] disabled:opacity-60"
                          style={{
                            fontSize: 11,
                            letterSpacing: 1,
                            background:
                              "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
                            color: "var(--brand-ink)",
                            boxShadow: "0 5px 0 var(--brand-gold-shadow)",
                          }}
                        >
                          {claiming ? "CLAIMING…" : "CLAIM REWARDS"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }
              return (
                <div
                  className="rounded-[20px] p-4 text-center"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1.5px solid rgba(255,255,255,0.14)",
                  }}
                >
                  <div
                    className="font-pixel"
                    style={{ fontSize: 9, letterSpacing: 1, color: "var(--brand-gold)" }}
                  >
                    EVENT REWARDS
                  </div>
                  <div className="mt-1.5 text-[14px] font-extrabold text-white">
                    {placementText}
                  </div>
                  <div
                    className="mt-1 text-[13px] font-bold"
                    style={{ color: "rgba(255,255,255,0.85)" }}
                  >
                    +{xp} XP · +{coins} Coins · +{tp} TP
                  </div>
                  {rewardClaimed ? (
                    <div
                      className="mt-3 flex h-12 items-center justify-center rounded-full font-pixel"
                      style={{
                        fontSize: 9,
                        letterSpacing: 1,
                        background: "rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.7)",
                      }}
                    >
                      REWARDS CLAIMED ✓
                    </div>
                  ) : null}
                  {!rewardClaimed && (
                    <button
                      onClick={() => void claimReward()}
                      disabled={claiming}
                      className="mt-3 flex h-12 w-full items-center justify-center rounded-full font-pixel active:scale-[0.99] disabled:opacity-60"
                      style={{
                        fontSize: 10,
                        letterSpacing: 1,
                        background: "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
                        color: "var(--brand-ink)",
                        boxShadow: "0 4px 0 var(--brand-gold-shadow)",
                      }}
                    >
                      {claiming ? "CLAIMING…" : "CLAIM REWARDS"}
                    </button>
                  )}
                </div>
              );
            })()}
          <div
            className="mt-3.5 font-pixel"
            style={{ fontSize: 7, letterSpacing: 1, color: "rgba(255,255,255,0.5)" }}
          >
            RANKINGS
          </div>
          <div className="mt-2.5 flex flex-col gap-2">
            {rows.slice(0, 50).map((r, i) => {
              const rank = i + 1;
              const me = mine?.user_id === r.user_id;
              const medal =
                rank === 1
                  ? "var(--brand-gold)"
                  : rank === 2
                    ? "#C0C6D4"
                    : rank === 3
                      ? "#C8895A"
                      : "rgba(255,255,255,0.5)";
              return (
                <div
                  key={r.user_id}
                  className="flex items-center gap-3 rounded-[14px] px-3.5 py-[11px]"
                  style={
                    me
                      ? {
                          background:
                            "linear-gradient(95deg, rgba(242,214,78,0.2), rgba(242,214,78,0.05))",
                          border: "1.5px solid var(--brand-gold)",
                        }
                      : undefined
                  }
                >
                  <span
                    className="font-pixel"
                    style={{ fontSize: rank <= 3 ? 10 : 9, color: medal, width: 24 }}
                  >
                    {rank}
                  </span>
                  <Avatar
                    sprite={r.trainer_sprite}
                    size={rank <= 3 ? 36 : 34}
                    ring={medal === "rgba(255,255,255,0.5)" ? "#2A2D3A" : medal}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-white">
                      {me ? "You" : r.trainer_name}
                    </div>
                    {me && isMyChampion && (
                      <div
                        className="font-pixel"
                        style={{ fontSize: 6, color: "var(--brand-gold)" }}
                      >
                        CHAMPION
                      </div>
                    )}
                  </div>
                  {!me && r.user_id !== myUid && (
                    <FriendChip
                      state={friendState(r.user_id)}
                      onAdd={() => void addFriend(r.user_id)}
                    />
                  )}
                  <div
                    className="text-[17px] font-black"
                    style={{ color: medal === "rgba(255,255,255,0.5)" ? "#fff" : medal }}
                  >
                    {Math.round(r.accuracy)}%
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="px-4 pt-3">
            <div
              className="flex items-center gap-2 rounded-[14px] px-3.5 py-2.5"
              style={{
                background: "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
              }}
            >
              <AppIcon src={UI_ICON.trophies} className="h-4 w-4 shrink-0" />
              <span className="text-[11.5px] font-bold leading-tight" style={{ color: "#5A3E12" }}>
                Champion: {MEGA_REWARD.xp.toLocaleString()} XP ·{" "}
                {MEGA_REWARD.coins.toLocaleString()} Coins · {MEGA_REWARD.tp} TP ·{" "}
                {MEGA_REWARD.items} items · Trophy — top 3 & all who place win rank-scaled rewards
              </span>
            </div>
          </div>
          <div className="flex items-end justify-center gap-2 px-[18px] pt-3.5">
            {([2, 1, 3] as const).map((rank) => {
              const r = rows[rank - 1];
              if (!r) return <div key={rank} style={{ width: PODIUM[rank].w }} />;
              const p = PODIUM[rank];
              return (
                <div key={rank} className="flex flex-col items-center" style={{ width: p.w }}>
                  <div
                    className={rank === 1 ? "mt-0.5" : ""}
                    style={
                      rank === 1
                        ? { filter: "drop-shadow(0 0 14px rgba(242,214,78,0.6))" }
                        : undefined
                    }
                  >
                    <Avatar sprite={r.trainer_sprite} size={p.av} ring={p.ring} />
                  </div>
                  <div className="mt-1 text-[12px] font-bold text-white">
                    {mine?.user_id === r.user_id ? "You" : r.trainer_name}
                  </div>
                  <div className="text-[13px] font-black" style={{ color: p.ring }}>
                    {Math.round(r.accuracy)}%
                  </div>
                  <div
                    className="mt-1.5 flex w-full justify-center rounded-t-lg pt-1.5 font-pixel"
                    style={{
                      height: p.h,
                      background: p.bar,
                      fontSize: rank === 1 ? 14 : rank === 2 ? 12 : 11,
                      color: p.barText,
                    }}
                  >
                    {rank}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex-1 overflow-y-auto px-3.5 pt-1">
            {rows.slice(3).map((r, i) => {
              const rank = i + 4;
              const me = mine?.user_id === r.user_id;
              return (
                <div
                  key={r.user_id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                  style={i % 2 === 1 ? { background: "rgba(255,255,255,0.04)" } : undefined}
                >
                  <span
                    className="font-pixel"
                    style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", width: 22 }}
                  >
                    {rank}
                  </span>
                  <Avatar sprite={r.trainer_sprite} size={34} ring="#2A2D3A" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-bold text-white">
                      {me ? "You" : r.trainer_name}
                    </div>
                    <div
                      className="font-pixel"
                      style={{ fontSize: 6, color: "rgba(255,255,255,0.45)" }}
                    >
                      {r.correct}/{r.total} · {fmtTime(r.time_ms)}
                    </div>
                  </div>
                  {!me && r.user_id !== myUid && (
                    <FriendChip
                      state={friendState(r.user_id)}
                      onAdd={() => void addFriend(r.user_id)}
                    />
                  )}
                  <div className="text-[17px] font-black text-white">{Math.round(r.accuracy)}%</div>
                </div>
              );
            })}
          </div>
          {mine && myRank > 0 && (
            <div
              className="px-3.5 pb-9 pt-2"
              style={{
                background: "linear-gradient(180deg, transparent, var(--brand-ink-deep) 40%)",
              }}
            >
              <div
                className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
                style={{
                  background: "linear-gradient(95deg, rgba(226,59,46,0.25), rgba(242,214,78,0.25))",
                  border: "1.5px solid var(--brand-gold)",
                }}
              >
                <span
                  className="font-pixel"
                  style={{ fontSize: 10, color: "var(--brand-gold)", width: 30 }}
                >
                  {myRank}
                </span>
                <Avatar sprite={mine.trainer_sprite} size={36} ring="var(--brand-red)" />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-extrabold text-white">You</div>
                  <div
                    className="font-pixel"
                    style={{ fontSize: 6, color: "rgba(255,255,255,0.6)" }}
                  >
                    {mine.correct}/{mine.total} · {fmtTime(mine.time_ms)}
                  </div>
                </div>
                <div className="text-[18px] font-black text-white">
                  {Math.round(mine.accuracy)}%
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
