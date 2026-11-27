import { pageHead } from "@/lib/seo";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { RotateCcw, Check, Search, Volume2, VolumeX, Music, ChevronRight, Copy, Share2, UserPlus, Loader2, ImageDown, Lightbulb, Bug, Bell, BellOff, Swords, ZapOff, Facebook } from "lucide-react";
import { NaIcon } from "@/components/na/icon";
import { ShareCardDialog } from "@/components/share-card-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { useGameStore } from "@/lib/store";
import { bestDayStreak, dayStreak } from "@/lib/win-streak";
import { NaTopBar } from "@/components/na/top-bar";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaSheet } from "@/components/na/sheet";
import { NaGlassRow } from "@/components/na/celebration";
import { NaButton } from "@/components/na/button";
import { FitSprite } from "@/components/na/battle";
import { useStoreHydrated } from "@/lib/store-hydration";
import { hardReset } from "@/lib/hard-reset";
import {
  listFriends,
  addFriendByCode,
  removeFriend,
  syncProfile,
  isTrainerNameAvailable,
  claimTrainerName,
  bootstrapSocial,
  ensureSession,
  getProfileById,
  type TrainerProfile,
} from "@/lib/social";
import {
  pushSupported,
  getPushSubscriptionState,
  enablePushNotifications,
  disablePushNotifications,
} from "@/lib/push";
import { createPvpChallenge, listPvpMatches, type PvpMatch } from "@/lib/pvp";
import { fetchBattleQuestions } from "@/lib/api/trivia";
import { validateTrainerName, claimErrorMessage, TRAINER_NAME_MAX } from "@/lib/trainer-name";
import { inviteUrl } from "@/lib/referral-rewards";
import {
  rankForLevel,
  lifetimeTp,
  TRAINER_SPRITES,
  trainerSpriteUrl,
  adaptiveDifficultyBand,
} from "@/lib/game-data";
import { ALL_POKEMON, type PokeEntry, type PokeType } from "@/lib/pokemon-data";
import { PartnerTypeFilter } from "@/components/partner-type-filter";
import { matchesPartnerFilters, partnerTypeOptions } from "@/lib/partner-filter";

import { EvolutionScreen } from "@/components/evolution-screen";
import { PokemonSprite } from "@/components/game-ui";
import { TypeChip } from "@/components/type-chip";
import { FACEBOOK_PAGE_NAME, FACEBOOK_PAGE_URL } from "@/lib/social-links";
import { BattleLogList } from "@/components/battle-log-list";
import {
  EvolutionCard,
  CardStat,
  FriendRow,
  StatBox,
  BadgesTab,
} from "@/components/profile-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ACHIEVEMENTS, unlockedAchievements } from "@/lib/achievements";
import {
  achievementReward,
  achievementRewardLabel,
  claimAchievementReward,
} from "@/lib/achievement-rewards";
import { AppIcon } from "@/components/app-icon";
import { LOCK_ICON } from "@/lib/app-icons";
import {
  BACKDROP_BATTLE_COST,
  BACKDROP_COIN_COST,
  VERSUS_BACKDROPS,
  ownsBackdrop,
  versusBackdrop,
  versusBackdropSrc,
} from "@/lib/versus-backdrops";
import { GYM_LEADERS } from "@/lib/gym-leaders";
import {
  isMusicOn,
  setMusicOn,
  isSfxOn,
  setSfxOn,
  playSfx,
  getMusicVolume,
  setMusicVolume,
  getSfxVolume,
  setSfxVolume,
} from "@/lib/audio";
import { Slider } from "@/components/ui/slider";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/profile")({
  head: () => pageHead("/profile"),
  component: ProfilePage,
});

function ProfilePage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const navigate = useNavigate();
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);

  const stats = useGameStore((s) => s.stats);

  const setName = useGameStore((s) => s.setName);
  const setPokemon = useGameStore((s) => s.setPokemon);
  const setTrainerSprite = useGameStore((s) => s.setTrainerSprite);
  const versusBackdropId = useGameStore((s) => s.versusBackdropId);
  const setVersusBackdropId = useGameStore((s) => s.setVersusBackdropId);
  const coins = useGameStore((s) => s.coins);
  const ownedBackdropIds = useGameStore((s) => s.ownedBackdropIds);
  const versusBackdropBattles = useGameStore((s) => s.versusBackdropBattles);
  const buyVersusBackdrop = useGameStore((s) => s.buyVersusBackdrop);
  const battleLog = useGameStore((s) => s.battleLog);
  const flags = useGameStore((s) => s.flags);
  const peakLevel = useGameStore((s) => s.peakLevel);
  const pokedex = useGameStore((s) => s.pokedex);

  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const arenaWins = useGameStore((s) => s.arenaStats?.wins ?? 0);
  const trainingPointsSpent = useGameStore((s) => s.trainingPointsSpent);
  const evolvePartner = useGameStore((s) => s.evolvePartner);
  const gymBadges = useGameStore((s) => s.gymBadges);
  const seenHashes = useGameStore((s) => s.seenQuestionHashes);
  const seenQuestions = useGameStore((s) => s.seenQuestions);
  const seenCuratedIds = useGameStore((s) => s.seenCuratedIds);
  const recentAnswers = useGameStore((s) => s.recentAnswers);
  const markQuestionsSeen = useGameStore((s) => s.markQuestionsSeen);
  const markCuratedSeen = useGameStore((s) => s.markCuratedSeen);
  const unlocked = useMemo(() => {
    const ctx = { stats, flags, peakLevel, pokedex } as Parameters<typeof unlockedAchievements>[0];
    return new Set(unlockedAchievements(ctx));
  }, [stats, flags, peakLevel, pokedex]);
  const claimedAchievements = useGameStore((s) => s.claimedAchievements);
  const claimableCount = useMemo(
    () => [...unlocked].filter((id) => !claimedAchievements.includes(id)).length,
    [unlocked, claimedAchievements],
  );

  /** Claimable, then unlocked, then locked.
   *
   *  The row you can act on comes first, and everything you have actually
   *  earned sits above everything you have not. Collecting a trophy used to
   *  send it to the very bottom, below trophies the player had never earned,
   *  which read as a demotion for doing the right thing. */
  const trophySortRank = (id: string) => {
    if (!unlocked.has(id)) return 2;
    return claimedAchievements.includes(id) ? 1 : 0;
  };

  const claimTrophy = (id: string, name: string) => {
    const res = claimAchievementReward(id, useGameStore.getState());
    if (!res) return;
    playSfx("claim_reward");
    toast.success(`${name} claimed`, { description: res.text, duration: 4000 });
  };

  const [trophiesOpen, setTrophiesOpen] = useState(false);
  const friendCode = useGameStore((s) => s.friendCode);
  const pokedexCount = Object.keys(pokedex).length;
  const [cardOpen, setCardOpen] = useState(false);
  const [friendsOpen, setFriendsOpen] = useState(false);
  const [friends, setFriends] = useState<TrainerProfile[]>([]);
  const [friendCodeInput, setFriendCodeInput] = useState("");
  const [addingFriend, setAddingFriend] = useState(false);
  const [cardShareOpen, setCardShareOpen] = useState(false);
  const [friendToRemove, setFriendToRemove] = useState<TrainerProfile | null>(null);
  const [challengingId, setChallengingId] = useState<string | null>(null);
  const [pvpHistoryOpen, setPvpHistoryOpen] = useState(false);
  const [pvpMatches, setPvpMatches] = useState<PvpMatch[]>([]);
  const [pvpProfiles, setPvpProfiles] = useState<Record<string, TrainerProfile>>({});
  const [myPvpId, setMyPvpId] = useState<string | null>(null);

  const refreshFriends = React.useCallback(async () => {
    setFriends(await listFriends());
  }, []);
  useEffect(() => {
    void refreshFriends();
  }, [refreshFriends]);
  useEffect(() => {
    const handler = () => {
      void refreshFriends();
    };
    window.addEventListener("poketrivia:friends-refresh", handler);
    return () => window.removeEventListener("poketrivia:friends-refresh", handler);
  }, [refreshFriends]);

  useEffect(() => {
    if (!pvpHistoryOpen) return;
    void (async () => {
      const rows = await listPvpMatches();
      setPvpMatches(rows);
      const myId = await ensureSession();
      setMyPvpId(myId);
      const otherIds = new Set(
        rows.map((m) => (m.challengerId === myId ? m.opponentId : m.challengerId)),
      );
      const entries = await Promise.all(
        [...otherIds].map(async (id) => [id, await getProfileById(id)] as const),
      );
      const map: Record<string, TrainerProfile> = {};
      for (const [id, p] of entries) if (p) map[id] = p;
      setPvpProfiles(map);
    })();
  }, [pvpHistoryOpen]);

  async function handleChallenge(friend: TrainerProfile) {
    if (challengingId) return;
    setChallengingId(friend.id);
    try {
      const data = await fetchBattleQuestions({
        difficulties: adaptiveDifficultyBand(level, recentAnswers),
        seenHashes,
        seenSamples: seenQuestions.slice(-80),
        excludeIds: seenCuratedIds,
        flowSeed: Math.floor(Math.random() * 1_000_000),
      });
      if (!data.questions || data.questions.length < 5) {
        toast.error("Couldn't prepare the challenge. Try again.");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      markCuratedSeen(data.servedIds ?? []);
      const res = await createPvpChallenge(friend.id, data.questions);
      if (!res.ok) {
        toast.error("Couldn't send the challenge. Try again.");
        return;
      }
      toast.success(`Challenge sent to ${friend.trainer_name || "trainer"}!`);
      void navigate({ to: "/pvp/$matchId", params: { matchId: res.matchId } });
    } finally {
      setChallengingId(null);
    }
  }

  function handleOpenCard() {
    setCardOpen(true);
    void syncProfile();
  }
  async function handleAddFriend() {
    const code = friendCodeInput.trim().toUpperCase();
    if (!code || addingFriend) return;
    setAddingFriend(true);
    const res = await addFriendByCode(code);
    setAddingFriend(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const name = res.profile?.trainer_name ?? "trainer";
    if (res.status === "accepted") {
      toast.success(`You're now friends with ${name}!`);
      setFriendCodeInput("");
      void refreshFriends();
    } else if (res.status === "already_pending") {
      toast("Request already sent — waiting for them to accept.");
      setFriendCodeInput("");
    } else {
      toast.success(`Friend request sent to ${name}!`);
      setFriendCodeInput("");
    }
  }
  async function handleRemoveFriend(id: string) {
    if (await removeFriend(id)) setFriends((f) => f.filter((x) => x.id !== id));
  }
  const [badgesOpen, setBadgesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  useEffect(() => {
    if (!settingsOpen) return;
    void getPushSubscriptionState().then((s) => setPushSubscribed(s.subscribed));
  }, [settingsOpen]);
  async function togglePush(next: boolean) {
    setPushBusy(true);
    try {
      if (next) {
        track("push_prompt_shown", { source: "settings" });
        const res = await enablePushNotifications();
        if (res.ok) {
          setPushSubscribed(true);
          track("push_prompt_accepted", { source: "settings" });
          toast.success("Notifications enabled!");
        } else {
          track("push_prompt_dismissed", { source: "settings", reason: res.error ?? "unknown" });
          toast.error(res.error ?? "Couldn't enable notifications.");
        }
      } else {
        await disablePushNotifications();
        setPushSubscribed(false);
        toast.success("Notifications turned off.");
      }
    } finally {
      setPushBusy(false);
    }
  }
  // Feedback/Rename/Repick are separate Radix Dialog roots stacked on top of
  // the Settings Sheet (not nested in the JSX tree). Radix processes a single
  // dismiss gesture (Escape / outside click) by walking the layer stack
  // top-down and — critically — appears to flush the resulting React state
  // update between each layer's onOpenChange call, so by the time Settings'
  // own onOpenChange(false) runs, a state-based "is a child open?" check has
  // already gone stale (the child's setState already landed). A ref written
  // synchronously in the SAME handler as the child's close, and cleared only
  // on the next tick, survives that in-between flush and reliably blocks the
  // spurious Settings close.
  const suppressSettingsCloseRef = React.useRef(false);
  function suppressSettingsClose() {
    suppressSettingsCloseRef.current = true;
    setTimeout(() => {
      suppressSettingsCloseRef.current = false;
    }, 0);
  }
  const [feedbackOpen, setFeedbackOpen] = useState<null | "suggestion" | "bug">(null);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [feedbackContact, setFeedbackContact] = useState("");
  const [sendingFeedback, setSendingFeedback] = useState(false);
  const lastFeedbackAtRef = React.useRef(0);

  async function submitFeedback() {
    if (!feedbackOpen || sendingFeedback) return;
    const msg = feedbackMsg.trim();
    if (msg.length < 10) {
      toast.error("Please write at least 10 characters.");
      return;
    }
    if (Date.now() - lastFeedbackAtRef.current < 60_000) {
      toast.error("Please wait a minute between submissions.");
      return;
    }
    setSendingFeedback(true);
    try {
      const { error } = await (
        supabase as unknown as {
          from: (t: string) => {
            insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
          };
        }
      )
        .from("feedback")
        .insert({
          trainer_name: trainerName || null,
          category: feedbackOpen,
          message: msg.slice(0, 2000),
          contact: feedbackContact.trim() || null,
          app_version: null,
        });
      if (error) {
        toast.error("Couldn't send right now — please try again.");
        return;
      }
      lastFeedbackAtRef.current = Date.now();
      toast.success(
        feedbackOpen === "bug" ? "Bug report sent — thank you!" : "Suggestion sent — thank you!",
      );
      setFeedbackOpen(null);
      setFeedbackMsg("");
      setFeedbackContact("");
    } finally {
      setSendingFeedback(false);
    }
  }
  const [statsOpen, setStatsOpen] = useState(false);

  const [, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(trainerName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [trainerPickerOpen, setTrainerPickerOpen] = useState(false);
  const [backdropPickerOpen, setBackdropPickerOpen] = useState(false);
  /** Which locked backdrop the confirm sheet is asking about, or null. */
  const [backdropToBuy, setBackdropToBuy] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<PokeType | null>(null);
  const [trainerQuery, setTrainerQuery] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameAvail, setRenameAvail] = useState<
    "idle" | "checking" | "available" | "taken" | "invalid"
  >("idle");
  const [renameMsg, setRenameMsg] = useState<string>("");
  const [renaming, setRenaming] = useState(false);
  const [musicOn, setMusicState] = useState(true);
  const [sfxOn, setSfxState] = useState(true);
  const [musicVol, setMusicVolState] = useState(35);
  const [sfxVol, setSfxVolState] = useState(100);
  const reducedMotion = useGameStore((s) => s.reducedMotion);
  const setReducedMotion = useGameStore((s) => s.setReducedMotion);

  const [brokenTrainerIds, setBrokenTrainerIds] = useState<Set<string>>(new Set());
  const [evolvingFrom, setEvolvingFrom] = useState<PokeEntry | null>(null);
  const [evolvingTo, setEvolvingTo] = useState<PokeEntry | null>(null);

  useEffect(() => {
    setMusicState(isMusicOn());
    setSfxState(isSfxOn());
    setMusicVolState(getMusicVolume());
    setSfxVolState(getSfxVolume());
  }, []);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  // Re-picking is limited to Pokémon captured in the Pokédex (the current
  // partner always stays available). Onboarding still uses STARTING_PARTNERS.
  const partnerPool = useMemo(
    () => ALL_POKEMON.filter((p) => pokedex[p.id] || p.id === pokemon?.id),
    [pokedex, pokemon?.id],
  );
  // Chips come from the pool, so they only ever offer types the player owns.
  const typeOptions = useMemo(() => partnerTypeOptions(partnerPool), [partnerPool]);
  const results = useMemo(
    () => partnerPool.filter((p) => matchesPartnerFilters(p, query, typeFilter)).slice(0, 9),
    [partnerPool, query, typeFilter],
  );
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    const pool = TRAINER_SPRITES.filter((t) => !brokenTrainerIds.has(t.id));
    if (!q) return pool.slice(0, 9);
    return pool.filter((t) => t.name.toLowerCase().startsWith(q)).slice(0, 9);
  }, [trainerQuery, brokenTrainerIds]);


  // Debounced availability check while the rename dialog is open.
  useEffect(() => {
    if (!renameOpen) return;
    const trimmed = nameDraft.trim();
    if (trimmed.length === 0) {
      setRenameAvail("idle");
      setRenameMsg("");
      return;
    }
    const v = validateTrainerName(nameDraft);
    if (!v.ok) {
      setRenameAvail("invalid");
      setRenameMsg(claimErrorMessage(v.error));
      return;
    }
    if (v.name.toLowerCase() === trainerName.toLowerCase()) {
      setRenameAvail("available");
      setRenameMsg("Current name");
      return;
    }
    setRenameAvail("checking");
    setRenameMsg("Checking…");
    const t = window.setTimeout(async () => {
      const ok = await isTrainerNameAvailable(v.name);
      if (nameDraft.trim() !== v.name) return;
      if (ok) {
        setRenameAvail("available");
        setRenameMsg("Name available");
      } else {
        setRenameAvail("taken");
        setRenameMsg(claimErrorMessage("taken"));
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [nameDraft, renameOpen, trainerName]);

  if (!hydrated || !hasOnboarded || !pokemon) return null;

  const rank = rankForLevel(level);

  const accuracy = stats.answered > 0 ? Math.round((stats.correct / stats.answered) * 100) : 0;
  const avgTime =
    stats.answered > 0 ? Math.round(stats.totalAnswerTime / stats.answered / 100) / 10 : 0;

  async function saveName() {
    const v = validateTrainerName(nameDraft);
    if (!v.ok) {
      setRenameAvail("invalid");
      setRenameMsg(claimErrorMessage(v.error));
      return;
    }
    if (v.name.toLowerCase() === trainerName.toLowerCase()) {
      setRenameOpen(false);
      setEditingName(false);
      return;
    }
    setRenaming(true);
    try {
      await bootstrapSocial();
      const res = await claimTrainerName(v.name);
      if (!res.ok) {
        if (res.error === "taken") setRenameAvail("taken");
        else if (res.error === "length" || res.error === "chars") setRenameAvail("invalid");
        else setRenameAvail("idle");
        setRenameMsg(claimErrorMessage(res.error));
        return;
      }
      setName(v.name);
      useGameStore.getState().setNameReconciled(true);

      setRenameOpen(false);
      setEditingName(false);
      setRenameMsg("");
      setRenameAvail("idle");
      toast.success("Trainer name updated!");
    } finally {
      setRenaming(false);
    }
  }

  // Deliberately NOT the store's `reset()` + navigate. That left the audio
  // settings, the Supabase session and every module-level cache in place, so
  // the "new" trainer inherited the old one's sound preferences and — because
  // the account was unchanged — the old one's server-side cooldowns. See
  // lib/hard-reset.ts. It ends in a document reload, so there is nothing to
  // navigate to afterwards.
  function doReset() {
    void hardReset();
  }

  const winRate = stats.battles > 0 ? Math.round((stats.wins / stats.battles) * 100) : 0;
  // The same day streak Home's flame shows (lib/win-streak.ts).
  const weekStreak = dayStreak(battleLog).days;
  const nameGood = renameAvail === "available";
  const nameBad = renameAvail === "taken" || renameAvail === "invalid";

  return (
    <div className="h-full w-full overflow-y-auto pb-nav safe-x">
      <div className="flex flex-col gap-3.5 px-4 pb-6 pt-[calc(env(safe-area-inset-top)+6px)]">
        {/* Top bar (6.3): as on Home, with the pencil after your name (6.3b). */}
        <NaTopBar
          onAvatar={handleOpenCard}
          avatarLabel="Your trainer card"
          afterName={
            <button
              type="button"
              aria-label="Edit profile"
              onClick={() => {
                setNameDraft(trainerName);
                setRenameOpen(true);
              }}
              className="press flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-night-card-2 shadow-[0_3px_0_#141A3F]"
            >
              <NaGlossIcon kind="pencil" size={16} />
            </button>
          }
        />

        <EvolutionCard
          pokemon={pokemon}
          tp={trainingPoints[pokemon.id] ?? 0}
          lifetime={lifetimeTp(trainingPoints, trainingPointsSpent, pokemon.id)}
          onEvolve={(target) => {
            const ok = evolvePartner(target);
            if (ok) {
              setEvolvingTo(target);
              setEvolvingFrom(pokemon);
            } else {
              toast.error("Evolution failed.");
            }
          }}
        />

        {/* Four clear names (6.3). Trainer battles = against other trainers; it opens their history until the Arena has it (7.2). */}
        <div className="grid grid-cols-2 gap-x-[18px] gap-y-3">
          {[
            { icon: <NaRewardIcon kind="Streak" size={26} />, value: weekStreak, label: "Daily streak" },
            { icon: <NaRewardIcon kind="XP" size={26} />, value: bestDayStreak(battleLog), label: "Best streak" },
            { icon: <NaIcon name="medal" size={26} className="text-reward-gold" />, value: arenaWins, label: "Trainer battles won", onClick: () => setPvpHistoryOpen(true) },
            { icon: <NaIcon name="arena" size={26} className="text-text-secondary" />, value: stats.wins, label: "Total battles won", onClick: () => setStatsOpen(true) },
          ].map((s) => (
            <button
              key={s.label}
              type="button"
              disabled={!s.onClick}
              onClick={s.onClick}
              className="na-glass flex flex-col gap-1 rounded-2xl p-3.5 text-left disabled:cursor-default"
            >
              <span className="flex items-center gap-1.5">
                {s.icon}
                <span className="na-display-m text-foreground">{s.value.toLocaleString()}</span>
              </span>
              <span className="na-caption text-text-secondary">{s.label}</span>
            </button>
          ))}
        </div>

        {/* From today: friends, trophies, badges and settings. */}
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { icon: <NaGlossIcon kind="profile" size={28} />, title: "Add a friend", sub: friends.length ? `${friends.length} friend${friends.length === 1 ? "" : "s"}` : "No friends yet? Invite one!", onClick: () => setFriendsOpen(true) },
            { icon: <NaRewardIcon kind="Trophy" size={28} />, title: "Trophies", sub: `${unlocked.size}/${ACHIEVEMENTS.length} earned`, count: claimableCount, onClick: () => setTrophiesOpen(true) },
            { icon: <NaGlossIcon kind="shield" size={28} />, title: "Badges", sub: `${gymBadges.length}/${GYM_LEADERS.length} earned`, onClick: () => setBadgesOpen(true) },
            { icon: <NaGlossIcon kind="gear" size={28} />, title: "Settings", sub: "Sound & notifications", onClick: () => setSettingsOpen(true) },
          ].map((m) => (
            <button key={m.title} type="button" onClick={m.onClick} className="na-glass press flex items-center gap-2.5 rounded-[18px] p-3 text-left">
              <span className="shrink-0">{m.icon}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="na-body-strong text-foreground">{m.title}</span>
                <span className="na-caption text-text-secondary">{m.sub}</span>
              </span>
              {!!m.count && (
                <span className="na-label flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-primary px-1 text-foreground">{m.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Trainer card dialog */}
      <Dialog open={cardOpen} onOpenChange={setCardOpen}>
        <DialogContent className="max-w-sm overflow-hidden rounded-3xl bg-poke-cream p-0">
          <div className="relative bg-gradient-to-b from-primary/20 to-poke-cream px-6 pb-6 pt-8 text-center">
            <div className="font-pixel-xs text-primary uppercase">Trainer Card</div>

            <h3 className="mt-1 font-display-xl text-2xl font-extrabold text-foreground">
              {trainerName}
            </h3>
            <p className="font-pixel-xs text-foreground/70 uppercase">
              {rank} · LV {level}
            </p>
            <div className="mt-4 flex justify-center">
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-card p-1 shadow-pop">
                <img
                  src={trainerSpriteUrl(trainerSprite)}
                  alt={trainerName}
                  className="sprite h-20 w-20 object-contain"
                />
              </div>
            </div>
          </div>
          <div className="screen-x pb-6">
            <div className="grid grid-cols-3 gap-2">
              <CardStat label="Level" value={level} />
              <CardStat label="Pokédex" value={pokedexCount} />
              <CardStat label="Battles" value={stats.battles} />
            </div>
            <div className="mt-4 rounded-2xl bg-card p-4 shadow-card">
              <div className="font-pixel-xs text-foreground/55 uppercase">Friend Code</div>
              <div className="mt-0.5 text-2xl font-extrabold tracking-[0.15em] text-foreground">
                {friendCode ?? "------"}
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (friendCode) {
                      navigator.clipboard?.writeText(friendCode);
                      toast.success("Friend code copied!");
                    }
                  }}
                  className="flex-1 rounded-full"
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const link = inviteUrl(friendCode);
                    const text = `Add me on Pokémon Trivia Battle! Friend code: ${friendCode}\n${link}`;
                    if (navigator.share) navigator.share({ text }).catch(() => {});
                    else {
                      navigator.clipboard?.writeText(text);
                      toast.success("Invite copied!");
                    }
                  }}
                  className="flex-1 rounded-full"
                >
                  <Share2 className="mr-1.5 h-3.5 w-3.5" /> Share
                </Button>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setCardOpen(false);
                  setCardShareOpen(true);
                }}
                className="mt-2 w-full rounded-full"
              >
                <ImageDown className="mr-1.5 h-3.5 w-3.5" /> Save as image
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ShareCardDialog
        open={cardShareOpen}
        onClose={() => setCardShareOpen(false)}
        data={{
          type: "trainer-card",
          trainerName,
          trainerSpriteUrl: trainerSpriteUrl(trainerSprite),
          level,
          rank,
          friendCode: friendCode ?? "------",
          pokedexCount,
          wins: stats.wins,
          bestStreak: stats.bestStreak,
          acePokemonId: pokemon?.id ?? 0,
          aceShiny: false,
          dateISO: new Date().toISOString().slice(0, 10),
        }}
      />

      {/* Friends sheet */}
      <Sheet open={friendsOpen} onOpenChange={setFriendsOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <div className="font-pixel-xs text-primary">{friends.length} ADDED</div>
            <SheetTitle className="font-display-xl text-foreground">Friends</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="flex gap-2">
              <Input
                value={friendCodeInput}
                onChange={(e) => setFriendCodeInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleAddFriend();
                }}
                placeholder="ENTER CODE"
                maxLength={6}
                className="h-12 flex-1 rounded-full bg-card font-pixel text-sm uppercase tracking-[0.2em]"
              />
              <Button
                onClick={() => void handleAddFriend()}
                disabled={addingFriend}
                className="h-12 rounded-full px-5"
              >
                {addingFriend ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <UserPlus className="h-5 w-5" />
                )}
              </Button>
            </div>
            <div className="space-y-2">
              {friends.length === 0 ? (
                <div className="rounded-3xl bg-card p-6 text-center text-sm text-foreground/55 shadow-card">
                  No friends yet. Tap your name to open your Trainer Card and share your code!
                </div>
              ) : (
                friends.map((f) => (
                  <FriendRow
                    key={f.id}
                    friend={f}
                    onRemove={() => setFriendToRemove(f)}
                    onChallenge={() => void handleChallenge(f)}
                    challengeBusy={challengingId === f.id}
                  />
                ))
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Feedback sheet */}
      <Sheet
        open={feedbackOpen !== null}
        onOpenChange={(open) => {
          if (!open) {
            suppressSettingsClose();
            setFeedbackOpen(null);
          }
        }}
      >
        <SheetContent side="bottom" className="rounded-t-3xl bg-poke-cream">
          <SheetHeader>
            <SheetTitle className="font-display-xl text-foreground">
              {feedbackOpen === "bug" ? "Report a bug" : "Submit a suggestion"}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-3 pb-4">
            <Textarea
              value={feedbackMsg}
              onChange={(e) => setFeedbackMsg(e.target.value)}
              maxLength={2000}
              rows={5}
              placeholder={
                feedbackOpen === "bug"
                  ? "What happened? What did you expect to happen?"
                  : "What would make the game more fun?"
              }
              className="rounded-2xl bg-card"
            />
            <Input
              value={feedbackContact}
              onChange={(e) => setFeedbackContact(e.target.value)}
              maxLength={200}
              placeholder="Contact (optional — email or trainer name)"
              className="rounded-2xl bg-card"
            />
            <Button
              size="action"
              onClick={() => void submitFeedback()}
              disabled={sendingFeedback || feedbackMsg.trim().length < 10}
              className="w-full bg-primary text-primary-foreground shadow-pop"
            >
              {sendingFeedback ? "Sending…" : "Send"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Trophies sheet */}
      <Sheet
        open={trophiesOpen}
        onOpenChange={(o) => {
          playSfx(o ? "panel_open" : "panel_close");
          setTrophiesOpen(o);
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <div className="font-pixel-xs text-primary">
              {unlocked.size} OF {ACHIEVEMENTS.length} EARNED
              {claimableCount > 0 ? ` · ${claimableCount} TO CLAIM` : ""}
            </div>
            <SheetTitle className="font-display-xl text-foreground">Trophies</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2.5">
            {/* Unclaimed-but-earned first: the trophy you can act on should never
                be below the fold behind ones you have already collected. */}
            {[...ACHIEVEMENTS]
              .sort((a, b) => trophySortRank(a.id) - trophySortRank(b.id))
              .map((a) => {
                const got = unlocked.has(a.id);
                const claimed = claimedAchievements.includes(a.id);
                const reward = achievementReward(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-3xl p-4 shadow-card ${got ? "bg-card" : "bg-card/60"}`}
                  >
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${claimed ? "bg-poke-yellow/25" : "bg-muted"}`}
                    >
                      <AppIcon
                        src={claimed ? a.art : LOCK_ICON}
                        className={`h-9 w-9 ${claimed ? "" : "opacity-50"}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`font-display-md ${got ? "text-foreground" : "text-foreground/50"}`}
                      >
                        {a.name}
                      </div>
                      <div className="text-xs text-foreground/55">{a.desc}</div>
                      {reward && !claimed && (
                        // Shown on locked rows too — knowing the payout is half
                        // the reason to chase a trophy — but muted there so the
                        // rows you can actually claim still read first.
                        <div
                          className={`mt-0.5 text-xs font-semibold ${got ? "text-primary" : "text-foreground/40"}`}
                        >
                          {achievementRewardLabel(reward)}
                        </div>
                      )}
                    </div>
                    {claimed ? (
                      <Check className="h-5 w-5 shrink-0 text-hp-good" />
                    ) : got ? (
                      <Button
                        onClick={() => claimTrophy(a.id, a.name)}
                        className="h-9 shrink-0 rounded-full bg-primary px-4 font-bold text-primary-foreground shadow-pop"
                      >
                        Claim
                      </Button>
                    ) : null}
                  </div>
                );
              })}
          </div>
        </SheetContent>
      </Sheet>

      {/* Badges sheet */}
      <Sheet
        open={badgesOpen}
        onOpenChange={(o) => {
          playSfx(o ? "panel_open" : "panel_close");
          setBadgesOpen(o);
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <div className="font-pixel-xs text-primary">
              {gymBadges.length} OF {GYM_LEADERS.length} EARNED
            </div>
            <SheetTitle className="font-display-xl text-foreground">Badge case</SheetTitle>
          </SheetHeader>
          <div className="mt-3">
            <BadgesTab />
          </div>
        </SheetContent>
      </Sheet>

      {/* PvP match history sheet */}
      <Sheet open={pvpHistoryOpen} onOpenChange={setPvpHistoryOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <div className="font-pixel-xs text-primary">BATTLE LOG</div>
            <SheetTitle className="font-display-xl text-foreground">Battle History</SheetTitle>
          </SheetHeader>
          <div className="mt-3">
            <Button
              size="action"
              variant="outline"
              onClick={() => {
                setPvpHistoryOpen(false);
                void navigate({ to: "/arena" });
              }}
              className="w-full"
            >
              <Swords className="mr-1.5 h-4 w-4" /> Start a new battle in the Arena
            </Button>
          </div>
          <div className="mt-4">
            <BattleLogList entries={battleLog.slice(0, 30)} />
          </div>
          <div className="mt-4 font-pixel-xs text-primary">ASYNC PVP MATCHES</div>
          <div className="mt-2 space-y-2.5">
            {pvpMatches.length === 0 ? (
              <div className="rounded-3xl bg-card p-6 text-center text-sm text-foreground/55 shadow-card">
                No PvP matches yet. Challenge a friend from your Friends list!
              </div>
            ) : (
              pvpMatches.map((m) => {
                const iAmChallenger = m.challengerId === myPvpId;
                const opponentId = iAmChallenger ? m.opponentId : m.challengerId;
                const myScore = iAmChallenger ? m.challengerScore : m.opponentScore;
                const oppScore = iAmChallenger ? m.opponentScore : m.challengerScore;
                const opponentName = pvpProfiles[opponentId]?.trainer_name || "Trainer";
                const label =
                  m.status !== "completed"
                    ? m.status === "declined"
                      ? "Declined"
                      : m.status === "expired"
                        ? "Expired"
                        : "Pending"
                    : myScore === null || oppScore === null
                      ? "—"
                      : myScore > oppScore
                        ? "Won"
                        : myScore < oppScore
                          ? "Lost"
                          : "Tied";
                const resumable = m.status === "pending";
                const row = (
                  <div className="flex items-center justify-between rounded-3xl bg-card p-4 shadow-card">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display-md text-foreground">
                        vs {opponentName}
                      </div>
                      <div className="text-xs text-foreground/55">
                        {myScore ?? "—"} : {oppScore ?? "—"}
                        {resumable ? " · tap to resume" : ""}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 rounded-full px-3 py-1 font-pixel-xs ${
                        label === "Won"
                          ? "bg-hp-good/15 text-hp-good"
                          : label === "Lost"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-muted text-foreground/55"
                      }`}
                    >
                      {label}
                    </div>
                  </div>
                );
                return resumable ? (
                  <button
                    key={m.id}
                    className="block w-full text-left transition press-lg"
                    onClick={() => {
                      setPvpHistoryOpen(false);
                      void navigate({ to: "/pvp/$matchId", params: { matchId: m.id } });
                    }}
                  >
                    {row}
                  </button>
                ) : (
                  <div key={m.id}>{row}</div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Settings sheet. Feedback/Rename/Repick are separate Radix Dialog
          roots stacked on top of it (not nested in the JSX tree), so Radix's
          dismissable-layer stack can misattribute the CHILD's closing
          interaction as an "outside click" on this Sheet too. Guard against
          that: only let an external close request through when no child
          overlay is open — an explicit close (the X / Continue button) always
          still works via setSettingsOpen(false) directly. */}
      <Sheet
        open={settingsOpen}
        onOpenChange={(open) => {
          if (!open && suppressSettingsCloseRef.current) return;
          setSettingsOpen(open);
        }}
      >
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[85vh] overflow-y-auto"
        >
          <SheetHeader>
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-5">
            <section>
              <div className="mb-2 font-pixel-xs uppercase text-foreground/45">General</div>
              <div className="overflow-hidden rounded-3xl bg-card shadow-card divide-y divide-border">
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <Music className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Music</div>
                      <div className="text-xs text-foreground/55">Background themes</div>
                    </div>
                  </div>
                  <Switch
                    checked={musicOn}
                    onCheckedChange={(v) => {
                      setMusicOn(v);
                      setMusicState(v);
                    }}
                  />
                </div>
                <div className="flex items-center gap-3 p-4">
                  <div className="text-xs font-semibold text-foreground/55">Music volume</div>
                  <Slider
                    className="flex-1"
                    value={[musicVol]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => {
                      setMusicVolState(v[0]);
                      setMusicVolume(v[0]);
                    }}
                  />
                  <div className="w-10 text-right text-xs font-semibold tabular-nums text-foreground">
                    {musicVol}%
                  </div>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      {sfxOn ? (
                        <Volume2 className="h-5 w-5 text-foreground" />
                      ) : (
                        <VolumeX className="h-5 w-5 text-foreground" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Sound effects</div>
                      <div className="text-xs text-foreground/55">Battle cries &amp; SFX</div>
                    </div>
                  </div>
                  <Switch
                    checked={sfxOn}
                    onCheckedChange={(v) => {
                      setSfxOn(v);
                      setSfxState(v);
                    }}
                  />
                </div>
                <div className="flex items-center gap-3 p-4">
                  <div className="text-xs font-semibold text-foreground/55">SFX volume</div>
                  <Slider
                    className="flex-1"
                    value={[sfxVol]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(v) => {
                      setSfxVolState(v[0]);
                      setSfxVolume(v[0]);
                    }}
                    onValueCommit={() => playSfx("tap")}
                  />
                  <div className="w-10 text-right text-xs font-semibold tabular-nums text-foreground">
                    {sfxVol}%
                  </div>
                </div>
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <ZapOff className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Reduce motion</div>
                      <div className="text-xs text-foreground/55">
                        Minimize animations and effects
                      </div>
                    </div>
                  </div>
                  <Switch checked={reducedMotion} onCheckedChange={(v) => setReducedMotion(v)} />
                </div>
                {pushSupported() && (
                  <div className="flex items-center justify-between p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                        {pushSubscribed ? (
                          <Bell className="h-5 w-5 text-foreground" />
                        ) : (
                          <BellOff className="h-5 w-5 text-foreground" />
                        )}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-foreground">Notifications</div>
                        <div className="text-xs text-foreground/55">
                          Mode reminders, friend requests &amp; more
                        </div>
                      </div>
                    </div>
                    <Switch
                      checked={pushSubscribed}
                      disabled={pushBusy}
                      onCheckedChange={(v) => void togglePush(v)}
                    />
                  </div>
                )}
              </div>
            </section>

            <section>
              <div className="mb-2 font-pixel-xs uppercase text-foreground/45">Feedback</div>
              <div className="overflow-hidden rounded-3xl bg-card shadow-card divide-y divide-border">
                <button
                  onClick={() => setFeedbackOpen("suggestion")}
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <Lightbulb className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        Submit a suggestion
                      </div>
                      <div className="text-xs text-foreground/55">
                        Ideas to make the game better
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
                <button
                  onClick={() => setFeedbackOpen("bug")}
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <Bug className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Report a bug</div>
                      <div className="text-xs text-foreground/55">
                        Something broken? Tell us about it
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
              </div>
            </section>

            <section>
              <div className="mb-2 font-pixel-xs uppercase text-foreground/45">Community</div>
              <div className="overflow-hidden rounded-3xl bg-card shadow-card divide-y divide-border">
                {/* An <a>, not a router Link: this leaves the app. rel=noreferrer
                    as well as noopener so the Facebook tab gets no referrer. */}
                <a
                  href={FACEBOOK_PAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <Facebook className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {FACEBOOK_PAGE_NAME} on Facebook
                      </div>
                      <div className="text-xs text-foreground/55">
                        News, events and new questions
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </a>
                <button
                  onClick={() => {
                    const url = FACEBOOK_PAGE_URL;
                    // Native share sheet where there is one (this is a PWA on a
                    // phone most of the time); clipboard is the desktop fallback.
                    if (typeof navigator !== "undefined" && navigator.share) {
                      void navigator
                        .share({ title: FACEBOOK_PAGE_NAME, url })
                        .catch(() => undefined);
                      return;
                    }
                    void navigator.clipboard
                      ?.writeText(url)
                      .then(() => toast.success("Facebook page link copied"))
                      .catch(() => toast.error("Could not copy the link"));
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-muted">
                      <Share2 className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Share the page</div>
                      <div className="text-xs text-foreground/55">
                        Invite a friend to follow along
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
              </div>
            </section>

            <section>
              <div className="mb-2 font-pixel-xs uppercase text-foreground/45">Trainer</div>
              <div className="overflow-hidden rounded-3xl bg-card shadow-card divide-y divide-border">
                <button
                  onClick={() => {
                    setNameDraft(trainerName);
                    setRenameOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div>
                    <div className="text-sm font-semibold text-foreground">Rename trainer</div>
                    <div className="text-xs text-foreground/55 truncate">
                      Currently: {trainerName}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
                <button
                  onClick={() => {
                    setTrainerPickerOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <img
                        src={trainerSpriteUrl(trainerSprite)}
                        alt=""
                        className="sprite h-8 w-8 object-contain"
                      />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Repick avatar</div>
                      <div className="text-xs text-foreground/55 truncate">
                        Currently: {trainerSprite}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
                <button
                  onClick={() => {
                    setPickerOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
                      <PokemonSprite id={pokemon.id} alt="" className="sprite h-8 w-8" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Repick partner</div>
                      <div className="text-xs text-foreground/55 truncate">
                        Currently: {pokemon.name}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
                <button
                  onClick={() => {
                    setBackdropPickerOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition press-lg"
                >
                  <div className="flex items-center gap-3">
                    {/* The thumbnail IS the setting — a name alone tells a
                        player nothing about art they have not seen. */}
                    <img
                      src={versusBackdropSrc(versusBackdropId)}
                      alt=""
                      className="h-10 w-10 shrink-0 rounded-2xl object-cover"
                    />
                    <div>
                      <div className="text-sm font-semibold text-foreground">Battle background</div>
                      <div className="text-xs text-foreground/55 truncate">
                        Currently: {versusBackdrop(versusBackdropId).label}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-foreground/40" />
                </button>
              </div>
            </section>

            <section>
              <div className="mb-2 font-pixel-xs uppercase text-destructive/70">Danger zone</div>
              <button
                onClick={() => {
                  playSfx("warning");
                  setResetOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-3xl bg-card p-4 shadow-card transition press"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-destructive/10">
                  <RotateCcw className="h-5 w-5 text-destructive" />
                </div>
                <div className="text-left">
                  <div className="text-sm font-semibold text-destructive">Reset progress</div>
                  <div className="text-xs text-foreground/55">Wipes XP, badges & Pokédex</div>
                </div>
              </button>
            </section>
          </div>
        </SheetContent>
      </Sheet>

      {/* All stats sheet */}
      <Sheet open={statsOpen} onOpenChange={setStatsOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl bg-poke-cream max-h-[80vh] overflow-y-auto"
        >
          <SheetHeader>
            <div className="font-pixel-xs text-primary">CAREER STATS</div>
            <SheetTitle className="font-display-xl text-foreground">All stats</SheetTitle>
          </SheetHeader>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <StatBox label="Battles" value={stats.battles} />
            <StatBox label="Wins" value={stats.wins} />
            <StatBox label="Losses" value={stats.losses} />
            <StatBox label="Win rate" value={`${winRate}%`} />
            <StatBox label="Best streak" value={stats.bestStreak} />
            <StatBox label="Accuracy" value={`${accuracy}%`} />
            <StatBox label="Avg time" value={`${avgTime}s`} />
            <StatBox label="Questions" value={stats.answered} />
            <StatBox label="Correct" value={stats.correct} />
          </div>
        </SheetContent>
      </Sheet>

      {/* 6.3b Edit profile, from the pencil (and Settings > Rename): name, avatar, partner. */}
      <NaSheet
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open) suppressSettingsClose();
          setRenameOpen(open);
        }}
        title="Edit profile"
        body="Change your name, avatar, or partner anytime!"
        primary={{
          label: renaming ? "Saving…" : "Save",
          onClick: () => void saveName(),
          disabled: renaming || renameAvail === "checking" || nameBad || !nameDraft.trim(),
        }}
        secondary={{ label: "Cancel", onClick: () => setRenameOpen(false) }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="na-label uppercase text-text-secondary">Trainer name</span>
          <span
            className={`flex h-[54px] items-center gap-2 rounded-[14px] border-2 bg-night-deep/60 px-3.5 ${
              nameGood ? "border-success" : nameBad ? "border-danger" : "border-white/[0.16]"
            }`}
          >
            <input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              maxLength={TRAINER_NAME_MAX}
              aria-invalid={nameBad}
              className="na-headline w-full min-w-0 bg-transparent text-foreground outline-none"
            />
            {nameGood && renameMsg !== "Current name" && (
              <span className="na-caption flex shrink-0 items-center gap-1 text-success">
                <NaIcon name="check" size={16} /> {renameMsg}
              </span>
            )}
          </span>
          {(nameBad || renameAvail === "checking") && (
            <span className={`na-caption ${nameBad ? "text-danger" : "text-text-muted"}`}>{renameMsg}</span>
          )}
        </label>
        <span className="na-label uppercase text-text-secondary">Avatar</span>
        <NaGlassRow
          lead={
            <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border-2 border-reward-gold bg-night-card-2">
              <img src={trainerSpriteUrl(trainerSprite)} alt="" className="sprite h-12 w-12 object-contain" />
            </span>
          }
          title={TRAINER_SPRITES.find((t) => t.id === trainerSprite)?.name ?? trainerSprite}
          sub="Your avatar"
          trailing={
            <NaButton kind="secondary" size="M" onClick={() => setTrainerPickerOpen(true)}>
              Change
            </NaButton>
          }
        />
        <span className="na-label uppercase text-text-secondary">Partner</span>
        <NaGlassRow
          lead={<FitSprite id={pokemon.id} size={33} />}
          title={pokemon.name}
          sub="Your partner"
          trailing={
            <NaButton kind="secondary" size="M" onClick={() => setPickerOpen(true)}>
              Change
            </NaButton>
          }
        />
      </NaSheet>

      <AlertDialog open={!!friendToRemove} onOpenChange={(o) => !o && setFriendToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove friend?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {friendToRemove?.trainer_name ?? "this trainer"} from your friends list? You
              can add them back anytime with their friend code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (friendToRemove) void handleRemoveFriend(friendToRemove.id);
                setFriendToRemove(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={resetOpen} onOpenChange={setResetOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all progress?</AlertDialogTitle>
            <AlertDialogDescription>
              This erases everything on this device — your trainer, level, items, stats and
              settings — and starts a brand-new account, so game cooldowns start over too. It
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doReset}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Pokémon picker */}
      <Dialog
        open={pickerOpen}
        onOpenChange={(open) => {
          if (!open) suppressSettingsClose();
          setPickerOpen(open);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change partner</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or type..."
              className="pl-10"
            />
          </div>
          <PartnerTypeFilter options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
          <div className="grid grid-cols-3 gap-2">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPokemon(p);
                  suppressSettingsClose();
                  setPickerOpen(false);
                  toast.success(`${p.name} chosen!`);
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition press hover:border-primary"
              >
                <PokemonSprite id={p.id} alt={p.name} className="sprite h-14 w-14" />
                <div className="text-[11px] font-semibold">{p.name}</div>
                {/* Type is what grants the ability, and it's what the chips
                    filter on — showing it here makes the filter legible. */}
                <div className="mt-0.5">
                  <TypeChip type={p.types[0]} selected size="sm" />
                </div>
              </button>
            ))}
            {results.length === 0 && (
              <div className="col-span-3 rounded-2xl bg-muted/40 p-5 text-center text-xs text-muted-foreground">
                {/* An empty POOL and an empty FILTER need different advice —
                    telling someone with 200 captures to go capture more is
                    nonsense when they have simply filtered to a type they
                    haven't caught yet. */}
                {partnerPool.length === 0
                  ? "Capture Pokémon in battle to unlock them as partners!"
                  : "None of your Pokémon match that search."}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Battle background picker. Portrait thumbnails at the shape they are
          actually drawn in — a square crop of a 12:13 backdrop hides most of
          what the player is choosing between. Lazy so opening Settings does
          not pull 2 MB of artwork nobody asked to see. */}
      <Dialog
        open={backdropPickerOpen}
        onOpenChange={(open) => {
          if (!open) suppressSettingsClose();
          setBackdropPickerOpen(open);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Battle background</DialogTitle>
          </DialogHeader>
          <p className="-mt-2 text-xs text-foreground/55">
            Select your preferred background for Battle Arena
          </p>
          {/* What a locked one costs, and how close the player is to affording
              it. Shown once above the grid rather than on every tile — the
              price is the same for all of them, and 18 copies of it is noise. */}
          {VERSUS_BACKDROPS.some((b) => !ownsBackdrop(b.id, ownedBackdropIds)) && (
            <div className="-mt-1 flex items-center justify-between rounded-2xl bg-muted/60 px-3 py-2 text-[11px]">
              <span className="text-foreground/60">Locked backgrounds</span>
              <span className="font-semibold text-foreground">
                <span className={coins >= BACKDROP_COIN_COST ? "" : "text-destructive"}>
                  {BACKDROP_COIN_COST.toLocaleString()} coins
                </span>
                {" + "}
                <span
                  className={
                    versusBackdropBattles >= BACKDROP_BATTLE_COST ? "" : "text-destructive"
                  }
                >
                  {Math.min(versusBackdropBattles, BACKDROP_BATTLE_COST)}/{BACKDROP_BATTLE_COST}{" "}
                  battles
                </span>
              </span>
            </div>
          )}
          {/* auto-rows-min: without it the grid stretches its rows to fill the
              60vh box, squashing each tile to 78px and clipping the label off
              the bottom of its own button. */}
          <div className="grid max-h-[60vh] auto-rows-min grid-cols-3 gap-2 overflow-y-auto">
            {VERSUS_BACKDROPS.map((b) => {
              const active = versusBackdrop(versusBackdropId).id === b.id;
              const owned = ownsBackdrop(b.id, ownedBackdropIds);
              return (
                <button
                  key={b.id}
                  onClick={() => {
                    if (!owned) {
                      setBackdropToBuy(b.id);
                      return;
                    }
                    setVersusBackdropId(b.id);
                    // Closing programmatically skips this dialog's own
                    // onOpenChange, so the guard has to be raised by hand —
                    // otherwise Radix reads the same click as an outside
                    // click on the Settings sheet and closes that too.
                    suppressSettingsClose();
                    setBackdropPickerOpen(false);
                    playSfx("tap");
                    toast.success(`Background set to ${b.label}!`);
                  }}
                  aria-pressed={active}
                  className="overflow-hidden rounded-2xl text-left transition press"
                >
                  {/* Colour marks the choice, not a frame: the equipped one is
                      the only tile in full colour, everything else desaturates.
                      Locked tiles go further and carry a padlock, so "not mine
                      yet" reads differently from "mine, just not equipped". */}
                  <div className="relative">
                    <img
                      src={versusBackdropSrc(b.id)}
                      alt=""
                      loading="lazy"
                      className="aspect-[12/13] w-full object-cover transition-[filter] duration-200"
                      style={{
                        filter: active
                          ? "none"
                          : owned
                            ? "grayscale(1)"
                            : "grayscale(1) brightness(0.6)",
                      }}
                    />
                    {!owned && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <AppIcon src={LOCK_ICON} className="h-8 w-8 drop-shadow" />
                      </div>
                    )}
                  </div>
                  <div
                    className={`truncate px-1.5 py-1 text-[11px] font-semibold ${
                      active ? "text-foreground" : "text-foreground/50"
                    }`}
                  >
                    {b.label}
                  </div>
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Buy confirmation. A separate dialog rather than a tap-to-buy tile:
          2,000 coins is most of a session's earnings, and a mis-tap in a grid
          of eighteen thumbnails should not spend it. */}
      <AlertDialog
        open={backdropToBuy !== null}
        onOpenChange={(open) => {
          if (!open) setBackdropToBuy(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unlock {backdropToBuy ? versusBackdrop(backdropToBuy).label : "this background"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {BACKDROP_COIN_COST.toLocaleString()} coins and {BACKDROP_BATTLE_COST} Battle Arena
              battles. You have {coins.toLocaleString()} coins and{" "}
              {Math.min(versusBackdropBattles, BACKDROP_BATTLE_COST)} of {BACKDROP_BATTLE_COST}{" "}
              battles banked — the battle count starts again after each unlock.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = backdropToBuy;
                setBackdropToBuy(null);
                if (!id) return;
                const res = buyVersusBackdrop(id);
                if (res.ok) {
                  playSfx("tap");
                  toast.success(`${versusBackdrop(id).label} unlocked and equipped!`);
                  return;
                }
                // Say which half is short — "can't afford it" leaves the player
                // guessing which of the two prices they have not met.
                toast.error(
                  res.reason === "coins"
                    ? `You need ${BACKDROP_COIN_COST.toLocaleString()} coins.`
                    : res.reason === "battles"
                      ? `Play ${BACKDROP_BATTLE_COST - versusBackdropBattles} more Arena battle${
                          BACKDROP_BATTLE_COST - versusBackdropBattles === 1 ? "" : "s"
                        } first.`
                      : "That background is not available.",
                );
              }}
            >
              Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trainer picker */}
      <Dialog
        open={trainerPickerOpen}
        onOpenChange={(open) => {
          if (!open) suppressSettingsClose();
          setTrainerPickerOpen(open);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change trainer</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={trainerQuery}
              onChange={(e) => setTrainerQuery(e.target.value)}
              placeholder="Search trainers..."
              className="pl-10"
            />
          </div>
          <div className="grid max-h-[60vh] grid-cols-3 gap-2 overflow-y-auto">
            {trainerResults.map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTrainerSprite(t.id);
                  // See the background picker: a programmatic close skips this
                  // dialog's onOpenChange, so the Settings sheet behind it
                  // needs the guard raised by hand or it closes too.
                  suppressSettingsClose();
                  setTrainerPickerOpen(false);
                  toast.success("Trainer updated!");
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition press hover:border-primary"
              >
                <img
                  src={trainerSpriteUrl(t.id)}
                  alt={t.name}
                  crossOrigin="anonymous"
                  className="sprite h-16 w-16 object-contain"
                  loading="lazy"
                  onError={() =>
                    setBrokenTrainerIds((s) => {
                      const n = new Set(s);
                      n.add(t.id);
                      return n;
                    })
                  }
                />
                <div className="text-[11px] font-semibold capitalize">{t.name}</div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {evolvingFrom && evolvingTo && (
        <EvolutionScreen
          from={evolvingFrom}
          to={evolvingTo}
          onComplete={() => {
            setEvolvingFrom(null);
            setEvolvingTo(null);
            toast.success(`Evolved into ${evolvingTo.name}!`);
          }}
        />
      )}
    </div>
  );
}
