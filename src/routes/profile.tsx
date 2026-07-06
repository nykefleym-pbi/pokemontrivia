import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  RotateCcw,
  Check,
  Search,
  Volume2,
  VolumeX,
  Music,
  ChevronRight,
  Moon,
  Copy,
  Share2,
  UserPlus,
  Loader2,
  IdCard,
  ImageDown,
  Lightbulb,
  Bug,
  Bell,
  BellOff,
  Swords,
} from "lucide-react";
import { ShareCardDialog } from "@/components/share-card-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";
import { useGameStore } from "@/lib/store";
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
import { startBotPvpMatch } from "@/lib/pvp-live";
import { NearbyBattleSheet } from "@/components/NearbyBattleSheet";
import { fetchBattleQuestions } from "@/lib/api/trivia";
import { validateTrainerName, claimErrorMessage, TRAINER_NAME_MAX } from "@/lib/trainer-name";
import {
  rankForLevel,
  TRAINER_SPRITES,
  trainerSpriteUrl,
  difficultyForLevel,
} from "@/lib/game-data";
import { ALL_POKEMON, type PokeEntry } from "@/lib/pokemon-data";

import { EvolutionScreen } from "@/components/evolution-screen";
import { PokemonSprite } from "@/components/game-ui";
import {
  PartnerCard,
  CardStat,
  FriendRow,
  StatBox,
  BadgesTab,
  PokeballIcon,
} from "@/components/profile-parts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
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

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const navigate = useNavigate();
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);

  const stats = useGameStore((s) => s.stats);

  const setName = useGameStore((s) => s.setName);
  const setPokemon = useGameStore((s) => s.setPokemon);
  const setTrainerSprite = useGameStore((s) => s.setTrainerSprite);
  const reset = useGameStore((s) => s.reset);
  const battleLog = useGameStore((s) => s.battleLog);
  const flags = useGameStore((s) => s.flags);
  const peakLevel = useGameStore((s) => s.peakLevel);
  const pokedex = useGameStore((s) => s.pokedex);

  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const evolvePartner = useGameStore((s) => s.evolvePartner);
  const gymBadges = useGameStore((s) => s.gymBadges);
  const seenHashes = useGameStore((s) => s.seenQuestionHashes);
  const seenQuestions = useGameStore((s) => s.seenQuestions);
  const seenCuratedIds = useGameStore((s) => s.seenCuratedIds);
  const markQuestionsSeen = useGameStore((s) => s.markQuestionsSeen);
  const markCuratedSeen = useGameStore((s) => s.markCuratedSeen);
  const unlocked = useMemo(() => {
    const ctx = { stats, flags, peakLevel, pokedex } as Parameters<typeof unlockedAchievements>[0];
    return new Set(unlockedAchievements(ctx));
  }, [stats, flags, peakLevel, pokedex]);

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
  const [nearbyBattleOpen, setNearbyBattleOpen] = useState(false);
  const [trainingBusy, setTrainingBusy] = useState(false);
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
        difficulty: difficultyForLevel(level),
        seenHashes,
        seenSamples: seenQuestions.slice(-80),
        excludeIds: seenCuratedIds.slice(-500),
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
        const res = await enablePushNotifications();
        if (res.ok) {
          setPushSubscribed(true);
          toast.success("🔔 Notifications enabled!");
        } else {
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
  const [query, setQuery] = useState("");
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
  const darkMode = useGameStore((s) => s.darkMode);
  const setDarkMode = useGameStore((s) => s.setDarkMode);

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
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  // Re-picking is limited to Pokémon captured in the Pokédex (the current
  // partner always stays available). Onboarding still uses STARTING_PARTNERS.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ALL_POKEMON.filter(
      (p) =>
        (pokedex[p.id] || p.id === pokemon?.id) && (q ? p.name.toLowerCase().startsWith(q) : true),
    ).slice(0, 9);
  }, [query, pokedex, pokemon?.id]);
  const trainerResults = useMemo(() => {
    const q = trainerQuery.trim().toLowerCase();
    const pool = TRAINER_SPRITES.filter((t) => !brokenTrainerIds.has(t.id));
    if (!q) return pool.slice(0, 9);
    return pool.filter((t) => t.name.toLowerCase().startsWith(q)).slice(0, 9);
  }, [trainerQuery, brokenTrainerIds]);

  // 7-day activity heatmap — must run BEFORE the conditional return
  const heatmap = useMemo(() => {
    const days: Array<{ date: string; count: number }> = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: 0 });
    }
    for (const e of battleLog) {
      const k = new Date(e.timestamp).toISOString().slice(0, 10);
      const slot = days.find((x) => x.date === k);
      if (slot) slot.count++;
    }
    return days;
  }, [battleLog]);

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

  if (!hasOnboarded || !pokemon) return null;

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

  function doReset() {
    reset();
    navigate({ to: "/" });
  }

  const winRate = stats.battles > 0 ? Math.round((stats.wins / stats.battles) * 100) : 0;
  const trainerSince = new Date().toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const weekStreak = (() => {
    let n = 0;
    for (let i = heatmap.length - 1; i >= 0; i--) {
      if (heatmap[i].count > 0) n++;
      else break;
    }
    return n;
  })();
  const todayKey = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">
      <Toaster position="top-center" />

      {/* Hero strip */}
      <div className="px-5 pb-5 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-4"
        >
          <button
            onClick={handleOpenCard}
            className="relative shrink-0 rounded-full bg-card p-1 ring-4 ring-primary shadow-pop transition active:scale-95"
          >
            <img
              src={trainerSpriteUrl(trainerSprite)}
              alt={trainerSprite}
              className="sprite h-20 w-20 rounded-full object-contain"
            />
          </button>
          <div className="min-w-0 flex-1">
            <p className="font-pixel-xs text-primary uppercase truncate">
              {rank} · LV {level}
            </p>
            <button onClick={handleOpenCard} className="text-left">
              <h2 className="font-display-lg text-2xl font-extrabold text-foreground truncate">
                {trainerName}
              </h2>
              <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <IdCard className="h-3 w-3" /> Card
              </span>
            </button>
            <p className="mt-0.5 text-xs text-foreground/55 truncate">
              Trainer since {trainerSince}
            </p>
          </div>
        </motion.div>
      </div>

      <div className="px-5 pb-8 pt-4">
        {/* Partner card */}
        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setStatsOpen(true)}
            className="rounded-3xl bg-card p-4 text-left shadow-card transition active:scale-95"
          >
            <div className="font-pixel-xs text-foreground/55">BATTLES WON</div>
            <div className="mt-1 text-3xl font-extrabold text-foreground">{stats.wins}</div>
            <div className="mt-1 text-xs font-semibold text-hp-good">{winRate}% win rate</div>
          </button>
          <button
            onClick={() => setFriendsOpen(true)}
            className="rounded-3xl bg-card p-4 text-left shadow-card transition active:scale-95"
          >
            <div className="font-pixel-xs text-foreground/55">FRIENDS</div>
            <div className="mt-1 text-3xl font-extrabold text-primary">{friends.length}</div>
            <div className="mt-1 text-xs text-foreground/60">tap to manage</div>
          </button>
        </div>

        {/* Partner card */}
        <PartnerCard
          pokemon={pokemon}
          tp={trainingPoints[pokemon.id] ?? 0}
          onChange={() => setPickerOpen(true)}
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

        {/* This week */}
        <div className="mt-3 rounded-3xl bg-card p-4 shadow-card">
          <div className="flex items-center justify-between">
            <div className="font-display-md text-foreground">This week</div>
            <div className="font-pixel-xs text-primary">{weekStreak}-DAY STREAK 🔥</div>
          </div>
          <div className="mt-3 flex justify-between gap-1">
            {heatmap.map((d) => {
              const played = d.count > 0;
              const isToday = d.date === todayKey;
              return (
                <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${isToday ? "ring-2 ring-primary ring-offset-1" : ""}`}
                    title={`${d.date}: ${d.count}`}
                  >
                    <PokeballIcon
                      className={`h-8 w-8 text-primary ${played ? "" : "opacity-30 grayscale"}`}
                    />
                  </div>
                  <div className="font-pixel-xs text-foreground/50 uppercase">
                    {new Date(d.date)
                      .toLocaleDateString(undefined, { weekday: "short" })
                      .slice(0, 3)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Trophies / Badges / PvP / Settings buttons */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            onClick={() => setTrophiesOpen(true)}
            className="flex flex-col items-center gap-1 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-poke-yellow/20 text-2xl">
              🏆
            </div>
            <span className="font-display-md text-foreground">Trophies</span>
            <span className="font-pixel-xs text-foreground/50">
              {unlocked.size}/{ACHIEVEMENTS.length}
            </span>
          </button>
          <button
            onClick={() => setBadgesOpen(true)}
            className="flex flex-col items-center gap-1 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-2xl">
              🎖
            </div>
            <span className="font-display-md text-foreground">Badges</span>
            <span className="font-pixel-xs text-foreground/50">
              {gymBadges.length}/{GYM_LEADERS.length}
            </span>
          </button>
          <button
            onClick={() => setPvpHistoryOpen(true)}
            className="flex flex-col items-center gap-1 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-destructive/10 text-2xl">
              <Swords className="h-5 w-5 text-destructive" />
            </div>
            <span className="font-display-md text-foreground">PvP</span>
            <span className="font-pixel-xs text-foreground/50">match history</span>
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex flex-col items-center gap-1 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-2xl">
              ⚙️
            </div>
            <span className="font-display-md text-foreground">Settings</span>
            <span className="font-pixel-xs text-foreground/50">&nbsp;</span>
          </button>
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
          <div className="px-5 pb-6">
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
                    const link = friendCode
                      ? `https://pokemontriviabattle.vercel.app/refer?code=${friendCode}`
                      : "https://pokemontriviabattle.vercel.app/";
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
              onClick={() => void submitFeedback()}
              disabled={sendingFeedback || feedbackMsg.trim().length < 10}
              className="h-12 w-full rounded-full bg-primary font-bold text-primary-foreground shadow-pop"
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
            </div>
            <SheetTitle className="font-display-xl text-foreground">Trophies</SheetTitle>
          </SheetHeader>
          <div className="mt-3 space-y-2.5">
            {[...ACHIEVEMENTS]
              .sort((a, b) => Number(unlocked.has(b.id)) - Number(unlocked.has(a.id)))
              .map((a) => {
                const got = unlocked.has(a.id);
                return (
                  <div
                    key={a.id}
                    className={`flex items-center gap-3 rounded-3xl p-4 shadow-card ${got ? "bg-card" : "bg-card/60"}`}
                  >
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl ${got ? "bg-poke-yellow/25" : "bg-muted"}`}
                    >
                      {got ? a.icon : "🔒"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`font-display-md ${got ? "text-foreground" : "text-foreground/50"}`}
                      >
                        {a.name}
                      </div>
                      <div className="text-xs text-foreground/55">{a.desc}</div>
                    </div>
                    {got && <Check className="h-5 w-5 shrink-0 text-hp-good" />}
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
            <div className="font-pixel-xs text-primary">RECENT MATCHES</div>
            <SheetTitle className="font-display-xl text-foreground">PvP history</SheetTitle>
          </SheetHeader>
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => {
                setPvpHistoryOpen(false);
                setNearbyBattleOpen(true);
              }}
              className="h-12 flex-1 rounded-full"
            >
              <Swords className="mr-1.5 h-4 w-4" /> Nearby Battle
            </Button>
            <Button
              variant="secondary"
              disabled={trainingBusy}
              onClick={async () => {
                if (trainingBusy) return;
                setTrainingBusy(true);
                try {
                  const s = useGameStore.getState();
                  const data = await fetchBattleQuestions({
                    difficulty: difficultyForLevel(s.level),
                    seenHashes: s.seenQuestionHashes,
                    seenSamples: s.seenQuestions.slice(-80),
                    excludeIds: s.seenCuratedIds.slice(-500),
                    flowSeed: Math.floor(Math.random() * 1_000_000),
                  });
                  if (!data.questions || data.questions.length < 5) {
                    toast.error("Couldn't prepare the battle. Try again.");
                    return;
                  }
                  const res = await startBotPvpMatch(data.questions, s.pokemon?.id ?? null);
                  if (!res.ok) {
                    toast.error("Couldn't start training. Try again.");
                    return;
                  }
                  s.markQuestionsSeen(data.questions.map((q) => q.question));
                  s.markCuratedSeen(data.servedIds ?? []);
                  setPvpHistoryOpen(false);
                  void navigate({ to: "/pvp/live/$matchId", params: { matchId: res.matchId } });
                } catch (e) {
                  console.warn("[profile] startTraining failed:", e);
                  toast.error("Couldn't start training. Try again.");
                } finally {
                  setTrainingBusy(false);
                }
              }}
              className="h-12 flex-1 rounded-full"
            >
              {trainingBusy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Swords className="mr-1.5 h-4 w-4" />
              )}{" "}
              Training
            </Button>
          </div>
          <div className="mt-3 space-y-2.5">
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
                    className="block w-full text-left transition active:scale-[0.98]"
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

      <NearbyBattleSheet open={nearbyBattleOpen} onOpenChange={setNearbyBattleOpen} />

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
                      <Moon className="h-5 w-5 text-foreground" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-foreground">Dark mode</div>
                      <div className="text-xs text-foreground/55">Easier on the eyes at night</div>
                    </div>
                  </div>
                  {/* TODO: dark theme not yet implemented */}
                  <Switch
                    checked={darkMode}
                    onCheckedChange={(v) => {
                      setDarkMode(v);
                      if (v) playSfx("darkness");
                    }}
                  />
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
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
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
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
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
              <div className="mb-2 font-pixel-xs uppercase text-foreground/45">Trainer</div>
              <div className="overflow-hidden rounded-3xl bg-card shadow-card divide-y divide-border">
                <button
                  onClick={() => {
                    setNameDraft(trainerName);
                    setRenameOpen(true);
                  }}
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
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
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
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
                  className="flex w-full items-center justify-between p-4 text-left transition active:scale-[0.98]"
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
              </div>
            </section>

            <section>
              <div className="mb-2 font-pixel-xs uppercase text-destructive/70">Danger zone</div>
              <button
                onClick={() => {
                  playSfx("warning");
                  setResetOpen(true);
                }}
                className="flex w-full items-center gap-3 rounded-3xl bg-card p-4 shadow-card transition active:scale-95"
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

      {/* Rename trainer dialog */}
      <Dialog
        open={renameOpen}
        onOpenChange={(open) => {
          if (!open) suppressSettingsClose();
          setRenameOpen(open);
        }}
      >
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Rename trainer</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <div className="flex gap-2">
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                maxLength={TRAINER_NAME_MAX}
                className="h-10 rounded-full"
                autoFocus
              />
              <Button
                onClick={() => void saveName()}
                disabled={
                  renaming ||
                  renameAvail === "checking" ||
                  renameAvail === "taken" ||
                  renameAvail === "invalid" ||
                  !nameDraft.trim()
                }
                className="rounded-full"
              >
                {renaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
            </div>
            <p
              className={`text-xs ${
                renameAvail === "available"
                  ? "text-green-600"
                  : renameAvail === "taken" || renameAvail === "invalid"
                    ? "text-red-600"
                    : "text-foreground/55"
              }`}
            >
              {renameMsg || "3–16 characters · letters, numbers, spaces, _ and -"}
            </p>
          </div>
        </DialogContent>
      </Dialog>

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
              This will erase your trainer, level, items, and stats. This cannot be undone.
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
              placeholder="Search..."
              className="pl-10"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {results.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPokemon(p);
                  setPickerOpen(false);
                  toast.success(`${p.name} chosen!`);
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition active:scale-95 hover:border-primary"
              >
                <PokemonSprite id={p.id} alt={p.name} className="sprite h-14 w-14" />
                <div className="text-[11px] font-semibold">{p.name}</div>
              </button>
            ))}
            {results.length === 0 && (
              <div className="col-span-3 rounded-2xl bg-muted/40 p-5 text-center text-xs text-muted-foreground">
                Capture Pokémon in battle to unlock them as partners!
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
                  setTrainerPickerOpen(false);
                  toast.success("Trainer updated!");
                }}
                className="flex flex-col items-center rounded-2xl border-2 p-2 transition active:scale-95 hover:border-primary"
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
