import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ChevronLeft, Backpack, Clock, Share2, Sparkles, Crown } from "lucide-react";
import { useGameStore, getItemDef } from "@/lib/store";
import {
  pickRandomEnemy,
  type EnemyTrainer,
  ITEMS,
  enemyHpForLevel,
  streakMultiplier,
  streakLabel,
} from "@/lib/game-data";
import { isSuperEffective, spriteUrl, findPokemon, type PokeEntry } from "@/lib/pokemon-data";
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
import { ACHIEVEMENTS, unlockedAchievements } from "@/lib/achievements";
import { playCry, playSfx } from "@/lib/audio";
import {
  type EliteMember,
  ELITE_FOUR,
  regionCompleted,
} from "@/lib/elite-four";

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
  mode?: "battle" | "daily" | "elite";
  eliteMember?: EliteMember;
}

export function BattleScreen({ questions, onExit, mode = "battle", eliteMember }: Props) {
  if (mode === "daily") {
    return <DailyScreen questions={questions} onExit={onExit} />;
  }
  if (mode === "elite" && eliteMember) {
    return <BattleMode questions={questions} onExit={onExit} eliteMember={eliteMember} />;
  }
  return <BattleMode questions={questions} onExit={onExit} />;
}

function BattleMode({
  questions,
  onExit,
  eliteMember,
}: Pick<Props, "questions" | "onExit"> & { eliteMember?: EliteMember }) {
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
  const raiseFlag = useGameStore((s) => s.raiseFlag);
  const pushBattleLog = useGameStore((s) => s.pushBattleLog);
  const recordPokedexCapture = useGameStore((s) => s.recordPokedexCapture);
  const markEliteDefeated = useGameStore((s) => s.markEliteDefeated);
  const defeatedElites = useGameStore((s) => s.defeatedElites);

  const isElite = !!eliteMember;

  const [enemy] = useState<EnemyTrainer>(() => {
    if (eliteMember) {
      const poke: PokeEntry =
        findPokemon(eliteMember.signaturePokemonId) ?? {
          id: eliteMember.signaturePokemonId,
          slug: eliteMember.signaturePokemonName.toLowerCase(),
          name: eliteMember.signaturePokemonName,
          types: [eliteMember.type],
        };
      return {
        name: eliteMember.name,
        title: `${eliteMember.title} · ${eliteMember.region}`,
        pokemon: poke,
        isShiny: false,
      };
    }
    return pickRandomEnemy();
  });
  const enemyMaxHp = isElite ? 200 : enemyHpForLevel(level);
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
  const [floatDmg, setFloatDmg] = useState<{ who: "player" | "enemy"; n: number; super: boolean; speedy: boolean } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [resultWon, setResultWon] = useState<boolean | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [streakBanner, setStreakBanner] = useState<string | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState(0);
  const questionStart = useRef<number>(0);
  const startedRef = useRef(false);
  const maxStreakRef = useRef(0);
  const lastStreakLabelRef = useRef<string | null>(null);

  const superEff = isSuperEffective(player, enemy.pokemon);

  // start once
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startBattle();
    if (isElite && eliteMember) {
      playSfx("elite_intro");
      setDialog(`${eliteMember.title} ${eliteMember.name}: "${eliteMember.quote}"`);
      setTimeout(() => playCry(enemy.pokemon.id), 900);
      setTimeout(() => setDialog(`${eliteMember.name} sent out ${enemy.pokemon.name}!`), 2200);
    } else {
      setDialog(`${enemy.name} sent out ${enemy.pokemon.name}!`);
      playCry(enemy.pokemon.id);
    }
    if (enemy.isShiny) {
      toast.success(`✨ A SHINY ${enemy.pokemon.name} appeared!`, {
        duration: 3000,
        style: { background: "linear-gradient(90deg, #fde68a, #fbbf24)", color: "#1f2937" },
      });
    }
    const introDelay = isElite ? 3600 : 1500;
    if (superEff) {
      setTimeout(() => setDialog(`Go, ${player.name}! It's super effective!`), introDelay);
    } else {
      setTimeout(() => setDialog(`Go, ${player.name}!`), introDelay);
    }
    setTimeout(() => loadQuestion(0), introDelay + 1300);
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
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(idx === trivia.correct ? 30 : [50, 30, 50]);
      } catch {
        /* ignore */
      }
    }
    setChosen(idx);
    const correct = idx === trivia.correct;
    const elapsed = Date.now() - questionStart.current;
    setLastElapsedMs(elapsed);

    let newStreak = streak;
    if (correct) {
      newStreak += 1;
      if (newStreak > maxStreakRef.current) maxStreakRef.current = newStreak;

      // streak multiplier
      let dmg = Math.round(10 * streakMultiplier(newStreak));
      // time bonus
      const elapsedSec = elapsed / 1000;
      const totalTime = TIMER_BASE + bonusTime;
      const speedRatio = Math.max(0, (totalTime - elapsedSec) / totalTime);
      const speedBonus = Math.round(5 * speedRatio);
      dmg += speedBonus;
      // type effectiveness AFTER multiplier
      if (superEff) dmg *= 2;
      if (xAttackActive) {
        dmg += 20;
        consumeXAttack();
      }

      const newEnemyHp = Math.max(0, enemyHp - dmg);
      setEnemyHp(newEnemyHp);
      setShakeWho("enemy");
      setFloatDmg({ who: "enemy", n: dmg, super: superEff, speedy: speedBonus >= 3 });
      setDialog(`${player.name} dealt ${dmg} damage!`);
      setStreak(newStreak);
      recordAnswer(true, elapsed, newStreak);
      playSfx("correct");

      const lbl = streakLabel(newStreak);
      if (lbl && lbl !== lastStreakLabelRef.current) {
        lastStreakLabelRef.current = lbl;
        setStreakBanner(lbl);
        setTimeout(() => setStreakBanner(null), 1500);
      }

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
      setFloatDmg({ who: "player", n: dmg, super: false, speedy: false });
      setStreak(0);
      lastStreakLabelRef.current = null;
      recordAnswer(false, elapsed, streak);
      playSfx("wrong");
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
    const eliteBonus = isElite && won ? 100 + level * 10 : 0;
    const bonus = maxStreakRef.current * 2;
    const total = baseXp + bonus + eliteBonus;
    setXpEarned(total);
    setResultWon(won);

    // comeback flag — won at low HP
    if (won && playerHp <= 10) {
      raiseFlag("comeback");
    }

    // Pokédex capture on win
    if (won) {
      recordPokedexCapture(enemy.pokemon.id, enemy.isShiny);
    }

    // Elite Four bookkeeping + premium item rewards
    if (won && isElite && eliteMember) {
      const nextDefeated = defeatedElites.includes(eliteMember.id)
        ? defeatedElites
        : [...defeatedElites, eliteMember.id];
      const regionDone = regionCompleted(eliteMember.region, nextDefeated);
      markEliteDefeated(eliteMember.id, eliteMember.region, regionDone);
      // Grant premium items by directly mutating inventory through buyItem? simplest: emit toast + use store action.
      const inv = useGameStore.getState().inventory;
      useGameStore.setState({
        inventory: {
          ...inv,
          candy: (inv.candy ?? 0) + 1,
          luckyegg: (inv.luckyegg ?? 0) + 1,
        },
      });
      toast.success("🍬 Rare Candy +1 · 🥚 Lucky Egg +1", { duration: 4000 });
      if (regionDone) {
        toast.success(`🏆 ${eliteMember.region} Elite Four cleared!`, { duration: 4500 });
      }
    }

    // snapshot achievements before/after
    const before = new Set(unlockedAchievements(useGameStore.getState()));
    endBattle(won, total);
    pushBattleLog({
      opponent: `${enemy.name}'s ${enemy.pokemon.name}`,
      won,
      xpGained: total,
      bestStreak: maxStreakRef.current,
      timestamp: Date.now(),
    });
    const after = unlockedAchievements(useGameStore.getState());
    for (const id of after) {
      if (!before.has(id)) {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) {
          toast.success(`${a.icon} ${a.name}`, { description: a.desc, duration: 4000 });
        }
      }
    }

    playSfx(won ? "victory" : "defeat");
    if (won) {
      toast.success(`Victory! +${total} XP`, { duration: 2500 });
    } else {
      toast.error(`Defeat — +${total} XP`, { duration: 2500 });
    }
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
    if (id === "xaccuracy") {
      // Also extend the currently-running question's timer immediately.
      setTimer((t) => t + 5);
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
        streak={maxStreakRef.current}
        onRebattle={() => onExit()}
      />
    );
  }

  const totalQuestions = questions.length;
  const progressPct = Math.min(100, (questionIdx / Math.max(1, totalQuestions)) * 100);

  return (
    <div className="bg-battle-field relative min-h-screen overflow-hidden">
      {/* progress bar */}
      <div className="absolute left-0 right-0 top-0 z-40 h-1 bg-poke-dark/20">
        <motion.div
          className="h-full bg-gradient-to-r from-poke-yellow to-primary"
          initial={false}
          animate={{ width: `${progressPct}%` }}
        />
      </div>
      {/* streak banner overlay */}
      <AnimatePresence>
        {streakBanner && (
          <motion.div
            key={streakBanner}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.4, opacity: 0 }}
            transition={{ type: "spring", stiffness: 220, damping: 14 }}
            className="pointer-events-none absolute inset-x-0 top-1/3 z-50 flex justify-center"
          >
            <div className="rounded-2xl bg-poke-dark/80 px-6 py-3 font-pixel text-lg text-poke-yellow shadow-pop">
              {streakBanner}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* top bar */}
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button
          onClick={onExit}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-card/80 backdrop-blur"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className={`flex items-center gap-1 rounded-full px-3 py-1 font-pixel text-[10px] backdrop-blur ${isElite ? "bg-poke-dark text-poke-yellow shadow-pop" : "bg-card/80 text-foreground"}`}>
          {isElite && <Crown className="h-3 w-3" />}
          {isElite
            ? `ELITE · ${eliteMember!.region}`
            : `Set ${Math.floor(questionIdx / QUESTIONS_PER_SET) + 1} · Q${(questionIdx % QUESTIONS_PER_SET) + 1}/${QUESTIONS_PER_SET}`}
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
              <HpBar hp={enemyHp} max={enemyMaxHp} label="HP" />
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
              src={spriteUrl(enemy.pokemon.id, { shiny: enemy.isShiny })}
              alt={enemy.pokemon.name}
              className={`sprite h-32 w-32 ${enemy.isShiny ? "shiny-glow" : ""}`}
            />
            {enemy.isShiny && (
              <Sparkles className="pointer-events-none absolute -right-1 -top-1 h-5 w-5 animate-pulse text-yellow-300 drop-shadow" />
            )}
            {floatDmg?.who === "enemy" && (
              <div className="animate-float-up pointer-events-none absolute -top-2 left-1/2 -translate-x-1/2 font-pixel text-base text-destructive">
                -{floatDmg.n}{floatDmg.super && " 💥"}{floatDmg.speedy && " ⚡"}
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
              className={`sprite h-32 w-32 ${streak >= 5 ? "mega-glow" : ""}`}
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
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="font-pixel text-[10px] uppercase text-muted-foreground">
                    {trivia.category}
                  </div>
                  {streak >= 2 && (
                    <div className="rounded-full bg-poke-yellow/30 px-2 py-0.5 font-pixel text-[9px] text-poke-dark">
                      🔥 {streak} · ×{streakMultiplier(streak)}
                    </div>
                  )}
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
                  💡 {trivia.explanation} · ⚡ {(lastElapsedMs / 1000).toFixed(1)}s
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

// ----------------------------- Daily Challenge Mode -----------------------------

function DailyScreen({ questions, onExit }: Pick<Props, "questions" | "onExit">) {
  const recordDaily = useGameStore((s) => s.recordDaily);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "done">("question");
  const [chosen, setChosen] = useState<number | null>(null);
  const [pattern, setPattern] = useState<string>("");
  const [correctCount, setCorrectCount] = useState(0);
  const [timer, setTimer] = useState(20);
  const startedAt = useRef(Date.now());
  const qStart = useRef(Date.now());
  const recordedRef = useRef(false);

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

  function handleAnswer(picked: number) {
    if (!trivia || phase !== "question") return;
    setChosen(picked);
    const correct = picked === trivia.correct;
    const sym = picked === -1 ? "⬛" : correct ? "🟩" : "🟥";
    const nextPattern = pattern + sym;
    setPattern(nextPattern);
    if (correct) setCorrectCount((c) => c + 1);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try {
        navigator.vibrate(correct ? 30 : [50, 30, 50]);
      } catch { /* ignore */ }
    }
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
        }
        playSfx("victory");
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
    return <DailyResultScreen correct={correctCount} total={total} timeMs={timeMs} pattern={pattern} onExit={onExit} />;
  }

  if (!trivia) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="font-pixel text-sm text-muted-foreground">No daily questions available.</div>
      </div>
    );
  }

  const progressPct = ((idx) / total) * 100;

  return (
    <div className="bg-poke-hero min-h-screen">
      <div className="absolute left-0 right-0 top-0 z-40 h-1 bg-poke-dark/20">
        <motion.div className="h-full bg-poke-yellow" initial={false} animate={{ width: `${progressPct}%` }} />
      </div>
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button onClick={onExit} className="flex h-10 w-10 items-center justify-center rounded-full bg-card/80 backdrop-blur">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="rounded-full bg-poke-dark px-3 py-1 font-pixel text-[10px] text-poke-yellow">
          🔥 DAILY · {idx + 1}/{total}
        </div>
        <div className="w-10" />
      </div>

      <div className="px-5 pt-6">
        <div className="rounded-3xl bg-card p-5 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-pixel text-[10px] uppercase text-muted-foreground">{trivia.category}</div>
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
              return (
                <button
                  key={i}
                  disabled={phase !== "question"}
                  onClick={() => handleAnswer(i)}
                  className={`rounded-2xl border-2 px-4 py-3 text-left text-sm font-medium transition ${
                    isCorrect
                      ? "border-hp-good bg-hp-good/20"
                      : isWrong
                        ? "border-destructive bg-destructive/15"
                        : "border-border bg-card hover:border-primary hover:bg-primary/5"
                  } disabled:cursor-not-allowed`}
                >
                  <span className="mr-2 font-pixel text-[10px] text-primary">{String.fromCharCode(65 + i)}</span>
                  {opt}
                </button>
              );
            })}
          </div>
          {phase === "feedback" && (
            <p className="mt-3 rounded-xl bg-muted p-2 text-xs text-muted-foreground">💡 {trivia.explanation}</p>
          )}
        </div>
        <div className="mt-4 text-center font-pixel text-base tracking-widest">{pattern || "—"}</div>
      </div>
    </div>
  );
}

function DailyResultScreen({
  correct,
  total,
  timeMs,
  pattern,
  onExit,
}: {
  correct: number;
  total: number;
  timeMs: number;
  pattern: string;
  onExit: () => void;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const seconds = Math.round(timeMs / 1000);
  const shareText = `Pokémon Trivia · ${date}\n${correct}/${total} · ${seconds}s\n${pattern}\nplay → poketrivia.app`;

  async function share() {
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (d: ShareData) => Promise<void> }).share) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({ text: shareText });
        return;
      } catch { /* fall through to clipboard */ }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      toast.success("Copied to clipboard!");
    } catch {
      toast.error("Couldn't copy. Long-press the text below.");
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex min-h-screen flex-col items-center justify-center bg-poke-hero px-6"
    >
      <div className="font-pixel text-2xl text-poke-dark">DAILY DONE!</div>
      <div className="mt-3 text-5xl">🏅</div>
      <div className="mt-6 w-full max-w-xs space-y-3 rounded-3xl bg-card/95 p-5 shadow-pop">
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Date</span><span className="font-pixel text-sm">{date}</span></div>
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Score</span><span className="font-pixel text-sm text-primary">{correct}/{total}</span></div>
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Time</span><span className="font-pixel text-sm">{seconds}s</span></div>
        <div className="text-center font-pixel text-lg tracking-widest">{pattern}</div>
      </div>
      <Button size="lg" onClick={share} className="mt-6 w-full max-w-xs rounded-full bg-primary py-6 font-semibold shadow-pop">
        <Share2 className="mr-2 h-4 w-4" /> Share Result
      </Button>
      <Button size="lg" variant="outline" onClick={onExit} className="mt-3 w-full max-w-xs rounded-full border-2 py-6 font-semibold">
        Back
      </Button>
    </motion.div>
  );
}
