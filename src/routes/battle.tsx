import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useGameStore } from "@/lib/store";
import { useStoreHydrated } from "@/lib/store-hydration";
import { PokemonSprite } from "@/components/game-ui";
import { difficultyForLevel } from "@/lib/game-data";
import { BattleScreen, type Trivia } from "@/components/battle-screen";
import { fetchBattleQuestions, fetchEliteQuestions, fetchDailyChallenge } from "@/lib/api/trivia";
import { playBgm } from "@/lib/audio";
import { ApiError } from "@/lib/api/client";
import { MegaRaidScreen } from "@/components/mega/MegaRaidScreen";
import { MegaLeaderboard } from "@/components/mega/MegaLeaderboard";
import { BattleHome, type MegaHomeState } from "@/components/battle-home";
import { ElitePendingTakeover } from "@/components/elite-pending-takeover";
import { LevelUpScreen } from "@/components/level-up-screen";

import {
  fetchActiveMegaEvent,
  MEGA_MAX_ATTEMPTS,
  MEGA_WIN_CORRECT,
  type MegaEvent,
} from "@/lib/mega/schedule";
import { ensureMegaQuestions } from "@/lib/mega/questions";
import { WHATS_NEW } from "@/lib/whats-new";
import { fetchMegaLeaderboard, getMyMegaRun, getMegaAttempts } from "@/lib/mega/runs";
import { nextPendingElite, type EliteMember } from "@/lib/elite-four";
import { findGymLeader, type GymLeader } from "@/lib/gym-leaders";
import { syncActivity } from "@/lib/social";

const ENGAGE_DELAY_MS = 10000; // safety cap: show carousel by now even if mega data never resolves

export const Route = createFileRoute("/battle")({
  component: BattlePage,
  validateSearch: (s: Record<string, unknown>) => ({
    autostart: s.autostart ? 1 : 0,
    mega: s.mega ? 1 : 0,
    mode: s.mode === "daily" ? "daily" : "battle",
  }),
});

function BattlePage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
  const hydrated = useStoreHydrated();
  const level = useGameStore((s) => s.level);
  const peakLevel = useGameStore((s) => s.peakLevel);
  const defeatedElites = useGameStore((s) => s.defeatedElites);
  const seenHashes = useGameStore((s) => s.seenQuestionHashes);
  const seenQuestions = useGameStore((s) => s.seenQuestions);
  const seenCuratedIds = useGameStore((s) => s.seenCuratedIds);
  const markQuestionsSeen = useGameStore((s) => s.markQuestionsSeen);
  const markCuratedSeen = useGameStore((s) => s.markCuratedSeen);
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [phase, setPhase] = useState<
    "home" | "loading" | "fighting" | "daily" | "elite" | "weekly" | "mega" | "megaLeaderboard"
  >("home");
  const [questions, setQuestions] = useState<Trivia[]>([]);
  const [eliteOpponent, setEliteOpponent] = useState<EliteMember | null>(null);
  const [weeklyOpponent, setWeeklyOpponent] = useState<GymLeader | null>(null);
  const [megaEvent, setMegaEvent] = useState<MegaEvent | null>(null);
  const [activeMega, setActiveMega] = useState<MegaEvent | null>(null);
  const [megaStats, setMegaStats] = useState<{
    rank: number;
    total: number;
    attempts: number;
    won: boolean;
  } | null>(null);
  const [battleKey, setBattleKey] = useState(0);

  const autoStartedRef = useRef(false);
  const megaAutoStartedRef = useRef(false);
  const dailyResult = useGameStore((s) => s.dailyResult);
  const today = new Date().toISOString().slice(0, 10);
  const dailyDone = dailyResult?.date === today;
  const whosThatHourKey = useGameStore((s) => s.whosThatHourKey);
  const pendingLevelUp = useGameStore((s) => s.pendingLevelUp);
  const clearPendingLevelUp = useGameStore((s) => s.clearPendingLevelUp);
  const engageDismissCount = useGameStore((s) => s.engageDismissCount);
  const lastSeenWhatsNew = useGameStore((s) => s.lastSeenWhatsNew);
  const markWhatsNewSeen = useGameStore((s) => s.markWhatsNewSeen);
  const engageDismissDate = useGameStore((s) => s.engageDismissDate);
  const recordEngageDismiss = useGameStore((s) => s.recordEngageDismiss);
  const engageShownThisSession = useGameStore((s) => s.engageShownThisSession);
  const setEngageShownThisSession = useGameStore((s) => s.setEngageShownThisSession);
  const [engageCards, setEngageCards] = useState<Array<{
    kind: "whatsnew" | "daily" | "weekly" | "whosthat" | "mega" | "megaleaderboard";
    title: string;
    desc: string;
    chip: string;
    cta: string;
    onPlay: () => void;
    heroSrc?: string;
    heroPokeId?: number;
  }> | null>(null);
  const [engageActive, setEngageActive] = useState(0);
  const engageShownRef = useRef(false);
  const [engageDelayPassed, setEngageDelayPassed] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setEngageDelayPassed(true), ENGAGE_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const initWeeklyLeague = useGameStore((s) => s.initWeeklyLeague);
  const startWeeklyLeagueAttempt = useGameStore((s) => s.startWeeklyLeagueAttempt);
  const recordWeeklyLeagueResult = useGameStore((s) => s.recordWeeklyLeagueResult);

  const pendingElite = nextPendingElite(peakLevel, defeatedElites);
  // The Elite Four takeover screen blocks the hub whenever an elite is pending
  // and we're not already in the elite battle.
  const eliteTakeover = !!pendingElite && phase !== "elite";

  // Home-screen Mega Raid card state (the raid entry moved here from the Battle
  // Arena tab). `null` while stats are still loading, `"none"` once we've
  // confirmed no raid is live, else the event with its disabled/reason state.
  const megaHomeState: MegaHomeState =
    megaStats === null
      ? null
      : !activeMega
        ? "none"
        : (() => {
            const won = megaStats.won;
            const exhausted = megaStats.attempts >= MEGA_MAX_ATTEMPTS;
            return {
              name: activeMega.name,
              megaId: activeMega.megaId,
              endsAt: activeMega.endsAt,
              disabled: won || exhausted,
              reason: won ? "cleared" : exhausted ? "exhausted" : "active",
            };
          })();

  // Background music per battle phase / mode. Keyed on `phase` (NOT level):
  // winning awards XP which can change `level` mid-battle — re-running this
  // would restart the battle BGM over the win/lose result music that
  // playBattleResult() just started. While the Elite Four takeover screen is
  // up, play the Elite Four Intro instead of the hub BGM.
  useEffect(() => {
    if (eliteTakeover) {
      playBgm("elite_intro");
      return;
    }
    switch (phase) {
      case "fighting":
        playBgm("battle_regular");
        break;
      case "daily":
        playBgm("daily");
        break;
      case "elite":
        playBgm("battle_elite");
        break;
      case "weekly":
        playBgm("weekly_league");
        break;
      case "mega":
        playBgm("mega");
        break;
      case "megaLeaderboard":
        playBgm("leaderboard");
        break;
      default:
        playBgm("home", { level });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, eliteTakeover]);

  // Keep the battle-hub band in sync with the player's level, but only while on
  // the hub (never during a battle or the elite takeover) so it can't override
  // the active track.
  useEffect(() => {
    const inBattle =
      phase === "fighting" ||
      phase === "daily" ||
      phase === "elite" ||
      phase === "weekly" ||
      phase === "mega" ||
      phase === "megaLeaderboard";
    if (!inBattle && !eliteTakeover) playBgm("home", { level });
  }, [level, phase, eliteTakeover]);

  useEffect(() => {
    initWeeklyLeague();
  }, [initWeeklyLeague]);

  const loadMegaStats = useCallback(async () => {
    const ev = await fetchActiveMegaEvent();
    if (!ev) {
      setActiveMega(null);
      setMegaStats({ rank: 0, total: 0, attempts: 0, won: false });
      return;
    }
    try {
      const [board, mineRun] = await Promise.all([
        fetchMegaLeaderboard(ev.id, 500),
        getMyMegaRun(ev.id),
      ]);
      const total = board.length;
      const rank = mineRun ? board.findIndex((r) => r.user_id === mineRun.user_id) + 1 : 0;
      const attempts = mineRun?.attempts ?? 0;
      const won = !!mineRun && mineRun.correct >= MEGA_WIN_CORRECT;
      setActiveMega(ev);
      setMegaStats({ rank, total, attempts, won });
    } catch {
      setActiveMega(ev);
      setMegaStats({ rank: 0, total: 0, attempts: 0, won: false });
    }
  }, []);

  useEffect(() => {
    void loadMegaStats();
  }, [loadMegaStats]);

  const prevPhaseRef = useRef(phase);
  useEffect(() => {
    const prev = prevPhaseRef.current;
    if (phase === "home" && (prev === "mega" || prev === "megaLeaderboard")) {
      void loadMegaStats();
    }
    prevPhaseRef.current = phase;
  }, [phase, loadMegaStats]);

  // Hide the persistent bottom nav while a Mega Raid or its end screens are on-screen,
  // so the nav pill can't overlay raid action buttons or be tapped by accident.
  useEffect(() => {
    const inMega = phase === "mega" || phase === "megaLeaderboard";
    if (!inMega) return;
    const { setBattleScreenActive } = useGameStore.getState();
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [phase]);

  // On mount: if a weekly battle was left in_progress (app closed mid-fight), count it as loss
  useEffect(() => {
    if (useGameStore.getState().weeklyLeague?.status === "in_progress") {
      recordWeeklyLeagueResult(false);
      toast.error("Previous Weekly League attempt counted as a loss.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated && !hasOnboarded) navigate({ to: "/" });
  }, [hydrated, hasOnboarded, navigate]);

  useEffect(() => {
    if (hasOnboarded && search.autostart === 1 && !autoStartedRef.current && phase === "home") {
      autoStartedRef.current = true;
      startBattle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOnboarded, search.autostart, phase]);

  useEffect(() => {
    if (hasOnboarded && search.mega === 1 && !megaAutoStartedRef.current && phase === "home") {
      megaAutoStartedRef.current = true;
      startMega();
    }
  }, [hasOnboarded, search.mega, phase]);

  async function startBattle() {
    if (pendingElite) {
      toast.error(`${pendingElite.name} blocks the way! Defeat them first.`);
      return;
    }
    setPhase("loading");
    try {
      const data = await fetchBattleQuestions({
        difficulty: difficultyForLevel(level),
        seenHashes,
        seenSamples: seenQuestions.slice(-80),
        excludeIds: seenCuratedIds.slice(-500),
        flowSeed: Math.floor(Math.random() * 1_000_000),
      });
      if (!data.questions || data.questions.length < 5) {
        toast.error("Couldn't prepare battle. Try again.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      markCuratedSeen(data.servedIds ?? []);
      setQuestions(data.questions);
      setPhase("fighting");
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        toast.error("Rate limited. Please wait a moment.");
        setPhase("home");
        return;
      }
      if (e instanceof ApiError && e.status === 402) {
        toast.error("AI credits exhausted. Add credits in Settings.");
        setPhase("home");
        return;
      }
      console.error(e);
      toast.error("Couldn't prepare battle. Try again.");
      setPhase("home");
    }
  }

  async function startElite() {
    if (!pendingElite) return;
    setPhase("loading");
    try {
      const data = await fetchEliteQuestions({
        type: pendingElite.type,
        memberName: `${pendingElite.title} ${pendingElite.name}`,
        difficultyTiers: ["hard", "expert"],
        curatedTarget: 36,
        aiCount: 4,
        seenHashes,
        seenSamples: seenQuestions.slice(-80),
        flowSeed: Math.floor(Math.random() * 1_000_000),
      });
      if (!data.questions?.length) {
        toast.error("Couldn't prepare Elite battle.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      setEliteOpponent(pendingElite);
      setQuestions(data.questions);
      setPhase("elite");
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        toast.error("Rate limited.");
        setPhase("home");
        return;
      }
      if (e instanceof ApiError && e.status === 402) {
        toast.error("AI credits exhausted.");
        setPhase("home");
        return;
      }
      console.error(e);
      toast.error("Couldn't prepare Elite battle.");
      setPhase("home");
    }
  }

  async function startDaily() {
    if (dailyDone) return;
    setPhase("loading");
    try {
      const data = await fetchDailyChallenge();
      if (!data.questions?.length) {
        toast.error("Daily challenge unavailable. Try again later.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      setQuestions(data.questions);
      setPhase("daily");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load daily.");
      setPhase("home");
    }
  }

  async function startWeekly() {
    if (!weeklyLeague) return;
    if (weeklyLeague.status === "won" || weeklyLeague.status === "lost") return;
    const leader = findGymLeader(weeklyLeague.gymLeaderId);
    if (!leader) return;
    setPhase("loading");
    try {
      const data = await fetchEliteQuestions({
        type: leader.type,
        memberName: `Gym Leader ${leader.name}`,
        difficultyTiers: ["hard"],
        curatedTarget: 26,
        aiCount: 4,
        seenHashes,
        seenSamples: seenQuestions.slice(-80),
        flowSeed: Math.floor(Math.random() * 1_000_000),
      });
      if (!data.questions?.length) {
        toast.error("Couldn't prepare Weekly League.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      startWeeklyLeagueAttempt();
      void syncActivity("last_weekly_attempt");
      setWeeklyOpponent(leader);
      setQuestions(data.questions);
      setPhase("weekly");
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        toast.error("Rate limited.");
        setPhase("home");
        return;
      }
      if (e instanceof ApiError && e.status === 402) {
        toast.error("AI credits exhausted.");
        setPhase("home");
        return;
      }
      console.error(e);
      toast.error("Couldn't prepare Weekly League.");
      setPhase("home");
    }
  }

  async function startMega() {
    setPhase("loading");
    try {
      const ev = await fetchActiveMegaEvent();
      if (!ev) {
        toast.error("No Mega Raid is active right now.");
        setPhase("home");
        return;
      }
      const used = await getMegaAttempts(ev.id);
      if (used >= MEGA_MAX_ATTEMPTS) {
        toast.error("You've used all your Mega Raid attempts for this event.");
        setPhase("home");
        return;
      }
      const qs = await ensureMegaQuestions(ev);
      if (!qs.length) {
        toast.error("Mega Raid questions aren't ready yet. Try again soon.");
        setPhase("home");
        return;
      }
      setMegaEvent(ev);
      setQuestions(qs);
      setBattleKey((k) => k + 1);
      setPhase("mega");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't load the Mega Raid.");
      setPhase("home");
    }
  }

  async function openMegaLeaderboard() {
    const ev = megaEvent ?? (await fetchActiveMegaEvent());
    if (!ev) {
      toast.error("No Mega Raid leaderboard yet.");
      return;
    }
    setMegaEvent(ev);
    setPhase("megaLeaderboard");
  }

  function exitBattle() {
    setPhase("home");
    setQuestions([]);
    setEliteOpponent(null);
    setWeeklyOpponent(null);
    setBattleKey((k) => k + 1);
    useGameStore.getState().abortBattle();
  }

  useEffect(() => {
    if (!hasOnboarded) return;
    if (engageShownRef.current || engageShownThisSession) return;
    if (phase !== "home" || pendingElite) return;
    const dismissedToday = engageDismissDate === today ? engageDismissCount : 0;
    if (dismissedToday >= 3) return;
    const hasMega = !!activeMega && Date.parse(activeMega.endsAt) > Date.now();
    if (megaStats === null && !engageDelayPassed) return;
    const now = Date.now();
    const hourKey = Math.floor(now / 3_600_000);
    const msToNextDay =
      Date.UTC(
        new Date(now).getUTCFullYear(),
        new Date(now).getUTCMonth(),
        new Date(now).getUTCDate() + 1,
      ) - now;
    const dailyClock = `${Math.floor(msToNextDay / 3_600_000)}H ${String(Math.floor((msToNextDay % 3_600_000) / 60_000)).padStart(2, "0")}M`;
    const weeklyStatus = weeklyLeague?.status;
    const leader = weeklyLeague ? findGymLeader(weeklyLeague.gymLeaderId) : null;
    const cards: Array<{
      kind: "whatsnew" | "daily" | "weekly" | "whosthat" | "mega" | "megaleaderboard";
      title: string;
      desc: string;
      chip: string;
      cta: string;
      onPlay: () => void;
      heroSrc?: string;
      heroPokeId?: number;
    }> = [];
    // What's New leads the carousel until dismissed (once per release).
    if (lastSeenWhatsNew < WHATS_NEW.version) {
      cards.push({
        kind: "whatsnew",
        title: WHATS_NEW.title,
        desc: WHATS_NEW.bullets.join("\n"),
        chip: `UPDATE ${WHATS_NEW.version}`,
        cta: "Got it!",
        onPlay: () => markWhatsNewSeen(WHATS_NEW.version),
      });
    }
    const dailyIncluded = !dailyDone;
    if (dailyIncluded) {
      cards.push({
        kind: "daily",
        title: "Daily Quest is ready!",
        desc: "Beat Rotom in 10 fast questions for bonus XP.",
        chip: `RESETS IN ${dailyClock}`,
        cta: "Play Daily Quest",
        onPlay: startDaily,
      });
    }
    const weeklyIncluded = weeklyStatus !== "won" && weeklyStatus !== "lost";
    if (weeklyIncluded) {
      cards.push({
        kind: "weekly",
        title: "Weekly League is open!",
        desc:
          weeklyStatus === "in_progress"
            ? "Finish your run before the week resets."
            : "Challenge this week's Gym Leader and climb the ranks.",
        chip: "RESETS MONDAY",
        cta: "Enter Weekly League",
        onPlay: startWeekly,
        heroSrc: leader ? `/trainers/gym/${leader.trainerSpriteId}.png` : undefined,
      });
    }
    const whosThatIncluded = hourKey !== whosThatHourKey;
    if (whosThatIncluded) {
      cards.push({
        kind: "whosthat",
        title: "A new round is live!",
        desc: "Guess the hidden Pokémon to earn rewards.",
        chip: "NEW ROUND EVERY HOUR",
        cta: "Play now",
        onPlay: () => navigate({ to: "/whos-that-pokemon" }),
      });
    }
    if (hasMega && activeMega) {
      const s2 = Math.floor((Date.parse(activeMega.endsAt) - Date.now()) / 1000);
      const dd = Math.floor(s2 / 86400),
        hh = Math.floor((s2 % 86400) / 3600);
      const megaClock = dd > 0 ? `${dd}D ${hh}H` : `${hh}H`;
      const lbCopy =
        megaStats && megaStats.rank > 0
          ? `You're ranked #${megaStats.rank} of ${megaStats.total} by accuracy.`
          : megaStats && megaStats.total > 0
            ? `${megaStats.total} trainers competing — top 3 earn exclusive rewards.`
            : "Be the first to set the pace — top 3 earn exclusive rewards.";
      const attemptsUsed = megaStats?.attempts ?? 0;
      const exhausted = attemptsUsed >= MEGA_MAX_ATTEMPTS;
      // Once the boss is beaten (or tries are used up) stop advertising the
      // raid; the leaderboard card below stays until the event ends.
      const beaten = megaStats?.won ?? false;
      if (!exhausted && !beaten) {
        cards.push({
          kind: "mega",
          title: `${activeMega.name} appeared!`,
          desc: "Outsmart 50 brutal questions — only the sharpest trainer is crowned.",
          chip: `ENDS IN ${megaClock}`,
          cta: "Enter Mega Raid",
          onPlay: startMega,
          heroPokeId: activeMega.megaId,
        });
      }
      cards.push({
        kind: "megaleaderboard",
        title: `${activeMega.name} Rankings`,
        desc: lbCopy,
        chip: "LIVE RANKINGS",
        cta: "View Leaderboard",
        onPlay: openMegaLeaderboard,
      });
    }
    if (cards.length > 0) {
      engageShownRef.current = true;
      setEngageShownThisSession(true);
      setEngageActive(0);
      setEngageCards(cards);
    }
  }, [
    phase,
    pendingElite,
    today,
    dailyDone,
    weeklyLeague,
    whosThatHourKey,
    startDaily,
    startWeekly,
    navigate,
    activeMega,
    megaStats,
    startMega,
    openMegaLeaderboard,
    engageDelayPassed,
    engageDismissCount,
    engageDismissDate,
    engageShownThisSession,
    setEngageShownThisSession,
    hasOnboarded,
    lastSeenWhatsNew,
    markWhatsNewSeen,
  ]);

  const ENGAGE_THEME: Record<
    string,
    {
      cardBg: string;
      hero: string;
      ray: string;
      glow: string;
      labelBg: string;
      labelColor: string;
      label: string;
      chipBg: string;
      chipColor: string;
      chipStroke: string;
      ctaBg: string;
      ctaColor: string;
      ctaShadow: string;
      titleColor: string;
      descColor: string;
    }
  > = {
    daily: {
      cardBg: "var(--brand-cream)",
      hero: "radial-gradient(circle at 50% 42%, #FF8A3D 0%, #F0531F 52%, #D23A12 100%)",
      ray: "rgba(255,255,255,0.14)",
      glow: "rgba(255,224,130,0.6)",
      labelBg: "rgba(0,0,0,0.22)",
      labelColor: "#fff",
      label: "DAILY QUEST",
      chipBg: "#F6E6C4",
      chipColor: "#9A7320",
      chipStroke: "#B8862A",
      ctaBg: "var(--brand-red)",
      ctaColor: "#fff",
      ctaShadow: "#A82A20",
      titleColor: "var(--brand-ink)",
      descColor: "var(--brand-slate)",
    },
    weekly: {
      cardBg: "var(--brand-cream)",
      hero: "radial-gradient(circle at 50% 40%, #8A6BC9 0%, #5B3F95 60%, #3F2A6E 100%)",
      ray: "rgba(242,214,78,0.16)",
      glow: "rgba(242,214,78,0.45)",
      labelBg: "var(--brand-gold)",
      labelColor: "#3F2A6E",
      label: "WEEKLY LEAGUE",
      chipBg: "#ECE3F4",
      chipColor: "#5B3F95",
      chipStroke: "#6B4FA0",
      ctaBg: "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
      ctaColor: "#3F2A6E",
      ctaShadow: "var(--brand-gold-shadow)",
      titleColor: "var(--brand-ink)",
      descColor: "var(--brand-slate)",
    },
    whosthat: {
      cardBg: "linear-gradient(165deg, var(--brand-red) 0%, #B5341F 100%)",
      hero: "transparent",
      ray: "rgba(255,255,255,0.08)",
      glow: "transparent",
      labelBg: "var(--brand-gold)",
      labelColor: "#B5341F",
      label: "WHO'S THAT POKÉMON?",
      chipBg: "rgba(255,255,255,0.16)",
      chipColor: "#fff",
      chipStroke: "#fff",
      ctaBg: "var(--brand-gold)",
      ctaColor: "var(--brand-ink)",
      ctaShadow: "#C9AE2E",
      titleColor: "#fff",
      descColor: "rgba(255,255,255,0.82)",
    },
    mega: {
      cardBg: "var(--brand-cream)",
      hero: "radial-gradient(circle at 50% 34%, #2E3A5C 0%, var(--brand-ink) 66%)",
      ray: "rgba(242,214,78,0.16)",
      glow: "rgba(242,214,78,0.5)",
      labelBg: "rgba(0,0,0,0.3)",
      labelColor: "var(--brand-gold)",
      label: "⚡ LIMITED EVENT",
      chipBg: "#E9E1F4",
      chipColor: "#5B3F95",
      chipStroke: "#6B4FA0",
      ctaBg: "var(--brand-red)",
      ctaColor: "#fff",
      ctaShadow: "#A82A20",
      titleColor: "var(--brand-ink)",
      descColor: "var(--brand-slate)",
    },
    whatsnew: {
      cardBg: "var(--brand-cream)",
      hero: "radial-gradient(circle at 50% 40%, #F2D64E 0%, #E8A93C 62%, #C9822A 100%)",
      ray: "rgba(255,255,255,0.2)",
      glow: "rgba(255,255,255,0.5)",
      labelBg: "var(--brand-ink)",
      labelColor: "var(--brand-gold)",
      label: "WHAT'S NEW",
      chipBg: "#F6E6C4",
      chipColor: "#9A7320",
      chipStroke: "#B8862A",
      ctaBg: "var(--brand-red)",
      ctaColor: "#fff",
      ctaShadow: "#A82A20",
      titleColor: "var(--brand-ink)",
      descColor: "var(--brand-slate)",
    },
    megaleaderboard: {
      cardBg: "var(--brand-cream)",
      hero: "radial-gradient(circle at 50% 34%, #2E3A5C 0%, var(--brand-ink) 66%)",
      ray: "rgba(242,214,78,0.14)",
      glow: "rgba(242,214,78,0.4)",
      labelBg: "var(--brand-gold)",
      labelColor: "var(--brand-ink)",
      label: "LEADERBOARD",
      chipBg: "#F6E6C4",
      chipColor: "#9A7320",
      chipStroke: "#B8862A",
      ctaBg: "linear-gradient(95deg, var(--brand-gold), var(--brand-amber))",
      ctaColor: "var(--brand-ink)",
      ctaShadow: "var(--brand-gold-shadow)",
      titleColor: "var(--brand-ink)",
      descColor: "var(--brand-slate)",
    },
  };

  if (!hydrated || !hasOnboarded) return null;

  return (
    <>
      {engageCards && engageCards.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-[rgba(8,9,14,0.72)]" />

          <div className="relative w-[360px] max-w-[94vw]">
            <div className="px-10 text-center">
              <div className="text-[26px] font-black tracking-tight text-white">Ready to play?</div>
              <div className="mt-1.5 font-pixel text-[9px] tracking-widest text-[var(--brand-gold)]">
                {engageCards.length} {engageCards.length === 1 ? "ACTIVITY" : "ACTIVITIES"}{" "}
                AVAILABLE
              </div>
            </div>
            <div
              className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-10 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(e) => {
                const el = e.currentTarget;
                setEngageActive(
                  Math.max(0, Math.min(engageCards.length - 1, Math.round(el.scrollLeft / 292))),
                );
              }}
            >
              {engageCards.map((card) => {
                const t = ENGAGE_THEME[card.kind];
                return (
                  <div
                    key={card.kind}
                    className="relative flex w-[280px] shrink-0 snap-center flex-col overflow-hidden rounded-[28px] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)]"
                    style={{ background: t.cardBg }}
                  >
                    {card.kind !== "whatsnew" && (
                      <div
                        className="relative flex h-[200px] items-center justify-center overflow-hidden"
                        style={{ background: t.hero }}
                      >
                        <div
                          className="absolute inset-0"
                          style={{
                            background: `repeating-conic-gradient(from 0deg at 50% 44%, ${t.ray} 0deg 6deg, transparent 6deg 13deg)`,
                          }}
                        />
                        {card.kind === "mega" && (
                          <div
                            className="absolute h-[168px] w-[168px] rounded-full"
                            style={{
                              background:
                                "radial-gradient(circle, rgba(242,214,78,0.42) 0%, rgba(181,52,31,0.18) 55%, transparent 72%)",
                            }}
                          />
                        )}
                        {card.kind !== "whosthat" && card.kind !== "mega" && (
                          <div
                            className="absolute h-[150px] w-[150px] rounded-full"
                            style={{
                              background: `radial-gradient(circle, ${t.glow} 0%, transparent 70%)`,
                            }}
                          />
                        )}
                        {card.kind === "daily" && (
                          <PokemonSprite
                            id={479}
                            alt="Rotom"
                            className="sprite relative h-[150px] w-[150px] object-contain drop-shadow-[0_10px_14px_rgba(120,30,0,0.45)]"
                          />
                        )}
                        {card.kind === "weekly" &&
                          (card.heroSrc ? (
                            <img
                              src={card.heroSrc}
                              alt="Gym Leader"
                              className="relative h-[150px] w-[150px] object-contain [filter:brightness(0)] [image-rendering:pixelated]"
                            />
                          ) : (
                            <div className="relative text-[110px] leading-none">🏆</div>
                          ))}
                        {card.kind === "whosthat" && (
                          <div
                            className="relative flex h-[124px] w-[124px] items-center justify-center overflow-hidden rounded-full shadow-[0_10px_26px_-8px_rgba(0,0,0,0.4)]"
                            style={{
                              background:
                                "radial-gradient(circle at 50% 46%, #FFF4D6 0%, #FFD98A 100%)",
                            }}
                          >
                            <PokemonSprite
                              id={25}
                              alt="Pikachu"
                              className="h-[104px] w-[104px] [filter:brightness(0)] [image-rendering:pixelated]"
                            />
                          </div>
                        )}
                        {card.kind === "mega" && card.heroPokeId && (
                          <PokemonSprite
                            id={card.heroPokeId}
                            alt="Mega Raid boss"
                            className="sprite relative h-[150px] w-[150px] object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.5)]"
                          />
                        )}
                        {card.kind === "megaleaderboard" && (
                          <>
                            <div className="absolute top-[44px] flex flex-col items-center">
                              <div
                                className="text-[40px] leading-none"
                                style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}
                              >
                                🏆
                              </div>
                              <div
                                className="font-pixel"
                                style={{ fontSize: 9, color: "var(--brand-gold)", marginTop: 2 }}
                              >
                                #1
                              </div>
                            </div>
                            <div className="absolute bottom-0 flex items-end gap-1.5">
                              <div className="flex flex-col items-center">
                                <div
                                  className="flex items-center justify-center rounded-full font-pixel"
                                  style={{
                                    width: 26,
                                    height: 26,
                                    background: "#C0C6D4",
                                    border: "2px solid #fff",
                                    fontSize: 8,
                                    color: "var(--brand-ink)",
                                  }}
                                >
                                  2
                                </div>
                                <div
                                  style={{
                                    marginTop: 5,
                                    width: 52,
                                    height: 46,
                                    background: "linear-gradient(#3A4660,#2A3450)",
                                    borderRadius: "6px 6px 0 0",
                                  }}
                                />
                              </div>
                              <div className="flex flex-col items-center">
                                <div
                                  className="flex items-center justify-center rounded-full font-pixel"
                                  style={{
                                    width: 32,
                                    height: 32,
                                    background: "var(--brand-gold)",
                                    border: "2px solid #fff",
                                    fontSize: 9,
                                    color: "var(--brand-ink)",
                                  }}
                                >
                                  1
                                </div>
                                <div
                                  style={{
                                    marginTop: 5,
                                    width: 56,
                                    height: 68,
                                    background: "linear-gradient(var(--brand-gold),#D9B838)",
                                    borderRadius: "6px 6px 0 0",
                                  }}
                                />
                              </div>
                              <div className="flex flex-col items-center">
                                <div
                                  className="flex items-center justify-center rounded-full font-pixel"
                                  style={{
                                    width: 26,
                                    height: 26,
                                    background: "#C8895A",
                                    border: "2px solid #fff",
                                    fontSize: 8,
                                    color: "var(--brand-ink)",
                                  }}
                                >
                                  3
                                </div>
                                <div
                                  style={{
                                    marginTop: 5,
                                    width: 52,
                                    height: 38,
                                    background: "linear-gradient(#4A3A5C,#34283F)",
                                    borderRadius: "6px 6px 0 0",
                                  }}
                                />
                              </div>
                            </div>
                          </>
                        )}
                        <div
                          className="absolute left-4 top-4 rounded-full px-2.5 py-1.5 font-pixel text-[9px] tracking-wider"
                          style={{ background: t.labelBg, color: t.labelColor }}
                        >
                          {t.label}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-1 flex-col px-5 pb-6 pt-4">
                      {card.kind === "whatsnew" && (
                        <div
                          className="mb-2 inline-flex w-fit rounded-full px-2.5 py-1.5 font-pixel text-[9px] tracking-wider"
                          style={{ background: t.labelBg, color: t.labelColor }}
                        >
                          ✨ {t.label}
                        </div>
                      )}
                      <div
                        className="text-[21px] font-black leading-tight tracking-tight"
                        style={{ color: t.titleColor }}
                      >
                        {card.title}
                      </div>
                      {card.kind === "whatsnew" ? (
                        <ul className="mt-2 space-y-1.5 text-[13.5px] leading-snug">
                          {card.desc.split("\n").map((line, i) => (
                            <li
                              key={i}
                              className="flex items-start gap-1.5"
                              style={{ color: t.descColor }}
                            >
                              <span
                                aria-hidden="true"
                                className="mt-[3px] h-[5px] w-[5px] shrink-0 rounded-full"
                                style={{ background: t.chipStroke }}
                              />
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div
                          className="mt-1.5 whitespace-pre-line text-[14px] leading-snug"
                          style={{ color: t.descColor }}
                        >
                          {card.desc}
                        </div>
                      )}
                      {/* Bottom-anchored so the CTA lands at the same Y position as
                          every other carousel card's button, regardless of how much
                          (or little) content sits above it. */}
                      <div className="mt-auto">
                        <div
                          className="mt-3.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5"
                          style={{ background: t.chipBg }}
                        >
                          <svg width="11" height="11" viewBox="0 0 22 22" fill="none">
                            <circle cx="11" cy="11" r="8.5" stroke={t.chipStroke} strokeWidth="2" />
                            <path
                              d="M11 6.5V11l3 2"
                              stroke={t.chipStroke}
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className="font-pixel text-[9px]" style={{ color: t.chipColor }}>
                            {card.chip}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const p = card.onPlay;
                            setEngageCards(null);
                            p();
                          }}
                          className="mt-4 flex h-[50px] w-full items-center justify-center rounded-full text-[16px] font-extrabold active:translate-y-0.5"
                          style={{
                            background: t.ctaBg,
                            color: t.ctaColor,
                            boxShadow: `0 4px 0 ${t.ctaShadow}`,
                          }}
                        >
                          {card.cta}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {engageCards.length > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                {engageCards.map((c, i) => (
                  <div
                    key={c.kind}
                    className="h-2 rounded-full transition-all"
                    style={{
                      width: i === engageActive ? 22 : 8,
                      background:
                        i === engageActive ? "var(--brand-red)" : "rgba(255,255,255,0.32)",
                    }}
                  />
                ))}
              </div>
            )}
            <button
              onClick={() => {
                recordEngageDismiss();
                setEngageCards(null);
              }}
              className="mx-auto mt-4 block text-[15px] font-semibold text-white/55"
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
      {phase === "fighting" ? (
        <BattleScreen
          key={battleKey}
          questions={questions}
          onExit={exitBattle}
          onRematch={() => {
            setBattleKey((k) => k + 1);
            startBattle();
          }}
        />
      ) : phase === "elite" && eliteOpponent ? (
        <BattleScreen
          key={battleKey}
          questions={questions}
          onExit={exitBattle}
          onRematch={() => {
            setBattleKey((k) => k + 1);
            startElite();
          }}
          mode="elite"
          eliteMember={eliteOpponent}
        />
      ) : phase === "mega" && megaEvent ? (
        <MegaRaidScreen
          key={battleKey}
          event={megaEvent}
          questions={questions}
          onExit={exitBattle}
          onViewLeaderboard={() => setPhase("megaLeaderboard")}
          onRematch={() => setBattleKey((k) => k + 1)}
        />
      ) : phase === "megaLeaderboard" && megaEvent ? (
        <MegaLeaderboard event={megaEvent} onBack={() => setPhase("home")} onBattle={startMega} />
      ) : phase === "weekly" && weeklyOpponent ? (
        <BattleScreen
          key={battleKey}
          questions={questions}
          onExit={exitBattle}
          mode="weekly"
          gymLeader={weeklyOpponent}
        />
      ) : phase === "daily" ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="daily" />
      ) : pendingLevelUp ? (
        <LevelUpScreen rewards={pendingLevelUp} onContinue={clearPendingLevelUp} />
      ) : pendingElite ? (
        <ElitePendingTakeover
          elite={pendingElite}
          onStart={startElite}
          loading={phase === "loading"}
        />
      ) : (
        <BattleHome
          onStart={startBattle}
          onStartDaily={startDaily}
          onStartWeekly={startWeekly}
          onStartMega={startMega}
          mega={megaHomeState}
          loading={phase === "loading"}
          dailyDone={dailyDone}
          dailyResult={dailyDone ? dailyResult : null}
        />
      )}
    </>
  );
}
