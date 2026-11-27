import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { NaIcon } from "@/components/na/icon";
import { useGameStore } from "@/lib/store";
import { dailyReward } from "@/lib/rewards";
import { rollLevelUpRewards } from "@/lib/level-rewards";
import { rankForLevel, streakMultiplier, trainerSpriteUrl } from "@/lib/game-data";
import { findPokemon } from "@/lib/pokemon-data";
import { getAbility } from "@/lib/abilities";
import {
  NaBattleField,
  FieldSprite,
  FxCanvas,
  NaHpCard,
  NaCombo,
  NaDamage,
  NaQuestionPanel,
  NaFeedbackBanner,
  type AnswerState,
  type Trim,
} from "@/components/na/battle";
import { NaBolt, NaDailyMarks, NaDayDots, NaRewardTile, NaWordmark, type DailyMarkState } from "@/components/na/celebration";
import { NaRewardIcon } from "@/components/na/reward-icon";
import { NaTypeChip } from "@/components/na/type-chip";
import { NaButton } from "@/components/na/button";
import type { BattleFx } from "@/lib/battle-fx/engine";
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
import { playSfx, playBattleResult } from "@/lib/audio";
import { answerHaptic } from "@/lib/haptics";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";
import type { Trivia } from "@/lib/trivia-core";
import { syncActivity } from "@/lib/social";
import { useForfeitGuard } from "@/lib/use-forfeit-guard";
import { submitDailyRun } from "@/services/client/daily-run";
import { track } from "@/lib/analytics";
import { dayStreak as dayStreakOf, weekWins } from "@/lib/win-streak";

type DailyMark = "correct" | "wrong" | "timeout";
const ROTOM = 479;

/** Hours (or minutes) until the Daily Quest resets at 00:00 UTC, for the boss tag. */
function timeLeft(now = Date.now()): string {
  const d = new Date(now);
  const ms = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
  return ms >= 3_600_000 ? `${Math.floor(ms / 3_600_000)}h LEFT` : `${Math.max(1, Math.ceil(ms / 60_000))}m LEFT`;
}

const toMarks = (pattern: DailyMark[], total: number, now: number | null): DailyMarkState[] =>
  Array.from({ length: total }, (_, i) =>
    i < pattern.length ? (pattern[i] === "correct" ? "right" : pattern[i]) : i === now ? "now" : "empty",
  );

export function DailyScreen({ questions, onExit }: { questions: Trivia[]; onExit: () => void }) {
  const recordDaily = useGameStore((s) => s.recordDaily);
  const recordAnswer = useGameStore((s) => s.recordAnswer);
  const [idx, setIdx] = useState(0);
  // 5.1 intro first; the clock only runs once you tap Start.
  const [phase, setPhase] = useState<"intro" | "question" | "feedback" | "done">("intro");
  const [chosen, setChosen] = useState<number | null>(null);
  const [pattern, setPattern] = useState<DailyMark[]>([]);
  const abortBattle = useGameStore((s) => s.abortBattle);
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive]);
  const [confirmExit, setConfirmExit] = useState(false);
  // Browser/Android back mid-run asks to forfeit instead of silently leaving
  // (feedback 2286b6fc). Reuses the existing Leave dialog.
  useForfeitGuard(phase === "question" || phase === "feedback", () => setConfirmExit(true));
  const [correctCount, setCorrectCount] = useState(0);
  const [timer, setTimer] = useState(20);
  const startedAt = useRef(Date.now());
  const qStart = useRef(Date.now());
  const recordedRef = useRef(false);
  const dailyStreakRef = useRef(0);
  // Consecutive DAYS completed, as counted by the server. Distinct from
  // dailyStreakRef above, which is correct-answers-in-a-row inside this one run.
  const [dayStreak, setDayStreak] = useState<number | null>(null);
  const [earnedXp, setEarnedXp] = useState(0);
  // server-first-refactor Phase 3 — raw picks (null for a timeout), in
  // question order, submitted to daily-run once the whole set is answered.
  const picksRef = useRef<Array<number | null>>([]);
  const [hit, setHit] = useState(0);

  const trivia = questions[idx];
  const total = questions.length;

  useEffect(() => {
    qStart.current = Date.now();
    setTimer(20);
  }, [idx]);

  useEffect(() => {
    if (phase !== "question") return;
    if (timer <= 0) {
      handleAnswer(-1);
      return;
    }
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, phase]);

  function start() {
    startedAt.current = Date.now();
    qStart.current = Date.now();
    setTimer(20);
    setPhase("question");
  }

  function handleAnswer(picked: number) {
    if (!trivia || phase !== "question") return;
    setChosen(picked);
    const correct = picked === trivia.correct;
    const elapsed = Date.now() - qStart.current;
    const nextStreak = correct ? dailyStreakRef.current + 1 : 0;
    dailyStreakRef.current = nextStreak;
    recordAnswer(correct, elapsed, nextStreak);
    const sym: DailyMark = picked === -1 ? "timeout" : correct ? "correct" : "wrong";
    const nextPattern: DailyMark[] = [...pattern, sym];
    setPattern(nextPattern);
    picksRef.current = [...picksRef.current, picked === -1 ? null : picked];
    if (correct) {
      setCorrectCount((c) => c + 1);
      setHit((h) => h + 1);
    }
    answerHaptic(correct);
    playSfx(correct ? "correct" : "wrong");
    setPhase("feedback");
    setTimeout(() => {
      const next = idx + 1;
      if (next >= total) {
        const timeMs = Date.now() - startedAt.current;
        if (!recordedRef.current) {
          recordedRef.current = true;
          const finalCorrect = correctCount + (correct ? 1 : 0);
          recordDaily({
            date: new Date().toISOString().slice(0, 10),
            correct: finalCorrect,
            total,
            timeMs,
            pattern: nextPattern,
          });
          void syncActivity("last_daily_claim");
          useGameStore.getState().pushBattleLog({
            opponent: "Daily Quest",
            won: true,
            xpGained: 0,
            bestStreak: 0,
            timestamp: Date.now(),
            mode: "daily",
          });
          // server-first-refactor Phase 3 — submit to daily-run for the
          // idempotent, server-validated reward instead of trusting this
          // component's own self-scored tally. Falls back to the old
          // client-computed dailyReward() only if the submit itself fails
          // (network hiccup) — never on `alreadyGranted`, which means the
          // server already paid this out (or determined it didn't qualify).
          void (async () => {
            let reward: { xp: number; tp: number } | null = null;
            try {
              const res = await submitDailyRun(picksRef.current, timeMs);
              reward = res.reward;
              setDayStreak(res.streakDays ?? null);
            } catch {
              // Offline fallback pays the day-1 rate: the streak is a server
              // fact, and guessing it here could over-pay.
              const lvl = useGameStore.getState().level;
              reward = dailyReward({ correct: finalCorrect, total, level: lvl });
            }
            track("daily_claimed", { correct: finalCorrect, total, rewarded: Boolean(reward?.xp) });
            if (reward && reward.xp > 0) {
              setEarnedXp(reward.xp);
              const prevLevel = useGameStore.getState().level;
              useGameStore.getState().addXp(reward.xp);
              const partner = useGameStore.getState().pokemon;
              if (partner) useGameStore.getState().addTrainingPoints(partner.id, reward.tp);
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
            }
            playSfx("victory");
            playBattleResult("daily", true);
            setPhase("done");
          })();
          return;
        }
        playSfx("victory");
        playBattleResult("daily", true);
        setPhase("done");
      } else {
        setChosen(null);
        setIdx(next);
        setPhase("question");
      }
    }, 1500);
  }

  if (phase === "done") {
    const timeMs = Date.now() - startedAt.current;
    return (
      <>
        {/* Test-observability hook only — not read by any production code. */}
        <div data-testid="daily-result" data-correct={correctCount} data-total={total} hidden />
        <DailyResultScreen
          correct={correctCount}
          total={total}
          timeMs={timeMs}
          pattern={pattern}
          dayStreak={dayStreak}
          earnedXp={earnedXp}
          onExit={onExit}
        />
      </>
    );
  }

  if (!trivia) {
    return (
      <div className="na-bg-night flex h-full w-full items-center justify-center">
        <div className="na-body text-text-secondary">No daily questions available.</div>
      </div>
    );
  }

  if (phase === "intro") return <DailyIntro total={total} onBack={onExit} onStart={start} />;

  return (
    <>
      <DailyBoss
        trivia={trivia}
        idx={idx}
        total={total}
        phase={phase}
        chosen={chosen}
        timer={timer}
        pattern={pattern}
        correctCount={correctCount}
        inARow={dailyStreakRef.current}
        hit={hit}
        onAnswer={handleAnswer}
      />
      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the daily challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving will discard your progress on today's challenge. You can start it again, but
              nothing is saved until you finish.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                abortBattle();
                onExit();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ------------------------------------------------------------------ 5.1 intro
/**
 * Figma 5.1 "Daily Quest: a boss to beat": Rotom hovers in a turning ring with
 * bolts circling it, the boss tag with the time left, the empty Poké Balls and
 * the rules. The rules say what the app pays today (6 right to score, 10/10
 * doubles); Figma's "every correct answer" option is decision 3, parked.
 */
function DailyIntro({ total, onBack, onStart }: { total: number; onBack: () => void; onStart: () => void }) {
  const log = useGameStore((s) => s.battleLog);
  const streak = dayStreakOf(log, Date.now(), true).days; // days in a row before today
  const rules: Array<[Parameters<typeof NaRewardIcon>[0]["kind"], string]> = [
    ["XP", "Get 6 or more right to earn XP!"],
    ["Chest", `Get all ${total} right to earn DOUBLE XP!`],
    ["Streak", streak >= 1 ? `${streak + 1}-day streak bonus active!` : "Play every day for a streak bonus!"],
  ];
  return (
    <div className="na-bg-night flex h-full w-full flex-col pt-[env(safe-area-inset-top)]">
      <div className="flex h-[52px] shrink-0 items-center gap-3 px-4">
        <button type="button" aria-label="Back" onClick={onBack} className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-foreground">
          <NaIcon name="arrow-left" size={20} />
        </button>
        <h1 className="na-display-s flex-1 text-foreground">Daily Quest</h1>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-3 overflow-y-auto px-4 pt-1 screen-bottom">
        <DailyRing />
        <span className="na-fill-brand flex items-center gap-2 rounded-lg px-2.5 py-1">
          <span className="na-label uppercase text-foreground">Boss battle</span>
          <NaIcon name="clock" size={14} className="text-foreground" />
          <span className="na-label text-foreground">{timeLeft()}</span>
        </span>
        <h2 className="na-display-l text-center text-foreground">DEFEAT ROTOM!</h2>
        <p className="na-body text-center text-text-secondary">{total} questions. The same challenge for every Trainer!</p>
        <NaDailyMarks marks={Array.from({ length: total }, () => "empty")} />
        <div className="na-glass flex w-full flex-col gap-2.5 rounded-[18px] p-3.5">
          {rules.map(([icon, text]) => (
            <div key={text} className="flex items-center gap-2.5">
              <span className="shrink-0">
                <NaRewardIcon kind={icon} size={28} />
              </span>
              <span className="na-body-strong text-foreground">{text}</span>
            </div>
          ))}
        </div>
        <div className="min-h-2 flex-1" />
        <NaButton block onClick={onStart}>
          Start
        </NaButton>
      </div>
    </div>
  );
}

/** Rotom in a turning dashed ring, three bolts circling it (Figma dailyRing, 220). */
function DailyRing() {
  return (
    <motion.div
      className="relative h-[220px] w-[220px] shrink-0"
      initial={{ scale: 0.6, opacity: 0, rotate: -40 }}
      animate={{ scale: 1, opacity: 1, rotate: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <motion.svg
        viewBox="0 0 200 200"
        className="absolute left-[10px] top-[10px] h-[200px] w-[200px]"
        animate={{ rotate: 360 }}
        transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
        aria-hidden
      >
        <circle cx="100" cy="100" r="98" fill="rgb(255 255 255 / 0.04)" stroke="rgb(255 200 61 / 0.8)" strokeWidth="4" strokeDasharray="14 10" />
      </motion.svg>
      <motion.div className="absolute inset-0" initial={{ y: -30 }} animate={{ y: 0 }} transition={{ duration: 0.3, ease: "easeOut" }}>
        <FieldSprite id={ROTOM} k={2} cx={110} feetY={0} centerY={110} />
      </motion.div>
      <motion.div
        className="absolute inset-0"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, rotate: 360 }}
        transition={{ scale: { delay: 0.3, duration: 0.25 }, opacity: { delay: 0.3 }, rotate: { delay: 0.3, duration: 12, repeat: Infinity, ease: "linear" } }}
        aria-hidden
      >
        {[-1.9, 0.2, 2.3].map((a) => (
          <span key={a} className="absolute" style={{ left: 110 + Math.cos(a) * 100 - 9, top: 110 + Math.sin(a) * 100 - 13 }}>
            {/* counter-turns, so each bolt stays upright as it circles */}
            <motion.span className="block" animate={{ rotate: -360 }} transition={{ delay: 0.3, duration: 12, repeat: Infinity, ease: "linear" }}>
              <NaBolt style={{ width: 18, height: 27 }} />
            </motion.span>
          </span>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ 5.2 boss battle
/**
 * Figma 5.2 "Boss battle: one Poké Ball per question": the evening field, Rotom
 * hovering over its pad, your partner on its platform; the boss bar with the
 * Poké Balls, the XP so far, and your partner's move on every right answer.
 * The XP pill shows what the run pays so far (it pays from 6 right).
 */
function DailyBoss({
  trivia,
  idx,
  total,
  phase,
  chosen,
  timer,
  pattern,
  correctCount,
  inARow,
  hit,
  onAnswer,
}: {
  trivia: Trivia;
  idx: number;
  total: number;
  phase: "question" | "feedback";
  chosen: number | null;
  timer: number;
  pattern: DailyMark[];
  correctCount: number;
  inARow: number;
  hit: number;
  onAnswer: (i: number) => void;
}) {
  const player = useGameStore((s) => s.pokemon)!;
  const abilityId = useGameStore((s) => s.abilityId);
  const level = useGameStore((s) => s.level);
  const ability = getAbility(player.types, abilityId);
  const rotom = findPokemon(ROTOM);
  const xpSoFar = dailyReward({ correct: correctCount, total, level }).xp;

  const [panelH, setPanelH] = useState(380);
  const panelRo = useRef<ResizeObserver | null>(null);
  const panelRef = (el: HTMLDivElement | null) => {
    panelRo.current?.disconnect();
    if (!el || typeof ResizeObserver === "undefined") return;
    panelRo.current = new ResizeObserver(() => setPanelH(el.offsetHeight));
    panelRo.current.observe(el);
  };

  // Pixel effects (3b): your partner's move hits Rotom on each right answer.
  const fxRef = useRef<BattleFx | null>(null);
  const fxBack = useRef<HTMLCanvasElement>(null);
  const fxFront = useRef<HTMLCanvasElement>(null);
  const fxEls = useRef<{ enemy?: HTMLElement | null; player?: HTMLElement | null; stage?: HTMLElement | null }>({}).current;
  const fxSprites = useRef<Partial<Record<"enemy" | "player", { img: HTMLImageElement; trim: Trim }>>>({}).current;
  const place = { enemy: { k: 1, cx: 145.5, feet: 105 }, player: { k: 1.5, cx: 52, feet: 210 } } as const;
  const onSprite = (side: "enemy" | "player", img: HTMLImageElement, trim: Trim) => {
    fxSprites[side] = { img, trim };
    fxRef.current?.setSprite(side, { img, trim, ...place[side] });
  };
  useEffect(() => {
    if (typeof navigator === "undefined" || /jsdom/i.test(navigator.userAgent)) return; // tests: no canvas
    let live = true;
    import("@/lib/battle-fx/engine")
      .then(({ createBattleFx }) => {
        if (!live || !fxBack.current || !fxFront.current) return;
        const reduced = useGameStore.getState().reducedMotion || matchMedia("(prefers-reduced-motion: reduce)").matches;
        const fx = createBattleFx(fxBack.current, fxFront.current, fxEls, { reduced });
        for (const side of ["enemy", "player"] as const) {
          const s = fxSprites[side];
          if (s) fx.setSprite(side, { ...s, ...place[side] });
        }
        fxRef.current = fx;
      })
      .catch(() => {});
    return () => {
      live = false;
      fxRef.current?.destroy();
      fxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (hit > 0) void fxRef.current?.attack(player.types[0], "player", 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hit]);

  const ok = phase === "feedback" && chosen === trivia.correct;
  const states: AnswerState[] = trivia.options.map((_, i) =>
    phase !== "feedback" ? "default" : i === trivia.correct ? (chosen === i ? "correct" : "reveal") : i === chosen ? "wrong" : "dimmed",
  );

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-night-deep">
      <NaBattleField
        mode="evening"
        panelHeight={panelH}
        stageRef={(el) => {
          fxEls.stage = el;
        }}
      >
        <FxCanvas ref={fxBack} />
        <FieldSprite
          id={ROTOM}
          k={2}
          cx={291}
          feetY={210}
          spriteRef={(el) => {
            fxEls.enemy = el;
          }}
          onReady={(img, trim) => onSprite("enemy", img, trim)}
        />
        <FieldSprite
          id={player.id}
          back
          k={3}
          cx={104}
          feetY={420}
          spriteRef={(el) => {
            fxEls.player = el;
          }}
          onReady={(img, trim) => onSprite("player", img, trim)}
        />
        <FxCanvas ref={fxFront} />
        {/* Boss bar: Rotom, its types, the question count and the Poké Balls. */}
        <div className="absolute left-3 top-[52px] flex w-[366px] flex-col gap-2 rounded-2xl border border-white/[0.16] bg-night-deep/70 px-3 py-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_12px_32px_rgb(0_0_0/0.35)] backdrop-blur-xl">
          <div className="flex items-center gap-1.5">
            <span className="na-headline text-foreground">Rotom</span>
            {(rotom?.types ?? ["electric", "ghost"]).map((t) => (
              <NaTypeChip key={t} type={t} />
            ))}
            <span className="flex-1" />
            <span className="na-label text-text-secondary">
              Question {idx + 1} of {total}
            </span>
          </div>
          <NaDailyMarks marks={toMarks(pattern, total, phase === "question" ? idx : null)} />
        </div>
        {xpSoFar > 0 && (
          <div className="absolute right-3 top-[150px] flex items-center gap-1.5 rounded-full bg-night-deep/70 py-1 pl-1 pr-3">
            <NaRewardIcon kind="XP" size={26} />
            <span className="na-number-m text-[#9B7BFF]">+{xpSoFar} XP</span>
          </div>
        )}
        {inARow >= 2 && <NaCombo count={inARow} multiplier={streakMultiplier(inARow)} style={{ left: 12, top: 206 }} />}
        <NaHpCard
          side="player"
          name={player.name}
          hp={100}
          maxHp={100}
          types={player.types}
          abilityName={ability.name}
          abilityDescription={ability.description}
          style={{ left: 178, top: 262 }}
        />
        {ok && <NaDamage key={`hit-${idx}`} value="HIT!" style={{ left: 196, top: 176 }} />}
      </NaBattleField>
      <NaQuestionPanel
        panelRef={panelRef}
        seconds={timer}
        maxSeconds={20}
        category={trivia.category}
        progress={`Q${idx + 1}`}
        question={trivia.question}
        options={trivia.options}
        states={states}
        disabled={() => phase !== "question"}
        onAnswer={onAnswer}
        banner={
          phase === "feedback" ? (
            <NaFeedbackBanner
              ok={ok}
              title={ok ? "Correct!" : chosen === -1 ? "Time's up" : "Not quite"}
              sub={ok ? `${correctCount} of ${total} right so far` : `The answer: ${trivia.options[trivia.correct]}`}
            />
          ) : null
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ 5.3 result
function DailyResultScreen({
  correct,
  total,
  timeMs,
  pattern,
  dayStreak,
  earnedXp,
  onExit,
}: {
  correct: number;
  total: number;
  timeMs: number;
  pattern: DailyMark[];
  /** Consecutive days completed, server-counted. Null when the submit didn't
   *  reach the server, or on a run that scored below the reward floor. */
  dayStreak: number | null;
  earnedXp: number;
  onExit: () => void;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const secs = Math.round(timeMs / 1000);
  const bestStreak = (() => {
    let best = 0,
      cur = 0;
    for (const m of pattern) {
      if (m === "correct") {
        cur += 1;
        best = Math.max(best, cur);
      } else cur = 0;
    }
    return best;
  })();
  const [shareOpen, setShareOpen] = useState(false);
  const trainerName = useGameStore((s) => s.trainerName);
  const trainerSprite = useGameStore((s) => s.trainerSprite);
  const partner = useGameStore((s) => s.pokemon);
  const level = useGameStore((s) => s.level);
  const log = useGameStore((s) => s.battleLog);
  const isPerfect = correct === total && total > 0;
  const avgTimeMs = total > 0 ? timeMs / total : undefined;
  const shareData: ShareData | null =
    isPerfect && partner
      ? {
          type: "daily-perfect",
          trainerName,
          trainerSpriteUrl: trainerSpriteUrl(trainerSprite),
          partnerName: partner.name,
          partnerPokemonId: partner.id,
          partnerShiny: false,
          opponentName: "Rotom",
          opponentTitle: "Daily Challenge",
          opponentSpriteUrl: null,
          signaturePokemonId: ROTOM,
          finalPlayerHp: 100,
          maxPlayerHp: 100,
          topStreak: bestStreak,
          topDamage: 0,
          dateISO: date,
          correctCount: correct,
          totalQuestions: total,
          xpEarned: earnedXp || dailyReward({ correct, total, level }).xp,
          avgTimeMs,
          level,
          rank: rankForLevel(level),
        }
      : null;
  const left = total - correct;
  const title = isPerfect ? "PERFECT!" : correct >= 6 ? "GREAT RUN!" : "SO CLOSE!";

  return (
    // Figma 5.3 "Daily result": the run's Poké Balls, the tiles, and the week of Daily Quests.
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="na-bg-night flex h-full w-full flex-col items-center gap-3.5 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-[calc(env(safe-area-inset-top)+12px)]"
    >
      <NaWordmark kind={correct >= 6 ? "victory" : "soclose"}>{title}</NaWordmark>
      <p className="na-body-strong text-center text-text-secondary">
        {correct} of {total} correct! {left === 0 ? "Rotom fainted!" : `Rotom has ${left} HP remaining!`}
      </p>
      <NaDailyMarks marks={toMarks(pattern, total, null)} />
      <div className="flex gap-[9px]">
        <NaRewardTile tone="xp" label="Total XP" value={`+${earnedXp}`} icon={<NaRewardIcon kind="XP" size={30} />} />
        <NaRewardTile tone="success" label="Accuracy" value={`${total ? Math.round((correct / total) * 100) : 0}%`} icon={<NaRewardIcon kind="Accuracy" size={30} />} />
        <NaRewardTile tone="info" label="Time" value={`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`} icon={<NaRewardIcon kind="Time" size={30} />} />
      </div>
      <div className="flex flex-col items-center gap-2">
        <NaDayDots week={weekWins(log, Date.now(), true)} today={(new Date().getUTCDay() + 6) % 7} />
        {dayStreak != null && dayStreak >= 2 && earnedXp > 0 && (
          <span className="na-caption text-center text-[#ff8a1f]">{dayStreak}-day streak bonus applied!</span>
        )}
      </div>
      <div className="min-h-2 flex-1" />
      <NaButton block onClick={onExit}>
        Home
      </NaButton>
      {shareData && (
        <NaButton kind="secondary" size="M" block onClick={() => setShareOpen(true)}>
          Share results
        </NaButton>
      )}
      {shareData && <ShareCardDialog open={shareOpen} onClose={() => setShareOpen(false)} data={shareData} />}
    </motion.div>
  );
}
