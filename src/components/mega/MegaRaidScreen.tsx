import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { FieldSprite, NaBattleField, NaHpCard, NaQuestionPanel, type AnswerState } from "@/components/na/battle";
import { NaTypeChip } from "@/components/na/type-chip";
import { NaGlossIcon } from "@/components/na/gloss-icon";
import { NaButton } from "@/components/na/button";
import { getAbility } from "@/lib/abilities";
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
import { playSfx, revealPokemon, playBattleResult } from "@/lib/audio";
import { answerHaptic } from "@/lib/haptics";
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
      // Parity with Regular/Weekly/Elite, which have both fired since launch.
      // A Mega Raid — the longest fight in the game at 50 questions — used to
      // simply go quiet at the end.
      playSfx(won ? "victory" : "defeat");
      playBattleResult("mega", won);
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
      answerHaptic(isCorrect);
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

  const partner = useGameStore.getState().pokemon;
  const abilityId = useGameStore.getState().abilityId;
  const partnerAbility = partner ? getAbility(partner.types, abilityId) : null;
  const answerStates: AnswerState[] = q.options.map((_, i) => {
    if (locked) {
      if (typeof currentCorrect === "number" && i === currentCorrect) return picked === i ? "correct" : "reveal";
      return picked === i ? "wrong" : "dimmed";
    }
    if (removedWrong === i) return "struck";
    if (revealCorrect && currentCorrect === i) return "reveal";
    return "default";
  });

  return (
    // Figma 13.2: the raid's own stage, the boss bar (MEGA RAID and its HP), your partner's card, the question panel.
    <div className="relative h-full w-full overflow-hidden bg-night-deep">
      {/* Test-observability hooks only, in the "hp/max" form the tests read. */}
      <span data-testid="boss-hp" hidden>
        {bossHp}/{MEGA_BOSS_HP}
      </span>
      <span data-testid="player-hp" hidden>
        {playerHp}/{PLAYER_MAX_HP}
      </span>
      <NaBattleField mode="raid">
        <FieldSprite id={event.megaId} shiny={bossShiny} k={2} cx={286} feetY={215} />
        {partner && <FieldSprite id={partner.id} back k={3} cx={104} feetY={420} />}
        <div
          className="absolute flex w-[188px] flex-col gap-1.5 rounded-2xl border border-white/[0.16] bg-night-deep/70 px-3 py-2.5 shadow-[inset_0_1px_0_rgb(255_255_255/0.14),0_12px_32px_rgb(0_0_0/0.35)] backdrop-blur-xl"
          style={{ left: 12, top: 52 }}
        >
          <span className="flex items-center justify-between">
            <span className="na-label uppercase text-[#FF7A85]">Mega Raid</span>
            <span className="na-number-m text-foreground">{bossHp}</span>
          </span>
          <span className="na-headline truncate text-foreground">{event.name}</span>
          <span className="flex gap-1">
            {event.types.map((t) => (
              <NaTypeChip key={t} type={t} />
            ))}
          </span>
          <span className="relative h-2.5 overflow-hidden rounded-[5px] bg-night-base">
            <span className="na-fill-gold absolute inset-y-0 left-0 rounded-[5px] transition-[width] duration-300" style={{ width: `${(bossHp / MEGA_BOSS_HP) * 100}%` }} />
          </span>
        </div>
        {partner && (
          <NaHpCard
            side="player"
            name={partner.name}
            hp={playerHp}
            maxHp={PLAYER_MAX_HP}
            types={partner.types}
            abilityName={partnerAbility?.name}
            abilityDescription={partnerAbility?.description}
            style={{ left: 178, top: 262 }}
          />
        )}
      </NaBattleField>
      <NaQuestionPanel
        
        seconds={timer}
        maxSeconds={TIMER}
        category={q.category || "Trivia"}
        progress={`Q${qIndex + 1}`}
        question={q.question}
        options={q.options}
        states={answerStates}
        disabled={(i) => locked || removedWrong === i}
        onAnswer={(i) => void answer(i)}
        bag={
          <button type="button" data-testid="bag-button" aria-label="Open your bag" onClick={() => setBagOpen(true)} className="press">
            <NaGlossIcon kind="bag" size={28} />
          </button>
        }
        banner={
          lowHp && hasAnyPotion ? (
            <button type="button" onClick={() => setBagOpen(true)} className="na-caption mt-1 rounded-xl border border-danger/60 bg-danger/15 px-3 py-2 text-foreground">
              Low HP! Open your bag for a potion.
            </button>
          ) : null
        }
      />
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
        <div className="absolute inset-0 z-50 flex flex-col justify-end" onClick={() => setBagOpen(false)}>
          <div className="absolute inset-0 bg-[rgb(4_6_15/0.6)]" />
          <div
            className="na-raised relative flex max-h-[88%] flex-col gap-2.5 overflow-y-auto rounded-t-[28px] px-5 pb-[calc(env(safe-area-inset-bottom)+30px)] pt-2.5"
            onClick={(e) => e.stopPropagation()}
          >
            <div aria-hidden className="mx-auto h-[5px] w-10 shrink-0 rounded-[3px] bg-white/30" />
            <div className="flex items-center justify-between">
              <span className="na-display-m text-foreground">Bag</span>
              <span className="na-label rounded-full bg-reward-gold/15 px-2.5 py-1 uppercase text-reward-gold">Raid rules</span>
            </div>
            <span className="na-label uppercase text-text-secondary">Healing · use any time</span>
            {(["potion", "superpotion", "maxpotion"] as ItemId[]).map((id) => (
              <BagRow
                key={id}
                id={id}
                count={inventory[id] ?? 0}
                subtitle={`Restores ${HEAL[id]} HP`}
                onUse={() => applyPotion(id)}
                disabled={(inventory[id] ?? 0) <= 0 || playerHp >= PLAYER_MAX_HP}
              />
            ))}
            <span className="na-label mt-1 uppercase text-text-secondary">Battle · once per raid</span>
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
            <NaButton kind="secondary" size="M" block data-testid="escape-button" onClick={escape} className="mt-2">
              Flee with an Escape Rope (doesn&apos;t count)
            </NaButton>
          </div>
        </div>
      )}

      <AlertDialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the raid?</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving now ends the raid as a loss and uses up one of your attempts (feedback
              f63c4dc3 — you can't bail to save an attempt).
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
                void queueMirror({ type: "forfeit" }).then((mirror) =>
                  finish(false, correctCount, mirror),
                );
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
    <div className={`na-glass flex items-center gap-3 rounded-2xl px-3.5 py-3 ${disabled && !used ? "opacity-55" : ""}`}>
      <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl bg-night-card-2">
        <img src={def?.iconUrl} alt={def?.name} className="h-8 w-8 [image-rendering:pixelated]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="na-body-strong text-foreground">
          {def?.name} {count > 0 && <span className="text-text-secondary">×{count}</span>}
        </span>
        <span className="na-caption text-text-secondary">{subtitle}</span>
      </span>
      <NaButton kind={used ? "secondary" : "primary"} size="M" data-testid={`bag-item-${id}`} onClick={onUse} disabled={disabled}>
        {used ? "Used" : "Use"}
      </NaButton>
    </div>
  );
}
