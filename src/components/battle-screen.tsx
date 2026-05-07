import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ChevronLeft, Backpack, Clock } from "lucide-react";
import { useGameStore, getItemDef } from "@/lib/store";
import {
  pickRandomEnemy,
  type EnemyTrainer,
  ITEMS,
  enemyHpForLevel,
} from "@/lib/game-data";
import { isSuperEffective, spriteUrl } from "@/lib/pokemon-data";
import { HpBar, TypeBadge } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ItemId } from "@/lib/game-data";

export interface Trivia {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
  category: string;
}

const QUESTIONS_PER_SET = 5;
const TIMER_BASE = 20;

type Phase = "intro" | "question" | "feedback" | "result";

interface Props {
  questions: Trivia[];
  onExit: () => void;
}

export function BattleScreen({ questions, onExit }: Props) {
  const player = useGameStore((s) => s.pokemon)!;
  const level = useGameStore((s) => s.level);
  const trainerName = useGameStore((s) => s.trainerName);

  const startBattle = useGameStore((s) => s.startBattle);
  const endBattle = useGameStore((s) => s.endBattle);
  const recordAnswer = useGameStore((s) => s.recordAnswer);
  const completeSet = useGameStore((s) => s.completeSet);
  const consumeXAttack = useGameStore((s) => s.consumeXAttack);
  const useItem = useGameStore((s) => s.useItem);
  const xAttackActive = useGameStore((s) => s.xAttackActive);
  const scopeRevealedThisBattle = useGameStore((s) => s.scopeRevealedThisBattle);
  const consumeScope = useGameStore((s) => s.consumeScope);
  const bonusTime = useGameStore((s) => s.bonusTimeThisBattle);
  const inventory = useGameStore((s) => s.inventory);
  const cooldowns = useGameStore((s) => s.itemCooldowns);

  const [enemy] = useState<EnemyTrainer>(() => pickRandomEnemy());
  const enemyMaxHp = enemyHpForLevel(level);
  const [playerHp, setPlayerHp] = useState(100);
  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [phase, setPhase] = useState<Phase>("intro");
  const [trivia, setTrivia] = useState<Trivia | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealedWrong, setRevealedWrong] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [timer, setTimer] = useState(TIMER_BASE);
  const [dialog, setDialog] = useState("");
  const [shakeWho, setShakeWho] = useState<"player" | "enemy" | null>(null);
  const [floatDmg, setFloatDmg] = useState<{ who: "player" | "enemy"; n: number; super: boolean } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [resultWon, setResultWon] = useState<boolean | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const questionStart = useRef<number>(0);
  const startedRef = useRef(false);
  const maxStreakRef = useRef(0);

  const superEff = isSuperEffective(player, enemy.pokemon);

  // start once
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startBattle();
    setDialog(`${enemy.name} sent out ${enemy.pokemon.name}!`);
    if (superEff) {
      setTimeout(() => setDialog(`Go, ${player.name}! It's super effective!`), 1500);
    } else {
      setTimeout(() => setDialog(`Go, ${player.name}!`), 1500);
    }
    setTimeout(() => loadQuestion(0), 2800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadQuestion(idx: number) {
    setChosen(null);
    setRevealedWrong(null);
    const data = questions[idx];
    if (!data) {
      // Out of questions — player outlasted the trainer
      setTimeout(() => finish(true), 600);
      return;
    }
    setTrivia(data);
    setPhase("question");
    setTimer(TIMER_BASE + bonusTime);
    setDialog(`Category: ${data.category}`);
    questionStart.current = Date.now();
    // scope reveal
    if (scopeRevealedThisBattle) {
      const wrongs = [0, 1, 2, 3].filter((i) => i !== data.correct);
      setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
      consumeScope();
    }
  }

  // timer
  useEffect(() => {
    if (phase !== "question") return;
    if (timer <= 0) {
      handleAnswer(-1);
      return;
    }
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timer]);

  function handleAnswer(idx: number) {
    if (phase !== "question" || !trivia) return;
    setChosen(idx);
    const correct = idx === trivia.correct;
    const elapsed = Date.now() - questionStart.current;

    let newStreak = streak;
    if (correct) {
      newStreak += 1;
      if (newStreak > maxStreakRef.current) maxStreakRef.current = newStreak;
      let dmg = 10;
      if (superEff) dmg *= 2;
      if (xAttackActive) {
        dmg += 20;
        consumeXAttack();
      }
      const newEnemyHp = Math.max(0, enemyHp - dmg);
      setEnemyHp(newEnemyHp);
      setShakeWho("enemy");
      setFloatDmg({ who: "enemy", n: dmg, super: superEff });
      setDialog(`${player.name} dealt ${dmg} damage!`);
      setStreak(newStreak);
      recordAnswer(true, elapsed, newStreak);
      setTimeout(() => setShakeWho(null), 500);
      setTimeout(() => setFloatDmg(null), 1000);

      if (newEnemyHp <= 0) {
        setTimeout(() => finish(true), 1400);
        setPhase("feedback");
        return;
      }
    } else {
      const dmg = 15;
      const newPlayerHp = Math.max(0, playerHp - dmg);
      setPlayerHp(newPlayerHp);
      setShakeWho("player");
      setFloatDmg({ who: "player", n: dmg, super: false });
      setStreak(0);
      recordAnswer(false, elapsed, streak);
      setDialog(
        idx === -1
          ? `Time's up! ${player.name} took ${dmg} damage!`
          : `Wrong! The answer was: ${trivia.options[trivia.correct]}`,
      );
      setTimeout(() => setShakeWho(null), 500);
      setTimeout(() => setFloatDmg(null), 1000);

      if (newPlayerHp <= 0) {
        setTimeout(() => finish(false), 1400);
        setPhase("feedback");
        return;
      }
    }

    setPhase("feedback");
    setTimeout(nextQuestion, 1800);
  }

  function nextQuestion() {
    const next = questionIdx + 1;
    setQuestionIdx(next);
    if (next % QUESTIONS_PER_SET === 0) {
      completeSet();
    }
    loadQuestion(next);
  }

  function finish(won: boolean) {
    const baseXp = won ? 40 + level * 5 : 10 + level * 2;
    const bonus = maxStreakRef.current * 2;
    const total = baseXp + bonus;
    setXpEarned(total);
    setResultWon(won);
    endBattle(won, total);
    setPhase("result");
  }

  function tryUseItem(id: ItemId) {
    const def = getItemDef(id);
    const ok = useItem(id);
    if (!ok) {
      toast.error(`Cannot use ${def.name} right now.`);
      return;
    }
    toast.success(`${def.emoji} Used ${def.name}!`);
    if (id === "potion") {
      setPlayerHp((hp) => Math.min(100, hp + 30));
    }
    if (id === "revive" && playerHp <= 10) {
      setPlayerHp(50);
    }
    if (id === "escape") {
      setBagOpen(false);
      setTimeout(() => onExit(), 300);
    }
    setBagOpen(false);
  }

  if (phase === "result") {
    return (
      <ResultScreen
        won={resultWon!}
        xpEarned={xpEarned}
        streak={streak}
        onRebattle={() => onExit()}
      />
    );
  }

  return (
    <div className="bg-battle-field relative min-h-screen overflow-hidden">
      {/* top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button
          onClick={onExit}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card/80 backdrop-blur"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="rounded-full bg-card/80 px-3 py-1 font-pixel text-[10px] text-foreground backdrop-blur">
          Set {Math.floor(questionIdx / QUESTIONS_PER_SET) + 1} · Q{(questionIdx % QUESTIONS_PER_SET) + 1}/{QUESTIONS_PER_SET}
        </div>
        <Sheet open={bagOpen} onOpenChange={setBagOpen}>
          <SheetTrigger asChild>
            <button className="flex h-10 w-10 items-center justify-center rounded-full bg-card/80 backdrop-blur">
              <Backpack className="h-5 w-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="rounded-t-3xl">
            <SheetHeader>
              <SheetTitle>Item Bag</SheetTitle>
            </SheetHeader>
            <div className="mt-4 grid grid-cols-2 gap-2 pb-6">
              {ITEMS.map((it) => {
                const owned = inventory[it.id] ?? 0;
                const cd = cooldowns[it.id] ?? 0;
                const disabled = owned <= 0 || cd > 0;
                return (
                  <button
                    key={it.id}
                    disabled={disabled}
                    onClick={() => tryUseItem(it.id)}
                    className="flex items-start gap-3 rounded-2xl border-2 p-3 text-left transition disabled:opacity-40 enabled:hover:border-primary"
                  >
                    <img
                      src={it.iconUrl}
                      alt={it.name}
                      className="sprite h-9 w-9 shrink-0 object-contain"
                      onError={(e) => {
                        const el = e.currentTarget as HTMLImageElement;
                        el.replaceWith(
                          Object.assign(document.createElement("span"), {
                            textContent: it.emoji,
                            className: "text-2xl",
                          }),
                        );
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold">
                        {it.name}
                        <span className="font-pixel text-[9px] text-primary">×{owned}</span>
                      </div>
                      <div className="text-[10px] leading-tight text-muted-foreground">
                        {it.desc}
                      </div>
                      {cd > 0 && <div className="text-[10px] text-destructive">Cooldown: {cd}</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* enemy area */}
      <div className="relative px-5 pt-4">
        <div className="rounded-2xl bg-card/85 p-3 backdrop-blur shadow-card">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-pixel text-[10px] uppercase text-muted-foreground">{enemy.title}</div>
              <div className="text-sm font-bold">{enemy.name}'s {enemy.pokemon.name}</div>
              <div className="mt-1 flex gap-1">
                {enemy.pokemon.types.map((t) => (
                  <TypeBadge key={t} type={t} />
                ))}
              </div>
            </div>
            <div className="w-32">
              <HpBar hp={enemyHp} label="HP" />
            </div>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <motion.div
            className={`relative ${shakeWho === "enemy" ? "animate-shake" : ""}`}
            initial={{ x: 80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <img
              src={spriteUrl(enemy.pokemon.id)}
              alt={enemy.pokemon.name}
              className="sprite h-32 w-32"
            />
            {floatDmg?.who === "enemy" && (
              <div className="animate-float-up pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 font-pixel text-base text-destructive">
                -{floatDmg.n}{floatDmg.super && " 💥"}
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* player area */}
      <div className="px-5 pt-2">
        <div className="flex justify-start">
          <motion.div
            className={`relative ${shakeWho === "player" ? "animate-shake" : ""}`}
            initial={{ x: -80, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
          >
            <img
              src={spriteUrl(player.id, true)}
              alt={player.name}
              className="sprite h-32 w-32"
            />
            {floatDmg?.who === "player" && (
              <div className="animate-float-up pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 font-pixel text-base text-destructive">
                -{floatDmg.n}
              </div>
            )}
          </motion.div>
        </div>
        <div className="mt-1 rounded-2xl bg-card/85 p-3 backdrop-blur shadow-card">
          <div className="flex items-center justify-between">
            <div className="w-32">
              <HpBar hp={playerHp} label="HP" />
            </div>
            <div className="text-right">
              <div className="font-pixel text-[10px] uppercase text-muted-foreground">{trainerName}</div>
              <div className="text-sm font-bold">{player.name}</div>
              <div className="mt-1 flex justify-end gap-1">
                {player.types.map((t) => (
                  <TypeBadge key={t} type={t} />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* dialog box */}
      <div className="px-5 pt-3">
        <div className="rounded-xl border-2 border-poke-dark bg-card p-3 text-sm font-medium text-foreground shadow-card">
          {dialog || "..."}
        </div>
      </div>

      {/* question card */}
      <AnimatePresence mode="wait">
        {phase !== "intro" && trivia && (
          <motion.div
            key={questionIdx}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            className="px-5 pb-6 pt-4"
          >
            <div className="rounded-3xl bg-card p-4 shadow-card">
              <div className="mb-3 flex items-center justify-between">
                <div className="font-pixel text-[10px] uppercase text-muted-foreground">
                  {trivia.category}
                </div>
                <div
                  className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-pixel text-[10px] ${
                    timer <= 5 ? "bg-destructive text-destructive-foreground animate-pulse" : "bg-muted"
                  }`}
                >
                  <Clock className="h-3 w-3" /> {timer}s
                </div>
              </div>
              <p className="text-base font-semibold leading-snug">{trivia.question}</p>
              <div className="mt-4 grid grid-cols-1 gap-2">
                {trivia.options.map((opt, i) => {
                  const isCorrect = phase === "feedback" && i === trivia.correct;
                  const isWrong = phase === "feedback" && chosen === i && i !== trivia.correct;
                  const isRevealed = revealedWrong === i;
                  return (
                    <button
                      key={i}
                      disabled={phase !== "question" || isRevealed}
                      onClick={() => handleAnswer(i)}
                      className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition ${
                        isCorrect
                          ? "border-hp-good bg-hp-good/20"
                          : isWrong
                            ? "border-destructive bg-destructive/15"
                            : isRevealed
                              ? "border-muted bg-muted/40 line-through opacity-50"
                              : "border-border bg-card hover:border-primary hover:bg-primary/5"
                      } disabled:cursor-not-allowed`}
                    >
                      <span className="mr-2 font-pixel text-[10px] text-primary">
                        {String.fromCharCode(65 + i)}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
              {phase === "feedback" && (
                <p className="mt-3 rounded-xl bg-muted p-2 text-xs text-muted-foreground">
                  💡 {trivia.explanation}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ResultScreen({
  won,
  xpEarned,
  streak,
  onRebattle,
}: {
  won: boolean;
  xpEarned: number;
  streak: number;
  onRebattle: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex min-h-screen flex-col items-center justify-center px-6 ${
        won ? "bg-victory" : "bg-defeat"
      }`}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 120 }}
        className="text-center"
      >
        <div className="font-pixel text-3xl text-white drop-shadow-lg">
          {won ? "VICTORY!" : "DEFEAT"}
        </div>
        <div className="mt-3 text-6xl">{won ? "🏆" : "💔"}</div>
      </motion.div>
      <div className="mt-8 w-full max-w-xs space-y-3 rounded-3xl bg-card/95 p-5 shadow-pop backdrop-blur">
        <Row label="XP Earned" value={`+${xpEarned}`} accent />
        <Row label="Best Streak" value={String(streak)} />
      </div>
      <Button
        size="lg"
        onClick={onRebattle}
        className="mt-8 w-full max-w-xs rounded-full bg-card py-6 font-semibold text-foreground shadow-pop hover:scale-105"
      >
        Continue
      </Button>
    </motion.div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`font-pixel text-sm ${accent ? "text-primary" : ""}`}>{value}</span>
    </div>
  );
}
