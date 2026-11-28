import * as React from "react";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import {
  addFriendByCode,
  getProfileById,
  listFriends,
  listIncomingFriendRequests,
  listPendingRequestTargets,
  notifyFriendAccepted,
  removeFriend,
  respondFriendRequest,
  type TrainerProfile,
} from "@/lib/social";
import { createPvpChallenge, listPvpInvites } from "@/lib/pvp";
import { fetchBattleQuestions } from "@/lib/api/trivia";
import { adaptiveDifficultyBand, ITEMS } from "@/lib/game-data";
import { inviteUrl } from "@/lib/referral-rewards";
import { ALL_POKEMON_SLIM } from "@/lib/pokemon-data.slim.generated";
import { NaIcon } from "@/components/na/icon";
import { NaOfflineRow } from "@/components/na/offline-row";
import { NaButton } from "@/components/na/button";
import { NaSheet } from "@/components/na/sheet";
import { NaGlassRow } from "@/components/na/celebration";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { FaceAvatar, FaceOff } from "@/components/na/face-off";
import { ItemIcon } from "@/components/game-ui";

/** Any screen can open Friends (a request toast, Settings, the raid leaderboard). */
export const OPEN_FRIENDS_EVENT = "poketrivia:open-friends";
export const FRIENDS_REFRESH_EVENT = "poketrivia:friends-refresh";
export type FriendsView = "list" | "requests" | "invite";

const PENDING_KEY = "poke-trivia-open-friends";
/** Open Friends from anywhere: Profile listens when mounted, else picks the view up on mount. */
export function openFriendsFrom(view: FriendsView, go: () => void) {
  try {
    sessionStorage.setItem(PENDING_KEY, view);
  } catch {
    /* private mode: the event below still works on Profile */
  }
  if (window.location.pathname === "/profile") {
    takePendingFriendsView();
    window.dispatchEvent(new CustomEvent(OPEN_FRIENDS_EVENT, { detail: view }));
  } else go();
}
export function takePendingFriendsView(): FriendsView | null {
  try {
    const v = sessionStorage.getItem(PENDING_KEY) as FriendsView | null;
    sessionStorage.removeItem(PENDING_KEY);
    return v;
  } catch {
    return null;
  }
}

type Incoming = Awaited<ReturnType<typeof listIncomingFriendRequests>>[number];

/** Send a friend battle (16.3, and Rematch on 16.6). Returns the new match id, or null after a toast. */
export async function sendFriendChallenge(friendId: string, friendName?: string): Promise<string | null> {
  const s = useGameStore.getState();
  const data = await fetchBattleQuestions({
    difficulties: adaptiveDifficultyBand(s.level, s.recentAnswers),
    seenHashes: s.seenQuestionHashes,
    seenSamples: s.seenQuestions.slice(-80),
    excludeIds: s.seenCuratedIds,
    flowSeed: Math.floor(Math.random() * 1_000_000),
  });
  if (!data.questions || data.questions.length < 5) {
    toast.error("Couldn't prepare the challenge. Try again.");
    return null;
  }
  s.markQuestionsSeen(data.questions.map((q) => q.question));
  s.markCuratedSeen(data.servedIds ?? []);
  const res = await createPvpChallenge(friendId, data.questions);
  if (!res.ok) {
    toast.error("Couldn't send the challenge. Try again.");
    return null;
  }
  toast.success(`Challenge sent to ${friendName || "trainer"}!`);
  return res.matchId;
}

const POTION = ITEMS.find((i) => i.id === "potion");
const partnerName = (id: number | null) => (id ? ALL_POKEMON_SLIM.find((p) => p.id === id)?.name : undefined);
const line = (level: number, ace: number | null) => [`Level ${level}`, partnerName(ace)].filter(Boolean).join(" · ");
// shortcut: "Online" = profile synced in the last 10 minutes (no presence channel yet).
const online = (p: TrainerProfile) => Date.now() - Date.parse(p.updated_at) < 10 * 60_000;

function Header({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
      <button type="button" aria-label="Back" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
        <NaIcon name="arrow-left" size={20} />
      </button>
      <h1 className="na-display-s flex-1 text-foreground">{title}</h1>
    </div>
  );
}

const Avatar = ({ sprite, size = 44, ring = "rgb(255 255 255 / 0.12)" }: { sprite: string; size?: number; ring?: string }) => (
  <FaceAvatar spriteId={sprite || "red"} size={size} ring={ring} />
);

/**
 * Figma 16.1 Friends (your code, add by code, requests, battle), 16.2 Friend
 * requests, 16.3 Challenge a friend (sheet) and 16.7 Invite a friend — one
 * full-screen overlay, like Settings (8.1).
 */
export function FriendsScreen({
  open,
  view: initialView = "list",
  onClose,
}: {
  open: boolean;
  view?: FriendsView;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const friendCode = useGameStore((s) => s.friendCode);
  const [view, setView] = useState<FriendsView>(initialView);
  const [friends, setFriends] = useState<TrainerProfile[]>([]);
  const [incoming, setIncoming] = useState<Incoming[]>([]);
  const [sent, setSent] = useState<TrainerProfile[]>([]);
  const [code, setCode] = useState("");
  const [adding, setAdding] = useState(false);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<TrainerProfile | null>(null);
  const [challenging, setChallenging] = useState(false);
  const [picked, setPicked] = useState<TrainerProfile | null>(null);
  /** challengerId -> matchId: challenges waiting for you (16.4 footnote). */
  const [waiting, setWaiting] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) setView(initialView);
  }, [open, initialView]);

  const refresh = React.useCallback(async () => {
    const [f, inc, targets] = await Promise.all([listFriends(), listIncomingFriendRequests(), listPendingRequestTargets()]);
    setFriends(f);
    setIncoming(inc);
    const profiles = await Promise.all([...targets].map((id) => getProfileById(id)));
    setSent(profiles.filter((p): p is TrainerProfile => !!p));
    const inv = await listPvpInvites();
    setWaiting(Object.fromEntries(inv.map((m) => [m.challengerId, m.id])));
  }, []);
  useEffect(() => {
    if (!open) return;
    void refresh();
    const h = () => void refresh();
    window.addEventListener(FRIENDS_REFRESH_EVENT, h);
    return () => window.removeEventListener(FRIENDS_REFRESH_EVENT, h);
  }, [open, refresh]);

  async function addFriend() {
    const c = code.trim().toUpperCase();
    if (c.length !== 6 || adding) return;
    setAdding(true);
    const res = await addFriendByCode(c);
    setAdding(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const name = res.profile?.trainer_name ?? "trainer";
    setCode("");
    if (res.status === "accepted") toast.success(`You're now friends with ${name}!`);
    else if (res.status === "already_pending") toast("Request already sent. Waiting for them to accept.");
    else toast.success(`Friend request sent to ${name}!`);
    void refresh();
  }

  async function respond(req: Incoming, accept: boolean) {
    if (respondingId) return;
    setRespondingId(req.requestId);
    const res = await respondFriendRequest(req.requestId, accept);
    setRespondingId(null);
    if (!res.ok) {
      toast.error("Couldn't respond, try again.");
      return;
    }
    setIncoming((rs) => rs.filter((r) => r.requestId !== req.requestId));
    if (res.status === "accepted") {
      toast.success(`You're now friends with ${req.trainerName || "trainer"}!`);
      void notifyFriendAccepted(req.fromId);
      void refresh();
    }
  }

  async function sendChallenge(friend: TrainerProfile) {
    if (challenging) return;
    setChallenging(true);
    try {
      const matchId = await sendFriendChallenge(friend.id, friend.trainer_name);
      if (!matchId) return;
      setChallenge(null);
      onClose();
      void navigate({ to: "/pvp/$matchId", params: { matchId } });
    } finally {
      setChallenging(false);
    }
  }

  function copy(text: string, what: string) {
    void navigator.clipboard?.writeText(text);
    toast.success(`${what} copied!`);
  }
  function shareLink() {
    const link = inviteUrl(friendCode);
    const text = `Add me on Pokémon Trivia Battle! Friend code: ${friendCode ?? ""}\n${link}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else copy(text, "Invite");
  }

  if (!open) return null;
  const mySprite = useGameStore.getState().trainerSprite;
  const back = () => (view === "list" || initialView !== "list" ? onClose() : setView("list"));

  return (
    <div className="na-bg-night fixed inset-0 z-50 flex flex-col overflow-y-auto pt-[env(safe-area-inset-top)]">
      {view === "list" && (
        <>
          <Header title="Friends" onBack={back} />
          <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
            <NaOfflineRow onRetry={() => void refresh()} />
            <div className="flex flex-col gap-2 rounded-[20px] border border-reward-gold/50 bg-white/[0.08] p-3.5">
              <span className="na-label uppercase text-reward-gold">Your friend code</span>
              <span className="na-display-m tracking-wide text-foreground">{friendCode ?? "------"}</span>
              <div className="flex gap-2.5">
                <NaButton kind="secondary" size="M" className="flex-1" onClick={() => friendCode && copy(friendCode, "Friend code")}>
                  Copy
                </NaButton>
                <NaButton size="M" className="flex-1" onClick={() => setView("invite")}>
                  Share
                </NaButton>
              </div>
            </div>

            <label className="flex flex-col gap-1.5">
              <span className="na-label uppercase text-text-secondary">Add a friend</span>
              <span
                className={`flex h-[54px] items-center gap-2 rounded-[14px] border-2 bg-night-deep/60 px-3.5 ${code.length === 6 ? "border-success" : "border-white/[0.16]"}`}
              >
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  onKeyDown={(e) => e.key === "Enter" && void addFriend()}
                  maxLength={6}
                  enterKeyHint="go"
                  autoCapitalize="characters"
                  placeholder="ENTER CODE"
                  aria-label="Friend code"
                  className="na-headline w-full min-w-0 bg-transparent uppercase tracking-wide text-foreground outline-none placeholder:text-text-muted"
                />
                {code.length === 6 && (
                  <button type="button" aria-label="Add friend" disabled={adding} onClick={() => void addFriend()} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success text-night-deep disabled:opacity-50">
                    <NaIcon name="user-plus" size={18} />
                  </button>
                )}
              </span>
              <span className="na-caption text-text-secondary">Enter your friend's 6-character code</span>
            </label>

            {incoming.length > 0 && (
              <NaGlassRow
                tone="red"
                lead={<NaGlossIcon kind="bell" size={32} />}
                title="Friend requests"
                sub={`${incoming.length} trainer${incoming.length === 1 ? " wants" : "s want"} to be your friend!`}
                trailing={<NaIcon name="chevron-right" size={18} className="text-text-muted" />}
                onClick={() => setView("requests")}
              />
            )}

            <span className="na-label uppercase text-text-secondary">Your friends ({friends.length})</span>
            {friends.length === 0 ? (
              <NaGlassRow lead={<NaGlossIcon kind="profile" size={32} />} title="No friends yet" sub="Share your code to add your first friend!" />
            ) : (
              friends.map((f) => (
                <div key={f.id} className="flex w-full items-center gap-3 rounded-[18px] border border-white/[0.12] bg-white/[0.08] p-3">
                  <button type="button" onClick={() => setPicked(f)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <Avatar sprite={f.trainer_sprite} />
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="na-headline truncate text-foreground">{f.trainer_name}</span>
                      <span className="na-caption truncate text-text-secondary">
                        {line(f.level, f.ace_pokemon_id)}
                        {online(f) ? " · Online" : ""}
                      </span>
                    </span>
                  </button>
                  {waiting[f.id] ? (
                    <NaButton
                      size="M"
                      onClick={() => {
                        onClose();
                        void navigate({ to: "/pvp/$matchId", params: { matchId: waiting[f.id] } });
                      }}
                    >
                      Play
                    </NaButton>
                  ) : (
                    <NaButton kind="secondary" size="M" onClick={() => setChallenge(f)}>
                      Battle
                    </NaButton>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {view === "requests" && (
        <>
          <Header title="Friend requests" onBack={back} />
          <div className="flex flex-col gap-3 px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
            <span className="na-label uppercase text-text-secondary">New requests</span>
            {incoming.length === 0 && <p className="na-body text-text-secondary">No new requests right now.</p>}
            {incoming.map((r) => (
              <div key={r.requestId} className="flex flex-col gap-2.5 rounded-[18px] border border-white/[0.12] bg-white/[0.08] p-3">
                <div className="flex items-center gap-3">
                  <Avatar sprite={r.trainerSprite} />
                  <span className="flex min-w-0 flex-col">
                    <span className="na-headline truncate text-foreground">{r.trainerName || "Trainer"}</span>
                    <span className="na-caption text-text-secondary">Level {r.level}</span>
                  </span>
                </div>
                <div className="flex gap-2.5">
                  <NaButton size="M" className="flex-1" disabled={respondingId === r.requestId} onClick={() => void respond(r, true)}>
                    Accept
                  </NaButton>
                  <NaButton kind="secondary" size="M" className="flex-1" disabled={respondingId === r.requestId} onClick={() => void respond(r, false)}>
                    Decline
                  </NaButton>
                </div>
              </div>
            ))}
            {sent.length > 0 && (
              <>
                <span className="na-label uppercase text-text-secondary">Sent</span>
                {sent.map((p) => (
                  <div key={p.id} className="opacity-70">
                    <NaGlassRow lead={<Avatar sprite={p.trainer_sprite} />} title={p.trainer_name} sub={`Waiting for ${p.trainer_name} to accept.`} />
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {view === "invite" && <InviteFriend friendCode={friendCode} onBack={back} onShare={shareLink} onCopy={() => copy(inviteUrl(friendCode), "Link")} />}

      <NaSheet
        open={!!challenge}
        onOpenChange={(o) => !o && setChallenge(null)}
        title={`Battle ${challenge?.trainer_name ?? ""}?`}
        body={`You both answer the same questions. ${challenge?.trainer_name ?? "They"} plays when ready, and the higher score wins!`}
        primary={{ label: challenging ? "Sending…" : "Send challenge", disabled: challenging, onClick: () => challenge && void sendChallenge(challenge) }}
        secondary={{ label: "Maybe Later", onClick: () => setChallenge(null) }}
      >
        <div className="flex justify-center">
          <FaceOff me={mySprite} them={challenge?.trainer_sprite || "red"} width={300} />
        </div>
      </NaSheet>

      <NaSheet
        open={!!picked}
        onOpenChange={(o) => !o && setPicked(null)}
        title={picked?.trainer_name ?? ""}
        body={picked ? `${line(picked.level, picked.ace_pokemon_id)} · ${picked.pokedex_count} caught` : undefined}
        primary={{
          label: "Remove friend",
          kind: "danger",
          onClick: () => {
            const p = picked;
            setPicked(null);
            if (p) void removeFriend(p.id).then((ok) => ok && setFriends((fs) => fs.filter((x) => x.id !== p.id)));
          },
        }}
        secondary={{ label: "Close", onClick: () => setPicked(null) }}
        footnote="You can add them back anytime with their friend code."
      />
    </div>
  );
}

/** Figma 16.7 Invite a friend: the rewards you both get, your code, Share link and Copy link. */
export function InviteFriend({
  friendCode,
  onBack,
  onShare,
  onCopy,
}: {
  friendCode: string | null;
  onBack: () => void;
  onShare: () => void;
  onCopy: () => void;
}) {
  return (
    <>
      <Header title="Invite a friend" onBack={onBack} />
      <div className="flex flex-1 flex-col items-center gap-3.5 px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-2">
        <div className="relative h-[140px] w-[240px] shrink-0">
          <span className="absolute left-[60px] top-[10px]">
            <NaRewardIcon kind="Gift" size={120} />
          </span>
          {([[30, 30, 20], [196, 20, 24], [200, 104, 14]] as const).map(([x, y, s]) => (
            <span key={x} aria-hidden className="absolute text-foreground" style={{ left: x - s / 2, top: y - s / 2 }}>
              <NaIcon name="sparkle" size={s} />
            </span>
          ))}
        </div>
        <p className="na-title text-center text-foreground">Invite a friend and you both get rewards!</p>
        <div className="flex w-full flex-col gap-2">
          <NaGlassRow lead={<NaRewardIcon kind="Coin" size={32} />} title="500 coins" />
          <NaGlassRow lead={<NaRewardIcon kind="Egg" size={32} />} title="A Poké Egg" />
          <NaGlassRow lead={POTION ? <ItemIcon item={POTION} className="h-8 w-8" /> : null} title="5 random items" />
        </div>
        <div className="flex w-full flex-col items-center gap-1 rounded-[16px] border border-reward-gold/50 bg-white/[0.08] px-4 py-3">
          <span className="na-label uppercase text-text-secondary">Your friend code</span>
          <span className="na-number-l text-reward-gold">{friendCode ?? "------"}</span>
        </div>
        <div className="flex-1" />
        <NaButton block onClick={onShare}>
          Share link
        </NaButton>
        <NaButton block kind="secondary" onClick={onCopy}>
          Copy link
        </NaButton>
      </div>
    </>
  );
}
