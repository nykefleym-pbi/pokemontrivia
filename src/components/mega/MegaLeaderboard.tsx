import { useEffect, useState } from "react";

import { trainerSpriteUrl, type ItemId } from "@/lib/game-data";
import { useGameStore } from "@/lib/store";
import { toast } from "sonner";
import { playSfx } from "@/lib/audio";
import { MEGA_REWARD, megaRankScale, type MegaEvent } from "@/lib/mega/schedule";
import { rollLevelUpRewards } from "@/lib/level-rewards";
import { claimMegaReward } from "@/services/client/mega-reward-claim";
import { NaIcon } from "@/components/na/icon";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaButton } from "@/components/na/button";
import { FitSprite, FittedTrainer } from "@/components/na/battle";
import { findPokemon } from "@/lib/pokemon-data";
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

// Small per-row friend action: Add / Pending / Friend (Figma 13.4 pills).
function FriendChip({ state, onAdd }: { state: "add" | "pending" | "friend"; onAdd: () => void }) {
  if (state === "friend") {
    return (
      <span className="na-label flex shrink-0 items-center gap-1 rounded-full border border-success/40 bg-success/[0.14] py-[5px] pl-2 pr-3 uppercase text-success">
        <NaIcon name="check" size={12} /> Friend
      </span>
    );
  }
  if (state === "pending") {
    return <span className="na-label shrink-0 rounded-full bg-white/10 px-3 py-[5px] uppercase text-text-muted">Pending</span>;
  }
  return (
    <button type="button" onClick={onAdd} aria-label="Add friend" className="na-label flex shrink-0 items-center gap-1 rounded-full border border-white/[0.16] bg-night-card-2 py-[5px] pl-2 pr-3 uppercase text-foreground press">
      <NaGlossIcon kind="profile" size={12} /> Add
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

  const rank = myRank > 0 ? myRank : 99;
  const scale = megaRankScale(rank);
  const pay = { xp: Math.round(MEGA_REWARD.xp * scale), coins: Math.round(MEGA_REWARD.coins * scale), tp: Math.round(MEGA_REWARD.tp * scale) };
  const base = findPokemon(event.baseDexId)?.name ?? "the boss";
  const done = rewardClaimed || claimed;

  return (
    // Figma 13.4 "Leaderboard: claim when the raid ends".
    <div className="na-bg-night flex h-full w-full flex-col overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        <button type="button" aria-label="Back" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
          <NaIcon name="arrow-left" size={20} />
        </button>
        <h1 className="na-display-s flex-1 text-foreground">Leaderboard</h1>
      </div>
      <div className="flex flex-col gap-2.5 px-4 pt-1">
        <div className="na-glass flex items-center gap-3 rounded-[18px] px-3.5 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="na-label uppercase text-reward-gold">
              {ended ? "Raid ended" : `Ends in ${fmtCountdown(msLeft)}`} · {rows.length} trainer{rows.length === 1 ? "" : "s"}
            </span>
            <span className="na-title truncate text-foreground">{event.name}</span>
          </span>
          <FitSprite id={event.megaId} size={56} />
        </div>

        {loading ? (
          <p className="na-body py-10 text-center text-text-secondary">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
            <span className="na-title text-foreground">Be the first to challenge {event.name}!</span>
            <span className="na-body text-text-secondary">No trainers have finished the raid yet. Set the pace and claim #1.</span>
            {!ended && (
              <NaButton block onClick={onBattle}>
                Start the raid
              </NaButton>
            )}
          </div>
        ) : (
          <>
            {mine && (
              <div className="flex flex-col items-center gap-2.5 rounded-[20px] border-[1.5px] border-reward-gold/60 bg-night-card p-4">
                <span className="na-title text-center text-foreground">
                  {myRank > 0 ? (ended ? `You placed #${myRank} out of ${rows.length}!` : `You're #${myRank} of ${rows.length} so far!`) : "You took part!"}
                </span>
                <span className="flex flex-wrap items-center justify-center gap-3.5">
                  {[["XP", `+${pay.xp} XP`], ["Coin", `+${pay.coins} coins`], ["TP", `+${pay.tp} TP`]].map(([k, v]) => (
                    <span key={k} className="flex items-center gap-1">
                      <NaRewardIcon kind={k as "XP" | "Coin" | "TP"} size={22} />
                      <span className="na-body-strong text-foreground">{v}</span>
                    </span>
                  ))}
                </span>
                {ended ? (
                  done ? (
                    <span className="na-label uppercase text-success">Rewards claimed</span>
                  ) : (
                    <NaButton kind="gold" block disabled={claiming} onClick={() => void claimReward()}>
                      {claiming ? "Claiming…" : "Claim rewards"}
                    </NaButton>
                  )
                ) : (
                  <span className="na-caption text-center text-text-secondary">Claim these when the raid ends, in {fmtCountdown(msLeft).toLowerCase()}.</span>
                )}
                <span className="na-caption text-center text-text-secondary">
                  {rank === 1 && ended ? `You also earned 10 items, a Poké Egg & ${base} for your Pokédex!` : `1st Place also ${ended ? "earned" : "gets"} 10 items, a Poké Egg & ${base} for their Pokédex!`}
                </span>
              </div>
            )}
            {rows.slice(0, 50).map((r, i) => {
              const n = i + 1;
              const me = mine?.user_id === r.user_id;
              return (
                <div
                  key={r.user_id}
                  className={`flex items-center gap-2.5 rounded-2xl border px-3 py-2 ${me ? "border-reward-gold/60 bg-reward-gold/[0.12]" : "border-white/[0.12] bg-white/[0.08]"}`}
                >
                  <span className={`na-number-m w-8 ${n === 1 ? "text-reward-gold" : "text-text-secondary"}`}>#{n}</span>
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-night-card-2">
                    <FittedTrainer art={trainerSpriteUrl(r.trainer_sprite)} height={30} cx={18} feetY={33} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center gap-1">
                      <span className="na-body-strong truncate text-foreground">{me ? `${r.trainer_name} (you)` : r.trainer_name}</span>
                      {n === 1 && <NaGlossIcon kind="crown" size={14} />}
                    </span>
                    <span className="na-caption text-text-secondary">
                      {Math.round(r.accuracy)}% accuracy · {fmtTime(r.time_ms)}
                    </span>
                  </span>
                  {!me && r.user_id !== myUid && <FriendChip state={friendState(r.user_id)} onAdd={() => void addFriend(r.user_id)} />}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}