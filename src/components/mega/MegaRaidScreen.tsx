import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Backpack } from "lucide-react";
import { toast } from "sonner";
import { PokemonSprite, QuestionCard } from "@/components/game-ui";
import type { Trivia } from "@/components/battle-screen";
import { shuffleTriviaOptionsWithOrder } from "@/lib/trivia-core";
import { useForfeitGuard } from "@/lib/use-forfeit-guard";
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
import { useGameStore } from "@/lib/store";
import { ITEMS, type ItemId } from "@/lib/game-data";
import {
  MEGA_BOSS_HP,
  MEGA_SHINY_CHANCE,
  MEGA_MAX_ATTEMPTS,
  type MegaEvent,
} from "@/lib/mega/schedule";
import { submitMegaRun, getMyMegaRank } from "@/lib/mega/runs";
import { revealMegaAnswer } from "@/lib/mega/questions";
import { playSfx, revealPokemon } from "@/lib/audio";
import { MegaResults, type MegaRewardItem } from "@/components/mega/MegaResults";
import {
  startMegaAttempt,
  submitMegaAction,
  abandonMegaAttempt,
  type SubmitMegaActionResult,
} from "@/services/client/mega-run";
import type { MegaRaidAction, MegaHealItemId } from "@/engine/mega-battle-replay";

const PLAYER_MAX_HP = 100;
const TIMER = 20;
const BOSS_DMG = 10; // per correct answer; 40 correct depletes 400 HP
const PLAYER_DMG = 8; // per wrong answer
const TYPE_COLORS: Record<string, string> = {
  fire: "#EE8130",
  dragon: "#6F35FC",
  water: "#6390F0",
  grass: "#7AC74C",
  electric: "#F7D02C",
  ice: "#96D9D6",
  fighting: "#C22E28",
  poison: "#A33EA1",
  ground: "#E2BF65",
  flying: "#A98FF3",
  psychic: "#F95587",
  bug: "#A6B91A",
  rock: "#B6A136",
  ghost: "#735797",
  dark: "#705746",
  steel: "#B7B7CE",
  fairy: "#D685AD",
  normal: "#A8A77A",
};

const HEAL: Partial<Record<ItemId, number>> = {
  potion: 30,
  superpotion: 60,
  maxpotion: PLAYER_MAX_HP,
};

function itemDef(id: ItemId) {
  return ITEMS.find((i) => i.id === id);
}

interface Props {
  event: MegaEvent;
  questions: Trivia[];
  onExit: () => void;
  onViewLeaderboard: () => void;
  onRematch: () => void;
}


export function MegaRaidScreen({
  event,
  questions: rawQuestions,
  onExit,
  onViewLeaderboard,
  onRematch,
}: Props) {
  // Random option order per run — the fixed 50-question set stays identical
  // for every player (leaderboard fairness), only the answer positions move.
  // Mega questions arrive with correct = -1 and the server later reveals the
  // correct index in ORIGINAL option order, so keep each question's
  // permutation to translate server indexes into display indexes.
  const shuffledSet = useMemo(
    () => rawQuestions.map((q) => shuffleTriviaOptionsWithOrder(q)),
    [rawQuestions],
  );
  const questions = useMemo(() => shuffledSet.map((s) => s.q), [shuffledSet]);
  const toDisplayIdx = useCallback(
    (qi: number, serverIdx: number) => shuffledSet[qi]?.order.indexOf(serverIdx) ?? serverIdx,
    [shuffledSet],
  );
  const total = questions.length;
  const inventory = useGameStore((s) => s.inventory);
  const grantItem = useGameStore((s) => s.grantItem);

  const [bossShiny] = useState(() => Math.random() < MEGA_SHINY_CHANCE);
  const [qIndex, setQIndex] = useState(0);
  const [bossHp, setBossHp] = useState(MEGA_BOSS_HP);
  const [playerHp, setPlayerHp] = useState(PLAYER_MAX_HP);
  const [timer, setTimer] = useState(TIMER);
  const [picked, setPicked] = useState<number | null>(null);
  const [locked, setLocked] = useState(false); // showing feedback
  const [correctCount, setCorrectCount] = useState(0);
  const [bagOpen, setBagOpen] = useState(false);
  const [phase, setPhase] = useState<"fighting" | "result">("fighting");
  const [confirmLeave, setConfirmLeave] = useState(false);
  // Browser/Android back mid-raid asks before abandoning the run
  // (feedback 2286b6fc).
  useForfeitGuard(phase !== "result", () => setConfirmLeave(true));

  const [usedOnce, setUsedOnce] = useState<Set<ItemId>>(new Set());
  const [xAtkArmed, setXAtkArmed] = useState(false);
  const [removedWrong, setRemovedWrong] = useState<number | null>(null);
  const [revealCorrect, setRevealCorrect] = useState(false);
  // Per-question correct index, learned from the server on answer / hint item.
  const [correctIdxByQ, setCorrectIdxByQ] = useState<Record<number, number>>({});
  const currentCorrect = correctIdxByQ[qIndex];
  const [lastElapsedMs, setLastElapsedMs] = useState(0);

  const startRef = useRef<number>(Date.now());
  const questionStart = useRef<number>(Date.now());
  const escapedRef = useRef(false);
  const endedRef = useRef(false);

  // server-first-refactor Phase 2 — mirror this run into mega-run so
  // submit_mega_run stops trusting this component's own self-scored tally.
  // `attemptIdRef` is set once startMegaAttempt resolves; every action fired
  // at it afterward is fire-and-forget EXCEPT the run-concluding one, which
  // finish() awaits so it can use mega-run's own authoritative submit result
  // instead of calling submitMegaRun directly (calling both would double-
  // consume the 2-attempt cap — see mega-run/index.ts's module doc).
  // `mirrorQueueRef` chains mirror calls strictly in submission order (fire-
  // and-forget without ordering would let the server's replay diverge from
  // the real one whenever an item was used between two answers).
  const attemptIdRef = useRef<string | null>(null);
  const mirrorQueueRef = useRef<Promise<SubmitMegaActionResult | null>>(Promise.resolve(null));
  const queueMirror = useCallback((action: MegaRaidAction) => {
    const next = mirrorQueueRef.current.then(() =>
      attemptIdRef.current
        ? submitMegaAction(attemptIdRef.current, action).catch(() => null)
        : Promise.resolve(null),
    );
    mirrorQueueRef.current = next;
    return next;
  }, []);

  useEffect(() => {
    void startMegaAttempt(event.id)
      .then((r) => {
        attemptIdRef.current = r.attemptId;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [result, setResult] = useState<{
    outcome: "win" | "loss";
    accuracy: number;
    correct: number;
    rank: number | null;
    attempts: number;
    items: MegaRewardItem[];
  } | null>(null);

  const q = questions[qIndex];
  const lowHp = playerHp / PLAYER_MAX_HP <= 0.3 && playerHp > 0;
  const hasAnyPotion = (["potion", "superpotion", "maxpotion"] as ItemId[]).some(
    (id) => (inventory[id] ?? 0) > 0,
  );

  const finish = useCallback(
    async (won: boolean, finalCorrect: number, mirror: SubmitMegaActionResult | null) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const timeMs = Date.now() - startRef.current;
      const accuracy = Math.round((finalCorrect / total) * 100);
      let rank: number | null = null;
      let attempts = MEGA_MAX_ATTEMPTS;
      if (mirror?.ended && mirror.submit) {
        // mega-run's own replay already called submit_mega_run with the
        // server-derived numbers — use ITS result rather than calling
        // submitMegaRun again (that would double-consume the attempt cap).
        if (mirror.submit.ok) {
          attempts = mirror.submit.row.attempts;
          const ranked = await getMyMegaRank(event.id);
          rank = ranked?.rank ?? null;
        } else if (/no attempts/i.test(mirror.submit.error)) {
          toast.error("No attempts left — this run doesn't count.");
        } else {
          toast.error("Couldn't save your run — check your connection.");
        }
      } else {
        // Fallback: the mega-run mirror never concluded this run (attemptId
        // was never obtained, or a network hiccup dropped it) — submit
        // directly so the run is still reliably recorded, same as before
        // this wiring existed.
        const res = await submitMegaRun({
          eventId: event.id,
          accuracy,
          correct: finalCorrect,
          total,
          timeMs,
        });
        if (res.ok) {
          rank = res.rank || null;
          attempts = res.row?.attempts ?? MEGA_MAX_ATTEMPTS;
        } else if (/no attempts/i.test(res.error)) {
          toast.error("No attempts left — this run doesn't count.");
        } else {
          toast.error("Couldn't save your run — check your connection.");
        }
      }
      setResult({
        outcome: won ? "win" : "loss",
        accuracy,
        correct: finalCorrect,
        rank,
        attempts,
        items: [],
      });
      useGameStore.getState().pushBattleLog({
        opponent: event.name,
        won,
        xpGained: 0,
        bestStreak: 0,
        timestamp: Date.now(),
        mode: "mega",
      });
      setPhase("result");
    },
    [event, total],
  );

  const advance = useCallback(
    (
      nextCorrect: number,
      nextBossHp: number,
      nextPlayerHp: number,
      mirror: SubmitMegaActionResult | null,
    ) => {
      if (nextBossHp <= 0) {
        void finish(true, nextCorrect, mirror);
        return;
      }
      if (nextPlayerHp <= 0) {
        void finish(false, nextCorrect, mirror);
        return;
      }
      if (qIndex + 1 >= total) {
        void finish(nextCorrect >= MEGA_BOSS_HP / BOSS_DMG, nextCorrect, mirror);
        return;
      }
      setQIndex((i) => i + 1);
      setPicked(null);
      setLocked(false);
      setRemovedWrong(null);
      setRevealCorrect(false);
      setTimer(TIMER);
      questionStart.current = Date.now();
    },
    [qIndex, total, finish],
  );

  const answer = useCallback(
    async (idx: number | null) => {
      if (locked || phase !== "fighting") return;
      setLocked(true);
      setPicked(idx);
      setLastElapsedMs(Date.now() - questionStart.current);
      // Fetch the correct index for this question from the server (cached per qIndex).
      let correctIdx = correctIdxByQ[qIndex];
      if (typeof correctIdx !== "number") {
        const rev = await revealMegaAnswer(event.id, qIndex);
        if (rev) {
          // Server reveals the index in original option order; translate into
          // this run's shuffled display order.
          const displayIdx = toDisplayIdx(qIndex, rev.correctIndex);
          correctIdx = displayIdx;
          setCorrectIdxByQ((m) => ({ ...m, [qIndex]: displayIdx }));
        }
      }
      // If the server check failed (network hiccup) and the user actually picked
      // an option, do NOT score the question — unlock and let them retry rather
      // than mis-marking a correct pick as wrong.
      if (typeof correctIdx !== "number" && idx !== null) {
        toast.error("Connection blip — try that answer again.");
        setLocked(false);
        setPicked(null);
        return;
      }
      const isCorrect = idx !== null && typeof correctIdx === "number" && idx === correctIdx;
      playSfx(isCorrect ? "correct" : "wrong");
      let nextBoss = bossHp;
      let nextPlayer = playerHp;
      let nextCorrect = correctCount;
      if (isCorrect) {
        nextCorrect += 1;
        nextBoss = Math.max(0, bossHp - BOSS_DMG * (xAtkArmed ? 2 : 1));
        setCorrectCount(nextCorrect);
        setBossHp(nextBoss);
        setTimeout(() => playSfx("damage"), 120);
      } else {
        nextPlayer = Math.max(0, playerHp - PLAYER_DMG);
        setPlayerHp(nextPlayer);
      }
      setXAtkArmed(false);

      // server-first-refactor Phase 2 — mirror into mega-run (see
      // attemptIdRef's declaration for the ordering/fallback contract).
      // `choiceIdx` is translated back into ORIGINAL option order: the
      // server only knows the answer key in that order, never this run's
      // display-side shuffle.
      const originalChoiceIdx = idx !== null ? (shuffledSet[qIndex]?.order[idx] ?? null) : null;
      const mirrorPromise = queueMirror({
        type: "answer",
        questionIdx: qIndex,
        choiceIdx: originalChoiceIdx,
      });

      window.setTimeout(() => {
        void mirrorPromise.then((mirror) => advance(nextCorrect, nextBoss, nextPlayer, mirror));
      }, 1100);
    },
    [
      locked,
      phase,
      qIndex,
      correctIdxByQ,
      event.id,
      bossHp,
      playerHp,
      correctCount,
      xAtkArmed,
      advance,
      shuffledSet,
      queueMirror,
    ],
  );

  useEffect(() => {
    if (phase !== "fighting" || locked || bagOpen) return;
    if (timer <= 0) {
      void answer(null);
      return;
    }
    if (timer <= 5) playSfx(timer === 5 ? "timer_warning" : "timer_tick");
    const t = window.setTimeout(() => setTimer((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timer, locked, bagOpen, phase, answer]);

  // Boss cry when the raid screen opens.
  useEffect(() => {
    revealPokemon(event.baseDexId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPotion = useCallback(
    (id: ItemId) => {
      if ((inventory[id] ?? 0) <= 0) return;
      const heal = HEAL[id] ?? 0;
      if (playerHp >= PLAYER_MAX_HP) {
        toast("HP already full");
        return;
      }
      setPlayerHp((hp) => Math.min(PLAYER_MAX_HP, hp + heal));
      grantItem(id, -1);
      toast.success(`${itemDef(id)?.name} used`);
      // applyPotion is only ever called with the 3 heal items (quick shortcuts
      // + the Healing bag section) — safe to narrow for the mirror action.
      void queueMirror({ type: "use_potion", itemId: id as MegaHealItemId });
    },
    [inventory, playerHp, grantItem, queueMirror],
  );

  const applyBattleItem = useCallback(
    async (id: ItemId) => {
      if (usedOnce.has(id) || (inventory[id] ?? 0) <= 0 || locked) return;
      if (id === "scope" || id === "xaccuracy") {
        let correctIdx = correctIdxByQ[qIndex];
        if (typeof correctIdx !== "number") {
          const rev = await revealMegaAnswer(event.id, qIndex);
          if (rev) {
            const displayIdx = toDisplayIdx(qIndex, rev.correctIndex);
            correctIdx = displayIdx;
            setCorrectIdxByQ((m) => ({ ...m, [qIndex]: displayIdx }));
          }
        }
        if (typeof correctIdx !== "number") {
          // Reveal failed — don't consume the item. User can retry.
          toast.error("Couldn't read the answer — try again in a moment.");
          return;
        }
        if (id === "scope") {
          const wrongs = [0, 1, 2, 3].filter((i) => i !== correctIdx);
          setRemovedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
        }
        if (id === "xaccuracy") setRevealCorrect(true);
      }
      if (id === "xattack") {
        setXAtkArmed(true);
        // scope/xaccuracy are hint-only — the server checks the submitted
        // choice against its answer key regardless of any hint, so there's
        // nothing for mega-battle-replay.ts to model for them (see its
        // module doc). Only X Attack changes the HP math, so only it mirrors.
        void queueMirror({ type: "use_xattack" });
      }
      grantItem(id, -1);
      setUsedOnce((s) => new Set(s).add(id));
      toast.success(`${itemDef(id)?.name} used`);
      setBagOpen(false);
    },
    [usedOnce, inventory, locked, qIndex, correctIdxByQ, event.id, grantItem, queueMirror],
  );

  const escape = useCallback(() => {
    if ((inventory.escape ?? 0) <= 0) {
      toast.error("No Escape Rope in your bag");
      return;
    }
    escapedRef.current = true;
    endedRef.current = true;
    grantItem("escape", -1);
    // Free exit — never mirrored as a forfeit (that would consume an
    // attempt server-side too). Clean up the shadow attempt row instead, so
    // the next `start` begins a genuinely fresh log rather than resuming
    // this abandoned one (see abandonMegaAttempt's doc).
    if (attemptIdRef.current) void abandonMegaAttempt(attemptIdRef.current).catch(() => {});
    toast("You fled the raid — this attempt doesn't count.");
    onExit();
  }, [inventory, grantItem, onExit]);

  if (phase === "result" && result) {
    return (
      <>
        {/* Test-observability hook only — not read by any production code. */}
        <div
          data-testid="mega-result"
          data-outcome={result.outcome}
          data-accuracy={result.accuracy}
          data-correct={result.correct}
          data-rank={result.rank ?? ""}
          data-attempts={result.attempts}
          hidden
        />
        <MegaResults
          event={event}
          outcome={result.outcome}
          accuracy={result.accuracy}
          correct={result.correct}
          total={total}
          timeMs={Date.now() - startRef.current}
          rank={result.rank}
          shiny={bossShiny}
          items={result.items}
          canRematch={result.outcome === "loss" && result.attempts < MEGA_MAX_ATTEMPTS}
          onRematch={onRematch}
          onHome={onExit}
          onViewLeaderboard={onViewLeaderboard}
        />
      </>
    );
  }

  const bossPct = Math.max(0, (bossHp / MEGA_BOSS_HP) * 100);
  const playerPct = Math.max(0, (playerHp / PLAYER_MAX_HP) * 100);

  // Quick shortcut items shown next to the Bag button (potions only — battle items are bag-only).
  const quickIds: ItemId[] = ["potion", "superpotion", "maxpotion"];
  const quickShortcuts = quickIds.filter((id) => (inventory[id] ?? 0) > 0).slice(0, 3);

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ background: "var(--brand-ink-deep)", fontFamily: "Outfit, sans-serif" }}
    >
      {/* ARENA — boss + partner HP. Shrinks to fit so the question card always pins to the bottom.
          Deliberately NOT built on game-ui.tsx's shared `CombatPanel`: that
          component is a small side-by-side card (both combatants same size,
          type badges + ability/status chips) matching Regular Battle's 1v1
          layout — Mega Raid's arena is a full-width boss banner with a giant
          centered sprite and a slim partner HP row underneath, an
          intentionally different "raid boss" presentation with no
          abilities/status/type-matchup concepts to show. Forcing CombatPanel
          here would be a real visual regression, not a genuine dedup — see
          the plan's Phase 2 UI note and this session's investigation. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="relative px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
          style={{
            background:
              "radial-gradient(circle at 50% 30%, #2E3A5C 0%, var(--brand-ink) 58%, var(--brand-ink-deep) 100%)",
            overflow: "hidden",
          }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "repeating-conic-gradient(from 0deg at 50% 26%, rgba(242,214,78,0.14) 0deg 6deg, transparent 6deg 13deg)",
            }}
          />
          <div className="relative text-center">
            <div className="text-[20px] font-black text-white">
              {event.name}
              {bossShiny ? "" : ""}
            </div>
            <div className="mt-1 flex justify-center gap-1.5">
              {event.types.map((t) => (
                <span
                  key={t}
                  className="font-pixel text-white"
                  style={{
                    fontSize: 6,
                    background: TYPE_COLORS[t] ?? "#777",
                    padding: "3px 8px",
                    borderRadius: 999,
                  }}
                >
                  {t.toUpperCase()}
                </span>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-pixel text-white" style={{ fontSize: 7 }}>
                HP
              </span>
              <div
                className="flex-1 overflow-hidden"
                style={{
                  height: 12,
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.35)",
                  border: "1.5px solid rgba(255,255,255,0.25)",
                }}
              >
                <div
                  style={{
                    width: `${bossPct}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: "linear-gradient(90deg, var(--brand-gold), #EE8130)",
                    transition: "width 0.4s",
                  }}
                />
              </div>
              <span className="font-pixel text-white" style={{ fontSize: 7 }} data-testid="boss-hp">
                {bossHp}/{MEGA_BOSS_HP}
              </span>
            </div>
          </div>
        </div>

        {/* Boss sprite — flex-1 region that scales to whatever vertical room is left. */}
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-4"
          style={{
            background:
              "linear-gradient(180deg, var(--brand-ink-deep) 0%, var(--brand-ink-deep) 100%)",
          }}
        >
          <div
            className="absolute"
            style={{
              bottom: 4,
              width: "min(46vw, 160px)",
              height: 22,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.45)",
            }}
          />
          <PokemonSprite
            id={event.megaId}
            shiny={bossShiny}
            alt={event.name}
            className="relative h-full max-h-[180px] w-auto object-contain [filter:drop-shadow(0_8px_14px_rgba(0,0,0,0.55))]"
          />
        </div>

        {/* Partner HP row */}
        <div
          className="flex shrink-0 items-center gap-2.5 px-4 pb-2 pt-1.5"
          style={{ background: "var(--brand-ink-deep)" }}
        >
          <PartnerSprite />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-extrabold text-white">
                <PartnerName />
              </span>
              <span
                className="font-pixel"
                style={{ fontSize: 6.5, color: "var(--brand-red)" }}
                data-testid="player-hp"
              >
                {playerHp}/{PLAYER_MAX_HP}
              </span>
            </div>
            <div
              className="mt-1 overflow-hidden"
              style={{ height: 9, borderRadius: 999, background: "rgba(255,255,255,0.12)" }}
            >
              <div
                style={{
                  width: `${playerPct}%`,
                  height: "100%",
                  borderRadius: 999,
                  background: lowHp ? "var(--brand-red)" : "#3F9D5A",
                  transition: "width 0.4s",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* QUESTION CARD — pinned bottom, shrink-0, no inner scroll. */}
      <div className="relative shrink-0 rounded-t-[28px] bg-card pt-12 px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_30px_-12px_oklch(0.3_0.05_260/0.25)]">
        {lowHp && hasAnyPotion && (
          <div
            className="mb-2 flex items-center justify-between rounded-2xl px-3 py-1.5"
            style={{ background: "rgba(226,59,46,0.1)", border: "1.5px solid rgba(226,59,46,0.4)" }}
          >
            <span className="text-[12px] font-bold" style={{ color: "#C22E28" }}>
              ⚠️ Low HP — use a potion!
            </span>
            <button
              onClick={() => setBagOpen(true)}
              className="font-pixel"
              style={{
                fontSize: 7,
                color: "#fff",
                background: "var(--brand-red)",
                borderRadius: 999,
                padding: "5px 10px",
              }}
            >
              OPEN BAG
            </button>
          </div>
        )}

        <AnimatePresence mode="wait">
          <QuestionCard
            key={qIndex}
            trivia={{ ...q, category: q.category || "TRIVIA" }}
            phase={locked ? "feedback" : "question"}
            chosen={picked}
            revealedWrong={removedWrong}
            revealedWrong2={null}
            revealedCorrect={revealCorrect && typeof currentCorrect === "number" ? currentCorrect : null}
            timer={timer}
            maxTime={TIMER}
            lastElapsedMs={lastElapsedMs}
            onAnswer={(i) => answer(i)}
          >
            {/* Item shortcuts row — Backpack trigger + quick item buttons (matches regular battle) */}
            <div className="mt-3 flex items-center justify-center gap-3">
              <button
                data-testid="bag-button"
                onClick={() => setBagOpen(true)}
                className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition active:scale-95"
              >
                <Backpack className="h-6 w-6 text-muted-foreground" />
              </button>
              {quickShortcuts.map((id) => {
                const def = itemDef(id);
                const owned = inventory[id] ?? 0;
                const disabled = owned <= 0 || playerHp >= PLAYER_MAX_HP || locked;
                return (
                  <button
                    key={id}
                    data-testid={`item-${id}`}
                    disabled={disabled}
                    onClick={() => applyPotion(id)}
                    className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition active:scale-95 disabled:opacity-40"
                  >
                    <img
                      src={def?.iconUrl}
                      alt={def?.name}
                      className="sprite h-8 w-8 object-contain [image-rendering:pixelated]"
                    />
                    <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-poke-dark px-1 font-pixel text-[9px] text-white">
                      {owned}
                    </span>
                  </button>
                );
              })}
            </div>
          </QuestionCard>
        </AnimatePresence>
      </div>

      {/* Deliberately NOT built on game-ui.tsx's shared `ItemBagSheet`: that
          component groups the FULL item catalog by `CATEGORY_OF` and gates
          use on Regular-Battle-only concepts (`itemCapReached`,
          `choiceSpecsActive`, a per-battle item cap) that don't exist in
          Mega Raid — Mega only recognizes 6 items total (3 unlimited-use
          potions, 3 once-per-raid battle items via `usedOnce`), and every
          other item in the catalog does nothing here. Reusing ItemBagSheet
          as-is would list those inert items as usable, misleading players;
          this bespoke two-section (Healing / Battle · Once Per Battle) sheet
          keeps the bag scoped to what actually works in this mode. */}
      {bagOpen && (
        <div
          className="absolute inset-0 z-50 flex flex-col justify-end"
          onClick={() => setBagOpen(false)}
        >
          <div className="absolute inset-0" style={{ background: "rgba(10,8,20,0.55)" }} />
          <div
            className="relative max-h-[88vh] overflow-y-auto"
            style={{
              background: "var(--brand-cream)",
              borderRadius: "28px 28px 0 0",
              padding: "14px 20px 32px",
              boxShadow: "0 -16px 40px -12px rgba(0,0,0,0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="mx-auto"
              style={{ width: 42, height: 5, borderRadius: 999, background: "#E2D6B6" }}
            />
            <div className="mt-3.5 flex items-center justify-between">
              <div className="text-xl font-black" style={{ color: "var(--brand-ink)" }}>
                Bag
              </div>
              <div
                className="font-pixel"
                style={{
                  fontSize: 7,
                  color: "#9A7320",
                  background: "#F6E6C4",
                  borderRadius: 999,
                  padding: "6px 10px",
                }}
              >
                RAID RULES
              </div>
            </div>
            <div
              className="mt-2 font-pixel"
              style={{ fontSize: 7, letterSpacing: 1, color: "var(--brand-slate)" }}
            >
              HEALING · STACKABLE
            </div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {(["potion", "superpotion", "maxpotion"] as ItemId[]).map((id) => (
                <BagRow
                  key={id}
                  id={id}
                  count={inventory[id] ?? 0}
                  subtitle={`Restore ${HEAL[id]} HP · stack freely`}
                  onUse={() => applyPotion(id)}
                  disabled={(inventory[id] ?? 0) <= 0 || playerHp >= PLAYER_MAX_HP}
                />
              ))}
            </div>
            <div
              className="mt-3.5 font-pixel"
              style={{ fontSize: 7, letterSpacing: 1, color: "var(--brand-slate)" }}
            >
              BATTLE · ONCE PER BATTLE
            </div>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {(["xattack", "scope", "xaccuracy"] as ItemId[]).map((id) => (
                <BagRow
                  key={id}
                  id={id}
                  count={inventory[id] ?? 0}
                  subtitle={itemDef(id)?.desc ?? ""}
                  used={usedOnce.has(id)}
                  onUse={() => applyBattleItem(id)}
                  disabled={usedOnce.has(id) || (inventory[id] ?? 0) <= 0 || locked}
                />
              ))}
            </div>
            <button
              data-testid="escape-button"
              onClick={escape}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: "rgba(28,35,51,0.9)" }}
            >
              Flee with Escape Rope (doesn't count)
            </button>
          </div>
        </div>
      )}

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the raid?</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving now ends the raid as a loss and uses up one of your
              attempts (feedback f63c4dc3 — you can't bail to save an attempt).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="keep-fighting-button">Keep fighting</AlertDialogCancel>
            <AlertDialogAction
              data-testid="confirm-leave-button"
              onClick={() => {
                setConfirmLeave(false);
                // Record the abandoned run as a loss so it consumes an attempt,
                // rather than a free exit — mirror the forfeit first so
                // finish() can use mega-run's authoritative submit result.
                void queueMirror({ type: "forfeit" }).then((mirror) => finish(false, correctCount, mirror));
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave (counts as attempt)
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PartnerSprite() {
  const partner = useGameStore((s) => s.pokemon);
  if (!partner) return <div style={{ width: 52, height: 52 }} />;
  return <PokemonSprite id={partner.id} back alt={partner.name} className="h-[52px] w-[52px]" />;
}
function PartnerName() {
  const partner = useGameStore((s) => s.pokemon);
  return <>{partner?.name ?? "Partner"}</>;
}

function BagRow({
  id,
  count,
  subtitle,
  used,
  onUse,
  disabled,
}: {
  id: ItemId;
  count: number;
  subtitle: string;
  used?: boolean;
  onUse: () => void;
  disabled?: boolean;
}) {
  const def = itemDef(id);
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-3.5 py-3"
      style={{
        background: "#FDF8EC",
        boxShadow: "0 3px 0 #ECE2C8",
        opacity: disabled && !used ? 0.55 : 1,
      }}
    >
      <div
        className="flex h-[46px] w-[46px] items-center justify-center rounded-xl"
        style={{ background: "#F7DACB" }}
      >
        <img src={def?.iconUrl} alt={def?.name} className="h-8 w-8 [image-rendering:pixelated]" />
      </div>
      <div className="flex-1">
        <div className="text-[15px] font-bold" style={{ color: "var(--brand-ink)" }}>
          {def?.name} {count > 0 && <span style={{ color: "var(--brand-slate)" }}>×{count}</span>}
        </div>
        <div className="text-xs" style={{ color: "var(--brand-slate)" }}>
          {subtitle}
        </div>
      </div>
      <button
        data-testid={`bag-item-${id}`}
        onClick={onUse}
        disabled={disabled}
        className="font-pixel"
        style={{
          fontSize: 6.5,
          color: used ? "var(--brand-slate)" : "#fff",
          background: used ? "#EFE7D2" : disabled ? "#C9B998" : "var(--brand-red)",
          borderRadius: 999,
          padding: "8px 11px",
        }}
      >
        {used ? "USED" : "USE"}
      </button>
    </div>
  );
}
