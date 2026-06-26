import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Crown } from "lucide-react";
import { useGameStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PokeballSpinner, PokemonSprite, type DailyMark } from "@/components/game-ui";
import { rankForLevel, xpProgressInLevel, difficultyForLevel, getTpMultiplier } from "@/lib/game-data";

import { trainerSpriteUrl } from "@/lib/game-data";
import { BattleScreen, type Trivia } from "@/components/battle-screen";
import { MegaRaidScreen } from "@/components/mega/MegaRaidScreen";
import { MegaLeaderboard } from "@/components/mega/MegaLeaderboard";

import { fetchActiveMegaEvent, MEGA_MAX_ATTEMPTS, type MegaEvent } from "@/lib/mega/schedule";
import { ensureMegaQuestions } from "@/lib/mega/questions";
import { fetchMegaLeaderboard, getMyMegaRun, getMegaAttempts } from "@/lib/mega/runs";
import { Toaster } from "@/components/ui/sonner";
import { nextPendingElite, type EliteMember } from "@/lib/elite-four";
import { findGymLeader, type GymLeader } from "@/lib/gym-leaders";
import { getWeekRangeUtc } from "@/lib/game-data";

const ENGAGE_DELAY_MS = 10000; // safety cap: show carousel by now even if mega data never resolves

export const Route = createFileRoute("/battle")({
  component: BattlePage,
  validateSearch: (s: Record<string, unknown>) => ({
    autostart: s.autostart ? 1 : 0,
    mode: s.mode === "daily" ? "daily" : "battle",
  }),
});

function BattlePage() {
  const hasOnboarded = useGameStore((s) => s.hasOnboarded);
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
  const [phase, setPhase] = useState<"home" | "loading" | "fighting" | "daily" | "elite" | "weekly" | "mega" | "megaLeaderboard">("home");
  const [questions, setQuestions] = useState<Trivia[]>([]);
  const [eliteOpponent, setEliteOpponent] = useState<EliteMember | null>(null);
  const [weeklyOpponent, setWeeklyOpponent] = useState<GymLeader | null>(null);
  const [megaEvent, setMegaEvent] = useState<MegaEvent | null>(null);
  const [activeMega, setActiveMega] = useState<MegaEvent | null>(null);
  const [megaStats, setMegaStats] = useState<{ rank: number; total: number; attempts: number } | null>(null);
  const [battleKey, setBattleKey] = useState(0);
  const autoStartedRef = useRef(false);
  const dailyResult = useGameStore((s) => s.dailyResult);
  const today = new Date().toISOString().slice(0, 10);
  const dailyDone = dailyResult?.date === today;
  const whosThatHourKey = useGameStore((s) => s.whosThatHourKey);
  const engageDismissCount = useGameStore((s) => s.engageDismissCount);
  const engageDismissDate = useGameStore((s) => s.engageDismissDate);
  const recordEngageDismiss = useGameStore((s) => s.recordEngageDismiss);
  const [engageCards, setEngageCards] = useState<Array<{ kind: "daily" | "weekly" | "whosthat" | "mega" | "megaleaderboard"; title: string; desc: string; chip: string; cta: string; onPlay: () => void; heroSrc?: string; heroPokeId?: number }> | null>(null);
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

  useEffect(() => {
    initWeeklyLeague();
  }, [initWeeklyLeague]);

  const loadMegaStats = useCallback(async () => {
    const ev = await fetchActiveMegaEvent();
    if (!ev) {
      setActiveMega(null);
      setMegaStats({ rank: 0, total: 0, attempts: 0 });
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
      setActiveMega(ev);
      setMegaStats({ rank, total, attempts });
    } catch {
      setActiveMega(ev);
      setMegaStats({ rank: 0, total: 0, attempts: 0 });
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
    if (!hasOnboarded) navigate({ to: "/" });
  }, [hasOnboarded, navigate]);

  useEffect(() => {
    if (hasOnboarded && search.autostart === 1 && !autoStartedRef.current && phase === "home") {
      autoStartedRef.current = true;
      startBattle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasOnboarded, search.autostart, phase]);

  if (!hasOnboarded) return null;

  async function startBattle() {
    if (pendingElite) {
      toast.error(`${pendingElite.name} blocks the way! Defeat them first.`);
      return;
    }
    setPhase("loading");
    try {
      const resp = await fetch("/api/trivia-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          difficulty: difficultyForLevel(level),
          seenHashes,
          seenSamples: seenQuestions.slice(-80),
          excludeIds: seenCuratedIds.slice(-500),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited. Please wait a moment."); setPhase("home"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted. Add credits in Settings."); setPhase("home"); return; }
      const data = (await resp.json()) as { questions: Trivia[]; servedIds?: string[] };
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
      console.error(e);
      toast.error("Couldn't prepare battle. Try again.");
      setPhase("home");
    }
  }

  async function startElite() {
    if (!pendingElite) return;
    setPhase("loading");
    try {
      const resp = await fetch("/api/trivia-elite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: pendingElite.type,
          memberName: `${pendingElite.title} ${pendingElite.name}`,
          difficultyTiers: ["hard", "expert"],
          curatedTarget: 36,
          aiCount: 4,
          seenHashes,
          seenSamples: seenQuestions.slice(-80),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited."); setPhase("home"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted."); setPhase("home"); return; }
      const data = (await resp.json()) as { questions: Trivia[] };
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
      console.error(e);
      toast.error("Couldn't prepare Elite battle.");
      setPhase("home");
    }
  }

  async function startDaily() {
    if (dailyDone) return;
    setPhase("loading");
    try {
      const resp = await fetch("/api/daily-challenge");
      const data = (await resp.json()) as { questions: Trivia[] };
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
      const resp = await fetch("/api/trivia-elite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: leader.type,
          memberName: `Gym Leader ${leader.name}`,
          difficultyTiers: ["hard"],
          curatedTarget: 26,
          aiCount: 4,
          seenHashes,
          seenSamples: seenQuestions.slice(-80),
          flowSeed: Math.floor(Math.random() * 1_000_000),
        }),
      });
      if (resp.status === 429) { toast.error("Rate limited."); setPhase("home"); return; }
      if (resp.status === 402) { toast.error("AI credits exhausted."); setPhase("home"); return; }
      const data = (await resp.json()) as { questions: Trivia[] };
      if (!data.questions?.length) {
        toast.error("Couldn't prepare Weekly League.");
        setPhase("home");
        return;
      }
      markQuestionsSeen(data.questions.map((q) => q.question));
      startWeeklyLeagueAttempt();
      setWeeklyOpponent(leader);
      setQuestions(data.questions);
      setPhase("weekly");
    } catch (e) {
      console.error(e);
      toast.error("Couldn't prepare Weekly League.");
      setPhase("home");
    }
  }

  async function startMega() {
    setPhase("loading");
    try {
      const ev = await fetchActiveMegaEvent();
      if (!ev) { toast.error("No Mega Raid is active right now."); setPhase("home"); return; }
      const used = await getMegaAttempts(ev.id);
      if (used >= MEGA_MAX_ATTEMPTS) {
        toast.error("You've used all your Mega Raid attempts for this event.");
        setPhase("home");
        return;
      }
      const qs = await ensureMegaQuestions(ev);
      if (!qs.length) { toast.error("Mega Raid questions aren't ready yet. Try again soon."); setPhase("home"); return; }
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
    if (!ev) { toast.error("No Mega Raid leaderboard yet."); return; }
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
    if (engageShownRef.current) return;
    if (phase !== "home" || pendingElite) return;
    const dismissedToday = engageDismissDate === today ? engageDismissCount : 0;
    if (dismissedToday >= 3) return;
    const hasMega = !!activeMega && Date.parse(activeMega.endsAt) > Date.now();
    if (megaStats === null && !engageDelayPassed) return;
    const now = Date.now();
    const hourKey = Math.floor(now / 3_600_000);
    const msToNextDay = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), new Date(now).getUTCDate() + 1) - now;
    const dailyClock = `${Math.floor(msToNextDay / 3_600_000)}H ${String(Math.floor((msToNextDay % 3_600_000) / 60_000)).padStart(2, "0")}M`;
    const weeklyStatus = weeklyLeague?.status;
    const leader = weeklyLeague ? findGymLeader(weeklyLeague.gymLeaderId) : null;
    const cards: Array<{ kind: "daily" | "weekly" | "whosthat" | "mega" | "megaleaderboard"; title: string; desc: string; chip: string; cta: string; onPlay: () => void; heroSrc?: string; heroPokeId?: number }> = [];
    const dailyIncluded = !dailyDone;
    if (dailyIncluded) {
      cards.push({ kind: "daily", title: "Daily Quest is ready!", desc: "Beat Rotom in 10 fast questions for bonus XP.", chip: `RESETS IN ${dailyClock}`, cta: "Play Daily Quest", onPlay: startDaily });
    }
    const weeklyIncluded = weeklyStatus !== "won" && weeklyStatus !== "lost";
    if (weeklyIncluded) {
      cards.push({ kind: "weekly", title: "Weekly League is open!", desc: weeklyStatus === "in_progress" ? "Finish your run before the week resets." : "Challenge this week's Gym Leader and climb the ranks.", chip: "RESETS MONDAY", cta: "Enter Weekly League", onPlay: startWeekly, heroSrc: leader ? `/trainers/gym/${leader.trainerSpriteId}.png` : undefined });
    }
    const whosThatIncluded = hourKey !== whosThatHourKey;
    if (whosThatIncluded) {
      cards.push({ kind: "whosthat", title: "A new round is live!", desc: "Guess the hidden Pokémon to earn rewards.", chip: "NEW ROUND EVERY HOUR", cta: "Play now", onPlay: () => navigate({ to: "/whos-that-pokemon" }) });
    }
    if (hasMega && activeMega) {
      const s2 = Math.floor((Date.parse(activeMega.endsAt) - Date.now()) / 1000);
      const dd = Math.floor(s2 / 86400), hh = Math.floor((s2 % 86400) / 3600);
      const megaClock = dd > 0 ? `${dd}D ${hh}H` : `${hh}H`;
      const lbCopy = megaStats && megaStats.rank > 0
        ? `You're ranked #${megaStats.rank} of ${megaStats.total} by accuracy.`
        : megaStats && megaStats.total > 0
          ? `${megaStats.total} trainers competing — top 3 earn exclusive rewards.`
          : "Be the first to set the pace — top 3 earn exclusive rewards.";
      const attemptsUsed = megaStats?.attempts ?? 0;
      const exhausted = attemptsUsed >= MEGA_MAX_ATTEMPTS;
      if (!exhausted) {
        cards.push({ kind: "mega", title: `${activeMega.name} appeared!`, desc: "Outsmart 50 brutal questions — only the sharpest trainer is crowned.", chip: `ENDS IN ${megaClock}`, cta: "Enter Mega Raid", onPlay: startMega, heroPokeId: activeMega.megaId });
      }
      cards.push({ kind: "megaleaderboard", title: `${activeMega.name} Rankings`, desc: lbCopy, chip: "LIVE RANKINGS", cta: "View Leaderboard", onPlay: openMegaLeaderboard });
    }
    if (cards.length > 0) {
      engageShownRef.current = true;
      setEngageActive(0);
      setEngageCards(cards);
    }
  }, [phase, pendingElite, today, dailyDone, weeklyLeague, whosThatHourKey, startDaily, startWeekly, navigate, activeMega, megaStats, startMega, openMegaLeaderboard, engageDelayPassed, engageDismissCount, engageDismissDate]);

  const ENGAGE_THEME: Record<string, { cardBg: string; hero: string; ray: string; glow: string; labelBg: string; labelColor: string; label: string; chipBg: string; chipColor: string; chipStroke: string; ctaBg: string; ctaColor: string; ctaShadow: string; titleColor: string; descColor: string }> = {
    daily: { cardBg: "#FBF3DF", hero: "radial-gradient(circle at 50% 42%, #FF8A3D 0%, #F0531F 52%, #D23A12 100%)", ray: "rgba(255,255,255,0.14)", glow: "rgba(255,224,130,0.6)", labelBg: "rgba(0,0,0,0.22)", labelColor: "#fff", label: "DAILY QUEST", chipBg: "#F6E6C4", chipColor: "#9A7320", chipStroke: "#B8862A", ctaBg: "#E23B2E", ctaColor: "#fff", ctaShadow: "#A82A20", titleColor: "#1C2333", descColor: "#6B6E7B" },
    weekly: { cardBg: "#FBF3DF", hero: "radial-gradient(circle at 50% 40%, #8A6BC9 0%, #5B3F95 60%, #3F2A6E 100%)", ray: "rgba(242,214,78,0.16)", glow: "rgba(242,214,78,0.45)", labelBg: "#F2D64E", labelColor: "#3F2A6E", label: "WEEKLY LEAGUE", chipBg: "#ECE3F4", chipColor: "#5B3F95", chipStroke: "#6B4FA0", ctaBg: "linear-gradient(95deg, #F2D64E, #E8A93C)", ctaColor: "#3F2A6E", ctaShadow: "#C18A28", titleColor: "#1C2333", descColor: "#6B6E7B" },
    whosthat: { cardBg: "linear-gradient(165deg, #E23B2E 0%, #B5341F 100%)", hero: "transparent", ray: "rgba(255,255,255,0.08)", glow: "transparent", labelBg: "#F2D64E", labelColor: "#B5341F", label: "WHO'S THAT POKÉMON?", chipBg: "rgba(255,255,255,0.16)", chipColor: "#fff", chipStroke: "#fff", ctaBg: "#F2D64E", ctaColor: "#1C2333", ctaShadow: "#C9AE2E", titleColor: "#fff", descColor: "rgba(255,255,255,0.82)" },
    mega: { cardBg: "#FBF3DF", hero: "radial-gradient(circle at 50% 34%, #2E3A5C 0%, #1C2333 66%)", ray: "rgba(242,214,78,0.16)", glow: "rgba(242,214,78,0.5)", labelBg: "rgba(0,0,0,0.3)", labelColor: "#F2D64E", label: "⚡ LIMITED EVENT", chipBg: "#E9E1F4", chipColor: "#5B3F95", chipStroke: "#6B4FA0", ctaBg: "#E23B2E", ctaColor: "#fff", ctaShadow: "#A82A20", titleColor: "#1C2333", descColor: "#6B6E7B" },
    megaleaderboard: { cardBg: "#FBF3DF", hero: "radial-gradient(circle at 50% 34%, #2E3A5C 0%, #1C2333 66%)", ray: "rgba(242,214,78,0.14)", glow: "rgba(242,214,78,0.4)", labelBg: "#F2D64E", labelColor: "#1C2333", label: "LEADERBOARD", chipBg: "#F6E6C4", chipColor: "#9A7320", chipStroke: "#B8862A", ctaBg: "linear-gradient(95deg, #F2D64E, #E8A93C)", ctaColor: "#1C2333", ctaShadow: "#C18A28", titleColor: "#1C2333", descColor: "#6B6E7B" },
  };

  return (
    <>
      <Toaster position="top-center" />
      {engageCards && engageCards.length > 0 && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-[rgba(8,9,14,0.72)]" onClick={() => { recordEngageDismiss(); setEngageCards(null); }} />
          <div className="relative w-[360px] max-w-[94vw]">
            <button onClick={() => { recordEngageDismiss(); setEngageCards(null); }} aria-label="Close" className="absolute -top-1.5 right-1 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white active:scale-90">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1 1l11 11M12 1L1 12" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" /></svg>
            </button>
            <div className="px-10 text-center">
              <div className="text-[26px] font-black tracking-tight text-white">Ready to play?</div>
              <div className="mt-1.5 font-pixel text-[8px] tracking-widest text-[#F2D64E]">
                {engageCards.length} {engageCards.length === 1 ? "ACTIVITY" : "ACTIVITIES"} AVAILABLE
              </div>
            </div>
            <div
              className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-10 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              onScroll={(e) => { const el = e.currentTarget; setEngageActive(Math.max(0, Math.min(engageCards.length - 1, Math.round(el.scrollLeft / 292)))); }}
            >
              {engageCards.map((card) => {
                const t = ENGAGE_THEME[card.kind];
                return (
                  <div key={card.kind} className="relative w-[280px] shrink-0 snap-center overflow-hidden rounded-[28px] shadow-[0_18px_40px_-14px_rgba(0,0,0,0.5)]" style={{ background: t.cardBg }}>
                    <div className="relative flex h-[200px] items-center justify-center overflow-hidden" style={{ background: t.hero }}>
                      <div className="absolute inset-0" style={{ background: `repeating-conic-gradient(from 0deg at 50% 44%, ${t.ray} 0deg 6deg, transparent 6deg 13deg)` }} />
                      {card.kind === "mega" && <div className="absolute h-[168px] w-[168px] rounded-full" style={{ background: "radial-gradient(circle, rgba(242,214,78,0.42) 0%, rgba(181,52,31,0.18) 55%, transparent 72%)" }} />}
                      {card.kind !== "whosthat" && card.kind !== "mega" && <div className="absolute h-[150px] w-[150px] rounded-full" style={{ background: `radial-gradient(circle, ${t.glow} 0%, transparent 70%)` }} />}
                      {card.kind === "daily" && <PokemonSprite id={479} alt="Rotom" className="sprite relative h-[150px] w-[150px] object-contain drop-shadow-[0_10px_14px_rgba(120,30,0,0.45)]" />}
                      {card.kind === "weekly" && (card.heroSrc
                        ? <img src={card.heroSrc} alt="Gym Leader" className="relative h-[150px] w-[150px] object-contain [filter:brightness(0)] [image-rendering:pixelated]" />
                        : <div className="relative text-[110px] leading-none">🏆</div>)}
                      {card.kind === "whosthat" && (
                        <div className="relative flex h-[124px] w-[124px] items-center justify-center overflow-hidden rounded-full shadow-[0_10px_26px_-8px_rgba(0,0,0,0.4)]" style={{ background: "radial-gradient(circle at 50% 46%, #FFF4D6 0%, #FFD98A 100%)" }}>
                          <PokemonSprite id={25} alt="Pikachu" className="h-[104px] w-[104px] [filter:brightness(0)] [image-rendering:pixelated]" />
                        </div>
                      )}
                      {card.kind === "mega" && card.heroPokeId && (
                        <PokemonSprite id={card.heroPokeId} alt="Mega Raid boss" className="sprite relative h-[150px] w-[150px] object-contain drop-shadow-[0_10px_14px_rgba(0,0,0,0.5)]" />
                      )}
                      {card.kind === "megaleaderboard" && (
                        <>
                          <div className="absolute top-[44px] flex flex-col items-center">
                            <div className="text-[40px] leading-none" style={{ filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.5))" }}>🏆</div>
                            <div className="font-pixel" style={{ fontSize: 9, color: "#F2D64E", marginTop: 2 }}>#1</div>
                          </div>
                          <div className="absolute bottom-0 flex items-end gap-1.5">
                            <div className="flex flex-col items-center">
                              <div className="flex items-center justify-center rounded-full font-pixel" style={{ width: 26, height: 26, background: "#C0C6D4", border: "2px solid #fff", fontSize: 8, color: "#1C2333" }}>2</div>
                              <div style={{ marginTop: 5, width: 52, height: 46, background: "linear-gradient(#3A4660,#2A3450)", borderRadius: "6px 6px 0 0" }} />
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="flex items-center justify-center rounded-full font-pixel" style={{ width: 32, height: 32, background: "#F2D64E", border: "2px solid #fff", fontSize: 9, color: "#1C2333" }}>1</div>
                              <div style={{ marginTop: 5, width: 56, height: 68, background: "linear-gradient(#F2D64E,#D9B838)", borderRadius: "6px 6px 0 0" }} />
                            </div>
                            <div className="flex flex-col items-center">
                              <div className="flex items-center justify-center rounded-full font-pixel" style={{ width: 26, height: 26, background: "#C8895A", border: "2px solid #fff", fontSize: 8, color: "#1C2333" }}>3</div>
                              <div style={{ marginTop: 5, width: 52, height: 38, background: "linear-gradient(#4A3A5C,#34283F)", borderRadius: "6px 6px 0 0" }} />
                            </div>
                          </div>
                        </>
                      )}
                      <div className="absolute left-4 top-4 rounded-full px-2.5 py-1.5 font-pixel text-[7px] tracking-wider" style={{ background: t.labelBg, color: t.labelColor }}>{t.label}</div>
                    </div>
                    <div className="px-5 pb-6 pt-4">
                      <div className="text-[21px] font-black leading-tight tracking-tight" style={{ color: t.titleColor }}>{card.title}</div>
                      <div className="mt-1.5 text-[14px] leading-snug" style={{ color: t.descColor }}>{card.desc}</div>
                      <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5" style={{ background: t.chipBg }}>
                        <svg width="11" height="11" viewBox="0 0 22 22" fill="none"><circle cx="11" cy="11" r="8.5" stroke={t.chipStroke} strokeWidth="2" /><path d="M11 6.5V11l3 2" stroke={t.chipStroke} strokeWidth="2" strokeLinecap="round" /></svg>
                        <span className="font-pixel text-[7px]" style={{ color: t.chipColor }}>{card.chip}</span>
                      </div>
                      <button
                        onClick={() => { const p = card.onPlay; setEngageCards(null); p(); }}
                        className="mt-4 flex h-[50px] w-full items-center justify-center rounded-full text-[16px] font-extrabold active:translate-y-0.5"
                        style={{ background: t.ctaBg, color: t.ctaColor, boxShadow: `0 4px 0 ${t.ctaShadow}` }}
                      >
                        {card.cta}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {engageCards.length > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                {engageCards.map((c, i) => (
                  <div key={c.kind} className="h-2 rounded-full transition-all" style={{ width: i === engageActive ? 22 : 8, background: i === engageActive ? "#E23B2E" : "rgba(255,255,255,0.32)" }} />
                ))}
              </div>
            )}
            <button onClick={() => { recordEngageDismiss(); setEngageCards(null); }} className="mx-auto mt-4 block text-[15px] font-semibold text-white/55">Maybe later</button>
          </div>
        </div>
      )}
      {phase === "fighting" ? (
        <BattleScreen
          key={battleKey}
          questions={questions}
          onExit={exitBattle}
          onRematch={() => { setBattleKey((k) => k + 1); startBattle(); }}
        />
      ) : phase === "elite" && eliteOpponent ? (
        <BattleScreen
          key={battleKey}
          questions={questions}
          onExit={exitBattle}
          onRematch={() => { setBattleKey((k) => k + 1); startElite(); }}
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
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="weekly" gymLeader={weeklyOpponent} />
      ) : phase === "daily" ? (
        <BattleScreen key={battleKey} questions={questions} onExit={exitBattle} mode="daily" />
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
          loading={phase === "loading"}
          dailyDone={dailyDone}
          dailyResult={dailyDone ? dailyResult : null}
        />
      )}
    </>
  );
}

function BattleHome({
  onStart,
  onStartDaily,
  onStartWeekly,
  loading,
  dailyDone,
  dailyResult,
}: {
  onStart: () => void;
  onStartDaily: () => void;
  onStartWeekly: () => void;
  loading: boolean;
  dailyDone: boolean;
  dailyResult: { correct: number; total: number; timeMs: number; pattern: DailyMark[]; date: string } | null;
}) {
  const [pending, setPending] = useState<null | "daily" | "weekly">(null);
  useEffect(() => {
    if (!loading) setPending(null);
  }, [loading]);
  const handleDaily = () => { setPending("daily"); onStartDaily(); };
  const handleWeekly = () => { setPending("weekly"); onStartWeekly(); };
  const navigate = useNavigate();
  const whosThatHourKey = useGameStore((s) => s.whosThatHourKey);
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const whosThatOnCooldown = Math.floor(nowTick / 3_600_000) === whosThatHourKey;
  const whosThatMsLeft = 3_600_000 - (nowTick % 3_600_000);
  const whosThatClock = `${String(Math.floor(whosThatMsLeft / 60000)).padStart(2, "0")}:${String(Math.floor((whosThatMsLeft % 60000) / 1000)).padStart(2, "0")}`;
  const _nd = new Date(nowTick);
  const msToNextDay = Date.UTC(_nd.getUTCFullYear(), _nd.getUTCMonth(), _nd.getUTCDate() + 1) - nowTick;
  const dailyClock = `${Math.floor(msToNextDay / 3_600_000)}h ${String(Math.floor((msToNextDay % 3_600_000) / 60_000)).padStart(2, "0")}m`;
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const pokemon = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const xp = useGameStore((s) => s.xp);
  const trainingPoints = useGameStore((s) => s.trainingPoints);
  const weeklyLeague = useGameStore((s) => s.weeklyLeague);
  const bestStreak = useGameStore((s) => s.stats.bestStreak);
  const weekRange = getWeekRangeUtc();

  const weeklyLeader = weeklyLeague ? findGymLeader(weeklyLeague.gymLeaderId) : null;
  const weeklyFinished = weeklyLeague?.status === "won" || weeklyLeague?.status === "lost";

  const [weeklyTimeLeft, setWeeklyTimeLeft] = useState("");
  useEffect(() => {
    if (!weeklyFinished) return;
    const tick = () => {
      const ms = weekRange.nextStart - Date.now();
      if (ms <= 0) { setWeeklyTimeLeft("Refreshing..."); return; }
      const days = Math.floor(ms / (24 * 60 * 60 * 1000));
      const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
      setWeeklyTimeLeft(`${days}d ${hours}h ${minutes}m`);
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [weekRange.nextStart, weeklyFinished]);

  if (!pokemon) return null;

  const rank = rankForLevel(level);
  const xpProg = xpProgressInLevel(xp);
  const partnerTp = trainingPoints[pokemon.id] ?? 0;
  const tpMult = getTpMultiplier(partnerTp);
  const xpPct = Math.min(100, (xpProg.current / xpProg.need) * 100);

  // Avatar with progress ring (GO-style)
  const ring = (
    <div className="relative h-20 w-20 shrink-0">
      <svg viewBox="0 0 80 80" className="absolute inset-0 h-full w-full -rotate-90">
        <circle cx="40" cy="40" r="35" fill="none" stroke="oklch(0.22 0.04 260 / 0.12)" strokeWidth="5" />
        <circle
          cx="40" cy="40" r="35" fill="none"
          stroke="var(--color-primary)" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 35}
          strokeDashoffset={2 * Math.PI * 35 * (1 - xpPct / 100)}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-[6px] flex items-center justify-center overflow-hidden rounded-full bg-card">
        <img
          src={trainerSpriteUrl(trainerSprite)}
          alt={trainerSprite}
          className="sprite h-14 w-14 object-contain"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = "0.3"; }}
        />
      </div>
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-poke-dark px-2 py-[2px] font-pixel text-[7px] leading-none text-poke-yellow shadow-sm">
        LV {level}
      </div>
    </div>
  );

  return (
    <div className="bg-poke-cream h-full w-full overflow-y-auto pb-nav safe-x">

      {/* Hero — sits directly on yellow gradient, no white card */}
      <div className="relative px-5 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <div className="flex items-center gap-3">
          {ring}
          <div className="min-w-0 flex-1">
            <p className="font-pixel-xs text-primary">{rank}</p>
            <h1 className="truncate font-display-lg text-foreground">{trainerName}</h1>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-poke-dark/15">
              <div
                className="h-full rounded-full bg-gradient-to-r from-poke-yellow to-primary transition-[width] duration-500"
                style={{ width: `${xpPct}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-foreground/60">
              {xpProg.current.toLocaleString()} / {xpProg.need.toLocaleString()} XP to Lv {level + 1}
            </p>
          </div>
          <PokemonSprite
            id={pokemon.id}
            alt={pokemon.name}
            className="sprite h-16 w-16 shrink-0 -mt-2"
          />
        </div>

        {/* Stat row */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-foreground/60">Streak</div>
            <div className="text-lg font-extrabold text-foreground">{bestStreak} <span className="text-base">🔥</span></div>
          </div>
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-foreground/60">XP</div>
            <div className="text-lg font-extrabold text-foreground">{xp.toLocaleString()}</div>
          </div>
          <div className="rounded-2xl bg-card px-2 py-2 text-center shadow-card">
            <div className="font-pixel-xs text-foreground/60">TP ×{tpMult.toFixed(2)}</div>
            <div className="text-lg font-extrabold text-poke-blue">{partnerTp}</div>
          </div>
        </div>
      </div>

      {/* Battle card */}
      <div className="px-5 pt-3">
        <div className="relative overflow-hidden rounded-3xl bg-card p-5 shadow-card">
          <div className="pointer-events-none absolute -right-8 -bottom-8 opacity-[0.06]">
            <PokeballSpinner size={180} />
          </div>
          <div className="relative flex items-center gap-4">
            <PokeballSpinner size={56} spinning={loading && pending === null} />
            <div className="min-w-0 flex-1">
              <h3 className="font-display-md text-foreground">
                {loading && pending === null ? "Summoning..." : "Up for a battle?"}
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                20 questions · difficulty scales with your level
              </p>
            </div>
          </div>
          <Button
            size="lg"
            onClick={onStart}
            disabled={loading && pending === null}
            className="relative mt-4 h-14 w-full rounded-full bg-primary text-base font-bold shadow-pop"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {loading && pending === null ? "Summoning..." : "Find Match"}
          </Button>
        </div>
      </div>

      {/* Daily + Weekly row */}
      <div className="grid grid-cols-2 gap-2.5 px-5 pt-3">
        <button
          onClick={handleDaily}
          disabled={dailyDone || loading}
          className={`relative flex h-[96px] items-center gap-1 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.9_0.13_95)] to-[oklch(0.85_0.17_80)] p-3 text-left shadow-card disabled:opacity-80 ${
            dailyDone ? "grayscale" : ""
          } ${
            pending === "daily" ? "animate-pulse ring-2 ring-[oklch(0.35_0.06_80)]/40" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="whitespace-nowrap font-pixel text-[7px] leading-none text-[oklch(0.35_0.06_80)]">DAILY QUEST</div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight text-[oklch(0.25_0.05_80)]">
              {dailyDone ? "Done" : "Beat Rotom"}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-[oklch(0.35_0.06_80/0.8)]">
              {dailyDone ? `Next in ${dailyClock}` : "Tap to begin"}
            </p>
          </div>
          <PokemonSprite id={479} alt="Rotom" className="sprite -mr-1 h-[52px] w-[52px] shrink-0" />
        </button>

        <button
          onClick={handleWeekly}
          disabled={loading || weeklyFinished}
          className={`relative flex h-[96px] items-center gap-1 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.16_250)] to-[oklch(0.5_0.18_270)] p-3 text-left text-white shadow-card disabled:opacity-80 ${
            weeklyFinished ? "grayscale" : ""
          } ${
            pending === "weekly" ? "animate-pulse ring-2 ring-white/60" : ""
          }`}
        >
          <div className="min-w-0 flex-1">
            <div className="whitespace-nowrap font-pixel text-[7px] leading-none text-white/85">WEEKLY LEAGUE</div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight">
              {weeklyLeader ? `Gym: ${weeklyLeader.name}` : "Loading..."}
            </h3>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/85">
              {weeklyFinished
                ? `Next in ${weeklyTimeLeft}`
                : weeklyLeague?.status === "in_progress"
                  ? "Resume your run"
                  : "Tap to begin"}
            </p>
          </div>
          {weeklyLeader && (
            <PokemonSprite id={weeklyLeader.signaturePokemonId} alt={weeklyLeader.name} className="sprite -mr-1 h-[52px] w-[52px] shrink-0" />
          )}
        </button>
      </div>

      <div className="px-5 pt-2.5">
        <button
          onClick={() => navigate({ to: "/whos-that-pokemon" })}
          disabled={whosThatOnCooldown}
          className={`relative flex w-full items-center gap-3 overflow-hidden rounded-[18px] bg-gradient-to-br from-[oklch(0.62_0.2_25)] to-[oklch(0.5_0.2_25)] px-4 py-3.5 text-left text-white shadow-card disabled:opacity-80 ${whosThatOnCooldown ? "grayscale" : ""}`}
        >
          <div className="absolute inset-0 opacity-25" style={{ background: "repeating-conic-gradient(from 0deg at 16% 50%, rgba(255,255,255,0.18) 0deg 4deg, transparent 4deg 10deg)" }} />
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
            <PokemonSprite id={25} alt="" className="h-9 w-9 [filter:brightness(0)_invert(1)] [image-rendering:pixelated]" />
            <span className="absolute -right-0.5 -top-1 font-pixel text-base text-poke-yellow drop-shadow">?</span>
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="font-pixel text-[7px] leading-none text-white/85">HOURLY MINI-GAME</div>
            <h3 className="mt-1.5 text-base font-extrabold leading-tight">Who's That Pokémon?</h3>
            <p className="mt-0.5 font-pixel text-[8px] leading-none text-white/85">
              {whosThatOnCooldown ? `NEXT IN ${whosThatClock}` : "TAP TO BEGIN"}
            </p>
          </div>
          <span className="relative shrink-0 text-lg text-white/80">›</span>
        </button>
      </div>
    </div>
  );
}


function ElitePendingTakeover({
  elite,
  onStart,
  loading,
}: {
  elite: EliteMember;
  onStart: () => void;
  loading: boolean;
}) {
  return (
    <div className="bg-elite-arena relative flex h-full w-full flex-col overflow-y-auto pl-[max(1.25rem,env(safe-area-inset-left))] pr-[max(1.25rem,env(safe-area-inset-right))] pb-[calc(env(safe-area-inset-bottom)+5rem)] pt-[calc(env(safe-area-inset-top)+1.5rem)]">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-poke-dark/40 via-transparent to-poke-dark/70" />

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex items-center justify-center gap-2 font-pixel text-[10px] tracking-[0.3em] text-poke-yellow"
      >
        <Crown className="h-3 w-3" /> ELITE FOUR <Crown className="h-3 w-3" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        className="relative mx-auto mt-6 flex w-full max-w-xs flex-col items-center text-center"
      >
        <div className="relative flex items-end justify-center gap-2">
          <div className="absolute inset-0 -m-6 rounded-full bg-poke-yellow/15 blur-3xl" />
          <img
            src={elite.trainerSpriteUrl}
            alt={elite.name}
            crossOrigin="anonymous"
            className="sprite relative h-40 w-40 object-contain drop-shadow-2xl"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          <PokemonSprite
            id={elite.signaturePokemonId}
            alt={elite.signaturePokemonName}
            className="sprite relative h-28 w-28 object-contain drop-shadow-2xl"
          />
        </div>
        <p className="mt-3 font-pixel text-[10px] tracking-[0.25em] text-poke-yellow/80">
          {elite.title.toUpperCase()}
        </p>
        <h1 className="mt-2 text-5xl font-extrabold leading-none text-poke-yellow drop-shadow">
          {elite.name}
        </h1>
        <p className="mt-3 text-xs text-poke-yellow/70">
          {elite.region} · {elite.type.toUpperCase()} specialist · 200 HP boss
        </p>
        <p className="mt-4 text-sm italic leading-relaxed text-poke-yellow/85">
          "{elite.quote}"
        </p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-poke-yellow/40 bg-poke-dark/50 px-3 py-1 text-[11px] font-semibold text-poke-yellow">
            🏅 Region unlock
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-poke-yellow/40 bg-poke-dark/50 px-3 py-1 text-[11px] font-semibold text-poke-yellow">
            +1,000 XP
          </span>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="relative mx-auto mt-auto flex w-full max-w-xs flex-col gap-2 pt-8"
      >
        {loading ? (
          <Skeleton className="h-14 w-full rounded-full" />
        ) : (
          <Button
            size="lg"
            onClick={onStart}
            className="h-14 w-full rounded-full bg-poke-yellow text-base font-bold text-foreground shadow-pop hover:bg-poke-yellow/90"
          >
            <Crown className="mr-2 h-5 w-5" /> Challenge {elite.name}
          </Button>
        )}
        <p className="text-center font-pixel text-[9px] tracking-[0.2em] text-poke-yellow/50">
          REGULAR BATTLES LOCKED UNTIL VICTORY
        </p>
      </motion.div>
    </div>
  );
}
