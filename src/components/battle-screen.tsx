import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Sparkles, Crown } from "lucide-react";
import { useGameStore, getItemDef } from "@/lib/store";
import { MAX_ITEMS_PER_BATTLE } from "@/lib/store/slices/itemsSlice";
import {
  pickRandomEnemy,
  type EnemyTrainer,
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
  canEvolve,
  type PokeEntry,
} from "@/lib/pokemon-data";
import { getAbility as getAbilityFn, rollAbilityId, type Ability } from "@/lib/abilities";
import { TutorialOverlay } from "@/components/tutorial-overlay";
import {
  PokemonSprite,
  StatusEffectOverlay,
  BattleStage,
  CombatPanel,
  QuestionCard,
  ItemBagSheet,
} from "@/components/game-ui";
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
import { playSfx, revealPokemon, playBattleResult, playItemCue } from "@/lib/audio";
import { answerHaptic } from "@/lib/haptics";
import { type EliteMember, regionCompleted } from "@/lib/elite-four";
import type { GymLeader } from "@/lib/gym-leaders";
import { ShareCardDialog } from "@/components/share-card-dialog";
import type { ShareData } from "@/components/share-card-builder";
import { trainerSpriteUrl } from "@/lib/game-data";
import type { Trivia } from "@/lib/trivia-core";
import { shuffleAllTriviaOptions } from "@/lib/trivia-core";
import { useForfeitGuard } from "@/lib/use-forfeit-guard";
export type { Trivia };
import { DailyScreen } from "@/components/daily-screen";
import { ResultScreen } from "@/components/result-screen";
import { startSoloBattle, submitBattleAction } from "@/services/client/battle-solo";
import type { SoloBattleCfg } from "@/engine";
import { track } from "@/lib/analytics";

const QUESTIONS_PER_SET = 5;
const TIMER_BASE = 20;

type Phase = "intro" | "question" | "feedback" | "result";

interface Props {
  questions: Trivia[];
  onExit: () => void;
  onRematch?: () => void;
  mode?: "battle" | "daily" | "elite" | "weekly";
  eliteMember?: EliteMember;
  gymLeader?: GymLeader | null;
}

export function BattleScreen({
  questions: rawQuestions,
  onExit,
  onRematch,
  mode = "battle",
  eliteMember,
  gymLeader,
}: Props) {
  // Randomize option order once per battle so repeat questions can't be
  // answered from memorized answer positions.
  const questions = useMemo(() => shuffleAllTriviaOptions(rawQuestions), [rawQuestions]);
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
  const choiceSpecsActive = useGameStore((s) => s.choiceSpecsActive);
  const anyItemUsedThisBattle = useGameStore((s) => s.anyItemUsedThisBattle);
  const itemsUsedThisBattleCount = useGameStore((s) => s.itemsUsedThisBattleCount);
  const itemCapReached = itemsUsedThisBattleCount >= MAX_ITEMS_PER_BATTLE;
  const tryAutoFocusBand = useGameStore((s) => s.tryAutoFocusBand);
  const tryAutoQuickClaw = useGameStore((s) => s.tryAutoQuickClaw);
  const tryAutoAssaultVest = useGameStore((s) => s.tryAutoAssaultVest);
  const tryAutoRevive = useGameStore((s) => s.tryAutoRevive);
  const tryAutoOranBerry = useGameStore((s) => s.tryAutoOranBerry);
  const tryAutoSilkScarf = useGameStore((s) => s.tryAutoSilkScarf);
  const tryAutoKingsRock = useGameStore((s) => s.tryAutoKingsRock);
  const tryAutoLeftovers = useGameStore((s) => s.tryAutoLeftovers);
  const tryAutoMetronome = useGameStore((s) => s.tryAutoMetronome);
  const raiseFlag = useGameStore((s) => s.raiseFlag);
  const pushBattleLog = useGameStore((s) => s.pushBattleLog);
  const recordPokedexCapture = useGameStore((s) => s.recordPokedexCapture);
  const recordPokedexSeen = useGameStore((s) => s.recordPokedexSeen);
  const markEliteDefeated = useGameStore((s) => s.markEliteDefeated);
  const defeatedElites = useGameStore((s) => s.defeatedElites);

  const isElite = !!eliteMember;
  const isWeekly = !!gymLeader;
  const recordWeeklyLeagueResult = useGameStore((s) => s.recordWeeklyLeagueResult);

  // Shared status system (lifted from local component state into the store so
  // Solo and Nearby-Battle PvP share one representation).
  const statuses = useGameStore((s) => s.battleStatuses);
  const applyBattleStatus = useGameStore((s) => s.applyBattleStatus);
  const tickBattleStatusCure = useGameStore((s) => s.tickBattleStatusCure);
  const clearAllBattleStatuses = useGameStore((s) => s.clearAllBattleStatuses);

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
  // Cosmetic-only: the enemy trainer's Pokémon gets a random type ability too
  // (matches the partner's chip in the UI) but never affects damage math —
  // Solo has no "enemy acts" turn for an ability to hook into.
  const enemyAbility = useMemo(
    () => getAbilityFn(enemy.pokemon.types, rollAbilityId(enemy.pokemon.types)),
    [enemy.pokemon.types],
  );
  const [playerHp, setPlayerHp] = useState(playerMaxHp);
  // Meeting a Pokémon registers it as SEEN; beating it upgrades that to CAUGHT
  // further down. Without this the Pokédex's seen state would have no writer
  // and the status would be dead UI. Seen never overwrites caught, so a rematch
  // against something you already own changes nothing.
  useEffect(() => {
    recordPokedexSeen(enemy.pokemon.id);
  }, [enemy.pokemon.id, recordPokedexSeen]);

  const [enemyHp, setEnemyHp] = useState(enemyMaxHp);
  const [phase, setPhase] = useState<Phase>("intro");
  const [trivia, setTrivia] = useState<Trivia | null>(null);
  const [chosen, setChosen] = useState<number | null>(null);
  const [revealedWrong, setRevealedWrong] = useState<number | null>(null);
  const [revealedWrong2, setRevealedWrong2] = useState<number | null>(null);
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
  // Browser/Android back mid-battle asks to forfeit instead of silently
  // leaving (feedback 2286b6fc). Reuses the existing Leave-battle dialog.
  useForfeitGuard(phase !== "result", () => setConfirmExit(true));
  const [resultWon, setResultWon] = useState<boolean | null>(null);
  const [xpEarned, setXpEarned] = useState(0);
  const [coinsEarned, setCoinsEarned] = useState(0);
  const [streakBanner, setStreakBanner] = useState<string | null>(null);
  const [lastElapsedMs, setLastElapsedMs] = useState(0);
  const questionStart = useRef<number>(0);
  const startedRef = useRef(false);
  const battleEndedRef = useRef(false);
  // server-first-refactor P3 — set once startSoloBattle resolves; every
  // action fired at this battle-solo record afterward is fire-and-forget
  // (see the mirroring effect below for why: gameplay stays fully
  // client-driven/instant, this is a best-effort replayable mirror only).
  const soloBattleIdRef = useRef<string | null>(null);
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
  const kingsRockActiveRef = useRef(false);
  const leftoversActiveRef = useRef(false);
  const metronomeActiveRef = useRef(false);

  // Phase 2: ability + status state. `statuses` now lives in the store
  // (`battleStatuses`); solo only ever applies "confused" / "poisoned".
  type StatusKind = "confused" | "poisoned";
  const wrongStreakRef = useRef(0);
  const missedRef = useRef<Array<{ question: string; correctAnswer: string; explanation: string }>>(
    [],
  );
  const newTrophiesRef = useRef<Array<{ name: string }>>([]);
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
      toast.info(`${ability.name} activated!`, {
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
    applyBattleStatus({ kind, curesRemaining: cureNeeds[kind], appliedAt: Date.now() });
    if (kind === "confused") {
      toast.warning("🌀 Confused! Some correct answers may miss.");
    } else {
      toast.error("☠️ Poisoned! Losing HP over time.");
      startPoisonTick();
    }
  }

  function tickStatusCure(kind: StatusKind) {
    const willClear = tickBattleStatusCure(kind);
    if (willClear) {
      if (kind === "confused") toast.success("Snapped out of confusion!");
      if (kind === "poisoned") {
        toast.success("Recovered from poison!");
        stopPoisonTick();
      }
    }
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
      toast.success(`A SHINY ${enemy.pokemon.name} appeared!`, {
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
    setRevealedWrong2(null);
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
      toast.success("Assault Vest — damage halved this battle!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // King's Rock / Leftovers / Metronome: auto-activate at battle start (whole-battle effect, once per week)
  useEffect(() => {
    if (tryAutoKingsRock()) {
      kingsRockActiveRef.current = true;
      toast.success("King's Rock — chance to shrug off wrong answers this battle!");
    }
    if (tryAutoLeftovers()) {
      leftoversActiveRef.current = true;
      toast.success("Leftovers — healing after every correct answer this battle!");
    }
    if (tryAutoMetronome()) {
      metronomeActiveRef.current = true;
      toast.success("Metronome — streak multiplier locked at max this battle!");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // server-first-refactor P3 — mirror this battle into battle-solo
  // (fire-and-forget; see soloBattleIdRef's declaration for why). Runs after
  // the auto-trigger effects above so their refs are already populated.
  // `silkScarfAvailable`/`focusBandAvailable`/`reviveAvailable`/
  // `oranBerryAvailable` mirror `tryAuto*`'s own preconditions (inventory,
  // per-item auto-toggle, Choice Specs exclusivity) without consuming
  // anything — those items' own in-battle trigger conditions (first correct
  // answer, HP thresholds) are what the engine itself decides, same as the
  // client. NOT enforced here: the client's global MAX_ITEMS_PER_BATTLE cap
  // across all items — a known, narrow gap, not silently assumed away.
  useEffect(() => {
    const store = useGameStore.getState();
    const canAutoItem = (id: ItemId) =>
      !store.choiceSpecsActive && (store.inventory[id] ?? 0) > 0 && store.autoItems[id] !== false;
    const cfg: SoloBattleCfg = {
      questions,
      playerPokemonId: player.id,
      playerTypes: player.types,
      abilityId: playerAbility.id,
      level,
      mode: isElite ? "elite" : isWeekly ? "weekly" : "battle",
      enemyPokemonId: enemy.pokemon.id,
      enemyTypes: enemy.pokemon.types,
      trainingPoints: store.trainingPoints[player.id] ?? 0,
      items: {
        assaultVestActive: assaultVestActiveRef.current,
        kingsRockActive: kingsRockActiveRef.current,
        leftoversActive: leftoversActiveRef.current,
        metronomeActive: metronomeActiveRef.current,
        silkScarfAvailable: canAutoItem("silkscarf"),
        focusBandAvailable: canAutoItem("focusband"),
        reviveAvailable: canAutoItem("revive"),
        oranBerryAvailable: canAutoItem("oranberry"),
      },
    };
    startSoloBattle(cfg)
      .then(({ battleId }) => {
        soloBattleIdRef.current = battleId;
      })
      .catch(() => {});
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
        toast.success("Quick Claw — timer reset to 20s!");
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
    // Fresh start: clear any status left in the store from a prior battle/remount
    // (preserves the old local-useState([]) semantics on rematch).
    clearAllBattleStatuses();
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
    answerHaptic(idx === trivia.correct);
    setChosen(idx);
    const correct = idx === trivia.correct;
    const elapsed = Date.now() - questionStart.current;
    setLastElapsedMs(elapsed);
    totalElapsedMsRef.current += elapsed;
    answeredCountRef.current += 1;

    // server-first-refactor P3 — fire-and-forget mirror (see soloBattleIdRef).
    if (soloBattleIdRef.current) {
      submitBattleAction(soloBattleIdRef.current, {
        type: "submit_answer",
        questionIdx,
        choiceIdx: idx,
        elapsedMs: elapsed,
      }).catch(() => {});
    }

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
      let dmg = Math.round(
        baseDmg * (metronomeActiveRef.current ? 3.0 : streakMultiplier(newStreak)),
      );
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
      // Silk Scarf: first correct answer this battle deals bonus damage (more for a Normal-type partner)
      if (tryAutoSilkScarf()) {
        dmg = Math.round(dmg * (player.types.includes("normal") ? 1.75 : 1.5));
        toast.success("Silk Scarf — bonus damage!");
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

      // Leftovers: heal 5 HP after every correct answer, for the whole battle
      if (leftoversActiveRef.current) {
        setPlayerHp((hp) => Math.min(playerMaxHp, hp + 5));
      }

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
      // King's Rock: 50% chance to negate HP loss on any wrong answer, for the whole battle
      if (kingsRockActiveRef.current && Math.random() < 0.5) wrongDmg = 0;

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

      // Revive: survive a knockout at 25% HP (once per battle, consumes an item)
      if (newPlayerHp <= 0 && tryAutoRevive()) {
        newPlayerHp = Math.round(playerMaxHp * 0.25);
        toast.success("Revive — survived at 25% HP!");
      }

      // Focus Band: auto-heal to 50% when HP is 10 or below (once per week)
      if (newPlayerHp <= 10 && tryAutoFocusBand()) {
        newPlayerHp = Math.round(playerMaxHp * 0.5);
        toast.success("Focus Band — restored to 50% HP!");
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

      // Oran Berry: auto-heal 15 HP the instant HP first drops below 30% (once per battle)
      if (newPlayerHp > 0 && newPlayerHp < playerMaxHp * 0.3 && tryAutoOranBerry()) {
        newPlayerHp = Math.min(playerMaxHp, newPlayerHp + 15);
        toast.success("Oran Berry — healed 15 HP!");
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
    // A battle can end (finish()) from a path other than the click that
    // scheduled this timeout — e.g. the poison-tick interval detecting a
    // KO independently. Without this guard, this stale callback fires after
    // finish() already ran, calls loadQuestion(), and sets phase back to
    // "question" — reviving an ended battle into a state no further click
    // can recover from (battleEndedRef then blocks any real finish() call).
    if (battleEndedRef.current) return;
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
    clearAllBattleStatuses();
    wrongStreakRef.current = 0;
    abilityStateRef.current.cursedBodyPending = null;

    const reward = battleReward({
      mode: isElite ? "elite" : isWeekly ? "weekly" : "regular",
      won,
      level,
      maxStreak: maxStreakRef.current,
    });
    let xpAward = reward.xp;
    let coinAward = reward.coins;
    let tpAward = reward.tp;

    // Exp. Charm / Amulet Coin / Lucky Punch / Star Piece / Choice Specs:
    // applied here before endBattle() resets these battle-ephemeral flags.
    const itemState = useGameStore.getState();
    if (itemState.expCharmActive) xpAward = Math.round(xpAward * 1.25);
    if (itemState.amuletCoinActive) coinAward *= 2;
    if (itemState.luckyPunchActive) {
      if (Math.random() < 0.5) {
        xpAward *= 2;
        coinAward *= 2;
        toast.success("Lucky Punch — doubled!");
      } else {
        xpAward = 0;
        coinAward = 0;
        toast.error("Lucky Punch — nothing this time!");
      }
    }
    if (itemState.starPieceActive && won) {
      xpAward = Math.round(xpAward * 1.5);
      coinAward = Math.round(coinAward * 1.5);
      toast.success("Star Piece — win rewards boosted!");
    }
    if (itemState.choiceSpecsActive) {
      xpAward *= 2;
      coinAward *= 2;
      tpAward *= 2;
      toast.success("Choice Specs — rewards doubled!");
    }
    // Big Nugget: while active, a fully evolved partner's TP rewards convert
    // straight to coins instead (a fully evolved Pokémon has no more use for TP).
    if (Date.now() < itemState.bigNuggetExpiresAt && !canEvolve(player) && tpAward > 0) {
      coinAward += tpAward;
      tpAward = 0;
      toast.success("Big Nugget — TP converted to coins!");
    }

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
      // Both glyphs dropped, not just Lucky Egg's: one item keeping an emoji
      // while the other lost it reads as a bug in a single composed line.
      toast.success("Rare Candy +1 · Lucky Egg +1", { duration: 4000 });
      if (regionDone) {
        toast.success(`${eliteMember.region} Elite Four cleared!`, { duration: 4500 });
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
        toast.success(`${gymLeader.badge} earned!`, { duration: 4500 });
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
      mode: isElite ? "elite" : isWeekly ? "weekly" : "battle",
    });
    // Read the count back out rather than tracking one here: endBattle() above
    // is what increments it, so `1` is unambiguously this player's first.
    const battlesSoFar = useGameStore.getState().stats.battles;
    const battleMode = isElite ? "elite" : isWeekly ? "weekly" : "battle";
    track("battle_complete", { mode: battleMode, won, battles: battlesSoFar });
    if (battlesSoFar === 1) track("first_battle_complete", { mode: battleMode, won });
    const after = unlockedAchievements(useGameStore.getState());
    const unlocked: Array<{ name: string }> = [];
    for (const id of after) {
      if (!before.has(id)) {
        const a = ACHIEVEMENTS.find((x) => x.id === id);
        if (a) {
          unlocked.push({ name: a.name });
          // The trophy is earned here but paid out in Profile > Trophies, so
          // the toast has to say where the reward is waiting.
          toast.success(a.name, {
            description: `${a.desc} Claim your reward in Profile.`,
            duration: 4000,
          });
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
    if (itemCapReached) {
      toast.error(`Already used ${MAX_ITEMS_PER_BATTLE} items this battle — that's the max.`);
      return;
    }
    const ok = applyItem(id);
    if (!ok) {
      toast.error(`Cannot use ${def.name} right now.`);
      return;
    }
    toast.success(`Used ${def.name}!`);
    // server-first-refactor P3 — fire-and-forget mirror (see soloBattleIdRef).
    // escape maps to forfeit below instead, not a use_item action.
    if (soloBattleIdRef.current && id !== "escape") {
      submitBattleAction(soloBattleIdRef.current, { type: "use_item", itemId: id }).catch(() => {});
    }
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
    if (id === "zoomlens" && trivia) {
      const wrongs = [0, 1, 2, 3]
        .filter((w) => w !== trivia.correct)
        .sort(() => Math.random() - 0.5);
      setRevealedWrong(wrongs[0]);
      setRevealedWrong2(wrongs[1]);
    }
    if (id === "xaccuracy" && trivia) {
      setRevealedCorrect(trivia.correct);
    }
    if (id === "escape") {
      setBagOpen(false);
      if (soloBattleIdRef.current) {
        submitBattleAction(soloBattleIdRef.current, { type: "forfeit" }).catch(() => {});
      }
      abortBattle();
      setTimeout(() => onExit(), 300);
    }
    if (id === "repel") {
      setBagOpen(false);
      nextQuestion();
      return;
    }
    setBagOpen(false);
  }

  if (phase === "result") {
    const stateNow = useGameStore.getState();
    const prog = xpProgressInLevel(stateNow.xp);
    const pct = Math.min(100, (prog.current / Math.max(1, prog.need)) * 100);
    return (
      <>
        {/* Test-observability hook only — not read by any production code. */}
        <div
          data-testid="battle-result"
          data-won={String(resultWon)}
          data-xp={xpEarned}
          data-tp={tpEarned}
          data-coins={coinsEarned}
          data-speed-bonus={speedBonusTotalRef.current}
          data-streak={maxStreakRef.current}
          hidden
        />
        <ResultScreen
          won={resultWon!}
          opponentName={enemy.name}
          correctCount={correctCountRef.current}
          // Questions the player actually FACED, not the size of the pool a
          // battle draws from. A battle ends when someone's HP runs out, which
          // is usually well before question 20, so "4/20 correct" read as a
          // much worse round than it was. `answeredCountRef` counts timeouts
          // too — handleAnswer(-1) is the timeout path — which is right: an
          // unanswered question was still put in front of them.
          totalQuestions={answeredCountRef.current}
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
          // Weekly League is one attempt a week — there is no next battle to
          // start, and the button was only ever leaving the screen.
          hideRematch={isWeekly}
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
      <div className="relative z-10 flex shrink-0 items-center justify-between gap-2 pt-[calc(env(safe-area-inset-top)+1rem)] pb-1 px-[max(1.25rem,env(safe-area-inset-left))]">
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

      {/* COMBAT ARENA — both combatants stand on the platforms painted into
          the field artwork. BattleStage owns that registration; the old
          hand-drawn green ground-shadow ellipses are gone with it, because the
          painting has real ones and two shadows under one sprite read as a
          rendering fault. */}
      <BattleStage
        enemyPanel={
          <CombatPanel
            align="left"
            pokemonName={enemy.pokemon.name}
            types={enemy.pokemon.types}
            hp={enemyHp}
            maxHp={enemyMaxHp}
            abilityName={enemyAbility.name}
            abilityDescription={enemyAbility.description}
            immune={false}
            disadvantaged={false}
            testId="enemy"
          />
        }
        enemySprite={
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
            <StatusEffectOverlay statuses={[]} />
            {floatDmg?.who === "enemy" && (
              <div className="animate-float-up pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 font-pixel text-base text-destructive">
                -{floatDmg.n}
                {floatDmg.super && " SUPER"}
                {floatDmg.speedy && " FAST"}
              </div>
            )}
          </motion.div>
        }
        playerSprite={
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
            <StatusEffectOverlay statuses={statuses} />
            {floatDmg?.who === "player" && (
              <div className="animate-float-up pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 font-pixel text-base text-destructive">
                -{floatDmg.n}
              </div>
            )}
          </motion.div>
        }
        playerPanel={
          <CombatPanel
            align="right"
            pokemonName={player.name}
            types={player.types}
            hp={playerHp}
            maxHp={playerMaxHp}
            abilityName={playerAbility.name}
            abilityDescription={playerAbility.description}
            immune={immune}
            disadvantaged={disadvantaged}
            testId="player"
          />
        }
      />
      {/* The stage is absolutely positioned, so this spacer is what pushes the
          question card to the bottom of the screen. It used to carry a
          fade-to-white gradient as well; that is gone — as a flex child its
          height moved whenever the card's content changed (a feedback line
          appearing, an item row), so the gradient jumped around mid-battle and
          washed parts of the field on and off. The artwork fades out on its own
          at the bottom, which is what the fade was imitating. */}
      <div className="min-h-0 flex-1" />

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
      {/* The card sits on a full-width band of the fade colour. Its own top
          corners are rounded, and without this the artwork behind them showed
          through as two green notches either side of the question card — the
          stage runs the full height of the screen, so "below the fade" is still
          painted field. */}
      <div className="relative z-10 shrink-0 bg-[var(--battle-fade-to)]">
        <div className="relative rounded-t-[28px] bg-card pt-14 px-[max(1rem,env(safe-area-inset-left))] pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-[0_-8px_30px_-12px_oklch(0.3_0.05_260/0.25)]">
          <AnimatePresence mode="wait">
            {phase !== "intro" && trivia && (
              <QuestionCard
                key={questionIdx}
                trivia={trivia}
                phase={phase as "question" | "feedback"}
                chosen={chosen}
                revealedWrong={revealedWrong}
                revealedWrong2={revealedWrong2}
                revealedCorrect={revealedCorrect}
                timer={timer}
                maxTime={TIMER_BASE + bonusTime}
                lastElapsedMs={lastElapsedMs}
                onAnswer={handleAnswer}
              >
                <ItemBagSheet
                  bagOpen={bagOpen}
                  onBagOpenChange={setBagOpen}
                  inventory={inventory}
                  usedThisBattle={usedThisBattle}
                  itemsUsedThisBattleCount={itemsUsedThisBattleCount}
                  maxItemsPerBattle={MAX_ITEMS_PER_BATTLE}
                  itemCapReached={itemCapReached}
                  choiceSpecsActive={choiceSpecsActive}
                  anyItemUsedThisBattle={anyItemUsedThisBattle}
                  escapeDisabled={isWeekly || isElite}
                  onUseItem={tryUseItem}
                />
              </QuestionCard>
            )}
          </AnimatePresence>
        </div>
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
                if (soloBattleIdRef.current) {
                  submitBattleAction(soloBattleIdRef.current, { type: "forfeit" }).catch(() => {});
                }
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
