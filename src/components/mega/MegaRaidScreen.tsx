import { useCallback, useEffect, useRef, useState } from "react";
import { Backpack } from "lucide-react";
import { toast } from "sonner";
import { PokemonSprite } from "@/components/game-ui";
import type { Trivia } from "@/components/battle-screen";
import { useGameStore } from "@/lib/store";
import { ITEMS, type ItemId } from "@/lib/game-data";
import {
  MEGA_BOSS_HP,
  MEGA_SHINY_CHANCE,
  MEGA_MAX_ATTEMPTS,
  type MegaEvent,
} from "@/lib/mega/schedule";
import { submitMegaRun } from "@/lib/mega/runs";
import { revealMegaAnswer } from "@/lib/mega/questions";
import { MegaResults, type MegaRewardItem } from "@/components/mega/MegaResults";

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

function TimerRing({ timer, maxTime }: { timer: number; maxTime: number }) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold shadow-card ${
        timer <= 5
          ? "animate-pulse bg-destructive text-destructive-foreground"
          : "bg-card text-foreground"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4">
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="3"
        />
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={timer <= 5 ? "currentColor" : "var(--color-hp-good)"}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={2 * Math.PI * 9}
          strokeDashoffset={2 * Math.PI * 9 * (1 - timer / Math.max(1, maxTime))}
          transform="rotate(-90 12 12)"
          style={{ transition: "stroke-dashoffset 0.5s linear" }}
        />
      </svg>
      {timer}s
    </div>
  );
}

export function MegaRaidScreen({ event, questions, onExit, onViewLeaderboard, onRematch }: Props) {
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

  const [usedOnce, setUsedOnce] = useState<Set<ItemId>>(new Set());
  const [xAtkArmed, setXAtkArmed] = useState(false);
  const [removedWrong, setRemovedWrong] = useState<number | null>(null);
  const [revealCorrect, setRevealCorrect] = useState(false);
  // Per-question correct index, learned from the server on answer / hint item.
  const [correctIdxByQ, setCorrectIdxByQ] = useState<Record<number, number>>({});
  const currentCorrect = correctIdxByQ[qIndex];

  const startRef = useRef<number>(Date.now());
  const escapedRef = useRef(false);
  const endedRef = useRef(false);

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
    async (won: boolean, finalCorrect: number) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const timeMs = Date.now() - startRef.current;
      const accuracy = Math.round((finalCorrect / total) * 100);
      let rank: number | null = null;
      let attempts = MEGA_MAX_ATTEMPTS;
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
      setResult({
        outcome: won ? "win" : "loss",
        accuracy,
        correct: finalCorrect,
        rank,
        attempts,
        items: [],
      });
      setPhase("result");
    },
    [event, total],
  );

  const advance = useCallback(
    (nextCorrect: number, nextBossHp: number, nextPlayerHp: number) => {
      if (nextBossHp <= 0) {
        void finish(true, nextCorrect);
        return;
      }
      if (nextPlayerHp <= 0) {
        void finish(false, nextCorrect);
        return;
      }
      if (qIndex + 1 >= total) {
        void finish(nextCorrect >= MEGA_BOSS_HP / BOSS_DMG, nextCorrect);
        return;
      }
      setQIndex((i) => i + 1);
      setPicked(null);
      setLocked(false);
      setRemovedWrong(null);
      setRevealCorrect(false);
      setTimer(TIMER);
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
          correctIdx = rev.correctIndex;
          setCorrectIdxByQ((m) => ({ ...m, [qIndex]: rev.correctIndex }));
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
      let nextBoss = bossHp;
      let nextPlayer = playerHp;
      let nextCorrect = correctCount;
      if (isCorrect) {
        nextCorrect += 1;
        nextBoss = Math.max(0, bossHp - BOSS_DMG * (xAtkArmed ? 2 : 1));
        setCorrectCount(nextCorrect);
        setBossHp(nextBoss);
      } else {
        nextPlayer = Math.max(0, playerHp - PLAYER_DMG);
        setPlayerHp(nextPlayer);
      }
      setXAtkArmed(false);
      window.setTimeout(() => advance(nextCorrect, nextBoss, nextPlayer), 1100);
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
    ],
  );

  useEffect(() => {
    if (phase !== "fighting" || locked || bagOpen) return;
    if (timer <= 0) {
      void answer(null);
      return;
    }
    const t = window.setTimeout(() => setTimer((v) => v - 1), 1000);
    return () => window.clearTimeout(t);
  }, [timer, locked, bagOpen, phase, answer]);

  const usePotion = useCallback(
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
    },
    [inventory, playerHp, grantItem],
  );

  const useBattleItem = useCallback(
    async (id: ItemId) => {
      if (usedOnce.has(id) || (inventory[id] ?? 0) <= 0 || locked) return;
      if (id === "scope" || id === "xaccuracy") {
        let correctIdx = correctIdxByQ[qIndex];
        if (typeof correctIdx !== "number") {
          const rev = await revealMegaAnswer(event.id, qIndex);
          if (rev) {
            correctIdx = rev.correctIndex;
            setCorrectIdxByQ((m) => ({ ...m, [qIndex]: rev.correctIndex }));
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
      if (id === "xattack") setXAtkArmed(true);
      grantItem(id, -1);
      setUsedOnce((s) => new Set(s).add(id));
      toast.success(`${itemDef(id)?.name} used`);
      setBagOpen(false);
    },
    [usedOnce, inventory, locked, qIndex, correctIdxByQ, event.id, grantItem],
  );

  const escape = useCallback(() => {
    if ((inventory.escape ?? 0) <= 0) {
      toast.error("No Escape Rope in your bag");
      return;
    }
    escapedRef.current = true;
    endedRef.current = true;
    grantItem("escape", -1);
    toast("You fled the raid — this attempt doesn't count.");
    onExit();
  }, [inventory, grantItem, onExit]);

  if (phase === "result" && result) {
    return (
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
      style={{ background: "#14161F", fontFamily: "Outfit, sans-serif" }}
    >
      {/* ARENA — boss + partner HP. Shrinks to fit so the question card always pins to the bottom. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          className="relative px-4 pb-2 pt-[calc(env(safe-area-inset-top)+1.25rem)]"
          style={{
            background: "radial-gradient(circle at 50% 30%, #2E3A5C 0%, #1C2333 58%, #14161F 100%)",
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
              {bossShiny ? " ✨" : ""}
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
                    background: "linear-gradient(90deg, #F2D64E, #EE8130)",
                    transition: "width 0.4s",
                  }}
                />
              </div>
              <span className="font-pixel text-white" style={{ fontSize: 7 }}>
                {bossHp}/{MEGA_BOSS_HP}
              </span>
            </div>
          </div>
        </div>

        {/* Boss sprite — flex-1 region that scales to whatever vertical room is left. */}
        <div
          className="relative flex min-h-0 flex-1 items-center justify-center px-4"
          style={{ background: "linear-gradient(180deg, #14161F 0%, #14161F 100%)" }}
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
          style={{ background: "#14161F" }}
        >
          <PartnerSprite />
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-extrabold text-white">
                <PartnerName />
              </span>
              <span className="font-pixel" style={{ fontSize: 6.5, color: "#E23B2E" }}>
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
                  background: lowHp ? "#E23B2E" : "#3F9D5A",
                  transition: "width 0.4s",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* QUESTION CARD — pinned bottom, shrink-0, no inner scroll. */}
      <div className="relative shrink-0 rounded-t-[28px] bg-card pt-12 px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_30px_-12px_oklch(0.3_0.05_260/0.25)]">
        {/* Floating timer pill + category label, sits in the negative gap above the card */}
        <div className="pointer-events-none absolute left-1/2 -top-11 z-10 flex -translate-x-1/2 flex-col items-center">
          <TimerRing timer={timer} maxTime={TIMER} />
          <p className="mt-1 font-pixel text-foreground/70" style={{ fontSize: 7 }}>
            {q.category?.toUpperCase() || "TRIVIA"}
          </p>
        </div>

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
                background: "#E23B2E",
                borderRadius: 999,
                padding: "5px 10px",
              }}
            >
              OPEN BAG
            </button>
          </div>
        )}

        <p className="text-center text-[clamp(0.9rem,3.8vw,1.05rem)] font-bold leading-snug">
          {q.question}
        </p>

        <div className="mt-2.5 grid grid-cols-1 gap-2">
          {q.options.map((opt, i) => {
            const isCorrect = locked && typeof currentCorrect === "number" && i === currentCorrect;
            const isWrong =
              locked && picked === i && typeof currentCorrect === "number" && i !== currentCorrect;
            const removed = removedWrong === i;
            const isAnswerRevealed =
              !locked &&
              revealCorrect &&
              typeof currentCorrect === "number" &&
              i === currentCorrect;
            return (
              <button
                key={i}
                disabled={locked || removed}
                onClick={() => answer(i)}
                className={`flex min-h-[44px] items-center justify-between rounded-2xl border-2 bg-card px-4 py-2 text-left text-[clamp(0.85rem,3.4vw,0.95rem)] font-semibold transition active:scale-[0.98] ${
                  isCorrect
                    ? "border-hp-good bg-hp-good/5 text-hp-good"
                    : isWrong
                      ? "border-destructive bg-destructive/5 text-destructive"
                      : removed
                        ? "border-border/60 line-through opacity-40"
                        : isAnswerRevealed
                          ? "border-hp-good bg-hp-good/10 text-hp-good"
                          : "border-border/60 text-foreground hover:border-primary/50"
                } disabled:cursor-not-allowed`}
              >
                <span className="min-w-0 flex-1 truncate">{opt}</span>
                {isCorrect && (
                  <span className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hp-good text-[12px] text-white">
                    ✓
                  </span>
                )}
                {isWrong && (
                  <span className="ml-2 shrink-0 text-[10px] font-bold uppercase tracking-wide text-destructive">
                    Your Pick ×
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Item shortcuts row — Backpack trigger + quick item buttons (matches regular battle) */}
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
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
                disabled={disabled}
                onClick={() => usePotion(id)}
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
      </div>

      {bagOpen && (
        <div
          className="absolute inset-0 z-50 flex flex-col justify-end"
          onClick={() => setBagOpen(false)}
        >
          <div className="absolute inset-0" style={{ background: "rgba(10,8,20,0.55)" }} />
          <div
            className="relative max-h-[88vh] overflow-y-auto"
            style={{
              background: "#FBF3DF",
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
              <div className="text-xl font-black" style={{ color: "#1C2333" }}>
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
              style={{ fontSize: 7, letterSpacing: 1, color: "#6B6E7B" }}
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
                  onUse={() => usePotion(id)}
                  disabled={(inventory[id] ?? 0) <= 0 || playerHp >= PLAYER_MAX_HP}
                />
              ))}
            </div>
            <div
              className="mt-3.5 font-pixel"
              style={{ fontSize: 7, letterSpacing: 1, color: "#6B6E7B" }}
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
                  onUse={() => useBattleItem(id)}
                  disabled={usedOnce.has(id) || (inventory[id] ?? 0) <= 0 || locked}
                />
              ))}
            </div>
            <button
              onClick={escape}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ background: "rgba(28,35,51,0.9)" }}
            >
              🪢 Flee with Escape Rope (doesn't count)
            </button>
          </div>
        </div>
      )}
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
        <div className="text-[15px] font-bold" style={{ color: "#1C2333" }}>
          {def?.name} {count > 0 && <span style={{ color: "#6B6E7B" }}>×{count}</span>}
        </div>
        <div className="text-xs" style={{ color: "#6B6E7B" }}>
          {subtitle}
        </div>
      </div>
      <button
        onClick={onUse}
        disabled={disabled}
        className="font-pixel"
        style={{
          fontSize: 6.5,
          color: used ? "#6B6E7B" : "#fff",
          background: used ? "#EFE7D2" : disabled ? "#C9B998" : "#E23B2E",
          borderRadius: 999,
          padding: "8px 11px",
        }}
      >
        {used ? "USED" : "USE"}
      </button>
    </div>
  );
}
