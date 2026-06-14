import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ChevronLeft, Backpack, Clock, Sparkles, Crown } from "lucide-react";
import { useGameStore, getItemDef } from "@/lib/store";
import {
  pickRandomEnemy,
  type EnemyTrainer,
  ITEMS,
  enemyHpForLevel,
  streakMultiplier,
  streakLabel,
  TP_REWARDS,
  getTpMultiplier,
} from "@/lib/game-data";
import { isSuperEffective, findPokemon, isPlayerDisadvantaged, isPlayerImmune, type PokeEntry, type PokeType } from "@/lib/pokemon-data";
import { getAbility as getAbilityFn, type Ability } from "@/lib/abilities";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import { HpBar, TypeBadge, PokemonSprite, PokeballPattern, type DailyMark } from "@/components/game-ui";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import type { ItemId } from "@/lib/game-data";
import { ACHIEVEMENTS, unlockedAchievements } from "@/lib/achievements";
import { playCry, playSfx } from "@/lib/audio";
import {
  type EliteMember,
  ELITE_FOUR,
  regionCompleted,
} from "@/lib/elite-four";
import type { GymLeader } from "@/lib/gym-leaders";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";
import { trainerSpriteUrl } from "@/lib/game-data";

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

function CombatPanel({
  align,
  trainerName,
  pokemonName,
  types,
  hp,
  maxHp,
  statuses,
  abilityName,
  immune,
  disadvantaged,
}: {
  align: "left" | "right";
  trainerName: string;
  pokemonName: string;
  types: PokeType[];
  hp: number;
  maxHp: number;
  statuses: Array<{ kind: "confused" | "poisoned" }>;
  abilityName: string | null;
  immune: boolean;
  disadvantaged: boolean;
}) {
  const pct = Math.max(0, Math.min(100, (hp / maxHp) * 100));
  const barColor = pct > 50 ? "bg-hp-good" : pct > 20 ? "bg-hp-warn" : "bg-hp-low";
  const alignCls = align === "right" ? "items-end text-right" : "items-start text-left";
  const justifyCls = align === "right" ? "justify-end" : "justify-start";

  return (
    <div className="w-[clamp(8.5rem,42vw,11rem)] shrink-0 rounded-xl bg-card/90 px-2.5 py-1.5 backdrop-blur shadow-card">
      <div className={`flex flex-col ${alignCls}`}>
        <div className="truncate font-pixel text-[8px] uppercase text-muted-foreground">{trainerName}</div>
        <div className="w-full truncate text-sm font-bold leading-tight">{pokemonName}</div>
        <div className={`mt-0.5 flex w-full gap-0.5 ${justifyCls}`}>
          {types.map((t) => <TypeBadge key={t} type={t} size="sm" />)}
        </div>
        <div className="mt-1 flex w-full items-center gap-1">
          <span className="font-pixel text-[7px] text-hp-good">HP</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full border border-poke-dark/60 bg-poke-dark/20">
            <motion.div
              className={`h-full ${barColor}`}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 18 }}
            />
          </div>
        </div>
        <div className="mt-0.5 w-full font-pixel text-[8px] tabular-nums text-muted-foreground">{Math.round(hp)}/{maxHp}</div>
        {(abilityName || immune || disadvantaged || statuses.length > 0) && (
          <div className={`mt-0.5 flex w-full flex-wrap gap-0.5 ${justifyCls}`}>
            {abilityName && <span className="rounded-full bg-primary/10 px-1 py-[1px] font-pixel text-[7px] text-primary">⚡ {abilityName}</span>}
            {immune && <span className="rounded-full bg-hp-good/20 px-1 py-[1px] font-pixel text-[7px] text-hp-good">🛡</span>}
            {disadvantaged && !immune && <span className="rounded-full bg-destructive/20 px-1 py-[1px] font-pixel text-[7px] text-destructive">⚠</span>}
            {statuses.map((s) => (
              <span key={s.kind} className={`rounded-full px-1 py-[1px] font-pixel text-[7px] ${s.kind === "confused" ? "bg-poke-yellow/30 text-poke-dark" : "bg-purple-500/20 text-purple-700"}`}>
                {s.kind === "confused" ? "🌀" : "☠️"}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface Props {
  questions: Trivia[];
  onExit: () => void;
  mode?: "battle" | "daily" | "elite" | "weekly";
  eliteMember?: EliteMember;
  gymLeader?: GymLeader | null;
}

export function BattleScreen({ questions, onExit, mode = "battle", eliteMember, gymLeader }: Props) {
  if (mode === "daily") {
    return <DailyScreen questions={questions} onExit={onExit} />;
  }
  if (mode === "elite" && eliteMember) {
    return <BattleMode questions={questions} onExit={onExit} eliteMember={eliteMember} />;
  }
  if (mode === "weekly" && gymLeader) {
    return <BattleMode questions={questions} onExit={onExit} gymLeader={gymLeader} />;
  }
  return <BattleMode questions={questions} onExit={onExit} />;
}

function BattleMode({
  questions,
  onExit,
  eliteMember,
  gymLeader,
}: Pick<Props, "questions" | "onExit"> & { eliteMember?: EliteMember; gymLeader?: GymLeader }) {
  const player = useGameStore((s) => s.pokemon)!;
  const level = useGameStore((s) => s.level);
  const trainerName = useGameStore((s) => s.trainerName);

  const startBattle = useGameStore((s) => s.startBattle);
  const endBattle = useGameStore((s) => s.endBattle);
  const abortBattle = useGameStore((s) => s.abortBattle);
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
  const isWeekly = !!gymLeader;
  const recordWeeklyLeagueResult = useGameStore((s) => s.recordWeeklyLeagueResult);

  const [enemy] = useState<EnemyTrainer>(() => {
    if (gymLeader) {
      const poke: PokeEntry =
        findPokemon(gymLeader.signaturePokemonId) ?? {
          id: gymLeader.signaturePokemonId,
          slug: gymLeader.name.toLowerCase(),
          name: gymLeader.name,
          types: [gymLeader.type],
          evolvesFromId: null,
          evolvesToIds: [],
          evolutionStage: 1,
          isFullyEvolved: true,
        };
      return {
        name: gymLeader.name,
        title: `Gym Leader · ${gymLeader.region}`,
        pokemon: poke,
        isShiny: false,
      };
    }
    if (eliteMember) {
      const poke: PokeEntry =
        findPokemon(eliteMember.signaturePokemonId) ?? {
          id: eliteMember.signaturePokemonId,
          slug: eliteMember.signaturePokemonName.toLowerCase(),
          name: eliteMember.signaturePokemonName,
          types: [eliteMember.type],
          evolvesFromId: null,
          evolvesToIds: [],
          evolutionStage: 1,
          isFullyEvolved: true,
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
  const enemyMaxHp = isWeekly ? 250 : isElite ? 200 : enemyHpForLevel(level);
  const playerAbility = useMemo(() => getAbilityFn(player.types), [player.types]);
  const playerMaxHp = playerAbility.id === "adaptable" ? 105 : 100;
  const [playerHp, setPlayerHp] = useState(playerMaxHp);
  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [phase, setPhase] = useState<Phase>("intro");
  const [trivia, setTrivia] = useState<Trivia | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealedWrong, setRevealedWrong] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [introBanner, setIntroBanner] = useState<string | null>(null);
  const [shakeWho, setShakeWho] = useState<"player" | "enemy" | null>(null);
  const [floatDmg, setFloatDmg] = useState<{ who: "player" | "enemy"; n: number; super: boolean; speedy: boolean } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [resultWon, setResultWon] = useState<boolean | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [streakBanner, setStreakBanner] = useState<string | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState(0);
  const questionStart = useRef<number>(0);
  const startedRef = useRef(false);
  const maxStreakRef = useRef(0);
  const lastStreakLabelRef = useRef<string | null>(null);
  const correctCountRef = useRef(0);
  const topDmgRef = useRef(0);
  const [tpEarned, setTpEarned] = useState(0);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const trainerSpriteId = useGameStore((s) => s.trainerSprite);

  // finishRef gives hooks a stable handle to the latest finish() closure
  const finishRef = useRef<(won: boolean) => void>(() => {});

  const superEff = isSuperEffective(player, enemy.pokemon);
  const disadvantaged = useMemo(
    () => isPlayerDisadvantaged(player, enemy.pokemon),
    [player, enemy.pokemon],
  );
  const immune = useMemo(
    () => isPlayerImmune(player, enemy.pokemon),
    [player, enemy.pokemon],
  );

  // Phase 2: ability + status state
  type StatusKind = "confused" | "poisoned";
  interface ActiveStatus { kind: StatusKind; curesRemaining: number; appliedAt: number }
  const [statuses, setStatuses] = useState<ActiveStatus[]>([]);
  const wrongStreakRef = useRef(0);
  const poisonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAbilityToastRef = useRef<number>(0);
  const abilityStateRef = useRef({
    sturdyUsed: false,
    iceFirstWrongConsumed: false,
    hydrationUsed: false,
    cursedBodyPending: null as { hpBefore: number; appliedAt: number } | null,
    triggered: new Set<string>(),
  });
  const [timer, setTimer] = useState(20);

  function triggerAbilityToast(ability: Ability) {
    const already = abilityStateRef.current.triggered.has(ability.id);
    const now = Date.now();
    const recentlyShown = now - lastAbilityToastRef.current < 1500;
    if (!recentlyShown) {
      toast.info(`✨ ${ability.name} activated!`, {
        description: ability.description,
        duration: 2200,
      });
      lastAbilityToastRef.current = now;
    }
    if (!already) {
      abilityStateRef.current.triggered.add(ability.id);
      useGameStore.getState().registerAbilityTriggered(ability.id);
    }
  }

  function stopPoisonTick() {
    if (poisonTimerRef.current) {
      clearInterval(poisonTimerRef.current);
      poisonTimerRef.current = null;
    }
  }

  function startPoisonTick() {
    stopPoisonTick();
    poisonTimerRef.current = setInterval(() => {
      setPlayerHp((hp) => {
        const tick = Math.max(1, Math.floor(playerMaxHp * 0.02));
        const next = Math.max(0, hp - tick);
        setFloatDmg({ who: "player", n: tick, super: false, speedy: false });
        setTimeout(() => setFloatDmg(null), 800);
        if (next <= 0) {
          stopPoisonTick();
          setTimeout(() => finish(false), 800);
        }
        return next;
      });
    }, 2000);
  }

  function applyStatus(kind: StatusKind) {
    if (
      kind === "confused" &&
      playerAbility.id === "hydration" &&
      !abilityStateRef.current.hydrationUsed
    ) {
      abilityStateRef.current.hydrationUsed = true;
      triggerAbilityToast(playerAbility);
      return;
    }
    const cureNeeds = { confused: 2, poisoned: 3 } as const;
    setStatuses((prev) => {
      const without = prev.filter((s) => s.kind !== kind);
      return [...without, { kind, curesRemaining: cureNeeds[kind], appliedAt: Date.now() }];
    });
    if (kind === "confused") {
      toast.warning("🌀 Confused! Some correct answers may miss.");
    } else {
      toast.error("☠️ Poisoned! Losing HP over time.");
      startPoisonTick();
    }
  }

  function tickStatusCure(kind: StatusKind) {
    setStatuses((prev) => {
      const willClear = prev.some((s) => s.kind === kind && s.curesRemaining === 1);
      const updated = prev
        .map((s) => (s.kind === kind ? { ...s, curesRemaining: s.curesRemaining - 1 } : s))
        .filter((s) => s.curesRemaining > 0);
      if (willClear) {
        if (kind === "confused") toast.success("Snapped out of confusion!");
        if (kind === "poisoned") {
          toast.success("Recovered from poison!");
          stopPoisonTick();
        }
      }
      return updated;
    });
  }


  // Tutorial state — only in regular battles, never Elite
  const flags = useGameStore((s) => s.flags);
  const tutorialActive = useMemo(
    () => !flags.includes("tutorial_done") && !eliteMember,
    [flags, eliteMember],
  );
  const [tutorialStep, setTutorialStep] = useState<1 | 2 | 3 | null>(null);

  function dismissTutorial() {
    const wasStep3 = tutorialStep === 3;
    setTutorialStep(null);
    if (wasStep3) {
      raiseFlag("tutorial_done");
    }
  }

  function skipTutorial() {
    setTutorialStep(null);
    raiseFlag("tutorial_done");
  }

  // start once
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startBattle();
    if (isElite && eliteMember) {
      playSfx("elite_intro");
      setIntroBanner(`${eliteMember.title} ${eliteMember.name}: "${eliteMember.quote}"`);
      setTimeout(() => playCry(enemy.pokemon.id), 900);
      setTimeout(() => setIntroBanner(`${eliteMember.name} sent out ${enemy.pokemon.name}!`), 2200);
    } else {
      setIntroBanner(`${enemy.name} sent out ${enemy.pokemon.name}!`);
      playCry(enemy.pokemon.id);
    }
    if (enemy.isShiny) {
      toast.success(`✨ A SHINY ${enemy.pokemon.name} appeared!`, {
        duration: 3000,
        style: { background: "linear-gradient(90deg, #fde68a, #fbbf24)", color: "#1f2937" },
      });
    }
    const introDelay = isElite ? 3600 : 1500;
    setTimeout(
      () => setIntroBanner(`Go, ${player.name}!${superEff ? " Type advantage!" : ""}`),
      introDelay,
    );
    setTimeout(() => setIntroBanner(null), introDelay + 1300);
    setTimeout(() => loadQuestion(0), introDelay + 1300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadQuestion(idx: number) {
    setChosen(null);
    setRevealedWrong(null);
    const data = questions[idx];
    if (!data) {
      // Out of questions — decide based on remaining HP.
      // Player wins only if enemy HP is 0; otherwise the enemy outlasted them.
      const won = enemyHp <= 0;
      setTimeout(() => finish(won), 600);
      return;
    }
    setTrivia(data);
    setPhase("question");
    setTimer(TIMER_BASE + bonusTime);
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
    if (confirmExit) return;
    if (tutorialStep !== null) return;
    if (timer <= 0) {
      handleAnswer(-1);
      return;
    }
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timer, confirmExit, tutorialStep]);

  // Trigger tutorial on first 3 questions
  useEffect(() => {
    if (phase === "question" && tutorialActive && questionIdx <= 2) {
      const id = (questionIdx + 1) as 1 | 2 | 3;
      setTutorialStep(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx, tutorialActive]);

  // Phase 2: ability onBattleStart effects (run once)
  useEffect(() => {
    if (playerAbility.id === "intimidate") {
      setEnemyHp(Math.floor(enemyMaxHp * 0.9));
    }
    if (playerAbility.id === "sand-veil") {
      useGameStore.setState((s) => ({ bonusTimeThisBattle: s.bonusTimeThisBattle + 2 }));
    }
    return () => {
      stopPoisonTick();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pause/resume poison tick when battle is paused
  useEffect(() => {
    const paused = confirmExit || tutorialStep !== null || phase === "result";
    const poisoned = statuses.some((s) => s.kind === "poisoned");
    if (paused && poisonTimerRef.current) {
      stopPoisonTick();
    } else if (!paused && poisoned && !poisonTimerRef.current) {
      startPoisonTick();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmExit, tutorialStep, statuses, phase]);

  // Foresight: every 5th question reveal a wrong option
  useEffect(() => {
    if (phase !== "question" || !trivia) return;
    if (playerAbility.id !== "foresight") return;
    if ((questionIdx + 1) % 5 !== 0) return;
    const wrongs = trivia.options.map((_, i) => i).filter((i) => i !== trivia.correct);
    setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    triggerAbilityToast(playerAbility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx, trivia, playerAbility]);

  // Compound Eyes: reveal a wrong option on first/last of each set
  useEffect(() => {
    if (phase !== "question" || !trivia) return;
    if (playerAbility.id !== "compound-eyes") return;
    const pos = questionIdx % QUESTIONS_PER_SET;
    if (pos !== 0 && pos !== QUESTIONS_PER_SET - 1) return;
    const wrongs = trivia.options.map((_, i) => i).filter((i) => i !== trivia.correct);
    setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    triggerAbilityToast(playerAbility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, questionIdx, trivia, playerAbility]);


  function handleAnswer(idx: number) {
    if (phase !== "question" || !trivia) return;
    if (tutorialStep !== null) return;
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
      correctCountRef.current += 1;
      wrongStreakRef.current = 0;

      // Confused miss: 25% chance to do nothing
      const isConfused = statuses.some((s) => s.kind === "confused");
      if (isConfused && Math.random() < 0.25) {
        toast.warning(`🌀 ${player.name} is confused — its attack missed!`);
        setShakeWho("player");
        setTimeout(() => setShakeWho(null), 500);
        tickStatusCure("confused");
        setStreak(0);
        lastStreakLabelRef.current = null;
        recordAnswer(true, elapsed, streak);
        playSfx("wrong");
        setPhase("feedback");
        setTimeout(nextQuestion, 1500);
        return;
      }

      newStreak += 1;
      if (newStreak > maxStreakRef.current) maxStreakRef.current = newStreak;

      // streak multiplier
      let dmg = Math.round(10 * streakMultiplier(newStreak));
      // TP damage boost
      const tpNow = useGameStore.getState().trainingPoints[player.id] ?? 0;
      const tpMult = getTpMultiplier(tpNow);
      if (tpMult > 1.0) dmg = Math.round(dmg * tpMult);
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
      // Tailwind: +20% dmg on first 3 questions
      if (playerAbility.id === "tailwind" && questionIdx < 3) {
        dmg = Math.round(dmg * 1.2);
        triggerAbilityToast(playerAbility);
      }
      // Guts: +10% dmg if below 50% HP
      if (playerAbility.id === "guts" && playerHp < playerMaxHp / 2) {
        dmg = Math.round(dmg * 1.1);
        triggerAbilityToast(playerAbility);
      }

      const newEnemyHp = Math.max(0, enemyHp - dmg);
      if (dmg > topDmgRef.current) topDmgRef.current = dmg;
      setEnemyHp(newEnemyHp);
      setShakeWho("enemy");
      setFloatDmg({ who: "enemy", n: dmg, super: superEff, speedy: speedBonus >= 3 });
      setStreak(newStreak);
      recordAnswer(true, elapsed, newStreak);
      playSfx("correct");

      // Leech Seed: heal 2
      if (playerAbility.id === "leech-seed") {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 2));
        triggerAbilityToast(playerAbility);
      }
      // Cursed Body: restore HP if pending within 5s
      if (playerAbility.id === "cursed-body" && abilityStateRef.current.cursedBodyPending) {
        const { hpBefore, appliedAt } = abilityStateRef.current.cursedBodyPending;
        if (Date.now() - appliedAt <= 5000) {
          setPlayerHp(hpBefore);
          triggerAbilityToast(playerAbility);
        }
        abilityStateRef.current.cursedBodyPending = null;
      }
      // Status cure ticks
      tickStatusCure("confused");
      tickStatusCure("poisoned");

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
      wrongStreakRef.current += 1;
      // Matchup-aware wrong-answer damage
      let wrongDmg = 10;
      if (immune) wrongDmg = 5;
      else if (disadvantaged) wrongDmg = 15;

      // Ability modifiers (in spec order)
      if (playerAbility.id === "multiscale" && playerHp === playerMaxHp) {
        wrongDmg = Math.floor(wrongDmg / 2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "filter" && disadvantaged) {
        wrongDmg = Math.floor(wrongDmg * 0.75);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "static" && Math.random() < 0.15) {
        wrongDmg = Math.floor(wrongDmg / 2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "snow-cloak" && !abilityStateRef.current.iceFirstWrongConsumed) {
        wrongDmg = 0;
        abilityStateRef.current.iceFirstWrongConsumed = true;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "flame-body" && Math.random() < 0.10) {
        wrongDmg = 0;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "cute-charm" && Math.random() < 0.05) {
        wrongDmg = 0;
        triggerAbilityToast(playerAbility);
      }

      // Cursed Body: track HP before damage for potential heal-back
      if (playerAbility.id === "cursed-body") {
        abilityStateRef.current.cursedBodyPending = {
          hpBefore: playerHp,
          appliedAt: Date.now(),
        };
      }

      let newPlayerHp = Math.max(0, playerHp - wrongDmg);
      // Sturdy: revive at 1
      if (
        playerAbility.id === "sturdy" &&
        newPlayerHp <= 0 &&
        !abilityStateRef.current.sturdyUsed
      ) {
        newPlayerHp = 1;
        abilityStateRef.current.sturdyUsed = true;
        triggerAbilityToast(playerAbility);
      }

      setPlayerHp(newPlayerHp);
      setShakeWho("player");
      setFloatDmg({ who: "player", n: wrongDmg, super: false, speedy: false });
      setStreak(0);
      lastStreakLabelRef.current = null;
      recordAnswer(false, elapsed, streak);
      playSfx("wrong");
      setTimeout(() => setShakeWho(null), 500);
      setTimeout(() => setFloatDmg(null), 1000);

      // Status thresholds
      if (
        wrongStreakRef.current === 2 &&
        !statuses.some((s) => s.kind === "confused")
      ) {
        applyStatus("confused");
      }
      if (
        wrongStreakRef.current === 5 &&
        !statuses.some((s) => s.kind === "poisoned") &&
        playerAbility.id !== "toxic"
      ) {
        applyStatus("poisoned");
      }

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
    // Clear Phase 2 battle-scoped state
    stopPoisonTick();
    setStatuses([]);
    wrongStreakRef.current = 0;
    abilityStateRef.current.cursedBodyPending = null;

    const baseXp = won ? 40 + level * 5 : 10 + level * 2;
    const eliteBonus = isElite && won ? 100 + level * 10 : 0;
    const bonus = maxStreakRef.current * 2;
    const total = baseXp + bonus + eliteBonus;
    setXpEarned(total);
    setResultWon(won);

    // Phase 3: Training Points
    let tp = 0;
    if (isWeekly) {
      tp = won ? TP_REWARDS.weeklyWin : TP_REWARDS.battleLoss;
    } else if (isElite) {
      tp = won ? TP_REWARDS.eliteWin : TP_REWARDS.battleLoss;
    } else if (won) {
      tp = Math.min(20, correctCountRef.current * TP_REWARDS.battleWinPerCorrect);
    } else {
      tp = TP_REWARDS.battleLoss;
    }
    useGameStore.getState().addTrainingPoints(player.id, tp);
    setTpEarned(tp);

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

    // Weekly League: record result + prep share card
    if (isWeekly && gymLeader) {
      recordWeeklyLeagueResult(won);
      if (won) {
        setShareData({
          type: "weekly",
          trainerName,
          trainerSpriteUrl: trainerSpriteUrl(trainerSpriteId),
          partnerName: player.name,
          partnerPokemonId: player.id,
          partnerShiny: false,
          opponentName: gymLeader.name,
          opponentTitle: `Gym Leader · ${gymLeader.region}`,
          opponentSpriteUrl: trainerSpriteUrl(gymLeader.trainerSpriteId),
          signaturePokemonId: gymLeader.signaturePokemonId,
          finalPlayerHp: playerHp,
          maxPlayerHp: playerMaxHp,
          topStreak: maxStreakRef.current,
          topDamage: topDmgRef.current,
          dateISO: new Date().toISOString().slice(0, 10),
          badgeName: gymLeader.badge,
        });
        toast.success(`🎖 ${gymLeader.badge} earned!`, { duration: 4500 });
      }
    }

    // snapshot achievements before/after
    const before = new Set(unlockedAchievements(useGameStore.getState()));
    endBattle(won, total);
    pushBattleLog({
      opponent: `${enemy.name} (${enemy.pokemon.name})`,
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
    if (id === "escape" && isWeekly) {
      toast.error("Escape Rope can't be used in the Weekly League.");
      return;
    }
    const ok = useItem(id);
    if (!ok) {
      toast.error(`Cannot use ${def.name} right now.`);
      return;
    }
    toast.success(`${def.emoji} Used ${def.name}!`);
    if (id === "potion") {
      setPlayerHp((hp) => Math.min(playerMaxHp, hp + 30));
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
      abortBattle();
      setTimeout(() => onExit(), 300);
    }
    setBagOpen(false);
  }

  if (phase === "result") {
    return (
      <>
        <ResultScreen
          won={resultWon!}
          xpEarned={xpEarned}
          tpEarned={tpEarned}
          partnerName={player.name}
          streak={maxStreakRef.current}
          onRebattle={() => onExit()}
          canShare={!!shareData}
          onShare={() => setShareOpen(true)}
        />
        {shareData && (
          <ShareCardDialog open={shareOpen} onClose={() => setShareOpen(false)} data={shareData} />
        )}
      </>
    );
  }

  const totalQuestions = questions.length;
  const progressPct = Math.min(100, (questionIdx / Math.max(1, totalQuestions)) * 100);

  return (
    <div className="bg-battle-field relative flex h-full min-h-0 w-full flex-col overflow-hidden">
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
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] safe-x">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (isWeekly) {
                toast.error("You cannot leave a Weekly League challenge.");
                return;
              }
              setConfirmExit(true);
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card/90 backdrop-blur shadow-card"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className={`flex items-center gap-1 rounded-full px-3 py-1.5 font-pixel text-[10px] shadow-card backdrop-blur ${isElite ? "bg-poke-dark text-poke-yellow" : "bg-card/90 text-foreground"}`}>
            {isElite && <Crown className="h-3 w-3" />}
            {isElite
              ? `ELITE · ${eliteMember!.region}`
              : `ROUND ${Math.floor(questionIdx / QUESTIONS_PER_SET) + 1}/${Math.max(1, Math.ceil(questions.length / QUESTIONS_PER_SET))}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {streak >= 1 && (
            <div className="rounded-full bg-primary px-3 py-1.5 font-pixel text-[10px] uppercase text-primary-foreground shadow-card">
              Streak ×{streak}
            </div>
          )}
          <Sheet open={bagOpen} onOpenChange={setBagOpen}>
            <SheetTrigger asChild>
              <button className="flex h-10 w-10 items-center justify-center rounded-full bg-card/90 backdrop-blur shadow-card">
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
                  const disabled = owned <= 0 || cd > 0 || (isWeekly && it.id === "escape");
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
      </div>

      {/* COMBAT ARENA — FRLG diagonal layout */}
      <div className="relative min-h-0 flex-1 px-3 py-2 safe-x">
        {/* ENEMY ZONE: panel top-left, sprite top-right */}
        <div className="flex items-start justify-between">
          <CombatPanel
            align="left"
            trainerName={enemy.name}
            pokemonName={enemy.pokemon.name}
            types={enemy.pokemon.types}
            hp={enemyHp}
            maxHp={enemyMaxHp}
            statuses={[]}
            abilityName={null}
            immune={false}
            disadvantaged={false}
          />
          <div className="relative mt-2 shrink-0">
            <img
              src="/grass/Basic_Grass.webp"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-4 left-1/2 w-28 -translate-x-1/2 select-none"
            />
            <motion.div
              className={`relative ${shakeWho === "enemy" ? "animate-shake" : ""}`}
              initial={{ x: 60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
            >
              <PokemonSprite
                id={enemy.pokemon.id}
                shiny={enemy.isShiny}
                alt={enemy.pokemon.name}
                className={`sprite relative z-10 h-36 w-36 ${enemy.isShiny ? "shiny-glow" : ""}`}
              />
              {enemy.isShiny && (
                <Sparkles className="pointer-events-none absolute right-2 top-2 z-20 h-4 w-4 animate-pulse text-yellow-300 drop-shadow" />
              )}
              {floatDmg?.who === "enemy" && (
                <div className="animate-float-up pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 font-pixel text-base text-destructive">
                  -{floatDmg.n}{floatDmg.super && " 💥"}{floatDmg.speedy && " ⚡"}
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* PLAYER ZONE: sprite lower-left, panel mid-right */}
        <div className="-mt-4 flex items-end justify-between">
          <div className="relative shrink-0">
            <img
              src="/grass/Basic_Grassback.webp"
              alt=""
              aria-hidden="true"
              className="pointer-events-none absolute bottom-4 left-1/2 w-32 -translate-x-1/2 select-none"
            />
            <motion.div
              className={`relative ${shakeWho === "player" ? "animate-shake" : ""}`}
              initial={{ x: -60, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
            >
              <PokemonSprite
                id={player.id}
                back
                alt={player.name}
                className={`sprite relative z-10 h-40 w-40 ${streak >= 5 ? "mega-glow" : ""}`}
              />
              {floatDmg?.who === "player" && (
                <div className="animate-float-up pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 font-pixel text-base text-destructive">
                  -{floatDmg.n}
                </div>
              )}
            </motion.div>
          </div>
          <CombatPanel
            align="right"
            trainerName={trainerName}
            pokemonName={player.name}
            types={player.types}
            hp={playerHp}
            maxHp={playerMaxHp}
            statuses={statuses}
            abilityName={playerAbility.name}
            immune={immune}
            disadvantaged={disadvantaged}
          />
        </div>
      </div>



      {/* intro banner overlay */}
      <AnimatePresence>
        {introBanner && (
          <motion.div
            key={introBanner}
            initial={{ y: -10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            className="pointer-events-none absolute inset-x-5 top-1/2 z-40 -translate-y-1/2"
          >
            <div className="rounded-2xl border-2 border-poke-dark bg-card/95 p-3 text-center text-sm font-semibold shadow-pop backdrop-blur">
              {introBanner}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QUESTION CARD — thumb zone, pinned bottom */}
      <div className="relative shrink-0 px-3 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-2 safe-x">
        <AnimatePresence mode="wait">
          {phase !== "intro" && trivia && (
            <motion.div
              key={questionIdx}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className="relative"
            >
              {/* Floating timer pill */}
              <div className="pointer-events-none absolute left-1/2 -top-5 z-10 -translate-x-1/2">
                <div
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 font-pixel text-[11px] shadow-card ${
                    timer <= 5
                      ? "animate-pulse bg-destructive text-destructive-foreground"
                      : "bg-card text-foreground"
                  }`}
                >
                  <span
                    className={`inline-block h-3 w-3 rounded-full border-2 ${
                      timer <= 5 ? "border-destructive-foreground" : "border-hp-good"
                    }`}
                    style={{
                      background: `conic-gradient(currentColor ${(timer / (TIMER_BASE + bonusTime)) * 360}deg, transparent 0deg)`,
                    }}
                  />
                  {timer}s
                </div>
              </div>

              <div className="rounded-3xl bg-card p-4 pt-5 shadow-card">
                <p className="text-center font-pixel text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                  {trivia.category}
                </p>
                <p className="mt-2 text-center text-[clamp(0.95rem,4vw,1.125rem)] font-bold leading-snug">
                  {trivia.question}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {trivia.options.map((opt, i) => {
                    const isCorrect = phase === "feedback" && i === trivia.correct;
                    const isWrong = phase === "feedback" && chosen === i && i !== trivia.correct;
                    const isRevealed = revealedWrong === i;
                    return (
                      <button
                        key={i}
                        disabled={phase !== "question" || isRevealed}
                        onClick={() => handleAnswer(i)}
                        className={`flex min-h-[48px] items-center justify-between rounded-2xl border-2 px-4 py-2.5 text-left text-[clamp(0.875rem,3.6vw,0.95rem)] font-semibold transition active:scale-[0.98] ${
                          isCorrect
                            ? "border-hp-good bg-hp-good/10 text-hp-good"
                            : isWrong
                              ? "border-destructive bg-destructive/10 text-destructive"
                              : isRevealed
                                ? "border-transparent bg-muted/60 line-through opacity-50"
                                : "border-transparent bg-muted text-foreground hover:bg-muted/70"
                        } disabled:cursor-not-allowed`}
                      >
                        <span className="min-w-0 flex-1 truncate">{opt}</span>
                        {isCorrect && (
                          <span className="ml-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-hp-good text-[12px] text-white">
                            ✓
                          </span>
                        )}
                        {isWrong && (
                          <span className="ml-2 inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 font-pixel text-[8px] uppercase text-destructive">
                            Your Pick ×
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {phase === "feedback" && (
                  <p className="mt-2 rounded-xl bg-muted p-2 text-[11px] leading-snug text-muted-foreground">
                    💡 {trivia.explanation} · ⚡ {(lastElapsedMs / 1000).toFixed(1)}s
                  </p>
                )}

                {/* Item shortcuts row */}
                <div className="mt-3 flex items-center justify-center gap-3">
                  {ITEMS.filter((it) => (inventory[it.id] ?? 0) > 0)
                    .slice(0, 3)
                    .map((it) => {
                      const owned = inventory[it.id] ?? 0;
                      const cd = cooldowns[it.id] ?? 0;
                      const disabled = cd > 0 || (isWeekly && it.id === "escape");
                      return (
                        <button
                          key={it.id}
                          disabled={disabled}
                          onClick={() => tryUseItem(it.id)}
                          className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition active:scale-95 disabled:opacity-40"
                        >
                          <img
                            src={it.iconUrl}
                            alt={it.name}
                            className="sprite h-8 w-8 object-contain"
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
                          <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-poke-dark px-1 font-pixel text-[9px] text-white">
                            {owned}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave battle?</AlertDialogTitle>
            <AlertDialogDescription>
              Your progress in this battle will be lost. You'll keep XP and trophies you've already earned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { abortBattle(); onExit(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TutorialOverlay step={tutorialStep} onDismiss={dismissTutorial} onSkip={skipTutorial} />
    </div>
  );
}

function ResultScreen({
  won,
  xpEarned,
  tpEarned,
  partnerName,
  streak,
  onRebattle,
  canShare,
  onShare,
}: {
  won: boolean;
  xpEarned: number;
  tpEarned: number;
  partnerName: string;
  streak: number;
  onRebattle: () => void;
  canShare?: boolean;
  onShare?: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex h-full w-full flex-col items-center justify-center overflow-y-auto px-6 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] safe-x ${
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
        <Row label="XP Gained" value={`+${xpEarned}`} accent />
        <Row label="Top Streak" value={String(streak)} />
        <Row label={`TP · ${partnerName}`} value={`+${tpEarned}`} accent />
      </div>
      {canShare && onShare && (
        <Button
          size="lg"
          onClick={onShare}
          className="mt-6 w-full max-w-xs rounded-full bg-poke-yellow py-6 font-pixel text-[11px] text-poke-dark shadow-pop hover:scale-105"
        >
          📸 Share Victory
        </Button>
      )}
      <Button
        size="lg"
        onClick={onRebattle}
        className="mt-3 w-full max-w-xs rounded-full bg-card py-6 font-semibold text-foreground shadow-pop hover:scale-105"
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
  const [pattern, setPattern] = useState<DailyMark[]>([]);
  const abortBattle = useGameStore((s) => s.abortBattle);
  const [confirmExit, setConfirmExit] = useState(false);
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
    const sym: DailyMark = picked === -1 ? "timeout" : correct ? "correct" : "wrong";
    const nextPattern: DailyMark[] = [...pattern, sym];
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
          // Phase 3: Daily TP
          const partner = useGameStore.getState().pokemon;
          if (partner) {
            if (finalCorrect === total) {
              useGameStore.getState().addTrainingPoints(partner.id, TP_REWARDS.dailyPerfect);
            } else if (finalCorrect >= 5) {
              useGameStore.getState().addTrainingPoints(partner.id, TP_REWARDS.dailyPartial);
            }
          }
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
      <div className="flex h-full w-full items-center justify-center bg-background">
        <div className="font-pixel text-sm text-muted-foreground">No daily questions available.</div>
      </div>
    );
  }

  const progressPct = ((idx) / total) * 100;

  return (
    <div className="bg-poke-hero relative h-full w-full overflow-y-auto pb-[calc(env(safe-area-inset-bottom)+1rem)] safe-x">
      <div className="absolute left-0 right-0 top-0 z-40 h-1 bg-poke-dark/20">
        <motion.div className="h-full bg-poke-yellow" initial={false} animate={{ width: `${progressPct}%` }} />
      </div>
      <div className="flex items-center justify-between px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        <button onClick={() => setConfirmExit(true)} className="flex h-10 w-10 items-center justify-center rounded-full bg-card/80 backdrop-blur">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="rounded-full bg-poke-dark px-3 py-1 font-pixel text-[10px] text-poke-yellow">
          🔥 DAILY · {idx + 1}/{total}
        </div>
        <div className="w-10" />
      </div>
      <AlertDialog open={confirmExit} onOpenChange={setConfirmExit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave the daily challenge?</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving will end today's challenge. You won't be able to retry until tomorrow.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { abortBattle(); onExit(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        <div className="mt-4 flex justify-center"><PokeballPattern marks={pattern} /></div>
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
  pattern: DailyMark[];
  onExit: () => void;
}) {
  const date = new Date().toISOString().slice(0, 10);
  const seconds = Math.round(timeMs / 1000);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex h-full w-full flex-col items-center justify-center overflow-y-auto bg-poke-hero px-6 py-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] safe-x"
    >
      <div className="font-pixel text-2xl text-poke-dark">ALL DONE!</div>
      <div className="mt-3 text-5xl">🏅</div>
      <div className="mt-6 w-full max-w-xs space-y-3 rounded-3xl bg-card/95 p-5 shadow-pop">
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Date</span><span className="font-pixel text-sm">{date}</span></div>
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Score</span><span className="font-pixel text-sm text-primary">{correct}/{total}</span></div>
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Time</span><span className="font-pixel text-sm">{seconds}s</span></div>
        <div className="pt-1"><PokeballPattern marks={pattern} /></div>
      </div>
      <Button size="lg" variant="outline" onClick={onExit} className="mt-6 w-full max-w-xs rounded-full border-2 py-6 font-semibold">
        Back
      </Button>
    </motion.div>
  );
}
