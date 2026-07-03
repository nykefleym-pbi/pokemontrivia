import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Backpack, Sparkles, Crown } from "lucide-react";
import { useGameStore, getItemDef } from "@/lib/store";
import {
  pickRandomEnemy,
  type EnemyTrainer,
  ITEMS,
  enemyHpForLevel,
  baseDamageForLevel,
  streakMultiplier,
  streakLabel,
  getTpMultiplier,
  xpProgressInLevel,
  rankForLevel,
} from "@/lib/game-data";
import { battleReward } from "@/lib/rewards";
import { rollLevelUpRewards } from "@/lib/level-rewards";

import {
  isSuperEffective,
  findPokemon,
  isPlayerDisadvantaged,
  isPlayerImmune,
  type PokeEntry,
  type PokeType,
} from "@/lib/pokemon-data";
import { getAbility as getAbilityFn, type Ability } from "@/lib/abilities";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import { TypeBadge, PokemonSprite } from "@/components/game-ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
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
import { CATEGORIES, CATEGORY_OF, BAG_SHORT_DESC } from "@/lib/item-categories";
import { playSfx, revealPokemon, playBattleResult, playItemCue } from "@/lib/audio";
import { type EliteMember, regionCompleted } from "@/lib/elite-four";
import type { GymLeader } from "@/lib/gym-leaders";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";
import { trainerSpriteUrl } from "@/lib/game-data";
import type { Trivia } from "@/lib/trivia-core";
export type { Trivia };
import { DailyScreen } from "@/components/daily-screen";
import { ResultScreen } from "@/components/result-screen";

const QUESTIONS_PER_SET = 5;
const TIMER_BASE = 20;

type Phase = "intro" | "question" | "feedback" | "result";

function CombatPanel({
  align,
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
    <div className="w-[clamp(8rem,38vw,10.5rem)] shrink-0 rounded-2xl bg-card px-3 py-2 backdrop-blur shadow-card">
      <div className={`flex flex-col ${alignCls}`}>
        <div className="w-full truncate text-sm font-bold leading-tight">{pokemonName}</div>

        <div className={`mt-1 flex w-full gap-1 ${justifyCls}`}>
          {types.map((t) => (
            <TypeBadge key={t} type={t} size="sm" />
          ))}
        </div>
        <div className="mt-1.5 flex w-full items-center gap-2">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-poke-dark/15">
            <motion.div
              className={`h-full ${barColor}`}
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 100, damping: 18 }}
            />
          </div>
          <span className="text-[11px] font-bold tabular-nums text-foreground">
            {Math.round(hp)}
          </span>
        </div>
        {(abilityName || immune || disadvantaged || statuses.length > 0) && (
          <div className={`mt-1 flex w-full flex-wrap gap-0.5 ${justifyCls}`}>
            {abilityName && (
              <span className="rounded-full bg-primary/10 px-1.5 py-[1px] font-pixel-xs text-primary">
                ⚡ {abilityName}
              </span>
            )}
            {immune && (
              <span className="rounded-full bg-hp-good/20 px-1.5 py-[1px] font-pixel-xs text-hp-good">
                🛡
              </span>
            )}
            {disadvantaged && !immune && (
              <span className="rounded-full bg-destructive/20 px-1.5 py-[1px] font-pixel-xs text-destructive">
                ⚠
              </span>
            )}
            {statuses.map((s) => (
              <span
                key={s.kind}
                className={`rounded-full px-1.5 py-[1px] font-pixel-xs ${s.kind === "confused" ? "bg-poke-yellow/30 text-foreground" : "bg-purple-500/20 text-purple-700"}`}
              >
                {s.kind === "confused" ? "🌀" : "☠️"}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function TimerRing({ timer, maxTime }: { timer: number; maxTime: number }) {
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

interface Props {
  questions: Trivia[];
  onExit: () => void;
  onRematch?: () => void;
  mode?: "battle" | "daily" | "elite" | "weekly";
  eliteMember?: EliteMember;
  gymLeader?: GymLeader | null;
}

export function BattleScreen({
  questions,
  onExit,
  onRematch,
  mode = "battle",
  eliteMember,
  gymLeader,
}: Props) {
  if (mode === "daily") {
    return <DailyScreen questions={questions} onExit={onExit} />;
  }
  if (mode === "elite" && eliteMember) {
    return (
      <BattleMode
        questions={questions}
        onExit={onExit}
        onRematch={onRematch}
        eliteMember={eliteMember}
      />
    );
  }
  if (mode === "weekly" && gymLeader) {
    return (
      <BattleMode
        questions={questions}
        onExit={onExit}
        onRematch={onRematch}
        gymLeader={gymLeader}
      />
    );
  }
  return <BattleMode questions={questions} onExit={onExit} onRematch={onRematch} />;
}

function BattleMode({
  questions,
  onExit,
  onRematch,
  eliteMember,
  gymLeader,
}: Pick<Props, "questions" | "onExit" | "onRematch"> & {
  eliteMember?: EliteMember;
  gymLeader?: GymLeader;
}) {
  const player = useGameStore((s) => s.pokemon)!;
  const level = useGameStore((s) => s.level);
  const trainerName = useGameStore((s) => s.trainerName);

  const startBattle = useGameStore((s) => s.startBattle);
  const endBattle = useGameStore((s) => s.endBattle);
  const abortBattle = useGameStore((s) => s.abortBattle);
  const setBattleScreenActive = useGameStore((s) => s.setBattleScreenActive);
  useEffect(() => {
    setBattleScreenActive(true);
    return () => setBattleScreenActive(false);
  }, [setBattleScreenActive]);
  const recordAnswer = useGameStore((s) => s.recordAnswer);
  const completeSet = useGameStore((s) => s.completeSet);
  const consumeXAttack = useGameStore((s) => s.consumeXAttack);
  const applyItem = useGameStore((s) => s.useItem);
  const xAttackActive = useGameStore((s) => s.xAttackActive);
  const scopeRevealedThisBattle = useGameStore((s) => s.scopeRevealedThisBattle);
  const consumeScope = useGameStore((s) => s.consumeScope);
  const bonusTime = useGameStore((s) => s.bonusTimeThisBattle);
  const inventory = useGameStore((s) => s.inventory);
  const usedThisBattle = useGameStore((s) => s.usedThisBattle);
  const tryAutoFocusBand = useGameStore((s) => s.tryAutoFocusBand);
  const tryAutoQuickClaw = useGameStore((s) => s.tryAutoQuickClaw);
  const tryAutoAssaultVest = useGameStore((s) => s.tryAutoAssaultVest);
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
      const poke: PokeEntry = findPokemon(gymLeader.signaturePokemonId) ?? {
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
      const poke: PokeEntry = findPokemon(eliteMember.signaturePokemonId) ?? {
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
    const base = pickRandomEnemy();
    return useGameStore.getState().guaranteedShinyPending ? { ...base, isShiny: true } : base;
  });
  const enemyMaxHp = isWeekly ? 250 : isElite ? 200 : enemyHpForLevel(level);
  const abilityId = useGameStore((s) => s.abilityId);
  const playerAbility = useMemo(
    () => getAbilityFn(player.types, abilityId),
    [player.types, abilityId],
  );
  const playerMaxHp = playerAbility.id === "adaptable" ? 105 : 100;
  const [playerHp, setPlayerHp] = useState(playerMaxHp);
  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [phase, setPhase] = useState<Phase>("intro");
  const [trivia, setTrivia] = useState<Trivia | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealedWrong, setRevealedWrong] = useState<number | null>(null);
  const [revealedCorrect, setRevealedCorrect] = useState<number | null>(null);
  const [streak, setStreak] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(0);
  const [introBanner, setIntroBanner] = useState<string | null>(null);
  const [shakeWho, setShakeWho] = useState<"player" | "enemy" | null>(null);
  const [floatDmg, setFloatDmg] = useState<{
    who: "player" | "enemy";
    n: number;
    super: boolean;
    speedy: boolean;
  } | null>(null);
  const [bagOpen, setBagOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [resultWon, setResultWon] = useState<boolean | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [streakBanner, setStreakBanner] = useState<string | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState(0);
  const questionStart = useRef<number>(0);
  const startedRef = useRef(false);
  const battleEndedRef = useRef(false);
  const maxStreakRef = useRef(0);
  const lastStreakLabelRef = useRef<string | null>(null);
  const correctCountRef = useRef(0);
  const topDmgRef = useRef(0);
  const totalElapsedMsRef = useRef(0);
  const answeredCountRef = useRef(0);
  const [tpEarned, setTpEarned] = useState(0);
  const [shareData, setShareData] = useState<ShareData | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const trainerSpriteId = useGameStore((s) => s.trainerSprite);

  const superEff = isSuperEffective(player, enemy.pokemon);
  const disadvantaged = useMemo(
    () => isPlayerDisadvantaged(player, enemy.pokemon),
    [player, enemy.pokemon],
  );
  const immune = useMemo(() => isPlayerImmune(player, enemy.pokemon), [player, enemy.pokemon]);
  const assaultVestActiveRef = useRef(false);

  // Phase 2: ability + status state
  type StatusKind = "confused" | "poisoned";
  interface ActiveStatus {
    kind: StatusKind;
    curesRemaining: number;
    appliedAt: number;
  }
  const [statuses, setStatuses] = useState<ActiveStatus[]>([]);
  const wrongStreakRef = useRef(0);
  const missedRef = useRef<Array<{ question: string; correctAnswer: string; explanation: string }>>(
    [],
  );
  const newTrophiesRef = useRef<Array<{ icon: string; name: string }>>([]);
  const speedBonusTotalRef = useRef(0);

  const poisonTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAbilityToastRef = useRef<number>(0);
  const abilityStateRef = useRef({
    sturdyUsed: false,
    iceFirstWrongConsumed: false,
    hydrationUsed: false,
    cursedBodyPending: null as { hpBefore: number; appliedAt: number } | null,
    triggered: new Set<string>(),
    // set 2/3 ability state
    torrentUsed: false,
    sandForceUsed: 0,
    moxieBonus: 0,
    hadWrong: false,
    lastWasWrong: false,
    venom: 0,
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
    if (playerAbility.id === "magic-guard") {
      triggerAbilityToast(playerAbility);
      return;
    }
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
    playSfx(kind === "confused" ? "confused" : "poisoned");
    const cureNeeds = {
      confused: playerAbility.id === "toxic" ? 1 : 2,
      poisoned: 3,
    } as const;
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
      setTimeout(() => revealPokemon(enemy.pokemon.id), 900);
      setTimeout(() => setIntroBanner(`${eliteMember.name} sent out ${enemy.pokemon.name}!`), 2200);
    } else {
      setIntroBanner(`${enemy.name} sent out ${enemy.pokemon.name}!`);
      revealPokemon(enemy.pokemon.id);
    }
    if (enemy.isShiny) {
      playSfx("shiny");
      toast.success(`✨ A SHINY ${enemy.pokemon.name} appeared!`, {
        duration: 3000,
        style: { background: "linear-gradient(90deg, #fde68a, #fbbf24)", color: "#1f2937" },
      });
    }
    const introDelay = isElite ? 3600 : 1500;
    setTimeout(() => {
      setIntroBanner(`Go, ${player.name}!${superEff ? " Type advantage!" : ""}`);
      revealPokemon(player.id);
    }, introDelay);
    setTimeout(() => setIntroBanner(null), introDelay + 1300);
    setTimeout(() => loadQuestion(0), introDelay + 1300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadQuestion(idx: number) {
    setChosen(null);
    setRevealedWrong(null);
    setRevealedCorrect(null);
    // Stealth Rock: 3 chip damage to the enemy at the start of every round.
    if (playerAbility.id === "stealth-rock" && idx > 0 && idx % QUESTIONS_PER_SET === 0) {
      const chippedHp = Math.max(0, enemyHp - 3);
      setEnemyHp(chippedHp);
      triggerAbilityToast(playerAbility);
      if (chippedHp <= 0) {
        setTimeout(() => finish(true), 600);
        return;
      }
    }
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

  // Assault Vest: auto-activate at battle start when the foe is super-effective against the partner
  useEffect(() => {
    if (disadvantaged && tryAutoAssaultVest()) {
      assaultVestActiveRef.current = true;
      toast.success("🦺 Assault Vest — damage halved this battle!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // timer
  useEffect(() => {
    if (phase !== "question") return;
    if (confirmExit) return;
    if (tutorialStep !== null) return;
    if (timer <= 0) {
      handleAnswer(-1);
      return;
    }
    if (timer <= 5) playSfx(timer === 5 ? "timer_warning" : "timer_tick");
    const t = setTimeout(() => setTimer((x) => x - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timer, confirmExit, tutorialStep]);

  // Quick Claw: auto-reset the timer to 20s when it drops below 5s (once per battle)
  useEffect(() => {
    if (phase === "question" && timer > 0 && timer < 5) {
      if (tryAutoQuickClaw()) {
        setTimer(20);
        toast.success("⏱️ Quick Claw — timer reset to 20s!");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timer, phase]);

  // Trigger tutorial on first 3 questions
  useEffect(() => {
    if (phase === "question" && tutorialActive && questionIdx <= 2) {
      const id = (questionIdx + 1) as 1 | 2 | 3;
      setTutorialStep(id);
    }
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
    totalElapsedMsRef.current += elapsed;
    answeredCountRef.current += 1;

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

      // streak multiplier on the rank-scaled base damage. Bosses (elite /
      // weekly) keep the flat base — their HP-per-question budgets are already
      // balanced; scaling here would trivialize them at high rank.
      let baseDmg = isElite || isWeekly ? 10 : baseDamageForLevel(level);
      if (playerAbility.id === "dragon-dance") baseDmg += Math.floor(questionIdx / 5);
      let dmg = Math.round(baseDmg * streakMultiplier(newStreak));
      // TP damage boost
      const tpNow = useGameStore.getState().trainingPoints[player.id] ?? 0;
      const tpMult = getTpMultiplier(tpNow);
      if (tpMult > 1.0) dmg = Math.round(dmg * tpMult);
      // time bonus
      const elapsedSec = elapsed / 1000;
      const totalTime = TIMER_BASE + bonusTime;
      const speedRatio = Math.max(0, (totalTime - elapsedSec) / totalTime);
      let speedBonus = Math.round(5 * speedRatio);
      if (playerAbility.id === "aerilate") {
        speedBonus = Math.round(speedBonus * 1.5);
        if (speedBonus > 0) triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "swift-swim") speedBonus = Math.max(3, speedBonus);
      speedBonusTotalRef.current += speedBonus;
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
      // Guts: +15% dmg if below 50% HP
      if (playerAbility.id === "guts" && playerHp < playerMaxHp / 2) {
        dmg = Math.round(dmg * 1.15);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "flash-fire") dmg = Math.round(dmg * 1.08);
      if (playerAbility.id === "no-guard") dmg = Math.round(dmg * 1.18);
      if (playerAbility.id === "blaze" && playerHp < playerMaxHp * 0.4) {
        dmg = Math.round(dmg * 1.2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "overgrow" && enemyHp > enemyMaxHp / 2) dmg = Math.round(dmg * 1.12);
      if (playerAbility.id === "bulldoze" && disadvantaged) {
        dmg = Math.round(dmg * 1.25);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "acrobatics" && playerHp === playerMaxHp)
        dmg = Math.round(dmg * 1.3);
      if (playerAbility.id === "berserk" && abilityStateRef.current.hadWrong)
        dmg = Math.round(dmg * 1.12);
      if (playerAbility.id === "hex" && statuses.length > 0) {
        dmg = Math.round(dmg * 1.3);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "dark-aura" && (isElite || isWeekly)) dmg = Math.round(dmg * 1.1);
      if (playerAbility.id === "even-tempo" && !superEff && !disadvantaged && !immune) dmg += 2;
      if (playerAbility.id === "charge") dmg += 2;
      if (playerAbility.id === "swarm" && newStreak >= 3) dmg += 3;
      if (playerAbility.id === "moonblast" && newStreak >= 3) dmg += 4;
      if (playerAbility.id === "volt-absorb" && elapsedSec <= 5) {
        dmg += 3;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "counter" && abilityStateRef.current.lastWasWrong) {
        dmg += 4;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "moxie") {
        dmg += abilityStateRef.current.moxieBonus;
        if (newStreak > 0 && newStreak % 3 === 0) {
          abilityStateRef.current.moxieBonus += 1;
          triggerAbilityToast(playerAbility);
        }
      }
      // Poison Touch: venom from the previous correct answer lands now.
      dmg += abilityStateRef.current.venom;
      abilityStateRef.current.venom = 0;
      abilityStateRef.current.lastWasWrong = false;

      const newEnemyHp = Math.max(0, enemyHp - dmg);
      if (dmg > topDmgRef.current) topDmgRef.current = dmg;
      setEnemyHp(newEnemyHp);
      setShakeWho("enemy");
      setFloatDmg({ who: "enemy", n: dmg, super: superEff, speedy: speedBonus >= 3 });
      setStreak(newStreak);
      recordAnswer(true, elapsed, newStreak);
      playSfx("correct");
      setTimeout(() => playSfx("damage"), 120);

      // Leech Seed: heal 2
      if (playerAbility.id === "leech-seed") {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 2));
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "poison-touch") abilityStateRef.current.venom = 2;
      if (playerAbility.id === "ice-body" && correctCountRef.current % 4 === 0) {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 6));
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "pixie-dust" && newStreak > 0 && newStreak % 3 === 0) {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 5));
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
        playSfx("streak");
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
      missedRef.current.push({
        question: trivia.question,
        correctAnswer: trivia.options[trivia.correct],
        explanation: trivia.explanation,
      });
      // Matchup-aware wrong-answer damage

      let wrongDmg = 10;
      if (immune) wrongDmg = 5;
      else if (disadvantaged) wrongDmg = 15;
      if (playerAbility.id === "no-guard") wrongDmg += 2;
      if (assaultVestActiveRef.current) wrongDmg = Math.floor(wrongDmg / 2);

      // Ability modifiers (in spec order)
      if (playerAbility.id === "multiscale" && playerHp === playerMaxHp) {
        wrongDmg = Math.floor(wrongDmg / 2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "filter" && disadvantaged) {
        wrongDmg = Math.floor(wrongDmg * 0.75);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "slush-rush" && disadvantaged) {
        wrongDmg = Math.max(0, wrongDmg - 5);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "iron-barbs") {
        wrongDmg = Math.max(0, wrongDmg - 3);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "solid-rock" && wrongDmg > 12) {
        wrongDmg = 12;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "static" && Math.random() < 0.2) {
        wrongDmg = Math.floor(wrongDmg / 2);
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "snow-cloak" && !abilityStateRef.current.iceFirstWrongConsumed) {
        wrongDmg = 0;
        abilityStateRef.current.iceFirstWrongConsumed = true;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "flame-body" && Math.random() < 0.15) {
        wrongDmg = 0;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "cute-charm" && Math.random() < 0.15) {
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

      // Focus Band: auto-heal to 50% when HP is 10 or below (once per week)
      if (newPlayerHp <= 10 && tryAutoFocusBand()) {
        newPlayerHp = Math.round(playerMaxHp * 0.5);
        toast.success("🎽 Focus Band — restored to 50% HP!");
      }

      // Torrent: first drop below 30% HP heals 10 (once per battle)
      if (
        playerAbility.id === "torrent" &&
        !abilityStateRef.current.torrentUsed &&
        newPlayerHp > 0 &&
        newPlayerHp < playerMaxHp * 0.3
      ) {
        abilityStateRef.current.torrentUsed = true;
        newPlayerHp = Math.min(playerMaxHp, newPlayerHp + 10);
        triggerAbilityToast(playerAbility);
      }

      setPlayerHp(newPlayerHp);
      setShakeWho("player");
      setFloatDmg({ who: "player", n: wrongDmg, super: false, speedy: false });
      // Sand Force: the first two wrong answers keep the streak alive.
      const keepStreak =
        playerAbility.id === "sand-force" && abilityStateRef.current.sandForceUsed < 2;
      if (keepStreak) {
        abilityStateRef.current.sandForceUsed += 1;
        triggerAbilityToast(playerAbility);
      } else {
        setStreak(0);
        lastStreakLabelRef.current = null;
      }
      abilityStateRef.current.hadWrong = true;
      abilityStateRef.current.lastWasWrong = true;
      recordAnswer(false, elapsed, streak);
      playSfx("wrong");
      setTimeout(() => setShakeWho(null), 500);
      setTimeout(() => setFloatDmg(null), 1000);

      // Chip damage to the enemy (Corrosion / Shadow Tag / landed venom)
      let chip = abilityStateRef.current.venom;
      abilityStateRef.current.venom = 0;
      if (playerAbility.id === "corrosion") {
        chip += 2;
        triggerAbilityToast(playerAbility);
      }
      if (playerAbility.id === "shadow-tag" && wrongDmg > 0) {
        chip += 2;
        triggerAbilityToast(playerAbility);
      }
      if (chip > 0 && newPlayerHp > 0) {
        const chippedHp = Math.max(0, enemyHp - chip);
        setEnemyHp(chippedHp);
        if (chippedHp <= 0) {
          setTimeout(() => finish(true), 1400);
          setPhase("feedback");
          return;
        }
      }

      // Status thresholds (Amnesia delays both by one wrong answer)
      const confuseAt = playerAbility.id === "amnesia" ? 3 : 2;
      const poisonAt = playerAbility.id === "amnesia" ? 6 : 5;
      if (
        wrongStreakRef.current === confuseAt &&
        !statuses.some((s) => s.kind === "confused") &&
        playerAbility.id !== "shield-dust"
      ) {
        applyStatus("confused");
      }
      if (
        wrongStreakRef.current === poisonAt &&
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
    if (battleEndedRef.current) return;
    battleEndedRef.current = true;
    // Clear Phase 2 battle-scoped state
    stopPoisonTick();
    setStatuses([]);
    wrongStreakRef.current = 0;
    abilityStateRef.current.cursedBodyPending = null;

    const {
      xp: xpAward,
      coins: coinAward,
      tp: tpAward,
    } = battleReward({
      mode: isElite ? "elite" : isWeekly ? "weekly" : "regular",
      won,
      level,
      maxStreak: maxStreakRef.current,
    });

    const adjustedCoins = playerAbility.id === "pickup" ? Math.round(coinAward * 1.25) : coinAward;
    setXpEarned(xpAward);
    setCoinsEarned(adjustedCoins);
    setTpEarned(tpAward);
    setResultWon(won);
    if (tpAward > 0) useGameStore.getState().addTrainingPoints(player.id, tpAward);
    if (adjustedCoins > 0) useGameStore.getState().addCoins(adjustedCoins);

    // comeback flag — won at low HP
    if (won && playerHp <= 10) {
      raiseFlag("comeback");
    }

    // Pokédex capture on win
    if (won) {
      recordPokedexCapture(enemy.pokemon.id, enemy.isShiny);
      if (!isWeekly && !isElite) useGameStore.getState().consumeGuaranteedShiny();
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
    let shareSet = false;
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
          correctCount: correctCountRef.current,
          totalQuestions: answeredCountRef.current,
          xpEarned: xpAward,
          avgTimeMs: answeredCountRef.current
            ? totalElapsedMsRef.current / answeredCountRef.current
            : undefined,
          level,
          rank: rankForLevel(level),
        });
        shareSet = true;
        toast.success(`🎖 ${gymLeader.badge} earned!`, { duration: 4500 });
      }
    }

    // Ensure every victory has a share card (regular + elite fallback)
    if (won && !shareSet) {
      setShareData({
        type: isElite ? "elite" : "battle",
        trainerName,
        trainerSpriteUrl: trainerSpriteUrl(trainerSpriteId),
        partnerName: player.name,
        partnerPokemonId: player.id,
        partnerShiny: false,
        opponentName: enemy.name,
        opponentTitle: isElite ? "Elite Four" : "Trainer",
        opponentSpriteUrl: null,
        signaturePokemonId: enemy.pokemon.id,
        finalPlayerHp: playerHp,
        maxPlayerHp: playerMaxHp,
        topStreak: maxStreakRef.current,
        topDamage: topDmgRef.current,
        correctCount: correctCountRef.current,
        totalQuestions: answeredCountRef.current,
        xpEarned: xpAward,
        avgTimeMs: answeredCountRef.current
          ? totalElapsedMsRef.current / answeredCountRef.current
          : undefined,
        level,
        rank: rankForLevel(level),
        dateISO: new Date().toISOString().slice(0, 10),
      });
    }

    // snapshot achievements before/after
    const before = new Set(unlockedAchievements(useGameStore.getState()));
    const prevLevel = useGameStore.getState().level;
    endBattle(won, xpAward);
    const newLevel = useGameStore.getState().level;
    if (newLevel > prevLevel) {
      // Level-up rewards trigger on ANY level gained, win or lose — a small
      // XP gain from a loss can still cross a level threshold. The reward
      // grant happens immediately; the celebration screen is deferred until
      // the player returns to the battle hub (see LevelUpScreen / battle.tsx)
      // so it never interrupts a Rematch chain.
      const rewards = rollLevelUpRewards(prevLevel, newLevel);
      if (rewards) {
        useGameStore.getState().mergePendingLevelUp(rewards);
        if (rewards.coins > 0) useGameStore.getState().addCoins(rewards.coins);
        for (const it of rewards.items) useGameStore.getState().grantItem(it.id, it.qty);
        if (rewards.eggs > 0) useGameStore.getState().grantPokeEgg(rewards.eggs);
      }
    }
    pushBattleLog({
      opponent: `${enemy.name} (${enemy.pokemon.name})`,
      won,
      xpGained: xpAward,
      bestStreak: maxStreakRef.current,
      timestamp: Date.now(),
    });
    const after = unlockedAchievements(useGameStore.getState());
    const unlocked: Array<{ icon: string; name: string }> = [];
    for (const id of after) {
      if (!before.has(id)) {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) {
          unlocked.push({ icon: a.icon, name: a.name });
          toast.success(`${a.icon} ${a.name}`, { description: a.desc, duration: 4000 });
        }
      }
    }
    newTrophiesRef.current = unlocked;

    playSfx(won ? "victory" : "defeat");
    playBattleResult(isElite ? "elite" : isWeekly ? "weekly" : "regular", won);
    if (won) {
      setTimeout(() => playSfx("cheer"), 450);
      setTimeout(() => playSfx("reward"), 950);
      if (xpAward > 0) setTimeout(() => playSfx("xp"), 1150);
      if (newTrophiesRef.current.length) setTimeout(() => playSfx("claim_reward"), 1500);
      toast.success(`Victory! +${xpAward} XP`, { duration: 2500 });
    } else {
      setTimeout(() => playSfx("disappointed"), 450);
      toast.error(`Defeat — +${xpAward} XP`, { duration: 2500 });
    }
    setPhase("result");
  }

  function tryUseItem(id: ItemId) {
    const def = getItemDef(id);
    if (id === "escape" && (isWeekly || isElite)) {
      toast.error("Escape Rope can't be used in the Weekly League or Elite Four.");
      return;
    }
    const ok = applyItem(id);
    if (!ok) {
      toast.error(`Cannot use ${def.name} right now.`);
      return;
    }
    toast.success(`${def.emoji} Used ${def.name}!`);
    const healMult = playerAbility.id === "synthesis" ? 1.5 : 1;
    if (id === "potion") {
      setPlayerHp((hp) => Math.min(playerMaxHp, hp + Math.round(30 * healMult)));
      playItemCue();
    }
    if (id === "superpotion") {
      setPlayerHp((hp) => Math.min(playerMaxHp, hp + Math.round(60 * healMult)));
      playItemCue();
    }
    if (id === "maxpotion") {
      setPlayerHp(playerMaxHp);
      playItemCue();
    }
    if (id === "scope" && trivia) {
      const wrongs = [0, 1, 2, 3].filter((w) => w !== trivia.correct);
      setRevealedWrong(wrongs[Math.floor(Math.random() * wrongs.length)]);
    }
    if (id === "xaccuracy" && trivia) {
      setRevealedCorrect(trivia.correct);
    }
    if (id === "escape") {
      setBagOpen(false);
      abortBattle();
      setTimeout(() => onExit(), 300);
    }
    setBagOpen(false);
  }

  if (phase === "result") {
    const stateNow = useGameStore.getState();
    const prog = xpProgressInLevel(stateNow.xp);
    const pct = Math.min(100, (prog.current / Math.max(1, prog.need)) * 100);
    return (
      <>
        <ResultScreen
          won={resultWon!}
          opponentName={enemy.name}
          correctCount={correctCountRef.current}
          totalQuestions={questions.length}
          xpEarned={xpEarned}
          tpEarned={tpEarned}
          coinsEarned={coinsEarned}
          speedBonus={speedBonusTotalRef.current}
          partnerName={player.name}
          partnerId={player.id}
          streak={maxStreakRef.current}
          streakKept={maxStreakRef.current > 0}
          currentLevel={prog.level}
          xpIntoLevel={prog.current}
          xpForThisLevel={prog.need}
          levelProgressPct={pct}
          newTrophies={newTrophiesRef.current}
          missed={missedRef.current}
          onRebattle={() => onExit()}
          onBackHome={() => onExit()}
          onRematch={onRematch}
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
      <div className="flex shrink-0 items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+1rem)] pb-1 px-[max(1.25rem,env(safe-area-inset-left))]">
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-pixel text-[9px] shadow-card backdrop-blur ${isElite ? "bg-poke-dark text-poke-yellow" : "bg-card/90 text-foreground"}`}
          >
            {isElite && <Crown className="h-3 w-3" />}
            {isElite
              ? `ELITE · ${eliteMember!.region}`
              : `ROUND ${Math.floor(questionIdx / QUESTIONS_PER_SET) + 1}/${Math.max(1, Math.ceil(questions.length / QUESTIONS_PER_SET))}`}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {streak >= 1 && (
            <div className="rounded-full bg-primary px-2.5 py-1 font-pixel text-[9px] uppercase text-primary-foreground shadow-card">
              Streak ×{streak}
            </div>
          )}
        </div>
      </div>

      {/* COMBAT ARENA — FRLG diagonal layout */}
      <div className="relative min-h-0 flex-1 py-2 px-[max(1.5rem,env(safe-area-inset-left))]">
        {/* ENEMY ZONE: panel top-left, sprite top-right */}
        <div className="flex items-start justify-between">
          <CombatPanel
            align="left"
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
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 left-1/2 h-7 w-28 -translate-x-1/2 rounded-[50%]"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 35%, oklch(0.88 0.16 145) 0%, oklch(0.72 0.18 145) 55%, oklch(0.55 0.16 150) 100%)",
                boxShadow:
                  "0 8px 14px -6px oklch(0.3 0.1 150 / 0.35), inset 0 1px 0 oklch(1 0 0 / 0.35)",
              }}
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
                  -{floatDmg.n}
                  {floatDmg.super && " 💥"}
                  {floatDmg.speedy && " ⚡"}
                </div>
              )}
            </motion.div>
          </div>
        </div>

        {/* PLAYER ZONE: sprite lower-left, panel mid-right */}
        <div className="-mt-4 flex items-end justify-between">
          <div className="relative shrink-0">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute bottom-3 left-1/2 h-9 w-32 -translate-x-1/2 rounded-[50%]"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 35%, oklch(0.88 0.16 145) 0%, oklch(0.72 0.18 145) 55%, oklch(0.55 0.16 150) 100%)",
                boxShadow:
                  "0 8px 14px -6px oklch(0.3 0.1 150 / 0.35), inset 0 1px 0 oklch(1 0 0 / 0.35)",
              }}
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
      <div className="relative shrink-0 rounded-t-[28px] bg-card pt-14 px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-8px_30px_-12px_oklch(0.3_0.05_260/0.25)]">
        <AnimatePresence mode="wait">
          {phase !== "intro" && trivia && (
            <motion.div
              key={questionIdx}
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              className="relative"
            >
              {/* Floating timer pill + category label */}
              <div className="pointer-events-none absolute left-1/2 -top-12 z-10 flex -translate-x-1/2 flex-col items-center">
                <TimerRing timer={timer} maxTime={TIMER_BASE + bonusTime} />
                <p className="mt-1.5 font-pixel-xs text-foreground/70">{trivia.category}</p>
              </div>

              <div className="pt-1">
                <p className="text-center text-[clamp(0.95rem,4vw,1.125rem)] font-bold leading-snug">
                  {trivia.question}
                </p>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {trivia.options.map((opt, i) => {
                    const isCorrect = phase === "feedback" && i === trivia.correct;
                    const isWrong = phase === "feedback" && chosen === i && i !== trivia.correct;
                    const isRevealed = revealedWrong === i;
                    const isAnswerRevealed = phase === "question" && revealedCorrect === i;
                    return (
                      <button
                        key={i}
                        disabled={phase !== "question" || isRevealed}
                        onClick={() => handleAnswer(i)}
                        className={`flex min-h-[48px] items-center justify-between rounded-2xl border-2 bg-card px-4 py-2.5 text-left text-[clamp(0.875rem,3.6vw,0.95rem)] font-semibold transition active:scale-[0.98] ${
                          isCorrect
                            ? "border-hp-good bg-hp-good/5 text-hp-good"
                            : isWrong
                              ? "border-destructive bg-destructive/5 text-destructive"
                              : isRevealed
                                ? "border-border/60 line-through opacity-50"
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
                {phase === "feedback" && (
                  <p className="mt-2 rounded-xl bg-muted p-2 text-[11px] leading-snug text-muted-foreground">
                    💡 {trivia.explanation} · ⚡ {(lastElapsedMs / 1000).toFixed(1)}s
                  </p>
                )}

                {/* Item shortcuts row */}
                <div className="mt-3 flex items-center justify-center gap-3">
                  <Sheet open={bagOpen} onOpenChange={setBagOpen}>
                    <SheetTrigger asChild>
                      <button className="relative flex h-12 w-12 items-center justify-center rounded-full bg-muted shadow-sm transition active:scale-95">
                        <Backpack className="h-6 w-6 text-muted-foreground" />
                      </button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="rounded-t-3xl">
                      <SheetHeader>
                        <SheetTitle className="text-center font-display-lg text-foreground">
                          Your Bag
                        </SheetTitle>
                      </SheetHeader>
                      {(() => {
                        // Same grouped, owned-only layout as the Shop bag.
                        const bagGroups = CATEGORIES.map((cat) => ({
                          ...cat,
                          items: ITEMS.filter(
                            (it) => CATEGORY_OF[it.id] === cat.id && (inventory[it.id] ?? 0) > 0,
                          ),
                        })).filter((g) => g.items.length > 0);
                        return (
                          <div className="my-4 max-h-[65vh] overflow-y-auto">
                            {bagGroups.length === 0 ? (
                              <div className="rounded-3xl bg-poke-yellow/15 p-6 text-center">
                                <div className="mx-auto mb-2 text-4xl">🎒</div>
                                <div className="font-display-md text-foreground">
                                  Your bag is empty
                                </div>
                                <p className="mt-1 text-xs text-foreground/60">
                                  Visit the Shop to stock up on items.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-4 pb-2">
                                {bagGroups.map((group) => (
                                  <div key={group.id}>
                                    <div className="mb-2 font-pixel-xs uppercase tracking-wider text-foreground/45">
                                      {group.label}
                                    </div>
                                    <div className="flex flex-col gap-2.5">
                                      {group.items.map((it) => {
                                        const owned = inventory[it.id] ?? 0;
                                        const used = usedThisBattle[it.id] ?? false;
                                        const isAuto =
                                          it.id === "focusband" ||
                                          it.id === "quickclaw" ||
                                          it.id === "assaultvest";
                                        const disabled =
                                          isAuto ||
                                          used ||
                                          ((isWeekly || isElite) && it.id === "escape");
                                        return (
                                          <button
                                            key={it.id}
                                            disabled={disabled}
                                            onClick={() => tryUseItem(it.id)}
                                            className="flex items-center gap-3.5 rounded-[20px] bg-card px-4 py-3 text-left shadow-card transition active:scale-[0.99] disabled:opacity-40"
                                          >
                                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-primary/[0.08]">
                                              <img
                                                src={it.iconUrl}
                                                alt={it.name}
                                                className="sprite h-9 w-9 object-contain"
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
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                                                {it.name}
                                                <span className="font-pixel text-[9px] text-primary">
                                                  ×{owned}
                                                </span>
                                              </div>
                                              <div className="text-[11px] leading-tight text-muted-foreground">
                                                {BAG_SHORT_DESC[it.id] ?? it.desc}
                                              </div>
                                              {isAuto && (
                                                <div className="text-[10px] text-primary">
                                                  Auto-activates
                                                </div>
                                              )}
                                              {used && !isAuto && (
                                                <div className="text-[10px] text-destructive">
                                                  Used this battle
                                                </div>
                                              )}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </SheetContent>
                  </Sheet>
                  {ITEMS.filter(
                    (it) =>
                      (inventory[it.id] ?? 0) > 0 &&
                      it.id !== "focusband" &&
                      it.id !== "quickclaw" &&
                      it.id !== "assaultvest",
                  )
                    .slice(0, 3)
                    .map((it) => {
                      const owned = inventory[it.id] ?? 0;
                      const used = usedThisBattle[it.id] ?? false;
                      const disabled =
                        owned <= 0 || used || ((isWeekly || isElite) && it.id === "escape");
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
              Your progress in this battle will be lost. You'll keep XP and trophies you've already
              earned.
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
      <TutorialOverlay step={tutorialStep} onDismiss={dismissTutorial} onSkip={skipTutorial} />
    </div>
  );
}
